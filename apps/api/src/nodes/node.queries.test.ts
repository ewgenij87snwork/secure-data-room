import { describe, expect, it } from 'vitest';
import { activeChildrenQuery, nodeCursorAnchorQuery } from './node.queries.js';

const room = '550e8400-e29b-41d4-a716-446655440000';
const parent = '650e8400-e29b-41d4-a716-446655440000';
const cursor = {
  kind: 'FILE' as const,
  normalizedName: "x' OR 1=1 --",
  id: '750e8400-e29b-41d4-a716-446655440000',
};
describe('node pagination queries', () => {
  it('uses exact room/parent ordering and parameterized cursor values', () => {
    const query = activeChildrenQuery(room, parent, cursor, 51);
    const text = query.strings.join('');
    expect(text).toContain('"dataRoomId"');
    expect(text).toContain('ORDER BY "kind" ASC, "normalizedName" ASC, "id" ASC');
    expect(text).toContain('"deletedAt" IS NULL');
    expect(text).not.toContain("x' OR 1=1");
    expect(nodeCursorAnchorQuery(room, parent, cursor).strings.join('')).toContain('LIMIT 1');
  });
});
