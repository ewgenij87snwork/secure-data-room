import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/v1/');
vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key-1234567890');

describe('api boundary', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    const { setAuthSessionEpoch, setSessionExpiredHandler } = await import('./api-client.js');
    setSessionExpiredHandler(undefined);
    setAuthSessionEpoch(undefined);
  });

  it('sends a request id and only available credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('./api-client.js');
    await apiRequest('/me', {
      accessToken: 'session-token',
      headers: { Authorization: 'Bearer caller', 'X-Share-Token': 'caller-share' },
    });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(request.headers);
    expect(headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers.get('Authorization')).toBe('Bearer session-token');
    expect(headers.get('X-Share-Token')).toBeNull();
  });

  it('strips caller credentials when no explicit token is supplied', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('./api-client.js');
    await apiRequest('/me', {
      headers: { Authorization: 'Bearer caller', 'X-Share-Token': 'caller-share' },
    });
    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.has('X-Share-Token')).toBe(false);
  });

  it('maps the canonical envelope and redacts unknown response bodies', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'ACCESS_DENIED',
              message: 'No access',
              requestId: '00000000-0000-4000-8000-000000000001',
            },
          }),
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(
        new Response('<html>secret stack trace</html>', {
          status: 500,
          headers: { 'X-Request-Id': '00000000-0000-4000-8000-000000000002' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('./api-client.js');
    const { ApiClientError } = await import('./api-error.js');
    await expect(apiRequest('/one')).rejects.toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
    const unknownError = await apiRequest('/two').catch((error: unknown) => error);
    expect(unknownError).toBeInstanceOf(ApiClientError);
    expect(unknownError).toMatchObject({
      code: 'INTERNAL_ERROR',
      status: 500,
      requestId: '00000000-0000-4000-8000-000000000002',
    });
    if (!(unknownError instanceof ApiClientError)) {
      throw new Error('Expected ApiClientError for a non-JSON failure.');
    }
    expect(unknownError.message).not.toContain('secret stack trace');
  });

  it('notifies session expiry once until the handler is reset', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest, setSessionExpiredHandler } = await import('./api-client.js');
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    await expect(apiRequest('/one', { accessToken: 'token' })).rejects.toBeTruthy();
    await expect(apiRequest('/two', { accessToken: 'token' })).rejects.toBeTruthy();
    expect(onExpired).toHaveBeenCalledTimes(1);
    setSessionExpiredHandler(undefined);
  });

  it('does not notify expiry twice when sign-out clears the current session epoch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest, setAuthSessionEpoch, setSessionExpiredHandler } =
      await import('./api-client.js');
    const onExpired = vi.fn(() => {
      setAuthSessionEpoch(undefined);
      return Promise.resolve();
    });
    setAuthSessionEpoch('session-one');
    setSessionExpiredHandler(onExpired);

    await Promise.allSettled([
      apiRequest('/one', { accessToken: 'token' }),
      apiRequest('/two', { accessToken: 'token' }),
    ]);

    expect(onExpired).toHaveBeenCalledTimes(1);
    setSessionExpiredHandler(undefined);
  });

  it('only notifies expiry for access-token requests and resets for a new session epoch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest, setSessionExpiredHandler, setAuthSessionEpoch } =
      await import('./api-client.js');
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    setAuthSessionEpoch('session-one');
    await expect(apiRequest('/anonymous')).rejects.toBeTruthy();
    await expect(apiRequest('/authenticated', { accessToken: 'token' })).rejects.toBeTruthy();
    setAuthSessionEpoch('session-two');
    await expect(
      apiRequest('/authenticated-again', { accessToken: 'token-2' }),
    ).rejects.toBeTruthy();
    expect(onExpired).toHaveBeenCalledTimes(2);
    setSessionExpiredHandler(undefined);
  });

  it('sends a share credential only from the explicit share token input', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('./api-client.js');

    await apiRequest('/public', { shareToken: 'explicit-share-token' });

    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.get('X-Share-Token')).toBe('explicit-share-token');
    expect(headers.has('Authorization')).toBe(false);
  });
});
