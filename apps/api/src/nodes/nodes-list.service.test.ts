import { ForbiddenException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { authenticatedPrincipal } from '../auth/principal.js';
import { encodeNodeCursor } from './node-cursor.js';
import { NodesListService } from './nodes-list.service.js';

const principal = authenticatedPrincipal('11111111-1111-4111-8111-111111111111', 'a@b.test');
const parent = '22222222-2222-4222-8222-222222222222';
const access = {
  nodeId: parent,
  dataRoomId: '33333333-3333-4333-8333-333333333333',
  parentId: null,
  kind: 'FOLDER' as const,
  accessRole: 'VIEWER' as const,
  accessRootNodeId: parent,
};
const row = (id: string, name: string) => ({
  id,
  dataRoomId: access.dataRoomId,
  parentId: parent,
  kind: 'FILE' as const,
  name,
  normalizedName: name.toLowerCase(),
  sizeBytes: 1n,
  mimeType: 'application/pdf',
  revision: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});
describe('NodesListService', () => {
  it('authorizes before listing and maps shared rows', async () => {
    const policy = { assertCanReadNode: vi.fn().mockResolvedValue(access) };
    const database = {
      $queryRaw: vi.fn().mockResolvedValue([row('44444444-4444-4444-8444-444444444444', 'A')]),
    };
    const result = await new NodesListService(database as never, policy as never).listChildren(
      principal,
      parent,
      { limit: 50 },
    );
    expect(policy.assertCanReadNode).toHaveBeenCalledBefore(database.$queryRaw);
    expect(result.items[0]).toMatchObject({ isShared: true, accessRole: 'VIEWER' });
  });
  it('rejects an accessible file without a listing read', async () => {
    const policy = { assertCanReadNode: vi.fn().mockResolvedValue({ ...access, kind: 'FILE' }) };
    const database = { $queryRaw: vi.fn() };
    await expect(
      new NodesListService(database as never, policy as never).listChildren(principal, parent, {
        limit: 50,
      }),
    ).rejects.toMatchObject({
      response: { error: { code: 'INVALID_PARENT' } },
      status: HttpStatus.BAD_REQUEST,
    });
    expect(database.$queryRaw).not.toHaveBeenCalled();
  });
  it('uses limit plus one and emits a cursor', async () => {
    const policy = {
      assertCanReadNode: vi.fn().mockResolvedValue({ ...access, accessRole: 'OWNER' }),
    };
    const database = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: 3 }, (_, i) =>
            row(`44444444-4444-4444-8444-44444444444${i}`, `A${i}`),
          ),
        ),
    };
    const result = await new NodesListService(database as never, policy as never).listChildren(
      principal,
      parent,
      { limit: 2 },
    );
    expect(database.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ isShared: false, accessRole: 'OWNER' });
    expect(result.pageInfo.hasNextPage).toBe(true);
    expect(result.pageInfo.nextCursor).toBe(
      encodeNodeCursor({
        kind: 'FILE',
        normalizedName: 'a1',
        id: '44444444-4444-4444-8444-444444444441',
      }),
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.items)).toBe(true);
    expect(Object.isFrozen(result.pageInfo)).toBe(true);
  });

  it('returns a final page without a cursor', async () => {
    const policy = { assertCanReadNode: vi.fn().mockResolvedValue(access) };
    const database = {
      $queryRaw: vi.fn().mockResolvedValue([row('44444444-4444-4444-8444-444444444444', 'A')]),
    };
    const result = await new NodesListService(database as never, policy as never).listChildren(
      principal,
      parent,
      { limit: 2 },
    );
    expect(result.pageInfo).toEqual({ hasNextPage: false, nextCursor: null });
  });

  it('validates a cursor anchor inside the authorized parent', async () => {
    const policy = { assertCanReadNode: vi.fn().mockResolvedValue(access) };
    const cursor = encodeNodeCursor({
      kind: 'FILE',
      normalizedName: 'a',
      id: '44444444-4444-4444-8444-444444444444',
    });
    const database = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'anchor' }])
        .mockResolvedValueOnce([]),
    };
    const result = await new NodesListService(database as never, policy as never).listChildren(
      principal,
      parent,
      { cursor, limit: 50 },
    );
    expect(result.items).toEqual([]);
    expect(database.$queryRaw).toHaveBeenCalledTimes(2);
    const sql = database.$queryRaw.mock.calls
      .map(([query]) => (query as { strings: string[] }).strings.join(''))
      .join(' ');
    expect(sql).toContain('"dataRoomId"');
    expect(sql).toContain('"parentId"');
  });

  it('rejects a cursor outside the authorized parent', async () => {
    const policy = { assertCanReadNode: vi.fn().mockResolvedValue(access) };
    const cursor = encodeNodeCursor({
      kind: 'FILE',
      normalizedName: 'a',
      id: '44444444-4444-4444-8444-444444444444',
    });
    const database = { $queryRaw: vi.fn().mockResolvedValue([]) };
    await expect(
      new NodesListService(database as never, policy as never).listChildren(principal, parent, {
        cursor,
        limit: 50,
      }),
    ).rejects.toMatchObject({ response: { error: { code: 'VALIDATION_FAILED' } } });
    expect(database.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('does not query when central policy denies access', async () => {
    const denied = new ForbiddenException('denied');
    const policy = { assertCanReadNode: vi.fn().mockRejectedValue(denied) };
    const database = { $queryRaw: vi.fn() };
    await expect(
      new NodesListService(database as never, policy as never).listChildren(principal, parent, {
        limit: 50,
      }),
    ).rejects.toBe(denied);
    expect(database.$queryRaw).not.toHaveBeenCalled();
  });

  it('preserves an existing HTTP exception from the read boundary', async () => {
    const expected = new ForbiddenException('safe denial');
    const policy = { assertCanReadNode: vi.fn().mockResolvedValue(access) };
    const database = { $queryRaw: vi.fn().mockRejectedValue(expected) };
    await expect(
      new NodesListService(database as never, policy as never).listChildren(principal, parent, {
        limit: 50,
      }),
    ).rejects.toBe(expected);
  });

  it('maps unknown persistence failures to a safe internal error', async () => {
    const policy = { assertCanReadNode: vi.fn().mockResolvedValue(access) };
    const database = { $queryRaw: vi.fn().mockRejectedValue(new Error('raw database password')) };
    const error: unknown = await new NodesListService(database as never, policy as never)
      .listChildren(principal, parent, { limit: 50 })
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      response: { error: { code: 'INTERNAL_ERROR', message: 'Node listing failed.' } },
    });
    expect(JSON.stringify(error)).not.toContain('raw database password');
  });
});
