import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../features/auth/auth-context.js';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/v1/');
vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key-1234567890');

const authenticated: AuthContextValue = {
  status: 'authenticated',
  user: null,
  accessToken: 'verified-access-token',
  signInWithGoogle: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  isSigningIn: false,
  error: null,
};

function SignInProbe(): React.JSX.Element {
  const location = useLocation();
  const state = location.state as unknown;
  const from =
    typeof state === 'object' && state !== null && 'from' in state && typeof state.from === 'string'
      ? state.from
      : null;
  return <p>{JSON.stringify({ pathname: location.pathname, state: { from } })}</p>;
}

async function renderProtected(auth: AuthContextValue) {
  const { ProtectedRoute } = await import('./protected-route.js');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/workspace?node=42']}>
          <Routes>
            <Route path="/sign-in" element={<SignInProbe />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/workspace" element={<h1>Private workspace</h1>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('preserves the intended route when redirecting an anonymous visitor', async () => {
    await renderProtected({ ...authenticated, status: 'anonymous', accessToken: null });

    expect(await screen.findByText(/"pathname":"\/sign-in"/)).toHaveTextContent(
      '"from":"/workspace?node=42"',
    );
  });

  it('never renders protected content when an authenticated state lacks a token', async () => {
    await renderProtected({ ...authenticated, accessToken: null });

    expect(await screen.findByRole('heading', { name: 'Session unavailable.' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Private workspace' })).not.toBeInTheDocument();
  });

  it('renders a stable registration-closed state instead of redirecting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'REGISTRATION_CLOSED',
              message: 'Internal detail is not rendered.',
              requestId: '00000000-0000-4000-8000-000000000003',
            },
          }),
          { status: 403 },
        ),
      ),
    );

    await renderProtected(authenticated);

    expect(await screen.findByRole('heading', { name: 'Registration is closed.' })).toBeVisible();
    expect(screen.queryByText('Internal detail is not rendered.')).not.toBeInTheDocument();
  });
});
