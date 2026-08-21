import { useLocation } from 'react-router-dom';
import { CreatorSignature } from '../data-room/components/creator-signature.js';
import { useAuth } from './auth-context.js';
import { getSafeIntendedRoute, isSafeIntendedRoute } from './intended-route.js';

interface IntendedRouteState {
  from: string;
}

function hasIntendedRoute(value: unknown): value is IntendedRouteState {
  if (typeof value !== 'object' || value === null || !('from' in value)) {
    return false;
  }
  return typeof value.from === 'string';
}

export function SignInRoute(): React.JSX.Element {
  const auth = useAuth();
  const location = useLocation();
  const requested = hasIntendedRoute(location.state) ? location.state.from : null;
  const hasSafeReturn = requested !== null && isSafeIntendedRoute(requested);
  const intendedRoute = getSafeIntendedRoute(hasSafeReturn ? requested : null);

  const submit = (): void => {
    if (hasSafeReturn) {
      sessionStorage.setItem('intended-route', intendedRoute);
    }
    void auth.signInWithGoogle();
  };

  return (
    <main className="auth-shell">
      <section className="auth-editorial" aria-labelledby="auth-statement-title">
        <div className="eyebrow eyebrow--inverse">Secure Data Room</div>
        <h1 id="auth-statement-title">Confidential work, deliberately contained.</h1>
        <p>
          One private workspace for documents that need a clear owner, deliberate sharing, and a
          visible audit of every important state.
        </p>
        <p className="auth-editorial__assurance">
          Private by default. Access changes only when you decide.
        </p>
      </section>

      <section className="auth-surface" aria-labelledby="sign-in-title">
        <div className="auth-card">
          <div className="eyebrow">Verified access</div>
          <h2 id="sign-in-title">Enter your private workspace.</h2>
          <p>Continue with the approved Google identity for this review.</p>
          <button
            type="button"
            onClick={submit}
            disabled={auth.status === 'loading' || auth.isSigningIn}
          >
            {auth.isSigningIn ? 'Connecting securely…' : 'Continue with Google'}
          </button>
          {auth.error ? (
            <p role="alert" className="auth-error">
              {auth.error}
            </p>
          ) : null}
          {hasSafeReturn ? (
            <p className="muted">You will return to your requested page after sign-in.</p>
          ) : null}
        </div>
        <p className="auth-privacy">
          Authentication verifies identity only. Document permissions are enforced by the API on
          every request.
        </p>
      </section>
      <CreatorSignature className="creator-signature--light" />
    </main>
  );
}
