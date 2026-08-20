import { describe, expect, it } from 'vitest';
import { activeNodeQuery, breadcrumbQuery } from './node.read.queries.js';

const room = '550e8400-e29b-41d4-a716-446655440000';
const node = '650e8400-e29b-41d4-a716-446655440000';
const root = '750e8400-e29b-41d4-a716-446655440000';

describe('node read queries', () => {
  it('reads one exact active node without sensitive columns', () => {
    const query = activeNodeQuery(room, node);
    const text = query.strings.join('');
    expect(text).toContain('"dataRoomId"');
    expect(text).toContain('"deletedAt" IS NULL');
    expect(text).not.toContain('storageKey');
    expect(text).not.toContain(room);
    expect(query.values).toEqual([room, node]);
  });

  it('bounds breadcrumbs at the parameterized access root', () => {
    const query = breadcrumbQuery(room, node, root);
    const text = query.strings.join('');
    expect(text).toContain('WITH RECURSIVE');
    expect(text).toContain('child."id" <>');
    expect(text).toContain('child.depth < 64');
    expect(text).toContain('ANY(child.visited)');
    expect(text).toContain('ORDER BY depth DESC');
    expect(text).not.toContain(root);
    expect(query.values).toEqual([room, node, room, root]);
  });
});
