import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { authenticatedPrincipal } from '../auth/principal.js';
import { ApiException } from '../common/api-exception.js';
import { SharesService } from './shares.service.js';

const owner = authenticatedPrincipal('11111111-1111-4111-8111-111111111111', 'owner@example.com');
const node = {
  id: '22222222-2222-4222-8222-222222222222',
  dataRoomId: '33333333-3333-4333-8333-333333333333',
  parentId: null,
  kind: 'FOLDER' as const,
  name: 'Contracts',
  normalizedName: 'contracts',
  sizeBytes: null,
  mimeType: null,
  revision: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  storageKey: null,
};

function harness() {
  const createdShare = {
    id: '44444444-4444-4444-8444-444444444444',
    targetNodeId: node.id,
    principalType: 'PUBLIC_LINK' as const,
    role: 'VIEWER' as const,
    recipientEmail: null,
    createdAt: new Date(),
    revokedAt: null,
  };
  const create = vi
    .fn<(args: { data: Record<string, unknown> }) => Promise<typeof createdShare>>()
    .mockResolvedValue(createdShare);
  const prisma = {
    share: {
      create,
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    node: { findUnique: vi.fn().mockResolvedValue(node) },
    userProfile: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const policy = { assertCanManageNode: vi.fn().mockResolvedValue({ nodeId: node.id }) };
  const runtime = { read: vi.fn().mockResolvedValue({ publicLinksEnabled: true }) };
  return {
    service: new SharesService(prisma as never, policy as never, runtime),
    create,
    prisma,
  };
}

describe('SharesService', () => {
  it('persists only a sha256 digest and returns a one-time canonical fragment token', async () => {
    const { service, create } = harness();
    const result = await service.createPublic(owner, node.id);
    const token = result.url.split('#token=')[1]!;
    const tokenHash = create.mock.calls[0]?.[0].data.tokenHash;
    if (!Buffer.isBuffer(tokenHash)) throw new Error('Expected a persisted token digest.');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(tokenHash).toEqual(
      createHash('sha256').update(Buffer.from(token, 'base64url')).digest(),
    );
    expect(result.url).not.toContain(tokenHash.toString('base64url'));
  });

  it('rejects permissioned self-share after email normalization', async () => {
    const { service } = harness();
    await expect(
      service.createPermissioned(owner, node.id, { email: ' Owner@Example.com ', role: 'VIEWER' }),
    ).rejects.toThrow();
  });

  it('authorizes revoke through an owner-scoped share lookup before reading metadata', async () => {
    const { service, prisma } = harness();
    const otherPrincipal = authenticatedPrincipal(
      '55555555-5555-4555-8555-555555555555',
      'other@example.com',
    );
    prisma.share.findFirst.mockResolvedValue(null);

    await expect(
      service.revoke(otherPrincipal, '44444444-4444-4444-8444-444444444444'),
    ).rejects.toThrow(/not found/i);

    expect(prisma.share.findFirst).toHaveBeenCalledWith({
      where: {
        id: '44444444-4444-4444-8444-444444444444',
        grantedByUserId: otherPrincipal.userId,
      },
    });
    expect(prisma.share.findUnique).not.toHaveBeenCalled();
    expect(prisma.node.findUnique).not.toHaveBeenCalled();
    expect(prisma.share.updateMany).not.toHaveBeenCalled();
  });

  it.each(['P2002', '23505'])(
    'maps concurrent permissioned-share %s to stable conflict',
    async (code) => {
      const { service, create } = harness();
      create.mockRejectedValue(Object.assign(new Error('raw constraint details'), { code }));

      const error = await service
        .createPermissioned(owner, node.id, { email: 'recipient@example.com', role: 'VIEWER' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ApiException);
      expect((error as ApiException).getResponse()).toMatchObject({
        error: { code: 'CONFLICT', message: 'An active share already exists.' },
      });
      expect(JSON.stringify((error as ApiException).getResponse())).not.toContain('raw constraint');
    },
  );

  it.each([
    { createdAt: 'not-a-date', id: '44444444-4444-4444-8444-444444444444' },
    { createdAt: '2026-08-20T12:00:00Z', id: 'not-a-uuid' },
    { createdAt: '2026-08-20T12:00:00Z', id: '44444444-4444-4444-8444-444444444444', extra: true },
  ])('rejects malformed shared-with-me cursor before query execution', async (cursor) => {
    const { service, prisma } = harness();
    const encoded = Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

    const error = await service.sharedWithMe(owner, encoded, 20).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiException);
    expect((error as ApiException).getResponse()).toMatchObject({
      error: { code: 'VALIDATION_FAILED' },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
