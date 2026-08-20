import type { NodeSummary } from '@data-room/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../auth/auth-context.js';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/v1/');
vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key-1234567890');

const parentId = '550e8400-e29b-41d4-a716-446655440000';
const nodeId = '550e8400-e29b-41d4-a716-446655440001';

const authenticated: AuthContextValue = {
  status: 'authenticated',
  user: null,
  accessToken: 'verified-access-token',
  signInWithGoogle: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  isSigningIn: false,
  error: null,
};

describe('management dialogs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the create name after a conflict and offers the canonical suggestion', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'NAME_CONFLICT',
            message: 'Internal duplicate detail.',
            requestId: '00000000-0000-4000-8000-000000000001',
            details: { suggestedName: 'Legal (1)' },
          },
        },
        409,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { CreateFolderDialog } = await import('./create-folder-dialog.js');
    renderWithClient(<CreateFolderDialog open onOpenChange={vi.fn()} parentId={parentId} />);

    const input = screen.getByRole('textbox', { name: 'Folder name' });
    await userEvent.type(input, '  Legal  ');
    await userEvent.click(screen.getByRole('button', { name: 'Create folder' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
    expect(input).toHaveValue('  Legal  ');
    expect(requestBody(fetchMock, 0)).toEqual({
      parentId,
      name: 'Legal',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Use “Legal (1)”' }));
    expect(input).toHaveValue('Legal (1)');
  });

  it('waits for and renders exact delete impact before enabling deletion', async () => {
    const impact = {
      rootNodeId: nodeId,
      folderCount: 2,
      fileCount: 3,
      totalBytes: '1048576',
      activeShareCount: 1,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(impact))
      .mockResolvedValueOnce(jsonResponse(impact));
    vi.stubGlobal('fetch', fetchMock);
    const { DeleteNodeDialog } = await import('./delete-node-dialog.js');
    const onOpenChange = vi.fn();
    renderWithClient(<DeleteNodeDialog open onOpenChange={onOpenChange} node={folderNode()} />);

    const deleteButton = screen.getByRole('button', { name: 'Delete permanently' });
    expect(deleteButton).toBeDisabled();
    expect(
      await screen.findByText(/2 folders, 3 files \(1.0 MB\) and revokes 1 active share/),
    ).toBeVisible();
    expect(deleteButton).toBeEnabled();

    await userEvent.click(deleteButton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('DELETE');
  });

  it('submits a trimmed rename with the current revision', async () => {
    const renamed = { ...folderNode(), name: 'Tax', revision: 2 };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(renamed));
    vi.stubGlobal('fetch', fetchMock);
    const { RenameNodeDialog } = await import('./rename-node-dialog.js');
    const onOpenChange = vi.fn();
    renderWithClient(<RenameNodeDialog open onOpenChange={onOpenChange} node={folderNode()} />);

    const input = screen.getByRole('textbox', { name: 'Name' });
    await userEvent.clear(input);
    await userEvent.type(input, '  Tax  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(requestBody(fetchMock, 0)).toEqual({ name: 'Tax', expectedRevision: 1 });
  });
});

function renderWithClient(ui: React.ReactNode): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authenticated}>{ui}</AuthContext.Provider>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, index: number): unknown {
  const body = (fetchMock.mock.calls[index]?.[1] as RequestInit | undefined)?.body;
  if (typeof body !== 'string') throw new Error('Expected a JSON string request body.');
  return JSON.parse(body) as unknown;
}

function folderNode(): NodeSummary {
  return {
    id: nodeId,
    dataRoomId: '650e8400-e29b-41d4-a716-446655440000',
    parentId,
    kind: 'FOLDER',
    name: 'Legal',
    sizeBytes: null,
    mimeType: null,
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    isShared: false,
    accessRole: 'OWNER',
  };
}
