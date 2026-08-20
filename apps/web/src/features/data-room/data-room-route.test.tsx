import type { BootstrapResponse, NodeSummary } from '@data-room/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/auth-context.js';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/v1/');
vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key-1234567890');

const rootId = '550e8400-e29b-41d4-a716-446655440000';
const folderId = '550e8400-e29b-41d4-a716-446655440001';
const fileId = '550e8400-e29b-41d4-a716-446655440002';

const bootstrap: BootstrapResponse = {
  user: {
    id: '450e8400-e29b-41d4-a716-446655440000',
    email: 'owner@example.com',
    displayName: 'Review Owner',
  },
  room: {
    id: '650e8400-e29b-41d4-a716-446655440000',
    name: 'Due diligence',
    rootNodeId: rootId,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  runtime: {
    registrationOpen: true,
    uploadsEnabled: false,
    publicLinksEnabled: false,
    maintenanceMode: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
};

const authenticated: AuthContextValue = {
  status: 'authenticated',
  user: null,
  accessToken: 'verified-access-token',
  signInWithGoogle: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  isSigningIn: false,
  error: null,
};

describe('DataRoomRoute', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders an owner folder, preserves API order, and appends the next cursor page', async () => {
    const current = node({ id: rootId, parentId: null, name: 'Due diligence' });
    const folder = node({ id: folderId, name: 'Contracts' });
    const file = node({
      id: fileId,
      kind: 'FILE',
      name: 'Board minutes.pdf',
      sizeBytes: '1048576',
      mimeType: 'application/pdf',
      isShared: true,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.pathname.endsWith(`/nodes/${rootId}/breadcrumbs`)) {
          return jsonResponse({ items: [{ id: rootId, name: 'Due diligence' }] });
        }
        if (url.pathname.endsWith(`/nodes/${rootId}/children`)) {
          return url.searchParams.has('cursor')
            ? jsonResponse({ items: [file], pageInfo: { nextCursor: null, hasNextPage: false } })
            : jsonResponse({
                items: [folder],
                pageInfo: { nextCursor: 'cursor-two', hasNextPage: true },
              });
        }
        return jsonResponse(current);
      }),
    );

    await renderRoute();

    expect(await screen.findByRole('heading', { name: 'Due diligence' })).toBeVisible();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Contracts')).toBeVisible();
    expect(screen.getByRole('button', { name: 'New folder' })).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await within(screen.getByRole('table')).findByText('Board minutes.pdf')).toBeVisible();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
  });

  it('renders a viewer as read-only with owner controls absent', async () => {
    const current = node({
      id: rootId,
      parentId: null,
      name: 'Due diligence',
      accessRole: 'VIEWER',
      isShared: true,
    });
    const folder = node({ id: folderId, name: 'Contracts', accessRole: 'VIEWER' });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => routeResponse(input, current, [folder])),
    );

    await renderRoute();

    expect(await screen.findByText(/Read-only access/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'New folder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for Contracts/ })).not.toBeInTheDocument();
  });
});

async function renderRoute(): Promise<ReturnType<typeof render>> {
  const { DataRoomRoute } = await import('./data-room-route.js');
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authenticated}>
        <MemoryRouter initialEntries={[`/workspace/${rootId}`]}>
          <Routes>
            <Route element={<Outlet context={{ bootstrap }} />}>
              <Route path="/workspace/:nodeId" element={<DataRoomRoute />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

function routeResponse(
  input: RequestInfo | URL,
  current: NodeSummary,
  children: NodeSummary[],
): Promise<Response> {
  const url = requestUrl(input);
  if (url.pathname.endsWith(`/nodes/${rootId}/breadcrumbs`)) {
    return Promise.resolve(jsonResponse({ items: [{ id: rootId, name: current.name }] }));
  }
  if (url.pathname.endsWith(`/nodes/${rootId}/children`)) {
    return Promise.resolve(
      jsonResponse({ items: children, pageInfo: { nextCursor: null, hasNextPage: false } }),
    );
  }
  return Promise.resolve(jsonResponse(current));
}

function requestUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string' || input instanceof URL) return new URL(input);
  return new URL(input.url);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function node(overrides: Partial<NodeSummary>): NodeSummary {
  return {
    id: rootId,
    dataRoomId: bootstrap.room.id,
    parentId: rootId,
    kind: 'FOLDER',
    name: 'Legal',
    sizeBytes: null,
    mimeType: null,
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    isShared: false,
    accessRole: 'OWNER',
    ...overrides,
  };
}
