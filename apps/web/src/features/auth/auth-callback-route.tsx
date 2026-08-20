import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth-context.js';
import { getSafeIntendedRoute } from './intended-route.js';

export function AuthCallbackRoute(): React.JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const callbackError = new URLSearchParams(location.search).has('error');

  useEffect(() => {
    if (auth.status === 'authenticated') {
      const target = getSafeIntendedRoute(sessionStorage.getItem('intended-route'));
      sessionStorage.removeItem('intended-route');
      void navigate(target, { replace: true });
    }
  }, [auth.status, navigate]);

  if (auth.error || callbackError) {
    return (
      <main className="auth-shell auth-shell--state">
        <section className="auth-state" aria-labelledby="callback-error-title">
          <div className="eyebrow">Secure Data Room</div>
          <h1 id="callback-error-title">Sign-in failed.</h1>
          <p role="alert">Google sign-in could not be completed. Please try again.</p>
        </section>
      </main>
    );
  }
  if (auth.status === 'anonymous') {
    return <Navigate to="/sign-in" replace />;
  }
  return (
    <main className="auth-shell auth-shell--state">
      <section className="auth-state" aria-labelledby="callback-loading-title">
        <div className="skeleton" aria-hidden="true" />
        <h1 id="callback-loading-title" className="sr-only">
          Completing secure sign-in
        </h1>
        <p role="status">Completing secure sign-in…</p>
      </section>
    </main>
  );
}
