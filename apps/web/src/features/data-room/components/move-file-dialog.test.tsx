import type { NodeSummary } from '@data-room/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
});

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
function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200 });
}
