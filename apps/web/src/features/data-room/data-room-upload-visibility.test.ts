import { describe, expect, it, vi } from 'vitest';

describe('upload route visibility', () => {
  it('requires owner management, runtime enablement, and a folder route', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/v1/');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key-1234567890');
    const { shouldShowUploadDropzone } = await import('./data-room-upload-visibility.js');
    expect(shouldShowUploadDropzone({ canManage: true, uploadsEnabled: true, nodeKind: 'FOLDER' })).toBe(true);
    expect(shouldShowUploadDropzone({ canManage: false, uploadsEnabled: true, nodeKind: 'FOLDER' })).toBe(false);
    expect(shouldShowUploadDropzone({ canManage: true, uploadsEnabled: false, nodeKind: 'FOLDER' })).toBe(false);
    expect(shouldShowUploadDropzone({ canManage: true, uploadsEnabled: true, nodeKind: 'FILE' })).toBe(false);
    expect(shouldShowUploadDropzone({ canManage: true, uploadsEnabled: true, nodeKind: undefined })).toBe(false);
  });
});
