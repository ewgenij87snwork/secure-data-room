import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/auth-context.js';
import { PdfViewerRoute } from './pdf-viewer-route.js';
import { EmbeddedPdf } from './components/embedded-pdf.js';
import { ViewerState } from './components/viewer-state.js';

vi.hoisted(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/v1/');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key-1234567890');
});

describe('private PDF viewer', () => {
  it('keeps the document chrome stable while the file metadata is loading', async () => {
    const fileId = '550e8400-e29b-41d4-a716-446655440001';
    const pending = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => pending.promise),
    );

    renderViewer(fileId, fileId);

    expect(screen.getByTestId('pdf-viewer-skeleton')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Opening document…' })).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Opening private document…' }),
    ).not.toBeInTheDocument();

    pending.resolve(json(node(fileId, 'A.pdf')));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'A.pdf' })).toBeVisible());
  });

  it('uses the browser-native object fallback without a copyable URL control', () => {
    render(<EmbeddedPdf url="https://storage.example.test/signed" name="Contract.pdf" />);
    expect(screen.getByLabelText('PDF document: Contract.pdf')).toHaveAttribute(
      'data',
      'https://storage.example.test/signed',
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the document' })).toHaveAttribute(
      'href',
      'https://storage.example.test/signed',
    );
  });

  it('does not let an older URL response overwrite the file after navigation', async () => {
    const fileAId = '550e8400-e29b-41d4-a716-446655440001';
    const fileBId = '550e8400-e29b-41d4-a716-446655440002';
    const first = deferred<Response>();
    const second = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith(`/nodes/${fileAId}`))
        return Promise.resolve(json(node(fileAId, 'A.pdf')));
      if (url.pathname.endsWith(`/nodes/${fileBId}`))
        return Promise.resolve(json(node(fileBId, 'B.pdf')));
      if (url.pathname.endsWith(`/files/${fileAId}/view-url`)) return first.promise;
      if (url.pathname.endsWith(`/files/${fileBId}/view-url`)) return second.promise;
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderViewer(fileAId, fileBId);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          requestUrl(input).pathname.endsWith(`/files/${fileAId}/view-url`),
        ),
      ).toBe(true),
    );
    screen.getByRole('button', { name: 'Navigate to B.pdf' }).click();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Opening private document…' })).toBeVisible(),
    );
    expect(screen.queryByLabelText('PDF document: A.pdf')).not.toBeInTheDocument();

    second.resolve(signedUrl('https://storage.example.test/b'));
    await waitFor(() => expect(screen.getByLabelText('PDF document: B.pdf')).toBeInTheDocument());
    first.resolve(signedUrl('https://storage.example.test/a'));
    await waitFor(() =>
      expect(screen.queryByLabelText('PDF document: A.pdf')).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText('PDF document: B.pdf')).toHaveAttribute(
      'data',
      'https://storage.example.test/b',
    );
  });

  it('clears the signed URL and renders the dedicated revoked state', async () => {
    const fileAId = '550e8400-e29b-41d4-a716-446655440001';
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith(`/nodes/${fileAId}`))
        return Promise.resolve(json(node(fileAId, 'A.pdf')));
      if (url.pathname.endsWith(`/files/${fileAId}/view-url`)) {
        return Promise.resolve(signedUrl('https://storage.example.test/a'));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: 'SHARE_REVOKED',
              message: 'hidden',
              requestId: '00000000-0000-4000-8000-000000000001',
            },
          }),
          { status: 403 },
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    renderViewer(fileAId, fileAId);
    await waitFor(() => expect(screen.getByLabelText('PDF document: A.pdf')).toBeInTheDocument());
    fetchMock.mockImplementation(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: 'SHARE_REVOKED',
              message: 'hidden',
              requestId: '00000000-0000-4000-8000-000000000001',
            },
          }),
          { status: 403 },
        ),
      );
    });
    screen.getByRole('button', { name: 'Refresh document access' }).click();
    expect(
      await screen.findByRole('heading', { name: 'Your access to this document was revoked.' }),
    ).toBeVisible();
    expect(screen.queryByLabelText('PDF document: A.pdf')).not.toBeInTheDocument();
  });

  it.each([
    ['deleted', 'This document is no longer available.'],
    ['revoked', 'Your access to this document was revoked.'],
    ['forbidden', 'You do not have permission to view this document.'],
    ['network', 'The document could not be loaded.'],
  ] as const)('renders the dedicated %s state', (_state, message) => {
    render(<ViewerState state={_state} />);
    expect(screen.getByRole('heading')).toHaveTextContent(message);
  });
});

function renderViewer(nodeId: string, otherNodeId: string) {
  const auth = {
    status: 'authenticated' as const,
    user: null,
    accessToken: 'token',
    signInWithGoogle: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    isSigningIn: false,
    error: null,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[`/files/${nodeId}`]}>
          <Routes>
            <Route
              path="/files/:nodeId"
              element={
                <>
                  <PdfViewerRoute />
                  <NavigationButtons otherNodeId={otherNodeId} />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

function NavigationButtons({ otherNodeId }: Readonly<{ otherNodeId: string }>) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        void navigate(`/files/${otherNodeId}`);
      }}
    >
      Navigate to B.pdf
    </button>
  );
}

function node(id: string, name: string) {
  return {
    id,
    dataRoomId: '650e8400-e29b-41d4-a716-446655440000',
    parentId: null,
    kind: 'FILE',
    name,
    sizeBytes: '10',
    mimeType: 'application/pdf',
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    isShared: false,
    accessRole: 'OWNER',
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function signedUrl(url: string): Response {
  return json({ url, expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
}

function requestUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string' || input instanceof URL) return new URL(input);
  return new URL(input.url);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
