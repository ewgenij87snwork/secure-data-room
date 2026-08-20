import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { queryClient } from '../../lib/query-client.js';
import { setAuthSessionEpoch, setSessionExpiredHandler } from '../../lib/api-client.js';
import { supabase as defaultSupabase } from '../../lib/supabase.js';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context.js';

interface AuthClient {
  auth: {
    getSession: () => Promise<{ data: { session: Session | null }; error: Error | null }>;
    onAuthStateChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
      data: { subscription: { unsubscribe: () => void } };
    };
    signInWithOAuth: (input: {
      provider: 'google';
      options: { redirectTo: string };
    }) => Promise<{ error: Error | null }>;
    signOut: () => Promise<{ error: Error | null }>;
  };
}

interface AuthProviderProps {
  children: ReactNode;
  client?: AuthClient;
}

export function AuthProvider({
  children,
  client = defaultSupabase,
}: AuthProviderProps): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let currentAccessToken: string | undefined;
    let currentUserId: string | undefined;
    let sessionEpoch = 0;

    const updateSession = (next: Session | null): void => {
      if (!active) {
        return;
      }
      if (next?.access_token !== currentAccessToken) {
        currentAccessToken = next?.access_token;
        sessionEpoch += 1;
      }
      const nextUserId = next?.user.id;
      if (nextUserId !== currentUserId) {
        queryClient.clear();
        currentUserId = nextUserId;
      }
      setSession(next);
      setStatus(next ? 'authenticated' : 'anonymous');
      setAuthSessionEpoch(next ? `${next.user.id}:${sessionEpoch}` : undefined);
    };

    const handleSessionFailure = (): void => {
      if (!active) {
        return;
      }
      setError('Your session could not be restored. Please sign in again.');
      updateSession(null);
    };

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        handleSessionFailure();
        return;
      }
      updateSession(data.session);
    }, handleSessionFailure);

    const { data } = client.auth.onAuthStateChange((_event, next) => {
      updateSession(next);
    });

    setSessionExpiredHandler(async () => {
      try {
        const { error: signOutError } = await client.auth.signOut();
        if (signOutError && active) {
          setError('Your session expired. Please sign in again.');
        }
      } catch {
        if (active) {
          setError('Your session expired. Please sign in again.');
        }
      } finally {
        queryClient.clear();
        updateSession(null);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
      setSessionExpiredHandler(undefined);
      setAuthSessionEpoch(undefined);
    };
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      accessToken: session?.access_token ?? null,
      isSigningIn,
      error,
      signInWithGoogle: async () => {
        setError(null);
        setIsSigningIn(true);
        try {
          const result = await client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: new URL('/auth/callback', window.location.origin).toString() },
          });
          if (result.error) {
            throw result.error;
          }
        } catch {
          setError('Google sign-in could not be started. Please try again.');
        } finally {
          setIsSigningIn(false);
        }
      },
      signOut: async () => {
        try {
          const result = await client.auth.signOut();
          if (result.error) {
            throw result.error;
          }
        } finally {
          queryClient.clear();
          setSession(null);
          setStatus('anonymous');
          setAuthSessionEpoch(undefined);
        }
      },
    }),
    [client, error, isSigningIn, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
