import { describe, expect, it, vi } from 'vitest';

const start = vi.fn();
const Upload = vi.fn(function Upload() {
  return { start, abort: vi.fn() };
});
vi.mock('tus-js-client', () => ({ Upload }));

describe('startTusUpload', () => {
  it('uses the exact Supabase tus contract and starts after construction', async () => {
    const { startTusUpload } = await import('./tus-upload.js');
    startTusUpload({
      file: new File(['%PDF-test'], 'a.pdf', { type: 'application/pdf' }),
      tusEndpoint: 'https://storage.example.test/upload',
      bucketName: 'private',
      storageKey: 'random-key',
      uploadToken: 'x'.repeat(16),
      onProgress: vi.fn(),
      onSuccess: vi.fn(),
      onError: vi.fn(),
    });
    expect(Upload).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        endpoint: 'https://storage.example.test/upload',
        chunkSize: 6 * 1024 * 1024,
        retryDelays: [0, 1000, 3000, 5000],
        headers: { 'x-signature': 'x'.repeat(16), 'x-upsert': 'false' },
        metadata: {
          bucketName: 'private',
          objectName: 'random-key',
          contentType: 'application/pdf',
          cacheControl: 'no-store',
        },
      }),
    );
    expect(start).toHaveBeenCalledTimes(1);
  });
});
