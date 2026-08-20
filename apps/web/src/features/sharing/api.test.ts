import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPublicShare, readPublicFileViewUrl, revokeShare } from './api.js';

const apiRequestMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/api-client.js', () => ({
  apiRequest: apiRequestMock,
}));

describe('sharing API', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({
      shareId: '11111111-1111-4111-8111-111111111111',
      url: 'https://room.test/share#token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      targetName: 'Financials',
      revoked: true,
    });
  });
  it.each([
    ['/nodes/22222222-2222-4222-8222-222222222222/shares/public', 'POST'],
    ['/shares/11111111-1111-4111-8111-111111111111', 'DELETE'],
  ])('uses the exact protected share path %s', async (path, method) => {
    apiRequestMock.mockResolvedValueOnce(
      method === 'POST'
        ? {
            shareId: '11111111-1111-4111-8111-111111111111',
            url: 'https://room.test/share#token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            targetName: 'Financials',
          }
        : { shareId: '11111111-1111-4111-8111-111111111111', revoked: true },
    );
    if (method === 'POST')
      await createPublicShare('access', '22222222-2222-4222-8222-222222222222');
    else await revokeShare('access', '11111111-1111-4111-8111-111111111111');
    expect(apiRequestMock).toHaveBeenCalledWith(
      path,
      expect.objectContaining({ method, accessToken: 'access' }),
    );
  });

  it('posts public PDF view requests with the share token transport', async () => {
    apiRequestMock.mockResolvedValueOnce({
      url: 'https://cdn.test/file.pdf',
      expiresAt: '2026-08-20T12:00:00.000Z',
    });
    await readPublicFileViewUrl(
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      '22222222-2222-4222-8222-222222222222',
    );
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/public-share/files/22222222-2222-4222-8222-222222222222/view-url',
      { method: 'POST', shareToken: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    );
  });

  it('creates public links through the frozen node share endpoint', async () => {
    await expect(
      createPublicShare('access', '22222222-2222-4222-8222-222222222222'),
    ).resolves.toMatchObject({
      targetName: 'Financials',
    });
  });

  it('revoke is idempotent and sends no request body', async () => {
    await expect(revokeShare('access', '11111111-1111-4111-8111-111111111111')).resolves.toEqual(
      expect.objectContaining({ revoked: true }),
    );
  });
});
