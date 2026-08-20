import { describe, expect, it, vi } from 'vitest';
import { authenticatedPrincipal } from '../auth/principal.js';
import { AccessDeniedException, type OwnedNode } from '../access-control/access-policy.service.js';
import { DeleteService } from './delete.service.js';

const ownerId = '11111111-1111-4111-8111-111111111111';
const roomId = '22222222-2222-4222-8222-222222222222';
const rootId = '33333333-3333-4333-8333-333333333333';
const nodeId = '44444444-4444-4444-8444-444444444444';
const principal = authenticatedPrincipal(ownerId, 'owner@example.com');
const ownedNode: OwnedNode = {
  nodeId,
  dataRoomId: roomId,
  parentId: rootId,
  kind: 'FOLDER',
  accessRole: 'OWNER',
  accessRootNodeId: rootId,
};

const impactRow = {
  rootNodeId: nodeId,
  folderCount: 1,
  fileCount: 2,
  totalBytes: '42',
  activeShareCount: 3,
  rootExists: true,
  traversalComplete: true,
};

function harness() {
  const transaction = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([
        { id: nodeId, parentId: rootId, deletedAt: null, cleanupJobExists: false },
      ])
      .mockResolvedValueOnce([{ ...impactRow, tombstonedCount: 4 }]),
  };
  const database = {
    $queryRaw: vi.fn().mockResolvedValue([impactRow]),
    $transaction: vi.fn((callback: (value: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
    ),
  };
  const policy = { assertCanManageNode: vi.fn().mockResolvedValue(ownedNode) };
  return { database, policy, transaction };
}

describe('DeleteService', () => {
  it('returns the exact complete active-subtree impact', async () => {
    const h = harness();
    const service = new DeleteService(h.database as never, h.policy as never);

    await expect(service.getDeleteImpact(principal, nodeId)).resolves.toEqual({
      rootNodeId: nodeId,
      folderCount: 1,
      fileCount: 2,
      totalBytes: '42',
      activeShareCount: 3,
    });
    expect(h.policy.assertCanManageNode).toHaveBeenCalledWith(principal, nodeId);
  });

  it('locks and deletes in one Serializable transaction', async () => {
    const h = harness();
    const service = new DeleteService(h.database as never, h.policy as never);

    await expect(service.deleteNode(principal, nodeId)).resolves.toEqual({
      rootNodeId: nodeId,
      folderCount: 1,
      fileCount: 2,
      totalBytes: '42',
      activeShareCount: 3,
    });
    expect(h.database.$transaction).toHaveBeenCalledOnce();
    expect(h.database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(h.transaction.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('rejects root and policy denials before a mutation transaction', async () => {
    const root = harness();
    root.policy.assertCanManageNode.mockResolvedValue({ ...ownedNode, parentId: null });
    const rootService = new DeleteService(root.database as never, root.policy as never);
    await expect(rootService.deleteNode(principal, nodeId)).rejects.toMatchObject({
      response: { error: { code: 'CONFLICT' } },
    });
    expect(root.database.$transaction).not.toHaveBeenCalled();

    const denied = harness();
    denied.policy.assertCanManageNode.mockRejectedValue(new AccessDeniedException());
    denied.database.$queryRaw.mockResolvedValue([]);
    const deniedService = new DeleteService(denied.database as never, denied.policy as never);
    await expect(deniedService.deleteNode(principal, nodeId)).rejects.toMatchObject({
      response: { error: { code: 'ACCESS_DENIED' } },
    });
    expect(denied.database.$transaction).not.toHaveBeenCalled();
  });

  it('returns an idempotent empty impact only for a proved owner deletion receipt', async () => {
    const h = harness();
    h.policy.assertCanManageNode.mockRejectedValue(new AccessDeniedException());
    h.database.$queryRaw.mockResolvedValue([{ id: nodeId }]);
    const service = new DeleteService(h.database as never, h.policy as never);

    await expect(service.deleteNode(principal, nodeId)).resolves.toEqual({
      rootNodeId: nodeId,
      folderCount: 0,
      fileCount: 0,
      totalBytes: '0',
      activeShareCount: 0,
    });
    expect(h.database.$transaction).not.toHaveBeenCalled();
  });

  it('fails closed on a truncated traversal without returning partial impact', async () => {
    const h = harness();
    h.database.$queryRaw.mockResolvedValue([{ ...impactRow, traversalComplete: false }]);
    const service = new DeleteService(h.database as never, h.policy as never);

    await expect(service.getDeleteImpact(principal, nodeId)).rejects.toMatchObject({
      response: { error: { code: 'INTERNAL_ERROR' } },
    });
  });

  it('retries one serialization conflict and never loops beyond the bound', async () => {
    const h = harness();
    h.database.$transaction
      .mockRejectedValueOnce(Object.assign(new Error('serialization'), { code: 'P2034' }))
      .mockImplementationOnce((callback: (value: typeof h.transaction) => Promise<unknown>) =>
        callback(h.transaction),
      );
    const service = new DeleteService(h.database as never, h.policy as never);

    await expect(service.deleteNode(principal, nodeId)).resolves.toEqual({
      rootNodeId: nodeId,
      folderCount: 1,
      fileCount: 2,
      totalBytes: '42',
      activeShareCount: 3,
    });
    expect(h.database.$transaction).toHaveBeenCalledTimes(2);
  });

  it('retries the raw-query adapter shape used for a PostgreSQL write conflict', async () => {
    const h = harness();
    h.database.$transaction
      .mockRejectedValueOnce(
        Object.assign(new Error('raw query failed'), {
          code: 'P2010',
          meta: {
            driverAdapterError: {
              name: 'DriverAdapterError',
              cause: { kind: 'TransactionWriteConflict' },
            },
          },
        }),
      )
      .mockImplementationOnce((callback: (value: typeof h.transaction) => Promise<unknown>) =>
        callback(h.transaction),
      );
    const service = new DeleteService(h.database as never, h.policy as never);

    await expect(service.deleteNode(principal, nodeId)).resolves.toEqual({
      rootNodeId: nodeId,
      folderCount: 1,
      fileCount: 2,
      totalBytes: '42',
      activeShareCount: 3,
    });
    expect(h.database.$transaction).toHaveBeenCalledTimes(2);
  });
});
