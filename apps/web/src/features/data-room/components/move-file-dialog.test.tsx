import type { NodeSummary } from '@data-room/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../auth/auth-context.js';
import { MoveFileDialog } from './move-file-dialog.js';

vi.hoisted(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/v1/');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key-1234567890');
});

const auth: AuthContextValue = {
  status: 'authenticated',
  user: null,
  accessToken: 'token',
  signInWithGoogle: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  isSigningIn: false,
  error: null,
};

const file: NodeSummary = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  dataRoomId: '650e8400-e29b-41d4-a716-446655440000',
  parentId: '550e8400-e29b-41d4-a716-446655440002',
  kind: 'FILE',
  name: 'Contract.pdf',
  sizeBytes: '100',
  mimeType: 'application/pdf',
  revision: 4,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  isShared: false,
  accessRole: 'OWNER',
};

describe('MoveFileDialog', () => {
  it('lazy-loads folders, disables the current folder, and submits the approved move shape', async () => {
    const folder = {
      ...file,
      id: '550e8400-e29b-41d4-a716-446655440003',
      parentId: null,
      kind: 'FOLDER' as const,
      name: 'Finance',
      sizeBytes: null,
      mimeType: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({ items: [folder], pageInfo: { nextCursor: null, hasNextPage: false } }),
      )
      .mockResolvedValueOnce(json({ ...file, parentId: folder.id }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithClient(
      <MoveFileDialog open onOpenChange={vi.fn()} node={file} currentFolderId={folder.id} />,
    );

    expect(await screen.findByText('Finance')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Finance' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move file' })).toBeDisabled();
  });

  it('offers an actionable server suggestion when the destination name conflicts', async () => {
    const folder = {
      ...file,
      id: '550e8400-e29b-41d4-a716-446655440003',
      parentId: null,
      kind: 'FOLDER' as const,
      name: 'Finance',
      sizeBytes: null,
      mimeType: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({ items: [folder], pageInfo: { nextCursor: null, hasNextPage: false } }),
      )
      .mockResolvedValueOnce(
        json(
          {
            error: {
              code: 'NAME_CONFLICT',
              message: 'Internal duplicate detail.',
              requestId: '00000000-0000-4000-8000-000000000001',
              details: { suggestedName: 'Contract (1).pdf' },
            },
          },
          409,
        ),
      )
      .mockResolvedValueOnce(json({ ...file, name: 'Contract (1).pdf', revision: 5 }))
      .mockResolvedValueOnce(
        json({ ...file, name: 'Contract (1).pdf', parentId: folder.id, revision: 6 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderWithClient(
      <MoveFileDialog open onOpenChange={vi.fn()} node={file} currentFolderId="different-folder" />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Finance' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move file' }));

    const suggestion = await screen.findByRole('button', {
      name: 'Rename to “Contract (1).pdf” and move',
    });
    await userEvent.click(suggestion);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).method).toBe('PATCH');
    expect(requestBody(fetchMock, 2)).toEqual({
      name: 'Contract (1).pdf',
      expectedRevision: 4,
    });
    expect((fetchMock.mock.calls[3]?.[1] as RequestInit).method).toBe('POST');
    expect(requestBody(fetchMock, 3)).toEqual({
      targetFolderId: folder.id,
      expectedRevision: 5,
    });
  });

  it('locks every close and move control while conflict recovery is running', async () => {
    const folder = destinationFolder();
    const renameResponse = deferred<Response>();
    const onOpenChange = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({ items: [folder], pageInfo: { nextCursor: null, hasNextPage: false } }),
      )
      .mockResolvedValueOnce(nameConflict('Contract (1).pdf'))
      .mockReturnValueOnce(renameResponse.promise)
      .mockResolvedValueOnce(
        json({ ...file, name: 'Contract (1).pdf', parentId: folder.id, revision: 6 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderWithClient(
      <MoveFileDialog
        open
        onOpenChange={onOpenChange}
        node={file}
        currentFolderId="different-folder"
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Finance' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move file' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Rename to “Contract (1).pdf” and move' }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const moveWasLocked = screen.getByRole('button', { name: 'Moving…' }).hasAttribute('disabled');
    const cancelWasLocked = screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled');
    renameResponse.resolve(json({ ...file, name: 'Contract (1).pdf', revision: 5 }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    expect(moveWasLocked).toBe(true);
    expect(cancelWasLocked).toBe(true);
  });

  it('retains the renamed revision and explains a partial outcome when the move then fails', async () => {
    const folder = destinationFolder();
    const onOpenChange = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({ items: [folder], pageInfo: { nextCursor: null, hasNextPage: false } }),
      )
      .mockResolvedValueOnce(nameConflict('Contract (1).pdf'))
      .mockResolvedValueOnce(json({ ...file, name: 'Contract (1).pdf', revision: 5 }))
      .mockResolvedValueOnce(apiError('CONFLICT', 'The item changed elsewhere.'))
      .mockResolvedValueOnce(
        json({ ...file, name: 'Contract (1).pdf', parentId: folder.id, revision: 6 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderWithClient(
      <MoveFileDialog
        open
        onOpenChange={onOpenChange}
        node={file}
        currentFolderId="different-folder"
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Finance' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move file' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Rename to “Contract (1).pdf” and move' }),
    );

    expect(
      await screen.findByText(
        'The file was renamed to “Contract (1).pdf”, but the move did not finish.',
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Retry move' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(requestBody(fetchMock, 4)).toEqual({
      targetFolderId: folder.id,
      expectedRevision: 5,
    });
  });

  it('keeps offering the newest suggestion when the recovery rename also conflicts', async () => {
    const folder = destinationFolder();
    const onOpenChange = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({ items: [folder], pageInfo: { nextCursor: null, hasNextPage: false } }),
      )
      .mockResolvedValueOnce(nameConflict('Contract (1).pdf'))
      .mockResolvedValueOnce(nameConflict('Contract (2).pdf'))
      .mockResolvedValueOnce(json({ ...file, name: 'Contract (2).pdf', revision: 5 }))
      .mockResolvedValueOnce(
        json({ ...file, name: 'Contract (2).pdf', parentId: folder.id, revision: 6 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderWithClient(
      <MoveFileDialog
        open
        onOpenChange={onOpenChange}
        node={file}
        currentFolderId="different-folder"
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Finance' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move file' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Rename to “Contract (1).pdf” and move' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Rename to “Contract (2).pdf” and move' }),
    );

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(requestBody(fetchMock, 3)).toEqual({
      name: 'Contract (2).pdf',
      expectedRevision: 4,
    });
    expect(requestBody(fetchMock, 4)).toEqual({
      targetFolderId: folder.id,
      expectedRevision: 5,
    });
  });
});

function destinationFolder(): NodeSummary {
  return {
    ...file,
    id: '550e8400-e29b-41d4-a716-446655440003',
    parentId: null,
    kind: 'FOLDER',
    name: 'Finance',
    sizeBytes: null,
    mimeType: null,
  };
}

function apiError(code: string, message: string, details?: unknown): Response {
  return json(
    {
      error: {
        code,
        message,
        requestId: '00000000-0000-4000-8000-000000000001',
        details,
      },
    },
    409,
  );
}

function nameConflict(suggestedName: string): Response {
  return apiError('NAME_CONFLICT', 'Internal duplicate detail.', { suggestedName });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): unknown {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return typeof init?.body === 'string' ? JSON.parse(init.body) : null;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function renderWithClient(ui: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <AuthContext.Provider value={auth}>{ui}</AuthContext.Provider>
    </QueryClientProvider>,
  );
}
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}
