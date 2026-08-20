import { describe, expect, it } from 'vitest';
import { deleteImpactQuery, deleteSubtreeQuery, lockDeleteTargetQuery } from './delete.queries.js';

const roomId = '11111111-1111-4111-8111-111111111111';
const nodeId = '22222222-2222-4222-8222-222222222222';
const ownerId = '33333333-3333-4333-8333-333333333333';

describe('delete queries', () => {
  it('uses one same-room active subtree with cycle and depth boundaries', () => {
    const impactSql = deleteImpactQuery(roomId, nodeId).strings.join('');
    const mutationSql = deleteSubtreeQuery(
      roomId,
      nodeId,
      new Date('2026-01-01T00:00:00.000Z'),
    ).strings.join('');

    for (const sql of [impactSql, mutationSql]) {
      expect(sql).toContain('WITH RECURSIVE');
      expect(sql).toContain('child."dataRoomId" = ');
      expect(sql).toContain('child."deletedAt" IS NULL');
      expect(sql).toContain('NOT child."id" = ANY(parent.path)');
      expect(sql).toContain('parent.depth < ');
      expect(sql).toContain('traversal_boundary');
    }
    expect(mutationSql.match(/subtree AS/gu)).toHaveLength(2);
    expect(mutationSql).toContain('safe_subtree');
  });

  it('locks the owning room and target before delete orchestration', () => {
    const sql = lockDeleteTargetQuery(ownerId, roomId, nodeId).strings.join('');
    expect(sql).toContain('room."ownerId" = ');
    expect(sql).toContain('FOR UPDATE OF room, target');
  });
});
