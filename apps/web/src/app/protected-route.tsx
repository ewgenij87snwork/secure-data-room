import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { bootstrapResponseSchema } from '@data-room/contracts';
import { apiRequest } from '../lib/api-client.js';
import { ApiClientError } from '../lib/api-error.js';
import { useAuth } from '../features/auth/auth-context.js';
import { UploadQueue } from '../features/uploads/components/upload-queue.js';

function AuthState({ title, message }: { title: string; message: string }): React.JSX.Element {
  return (
    <main className="auth-shell auth-shell--state">
      <section className="auth-state" aria-labelledby="auth-state-title">
        <div className="eyebrow">Secure Data Room</div>
        <h1 id="auth-state-title">{title}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

function WorkspaceSkeleton(): React.JSX.Element {
  return (
    <main className="auth-shell auth-shell--state">
      <section className="auth-state" aria-labelledby="workspace-loading-title">
        <div className="skeleton" aria-hidden="true" />
        <h1 id="workspace-loading-title" className="sr-only">
          Loading workspace
        </h1>
        <p role="status">Loading your private workspace…</p>
      </section>
    </main>
  );
}

export function ProtectedRoute(): React.JSX.Element {
  const auth = useAuth();
  const location = useLocation();
  const bootstrap = useQuery({
    queryKey: ['me', 'bootstrap'],
    enabled: auth.status === 'authenticated' && Boolean(auth.accessToken),
    queryFn: async () => {
      if (!auth.accessToken) {
        throw new Error('An access token is required to bootstrap the workspace.');
      }
      const response = await apiRequest('/me/bootstrap', {
        method: 'POST',
        accessToken: auth.accessToken,
      });
      return bootstrapResponseSchema.parse(response);
    },
  });

  if (auth.status === 'loading' || bootstrap.isLoading) {
    return <WorkspaceSkeleton />;
  }
  if (auth.status === 'anonymous') {
    return (
      <Navigate to="/sign-in" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }
  if (!auth.accessToken) {
    return <AuthState title="Session unavailable." message="Please sign in again to continue." />;
  }
  if (bootstrap.error instanceof ApiClientError && bootstrap.error.code === 'REGISTRATION_CLOSED') {
    return (
      <AuthState
        title="Registration is closed."
        message="Your identity is verified, but access is currently limited to approved reviewers."
      />
    );
  }
  if (bootstrap.error) {
    return (
      <AuthState title="Workspace unavailable." message="Please try again in a few moments." />
    );
  }
  if (!bootstrap.isSuccess) {
    return <WorkspaceSkeleton />;
  }
  return (
    <>
      {bootstrap.data.runtime.maintenanceMode ? (
        <div className="maintenance-notice" role="status" aria-live="polite">
          Maintenance mode is active. Read-only access remains available.
        </div>
      ) : null}
      <UploadQueue />
      <Outlet context={{ bootstrap: bootstrap.data }} />
    </>
  );
}
