import { Outlet, useOutletContext } from 'react-router-dom';
import { useAuth } from '../auth/auth-context.js';
import type { DataRoomOutletContext } from '../data-room/data-room-context.js';
import { WorkspaceHeader } from '../data-room/components/workspace-header.js';
import { WorkspaceShell } from '../data-room/components/workspace-shell.js';
import { WorkspaceSidebar } from '../data-room/components/workspace-sidebar.js';

export function SharedWorkspaceLayout(): React.JSX.Element {
  const { bootstrap } = useOutletContext<DataRoomOutletContext>();
  const auth = useAuth();
  const accountLabel = bootstrap.user.displayName ?? bootstrap.user.email;

  return (
    <WorkspaceShell
      sidebar={
        <WorkspaceSidebar roomName={bootstrap.room.name} rootNodeId={bootstrap.room.rootNodeId} />
      }
      header={<WorkspaceHeader accountLabel={accountLabel} onSignOut={() => void auth.signOut()} />}
    >
      <Outlet />
    </WorkspaceShell>
  );
}
