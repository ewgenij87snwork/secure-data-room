import type { NodeSummary } from '@data-room/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('waits for and renders every exact delete impact count before enabling deletion', async () => {
    const impact = {
      rootNodeId: nodeId,
      folderCount: 2,
      fileCount: 3,
      totalBytes: '1048576',
      activeShareCount: 0,
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
    expect(await screen.findByText('Folders')).toBeVisible();
    expect(screen.getByText('2 folders')).toBeVisible();
    expect(screen.getByText('3 files')).toBeVisible();
    expect(screen.getByText('1.0 MB')).toBeVisible();
    expect(screen.getByText('0 active shares')).toBeVisible();
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

  it('disables an open rename submit after the browser goes offline', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...folderNode(), name: 'Tax' }));
    vi.stubGlobal('fetch', fetchMock);
    const { RenameNodeDialog } = await import('./rename-node-dialog.js');
    renderWithClient(<RenameNodeDialog open onOpenChange={vi.fn()} node={folderNode()} />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Tax');

    window.dispatchEvent(new Event('offline'));

    expect(await screen.findByRole('button', { name: 'Save name' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('online'));
  });

  it('keeps an irreversible delete dialog locked until the request settles', async () => {
    const impact = {
      rootNodeId: nodeId,
      folderCount: 1,
      fileCount: 0,
      totalBytes: '0',
      activeShareCount: 0,
    };
    const deletion = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(impact))
      .mockReturnValueOnce(deletion.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { DeleteNodeDialog } = await import('./delete-node-dialog.js');
    const onOpenChange = vi.fn();
    renderWithClient(<DeleteNodeDialog open onOpenChange={onOpenChange} node={folderNode()} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete permanently' }));
    const cancelWasLocked = screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled');
    deletion.resolve(jsonResponse(impact));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    expect(cancelWasLocked).toBe(true);
  });

  it('keeps a conflicting rename input and focuses it after applying the server suggestion', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'NAME_CONFLICT',
            message: 'Internal duplicate detail.',
            requestId: '00000000-0000-4000-8000-000000000001',
            details: { suggestedName: 'Tax (1)' },
          },
        },
        409,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { RenameNodeDialog } = await import('./rename-node-dialog.js');
    renderWithClient(<RenameNodeDialog open onOpenChange={vi.fn()} node={folderNode()} />);

    const input = screen.getByRole('textbox', { name: 'Name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Tax');
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
    expect(input).toHaveValue('Tax');
    await userEvent.click(screen.getByRole('button', { name: 'Use “Tax (1)”' }));
    expect(input).toHaveValue('Tax (1)');
    expect(input).toHaveFocus();
    expect(screen.queryByText('Internal duplicate detail.')).not.toBeInTheDocument();
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

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
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
