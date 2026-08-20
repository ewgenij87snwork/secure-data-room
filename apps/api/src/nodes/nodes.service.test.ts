import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { NodeSummary } from '@data-room/contracts';
import { authenticatedPrincipal } from '../auth/principal.js';
import type { OwnedFolder, OwnedNode } from '../access-control/access-policy.service.js';
import { ApiException } from '../common/api-exception.js';
import { RuntimeControlsService } from '../runtime-controls/runtime-controls.service.js';
import { NodesService, normalizedNodeName } from './nodes.service.js';

const ownerId = '11111111-1111-4111-8111-111111111111';
const roomId = '22222222-2222-4222-8222-222222222222';
const parentId = '33333333-3333-4333-8333-333333333333';
const nodeId = '44444444-4444-4444-8444-444444444444';
const principal = authenticatedPrincipal(ownerId, 'owner@example.com');
const ownedFolder: OwnedFolder = {
  nodeId: parentId,
  dataRoomId: roomId,
  parentId: null,
  kind: 'FOLDER',
  accessRole: 'OWNER',
  accessRootNodeId: parentId,
};

function createdNode(overrides: Partial<NodeSummary> = {}): NodeSummary {
  return {
    id: nodeId,
    dataRoomId: roomId,
    parentId,
    kind: 'FOLDER',
    name: 'Legal',
    sizeBytes: null,
    mimeType: null,
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isShared: false,
    accessRole: 'OWNER',
    ...overrides,
  };
}

