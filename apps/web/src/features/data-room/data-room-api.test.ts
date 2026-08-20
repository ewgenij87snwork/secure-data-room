import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/v1/');
vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key-1234567890');

const nodeId = '550e8400-e29b-41d4-a716-446655440000';
const roomId = '650e8400-e29b-41d4-a716-446655440000';
const parentId = '750e8400-e29b-41d4-a716-446655440000';

const node = {
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
} as const;

describe('data room API boundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('parses the three read models and encodes an opaque cursor', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(node))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: nodeId, name: 'Legal' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [node],
          pageInfo: { nextCursor: null, hasNextPage: false },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { readBreadcrumbs, readNode, readNodeChildren } = await import('./data-room-api.js');

    await expect(readNode('access-token', nodeId)).resolves.toEqual(node);
    await expect(readBreadcrumbs('access-token', nodeId)).resolves.toEqual({
      items: [{ id: nodeId, name: 'Legal' }],
    });
    await expect(readNodeChildren('access-token', nodeId, 'cursor+/=')).resolves.toMatchObject({
      items: [node],
    });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `https://api.example.test/v1/nodes/${nodeId}`,
      `https://api.example.test/v1/nodes/${nodeId}/breadcrumbs`,
      `https://api.example.test/v1/nodes/${nodeId}/children?limit=50&cursor=cursor%2B%2F%3D`,
    ]);
    for (const [, request] of fetchMock.mock.calls) {
      expect(new Headers((request as RequestInit).headers).get('Authorization')).toBe(
        'Bearer access-token',
      );
    }
  });

  it('uses frozen request shapes for create, rename, impact, and delete', async () => {
    const renamed = { ...node, name: 'Tax', revision: 2 };
    const impact = {
      rootNodeId: nodeId,
      folderCount: 2,
      fileCount: 3,
      totalBytes: '1048576',
      activeShareCount: 1,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(node))
      .mockResolvedValueOnce(jsonResponse(renamed))
      .mockResolvedValueOnce(jsonResponse(impact))
      .mockResolvedValueOnce(jsonResponse(impact));
    vi.stubGlobal('fetch', fetchMock);
    const { createFolder, deleteNode, readDeleteImpact, renameNode } =
      await import('./data-room-api.js');

    await createFolder('access-token', { parentId, name: 'Legal' });
    await renameNode('access-token', nodeId, { name: 'Tax', expectedRevision: 1 });
    await readDeleteImpact('access-token', nodeId);
    await deleteNode('access-token', nodeId);

    expect(requestMethod(fetchMock, 0)).toBe('POST');
    expect(requestBody(fetchMock, 0)).toEqual({ parentId, name: 'Legal' });
    expect(requestMethod(fetchMock, 1)).toBe('PATCH');
    expect(requestBody(fetchMock, 1)).toEqual({ name: 'Tax', expectedRevision: 1 });
    expect(requestMethod(fetchMock, 2)).toBeUndefined();
    expect(requestMethod(fetchMock, 3)).toBe('DELETE');
  });

  it('keeps credentials out of stable query keys', async () => {
    const { nodeKeys } = await import('./data-room-keys.js');
    expect(nodeKeys.children(nodeId)).toEqual(['nodes', 'children', nodeId]);
    expect(JSON.stringify(nodeKeys)).not.toContain('access-token');
  });

  it('preserves only canonical structured conflict details', async () => {
    const { mapApiError } = await import('../../lib/api-error.js');
    const error = mapApiError(new Response(null, { status: 409 }), {
      error: {
        code: 'NAME_CONFLICT',
        message: 'internal duplicate detail',
        requestId: '00000000-0000-4000-8000-000000000001',
        details: { suggestedName: 'Legal (1)' },
      },
    });

    expect(error).toMatchObject({
      code: 'NAME_CONFLICT',
      details: { suggestedName: 'Legal (1)' },
    });
    expect(error.message).not.toContain('internal duplicate');
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function requestMethod(fetchMock: ReturnType<typeof vi.fn>, index: number): string | undefined {
  return (fetchMock.mock.calls[index]?.[1] as RequestInit | undefined)?.method;
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, index: number): unknown {
  const body = (fetchMock.mock.calls[index]?.[1] as RequestInit | undefined)?.body;
  return typeof body === 'string' ? JSON.parse(body) : null;
}
