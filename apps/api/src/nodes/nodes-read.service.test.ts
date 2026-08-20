import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { authenticatedPrincipal } from '../auth/principal.js';
import { AccessDeniedException } from '../access-control/access-policy.service.js';
import { ApiException } from '../common/api-exception.js';
import { NodesReadService } from './nodes-read.service.js';

const principal = authenticatedPrincipal('11111111-1111-4111-8111-111111111111', 'a@b.test');
const nodeId = '22222222-2222-4222-8222-222222222222';
const roomId = '33333333-3333-4333-8333-333333333333';
const rootId = '44444444-4444-4444-8444-444444444444';
const row = {
  id: nodeId,
  dataRoomId: roomId,
  parentId: rootId,
  kind: 'FOLDER' as const,
  name: 'Legal',
  normalizedName: 'legal',
  sizeBytes: null,
  mimeType: null,
  revision: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function harness(accessRole: 'OWNER' | 'VIEWER' | 'EDITOR' = 'OWNER') {
  const prisma = { $queryRaw: vi.fn().mockResolvedValue([row]) };
  const policy = {
    assertCanReadNode: vi.fn().mockResolvedValue({
      nodeId,
      dataRoomId: roomId,
      parentId: rootId,
      kind: 'FOLDER',
      accessRole,
      accessRootNodeId: rootId,
    }),
  };
  return { prisma, policy, service: new NodesReadService(prisma as never, policy as never) };
}

describe('NodesReadService', () => {
  it.each(['VIEWER', 'EDITOR'] as const)(
    'authorizes before exact node metadata and maps the %s shared role',
    async (role) => {
      const h = harness(role);
      await expect(h.service.getNode(principal, nodeId)).resolves.toMatchObject({
        id: nodeId,
        accessRole: role,
        isShared: true,
      });
      expect(h.policy.assertCanReadNode).toHaveBeenCalledWith(principal, nodeId);
      expect(h.prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(h.policy.assertCanReadNode.mock.invocationCallOrder[0]).toBeLessThan(
        h.prisma.$queryRaw.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
      );
    },
  );

  it('maps an active file and freezes the node summary', async () => {
    const h = harness();
    h.prisma.$queryRaw.mockResolvedValue([
      {
        ...row,
        kind: 'FILE',
        name: 'Agreement.pdf',
        normalizedName: 'agreement.pdf',
        sizeBytes: 42n,
        mimeType: 'application/pdf',
      },
    ]);
    const result = await h.service.getNode(principal, nodeId);
    expect(result).toMatchObject({ kind: 'FILE', sizeBytes: '42', mimeType: 'application/pdf' });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('fails closed when authorized node metadata becomes stale', async () => {
    const h = harness();
    h.prisma.$queryRaw.mockResolvedValue([]);
    await expect(h.service.getNode(principal, nodeId)).rejects.toBeInstanceOf(
      AccessDeniedException,
    );
  });

  it('does not query metadata after policy denial', async () => {
    const h = harness();
    h.policy.assertCanReadNode.mockRejectedValue(new AccessDeniedException());
    await expect(h.service.getNode(principal, nodeId)).rejects.toBeInstanceOf(
      AccessDeniedException,
    );
    expect(h.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('does not query breadcrumbs after policy denial', async () => {
    const h = harness();
    h.policy.assertCanReadNode.mockRejectedValue(new AccessDeniedException());
    await expect(h.service.getBreadcrumbs(principal, nodeId)).rejects.toBeInstanceOf(
      AccessDeniedException,
    );
    expect(h.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('fails closed for a breadcrumb path that misses the access root', async () => {
    const h = harness('VIEWER');
    h.prisma.$queryRaw.mockResolvedValue([{ id: nodeId, name: 'Legal', depth: 0 }]);
    await expect(h.service.getBreadcrumbs(principal, nodeId)).rejects.toMatchObject({
      response: { error: { code: 'ACCESS_DENIED' } },
    });
  });

  it('returns frozen root-to-current breadcrumbs', async () => {
    const h = harness();
    h.prisma.$queryRaw.mockResolvedValue([
      { id: rootId, name: 'Root', depth: 1 },
      { id: nodeId, name: 'Legal', depth: 0 },
    ]);
    const result = await h.service.getBreadcrumbs(principal, nodeId);
    expect(result.items.map(({ id }) => id)).toEqual([rootId, nodeId]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.items)).toBe(true);
    expect(result.items.every((item) => Object.isFrozen(item))).toBe(true);
  });

  it('returns one breadcrumb when the target is the authorized root', async () => {
    const h = harness('VIEWER');
    h.policy.assertCanReadNode.mockResolvedValue({
      nodeId,
      dataRoomId: roomId,
      parentId: rootId,
      kind: 'FOLDER',
      accessRole: 'VIEWER',
      accessRootNodeId: nodeId,
    });
    h.prisma.$queryRaw.mockResolvedValue([{ id: nodeId, name: 'Legal', depth: 0 }]);
    await expect(h.service.getBreadcrumbs(principal, nodeId)).resolves.toEqual({
      items: [{ id: nodeId, name: 'Legal' }],
    });
  });

  it('maps unknown read errors to a safe internal error', async () => {
    const h = harness();
    h.prisma.$queryRaw.mockRejectedValue(new Error('secret database detail'));
    const error = await h.service.getNode(principal, nodeId).catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      response: { error: { code: 'INTERNAL_ERROR', message: 'Node read failed.' } },
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
    expect(JSON.stringify(error)).not.toContain('secret database detail');
    expect(error).toBeInstanceOf(ApiException);
  });

  it('maps unknown breadcrumb errors to a safe internal error', async () => {
    const h = harness();
    h.prisma.$queryRaw.mockRejectedValue(new Error('private SQL detail'));
    const error = await h.service
      .getBreadcrumbs(principal, nodeId)
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      response: { error: { code: 'INTERNAL_ERROR', message: 'Breadcrumb lookup failed.' } },
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
    expect(JSON.stringify(error)).not.toContain('private SQL detail');
  });
});
