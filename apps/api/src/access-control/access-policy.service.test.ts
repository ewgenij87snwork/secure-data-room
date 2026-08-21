import { describe, expect, it, vi } from 'vitest';
import { authenticatedPrincipal } from '../auth/principal.js';
import {
  AccessDeniedException,
  AccessInternalException,
  AccessPolicyService,
  type AccessPolicyDatabase,
  type AccessPolicyRow,
  publicLinkPrincipal,
} from './access-policy.service.js';
import { accessPolicyQuery } from './access-policy.queries.js';
import { isPublicLinkPrincipal } from './access-policy.types.js';

const ownerId = '11111111-1111-4111-8111-111111111111';
const viewerId = '22222222-2222-4222-8222-222222222222';
const unrelatedId = '33333333-3333-4333-8333-333333333333';
const roomId = '44444444-4444-4444-8444-444444444444';
const targetId = '55555555-5555-4555-8555-555555555555';
const childId = '66666666-6666-4666-8666-666666666666';
const shareId = '77777777-7777-4777-8777-777777777777';

function row(overrides: Partial<AccessPolicyRow> = {}): AccessPolicyRow {
  return {
    targetId,
    targetExists: true,
    targetKind: 'FOLDER',
    parentId: null,
    dataRoomId: roomId,
    ownerId,
    hasDeletedAncestor: false,
    roomRootNodeId: targetId,
    winningRole: null,
    winningShareId: null,
    winningTargetNodeId: null,
    winningAccessRootNodeId: null,
    ...overrides,
  };
}

function harness(result: AccessPolicyRow): {
  database: AccessPolicyDatabase;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn().mockResolvedValue([result]);
  return { database: { $queryRaw: query }, query };
}

const owner = authenticatedPrincipal(ownerId, 'owner@example.com');
const viewer = authenticatedPrincipal(viewerId, 'viewer@example.com');
const unrelated = authenticatedPrincipal(unrelatedId, 'unrelated@example.com');
const publicLink = publicLinkPrincipal(shareId, targetId);