function harness(
  options: {
    maintenanceMode?: boolean;
    activeCount?: number;
    staleParent?: boolean;
    create?: () => Promise<unknown>;
  } = {},
) {
  const state = new Set<string>();
  let lockQuery: string | undefined;
  const tx = {
    runtimeControl: {
      upsert: vi.fn(() => {
        state.add('runtime');
        return Promise.resolve({
          registrationOpen: true,
          uploadsEnabled: true,
          publicLinksEnabled: false,
          maintenanceMode: options.maintenanceMode ?? false,
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        });
      }),
    },
    node: {
      count: vi.fn(() => {
        if (!state.has('parent')) throw new Error('quota before active-parent proof');
        state.add('quota');
        return Promise.resolve(options.activeCount ?? 0);
      }),
      create: vi.fn(() => {
        if (!state.has('runtime') || !state.has('parent') || !state.has('quota')) {
          throw new Error('create before transactional safety checks');
        }
        return (options.create?.() ??
          Promise.resolve({
            ...createdNode(),
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          })) as Promise<NodeSummary>;
      }),
    },
    $queryRaw: vi.fn((query: { strings: readonly string[] }) => {
      lockQuery = query.strings.join('');
      if (!lockQuery.includes('FOR UPDATE OF room, parent')) {
        throw new Error('room and parent must be locked');
      }
      state.add('parent');
      return Promise.resolve(
        options.staleParent ? [] : [{ dataRoomId: roomId, parentId, kind: 'FOLDER', ownerId }],
      );
    }),
  };
  const database = {
    $transaction: vi.fn((callback: (value: typeof tx) => Promise<NodeSummary>) => callback(tx)),
    node: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const policy = { assertCanCreateChild: vi.fn().mockResolvedValue(ownedFolder) };
  const runtime = new RuntimeControlsService();
  return {
    database,
    policy,
    runtime,
    state,
    tx,
    get lockQuery() {
      return lockQuery;
    },
  };
}

describe('NodesService', () => {
  it('creates an owner folder after the transactional safety checks', async () => {
    const h = harness();
    const service = new NodesService(h.database as never, h.policy as never, h.runtime);

    await expect(service.createFolder(principal, { parentId, name: 'Legal' })).resolves.toEqual(
      createdNode(),
    );
    expect(h.state).toEqual(new Set(['runtime', 'parent', 'quota']));
    expect(h.lockQuery).toContain('FOR UPDATE OF room, parent');
  });

  it('blocks maintenance and quota before node creation', async () => {
    const maintenance = harness({ maintenanceMode: true });
    const service = new NodesService(
      maintenance.database as never,
      maintenance.policy as never,
      maintenance.runtime,
    );
    await expect(
      service.createFolder(principal, { parentId, name: 'Legal' }),
    ).rejects.toMatchObject({
      response: { error: { code: 'MAINTENANCE_MODE' } },
    });
    expect(maintenance.state).toEqual(new Set(['runtime']));
    expect(maintenance.tx.node.create).not.toHaveBeenCalled();

    const quota = harness({ activeCount: 50 });
    const quotaService = new NodesService(
      quota.database as never,
      quota.policy as never,
      quota.runtime,
    );
    await expect(
      quotaService.createFolder(principal, { parentId, name: 'Legal' }),
    ).rejects.toMatchObject({
      response: { error: { code: 'QUOTA_EXCEEDED' } },
    });
    expect(quota.state).toEqual(new Set(['runtime', 'parent', 'quota']));
    expect(quota.tx.node.create).not.toHaveBeenCalled();
  });

  it('maps a sibling conflict to a bounded suggestion without database details', async () => {
    const conflict = Object.assign(new Error('secret constraint'), { code: 'P2002' });
    const h = harness({ create: () => Promise.reject(conflict) });
    h.database.node.findMany.mockResolvedValue([{ normalizedName: normalizedNodeName('Legal') }]);
    const service = new NodesService(h.database as never, h.policy as never, h.runtime);

    await expect(
      service.createFolder(principal, { parentId, name: 'Legal' }),
    ).rejects.toMatchObject({
      response: { error: { code: 'NAME_CONFLICT', details: { suggestedName: 'Legal (1)' } } },
    });
    expect(h.database.node.findMany).toHaveBeenCalledWith({
      where: { dataRoomId: roomId, parentId, deletedAt: null },
      select: { normalizedName: true },
    });
  });

  it('maps unknown persistence failures to a safe internal error', async () => {
    const h = harness({ create: () => Promise.reject(new Error('database password')) });
    const service = new NodesService(h.database as never, h.policy as never, h.runtime);

    const error: unknown = await service
      .createFolder(principal, { parentId, name: 'Legal' })
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      response: { error: { code: 'INTERNAL_ERROR', message: 'Folder creation failed.' } },
    });
    expect(JSON.stringify(error)).not.toContain('database password');
  });

  it('maps suggestion lookup failures to the same safe internal error', async () => {
    const conflict = Object.assign(new Error('raw constraint text'), { code: 'P2002' });
    const h = harness({ create: () => Promise.reject(conflict) });
    h.database.node.findMany.mockRejectedValue(new Error('raw database text'));
    const service = new NodesService(h.database as never, h.policy as never, h.runtime);
    const error: unknown = await service
      .createFolder(principal, { parentId, name: 'Legal' })
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      response: { error: { code: 'INTERNAL_ERROR', message: 'Folder creation failed.' } },
    });
    expect(JSON.stringify(error)).not.toContain('raw database text');
  });

  it('does not write when central policy denies the parent', async () => {
    const h = harness();
    h.policy.assertCanCreateChild.mockRejectedValue(new Error('denied'));
    const service = new NodesService(h.database as never, h.policy as never, h.runtime);
    await expect(service.createFolder(principal, { parentId, name: 'Legal' })).rejects.toThrow(
      'denied',
    );
    expect(h.database.$transaction).not.toHaveBeenCalled();
    expect(h.tx.node.create).not.toHaveBeenCalled();
  });

  it('does not write when the defensive parent proof is stale', async () => {
    const h = harness({ staleParent: true });
    const service = new NodesService(h.database as never, h.policy as never, h.runtime);
    await expect(
      service.createFolder(principal, { parentId, name: 'Legal' }),
    ).rejects.toMatchObject({ response: { error: { code: 'ACCESS_DENIED' } } });
    expect(h.state).toEqual(new Set(['runtime', 'parent']));
    expect(h.tx.node.create).not.toHaveBeenCalled();
  });

  it('preserves an existing HTTP exception unchanged', async () => {
    const expected = new ApiException('ACCESS_DENIED', HttpStatus.FORBIDDEN, 'Access denied.');
    const h = harness({ create: () => Promise.reject(expected) });
    const service = new NodesService(h.database as never, h.policy as never, h.runtime);

    const error: unknown = await service
      .createFolder(principal, { parentId, name: 'Legal' })
      .catch((cause: unknown) => cause);
    expect(error).toBe(expected);
  });
});

