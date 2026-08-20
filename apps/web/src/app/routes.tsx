import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthCallbackRoute } from '../features/auth/auth-callback-route.js';
import { SignInRoute } from '../features/auth/sign-in-route.js';
import { DataRoomRoute } from '../features/data-room/data-room-route.js';
import { WorkspaceIndexRoute } from '../features/data-room/workspace-index-route.js';
import { ProtectedRoute } from './protected-route.js';
import { PdfViewerRoute } from '../features/pdf-viewer/pdf-viewer-route.js';
import { PublicShareRoute } from '../features/sharing/public-share-route.js';
import { SharedNodeRoute } from '../features/sharing/shared-node-route.js';
import { SharedWithMeRoute } from '../features/sharing/shared-with-me-route.js';

export function AppRoutes(): React.JSX.Element {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInRoute />} />
      <Route path="/auth/callback" element={<AuthCallbackRoute />} />
      <Route path="/share" element={<PublicShareRoute />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/files/:nodeId" element={<PdfViewerRoute />} />
        <Route path="/workspace" element={<WorkspaceIndexRoute />} />
        <Route path="/workspace/:nodeId" element={<DataRoomRoute />} />
        <Route path="/shared" element={<SharedWithMeRoute />} />
        <Route path="/shared/:nodeId" element={<SharedNodeRoute />} />
        <Route path="/" element={<Navigate to="/workspace" replace />} />
        <Route path="*" element={<Navigate to="/workspace" replace />} />
      </Route>
    </Routes>
  );
}
