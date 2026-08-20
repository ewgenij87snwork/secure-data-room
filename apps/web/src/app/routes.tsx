import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthCallbackRoute } from '../features/auth/auth-callback-route.js';
import { SignInRoute } from '../features/auth/sign-in-route.js';
import { ProtectedRoute } from './protected-route.js';

function Workspace(): React.JSX.Element {
  return (
    <main className="workspace-shell">
      <div className="eyebrow">Secure Data Room</div>
      <h1>Workspace</h1>
      <p>Your private room is ready.</p>
    </main>
  );
}
export function AppRoutes(): React.JSX.Element {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInRoute />} />
      <Route path="/auth/callback" element={<AuthCallbackRoute />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/workspace" element={<Workspace />} />
        <Route path="/" element={<Navigate to="/workspace" replace />} />
        <Route path="*" element={<Navigate to="/workspace" replace />} />
      </Route>
    </Routes>
  );
}