const ownedRenameNode: OwnedNode = {
  nodeId,
  dataRoomId: roomId,
  parentId,
  kind: 'FOLDER',
  accessRole: 'OWNER',
  accessRootNodeId: parentId,
};

function renameHarness() {
  const transaction = {
    node: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({
        ...createdNode({ name: 'Renamed', revision: 2 }),
        normalizedName: 'renamed',
        deletedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
      }),
    },
  };
  const database = {
    $transaction: vi.fn((callback: (value: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
    ),
    node: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const policy = {
    assertCanManageNode: vi.fn().mockResolvedValue(ownedRenameNode),
  };
  return { database, policy, runtime: new RuntimeControlsService(), transaction };
}

describe('NodesService rename', () => {
  it('renames with the expected revision and returns the incremented summary', async () => {
    const h = renameHarness();
    const service = new NodesService(h.database as never, h.policy as never, h.runtime);

    await expect(
      service.renameNode(principal, nodeId, { name: 'Renamed', expectedRevision: 1 }),
    ).resolves.toMatchObject({ id: nodeId, name: 'Renamed', revision: 2 });
    expect(h.policy.assertCanManageNode).toHaveBeenCalledWith(principal, nodeId);
  });

  it('maps a stale compare-and-swap to CONFLICT', async () => {
    const h = renameHarness();
    h.transaction.node.updateMany.mockResolvedValue({ count: 0 });
    h.transaction.node.findUnique.mockResolvedValue({
      ...createdNode({ revision: 2 }),
      normalizedName: 'legal',
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:01.000Z'),
    });
    const service = new NodesService(h.database as never, h.policy as never, h.runtime);

    await expect(
      service.renameNode(principal, nodeId, { name: 'Renamed', expectedRevision: 1 }),
    ).rejects.toMatchObject({ response: { error: { code: 'CONFLICT' } } });
  });

  it('maps a raw PostgreSQL sibling conflict using the renamed node parent', async () => {
    const h = renameHarness();
    h.transaction.node.updateMany.mockRejectedValue(
      Object.assign(new Error('private constraint'), { code: 'P2002' }),
    );
    h.database.node.findMany.mockResolvedValue([{ normalizedName: 'existing' }]);
    const service = new NodesService(h.database as never, h.policy as never, h.runtime);

    await expect(
      service.renameNode(principal, nodeId, { name: 'Existing', expectedRevision: 1 }),
    ).rejects.toMatchObject({
      response: { error: { code: 'NAME_CONFLICT', details: { suggestedName: 'Existing (1)' } } },
    });
    expect(h.database.node.findMany).toHaveBeenCalledWith({
      where: { dataRoomId: roomId, parentId, deletedAt: null },
      select: { normalizedName: true },
    });
  });

  it('does not attempt a rename when owner policy denies the node', async () => {
    const h = renameHarness();
    h.policy.assertCanManageNode.mockRejectedValue(new Error('denied'));
    const service = new NodesService(h.database as never, h.policy as never, h.runtime);

    await expect(
      service.renameNode(principal, nodeId, { name: 'Renamed', expectedRevision: 1 }),
    ).rejects.toThrow('denied');
    expect(h.database.$transaction).not.toHaveBeenCalled();
  });
});