describe('AccessPolicyService', () => {
  it.each([
    ['owner', owner, row()],
    [
      'bound viewer on target',
      viewer,
      row({
        winningRole: 'VIEWER',
        winningShareId: shareId,
        winningTargetNodeId: targetId,
        winningAccessRootNodeId: targetId,
      }),
    ],
    [
      'bound editor on descendant',
      viewer,
      row({
        winningRole: 'EDITOR',
        winningShareId: shareId,
        winningTargetNodeId: targetId,
        winningAccessRootNodeId: targetId,
      }),
    ],
    [
      'active public link on target',
      publicLink,
      row({
        winningRole: 'VIEWER',
        winningShareId: shareId,
        winningTargetNodeId: targetId,
        winningAccessRootNodeId: targetId,
      }),
    ],
  ])('allows %s to read the authorized target', async (_name, principal, result) => {
    const { database } = harness(result);
    await expect(
      new AccessPolicyService(database).assertCanReadNode(principal, targetId),
    ).resolves.toEqual({
      nodeId: targetId,
      dataRoomId: roomId,
      parentId: null,
      kind: 'FOLDER',
      accessRole: principal === owner ? 'OWNER' : (result.winningRole ?? 'VIEWER'),
      accessRootNodeId: principal === owner ? targetId : targetId,
    });
  });

  it.each([
    ['unrelated user', unrelated, row()],
    ['revoked user share', viewer, row({ winningRole: null })],
    ['deleted target', viewer, row({ winningRole: 'VIEWER', targetExists: false })],
    ['deleted ancestor', viewer, row({ winningRole: 'VIEWER', hasDeletedAncestor: true })],
    [
      'cross-room target',
      viewer,
      row({ targetExists: false, dataRoomId: '88888888-8888-4888-8888-888888888888' }),
    ],
    ['ancestor without a share', viewer, row({ winningRole: null })],
    ['sibling without a share', viewer, row({ winningRole: null })],
    ['public link with no matching share', publicLink, row()],
  ])('denies %s with the safe envelope', async (_name, principal, result) => {
    const { database } = harness(result);
    const error = await new AccessPolicyService(database)
      .assertCanReadNode(principal, childId)
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AccessDeniedException);
    expect(error).toMatchObject({
      response: { error: { code: 'ACCESS_DENIED', message: 'Access denied.' } },
    });
    expect(JSON.stringify(error)).not.toContain(childId);
  });

  it('allows only the room owner to manage its node and returns an owned record', async () => {
    const ownerHarness = harness(row());
    await expect(
      new AccessPolicyService(ownerHarness.database).assertCanManageNode(owner, targetId),
    ).resolves.toEqual({
      nodeId: targetId,
      dataRoomId: roomId,
      parentId: null,
      kind: 'FOLDER',
      accessRole: 'OWNER',
      accessRootNodeId: targetId,
    });
  });

  it.each([
    ['editor share', viewer, row({ winningRole: 'EDITOR' })],
    ['unrelated user', unrelated, row()],
  ])('denies %s from managing its node', async (_name, principal, result) => {
    const { database } = harness(result);
    await expect(
      new AccessPolicyService(database).assertCanManageNode(principal, targetId),
    ).rejects.toBeInstanceOf(AccessDeniedException);
  });

  it('requires OWNER for management even when a user can view', async () => {
    const { database } = harness(row({ winningRole: 'VIEWER' }));
    await expect(
      new AccessPolicyService(database).assertCanManageNode(viewer, targetId),
    ).rejects.toBeInstanceOf(AccessDeniedException);
  });

  it('allows OWNER to create only inside an active folder', async () => {
    const folder = harness(row());
    await expect(
      new AccessPolicyService(folder.database).assertCanCreateChild(owner, targetId),
    ).resolves.toEqual({
      nodeId: targetId,
      dataRoomId: roomId,
      parentId: null,
      kind: 'FOLDER',
      accessRole: 'OWNER',
      accessRootNodeId: targetId,
    });

    const file = harness(row({ targetKind: 'FILE' }));
    await expect(
      new AccessPolicyService(file.database).assertCanCreateChild(owner, targetId),
    ).rejects.toBeInstanceOf(AccessDeniedException);
  });

  it('uses one parameterized policy query for every decision', async () => {
    const { database, query } = harness(
      row({ winningRole: 'VIEWER', winningAccessRootNodeId: targetId }),
    );
    await new AccessPolicyService(database).assertCanReadNode(viewer, targetId);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toBeDefined();
  });

  it('fails closed without exposing a database error', async () => {
    const query = vi.fn().mockRejectedValue(new Error('database details must stay private'));
    const database: AccessPolicyDatabase = { $queryRaw: query };
    const error = await new AccessPolicyService(database)
      .assertCanReadNode(viewer, targetId)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(AccessInternalException);
    expect(error).toMatchObject({
      response: { error: { code: 'INTERNAL_ERROR', message: 'Access policy unavailable.' } },
    });
    expect(JSON.stringify(error)).not.toContain('database details');
  });

  it('rejects a forged authenticated object before querying', async () => {
    const query = vi.fn();
    const database: AccessPolicyDatabase = { $queryRaw: query };
    const forged = Object.freeze({
      kind: 'authenticated',
      userId: ownerId,
      email: 'owner@example.com',
    });

    await expect(
      new AccessPolicyService(database).assertCanReadNode(forged as never, targetId),
    ).rejects.toBeInstanceOf(AccessDeniedException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a forged authenticated object for management before querying', async () => {
    const query = vi.fn();
    const database: AccessPolicyDatabase = { $queryRaw: query };
    const forged = Object.freeze({
      kind: 'authenticated',
      userId: ownerId,
      email: 'owner@example.com',
    });

    await expect(
      new AccessPolicyService(database).assertCanManageNode(forged as never, targetId),
    ).rejects.toBeInstanceOf(AccessDeniedException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a forged public-link object before querying', async () => {
    const query = vi.fn();
    const database: AccessPolicyDatabase = { $queryRaw: query };
    const forged = Object.freeze({
      kind: 'public-link',
      shareId,
      targetNodeId: targetId,
      role: 'VIEWER',
    });

    await expect(
      new AccessPolicyService(database).assertCanReadNode(forged as never, targetId),
    ).rejects.toBeInstanceOf(AccessDeniedException);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('public-link principals', () => {
  it('rejects non-UUID identifiers while constructing', () => {
    expect(() => publicLinkPrincipal('not-a-uuid', targetId)).toThrow(TypeError);
  });

  it('creates a frozen branded principal with a non-enumerable private brand', () => {
    const principal = publicLinkPrincipal(shareId, targetId);
    expect(principal).toEqual({
      kind: 'public-link',
      shareId,
      targetNodeId: targetId,
      role: 'VIEWER',
    });
    expect(Object.isFrozen(principal)).toBe(true);
    expect(Object.keys(principal)).toEqual(['kind', 'shareId', 'targetNodeId', 'role']);
    expect(isPublicLinkPrincipal(principal)).toBe(true);
  });

  it.each([
    null,
    { kind: 'public-link', shareId, targetNodeId: targetId, role: 'VIEWER' },
    Object.freeze({ kind: 'public-link', shareId, targetNodeId: targetId, role: 'VIEWER' }),
  ])('rejects forged or mutable principal %o', (value) =>
    expect(isPublicLinkPrincipal(value)).toBe(false),
  );
});

describe('access policy query shape', () => {
  it('uses a recursive same-room query with deterministic winning-share precedence', () => {
    const query = accessPolicyQuery(viewer, targetId);
    const sql = query.strings.join('');
    expect(sql).toContain('WITH RECURSIVE ancestry');
    expect(sql).toContain('"dataRoomId" = parent."dataRoomId"');
    expect(sql).toContain('child.depth < 64');
    expect(sql).toContain('ANY(child.visited)');
    expect(sql).toContain('"revokedAt" IS NULL');
    expect(sql).toContain('"deletedAt" IS NULL');
    expect(sql).toContain('"role" = \'EDITOR\'');
    expect(sql).toContain('ORDER BY share_role_rank ASC');
    expect(sql).toContain('bound_target.depth ASC');
    expect(sql).toContain('share."id" ASC');
    expect(sql).toContain('share."principalType" = \'USER\'');
    expect(sql).not.toContain(targetId);
    expect(query.values).toContain(targetId);

    const publicSql = accessPolicyQuery(publicLink, targetId).strings.join('');
    expect(publicSql).toContain('"role" = \'VIEWER\'');
    expect(publicSql).toContain('share."principalType" = \'PUBLIC_LINK\'');
  });

  it('binds a public link to the exact share and target node', () => {
    const query = accessPolicyQuery(publicLink, targetId);
    const sql = query.strings.join('');
    expect(sql).toContain('share."id" = ');
    expect(sql).toContain('share."targetNodeId" = ');
    expect(sql).toContain('share."role" = \'VIEWER\'');
    expect(sql).not.toContain('tokenHash');
    expect(query.values).toEqual(expect.arrayContaining([shareId, targetId]));
  });
});
