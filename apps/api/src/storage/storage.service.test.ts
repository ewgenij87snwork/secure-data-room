import { describe, expect, it, vi } from 'vitest';
import { isPartialContentResponse, SupabaseStorageService } from './supabase-storage.service.js';

describe('SupabaseStorageService', () => {
  it('accepts only successful partial-content responses', () => {
    expect(isPartialContentResponse({ ok: true, status: 206 })).toBe(true);
    expect(isPartialContentResponse({ ok: false, status: 206 })).toBe(false);
    expect(isPartialContentResponse({ ok: true, status: 200 })).toBe(false);
    expect(isPartialContentResponse({})).toBe(false);
  });

  it('removes objects in batches of at most 100', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const service = new SupabaseStorageService({ storage: { from: () => ({ remove }) } } as never, {
      SUPABASE_URL: 'https://project.supabase.co',
      STORAGE_BUCKET: 'data-room-pdfs',
    });

    await service.remove(Array.from({ length: 201 }, (_, index) => `object-${index}`));

    expect(remove).toHaveBeenCalledTimes(3);
    const calls = remove.mock.calls as unknown as [readonly string[]][];
    expect(calls.map(([keys]) => keys.length)).toEqual([100, 100, 1]);
  });

  it('creates a non-upsert signed upload capability and derives the TUS endpoint', async () => {
    const createSignedUploadUrl = vi.fn().mockResolvedValue({
      data: { token: 'capability-token' },
      error: null,
    });
    const fetchImpl = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response(Uint8Array.from([37, 80, 68, 70, 45, 99]), { status: 206 }));
    const service = new SupabaseStorageService(
      {
        storage: { from: () => ({ createSignedUploadUrl }) },
        remove: vi.fn(),
        getMetadata: vi.fn(),
        download: vi.fn(),
        createSignedUrl: vi.fn(),
      } as never,
      {
        SUPABASE_URL: 'https://project.supabase.co',
        STORAGE_BUCKET: 'data-room-pdfs',
      },
      fetchImpl,
    );

    const result = await service.createSignedUpload('rooms/room/objects/object');

    expect(result.token).toBe('capability-token');
    expect(result.bucketName).toBe('data-room-pdfs');
    expect(result.tusEndpoint).toBe(
      'https://project.storage.supabase.co/storage/v1/upload/resumable/sign',
    );
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(createSignedUploadUrl).toHaveBeenCalledWith('rooms/room/objects/object', {
      upsert: false,
    });
  });

  it('keeps local/custom origins for the signed TUS endpoint', async () => {
    const createSignedUploadUrl = vi
      .fn()
      .mockResolvedValue({ data: { token: 'capability-token' }, error: null });
    const service = new SupabaseStorageService(
      { storage: { from: () => ({ createSignedUploadUrl }) } } as never,
      { SUPABASE_URL: 'http://127.0.0.1:54321', STORAGE_BUCKET: 'data-room-pdfs' },
    );
    await expect(service.createSignedUpload('key')).resolves.toMatchObject({
      tusEndpoint: 'http://127.0.0.1:54321/storage/v1/upload/resumable/sign',
      bucketName: 'data-room-pdfs',
    });
  });

  it('requests and retains only the bounded prefix', async () => {
    const serviceRoleKey = 'fake-service-role-key-for-tests';
    const fetchImpl = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response(Uint8Array.from([37, 80, 68, 70, 45, 99]), { status: 206 }));
    const service = new SupabaseStorageService(
      { storage: { from: () => ({}) } } as never,
      {
        SUPABASE_URL: 'https://project.supabase.co',
        STORAGE_BUCKET: 'data-room-pdfs',
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      },
      fetchImpl,
    );
    await expect(service.readPrefix('rooms/r/objects/o', 5)).resolves.toEqual(
      Uint8Array.from([37, 80, 68, 70, 45]),
    );

    const fetchCall = fetchImpl.mock.calls[0];
    if (!fetchCall) throw new Error('Expected a storage fetch call.');
    const [url, requestInit] = fetchCall;
    expect(url).toBe(
      'https://project.supabase.co/storage/v1/object/data-room-pdfs/rooms/r/objects/o',
    );
    if (!requestInit) throw new Error('Expected storage fetch request options.');
    expect(requestInit.headers).toEqual({
      Range: 'bytes=0-4',
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    });
  });

  it('never sends a new secret API key as an Authorization bearer token', async () => {
    const secretApiKey = 'sb_secret_test';
    const fetchImpl = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response(Uint8Array.from([37, 80, 68, 70, 45]), { status: 206 }));
    const service = new SupabaseStorageService(
      { storage: { from: () => ({}) } } as never,
      {
        SUPABASE_URL: 'https://project.supabase.co',
        STORAGE_BUCKET: 'data-room-pdfs',
        SUPABASE_SERVICE_ROLE_KEY: secretApiKey,
      },
      fetchImpl,
    );

    await expect(service.readPrefix('rooms/r/objects/o', 5)).resolves.toEqual(
      Uint8Array.from([37, 80, 68, 70, 45]),
    );

    const fetchCall = fetchImpl.mock.calls[0];
    if (!fetchCall?.[1]) throw new Error('Expected storage fetch request options.');
    expect(fetchCall[1].headers).toEqual({
      Range: 'bytes=0-4',
      apikey: secretApiKey,
    });
  });
});
