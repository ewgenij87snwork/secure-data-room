import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../lib/query-client.js';
import { useAuth } from './auth-context.js';

vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/v1/');
vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key-1234567890');

const session: Session = {
  access_token: 'verified-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  expires_at: 2_000_000_000,
  token_type: 'bearer',
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    app_metadata: { provider: 'google' },
    user_metadata: {},
    aud: 'authenticated',
    email: 'owner@example.test',
    created_at: '2026-08-20T00:00:00.000Z',
    is_anonymous: false,
  },
};

function createAuthClient(initialSession: Session | null) {
  let authStateCallback: ((event: AuthChangeEvent, next: Session | null) => void) | undefined;
  const unsubscribe = vi.fn();
  const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const getSession = vi.fn().mockResolvedValue({
    data: { session: initialSession },
    error: null,
  });
  const onAuthStateChange = vi.fn(
    (callback: (event: AuthChangeEvent, next: Session | null) => void) => {
      authStateCallback = callback;
      return { data: { subscription: { unsubscribe } } };
    },
  );

  return {
    client: { auth: { getSession, onAuthStateChange, signInWithOAuth, signOut } },
    signInWithOAuth,
    signOut,
    unsubscribe,
    emitAuthState: (event: AuthChangeEvent, next: Session | null) => {
      if (!authStateCallback) {
        throw new Error('Auth state listener is not registered.');
      }
      authStateCallback(event, next);
    },
  };
}

function AuthProbe(): React.JSX.Element {
  const auth = useAuth();
  return (
    <div>
      <span>{auth.status}</span>
      <button type="button" onClick={() => void auth.signInWithGoogle()}>
        Start Google
      </button>
      <button type="button" onClick={() => void auth.signOut()}>
        Sign out
      </button>
      {auth.error ? <p role="alert">{auth.error}</p> : null}
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    queryClient.clear();
    const { setAuthSessionEpoch, setSessionExpiredHandler } =
      await import('../../lib/api-client.js');
    setSessionExpiredHandler(undefined);
    setAuthSessionEpoch(undefined);
  });

  it('starts Google OAuth with the exact same-origin callback and unsubscribes on unmount', async () => {
    const { AuthProvider } = await import('./auth-provider.js');
    const authClient = createAuthClient(null);
    const user = userEvent.setup();
    const view = render(
      <AuthProvider client={authClient.client}>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(await screen.findByText('anonymous')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Start Google' }));

    expect(authClient.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: new URL('/auth/callback', window.location.origin).toString() },
    });
    view.unmount();
    expect(authClient.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('clears protected query data on explicit sign-out', async () => {
    const { AuthProvider } = await import('./auth-provider.js');
    const authClient = createAuthClient(session);
    const user = userEvent.setup();
    render(
      <AuthProvider client={authClient.client}>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(await screen.findByText('authenticated')).toBeVisible();
    queryClient.setQueryData(['protected', 'document'], { owner: session.user.id });
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(queryClient.getQueryData(['protected', 'document'])).toBeUndefined();
  });

  it('clears protected query data and the local session after an authenticated 401', async () => {
    const { AuthProvider } = await import('./auth-provider.js');
    const { apiRequest } = await import('../../lib/api-client.js');
    const authClient = createAuthClient(session);
    render(
      <AuthProvider client={authClient.client}>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(await screen.findByText('authenticated')).toBeVisible();
    queryClient.setQueryData(['protected', 'document'], { owner: session.user.id });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));

    await expect(apiRequest('/me', { accessToken: session.access_token })).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      status: 401,
    });
    await waitFor(() => expect(authClient.signOut).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('anonymous')).toBeVisible();
    expect(queryClient.getQueryData(['protected', 'document'])).toBeUndefined();
  });

  it('keeps same-user cache across token refresh and clears it before an account switch', async () => {
    const { AuthProvider } = await import('./auth-provider.js');
    const authClient = createAuthClient(session);
    render(
      <AuthProvider client={authClient.client}>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(await screen.findByText('authenticated')).toBeVisible();
    const protectedKey = ['protected', 'document'] as const;
    const cachedDocument = { owner: session.user.id };
    queryClient.setQueryData(protectedKey, cachedDocument);

    authClient.emitAuthState('TOKEN_REFRESHED', {
      ...session,
      access_token: 'refreshed-access-token',
    });
    expect(queryClient.getQueryData(protectedKey)).toEqual(cachedDocument);

    authClient.emitAuthState('SIGNED_IN', {
      ...session,
      access_token: 'second-user-access-token',
      user: {
        ...session.user,
        id: '00000000-0000-4000-8000-000000000002',
        email: 'reviewer@example.test',
      },
    });
    await waitFor(() => expect(queryClient.getQueryData(protectedKey)).toBeUndefined());
  });
});
