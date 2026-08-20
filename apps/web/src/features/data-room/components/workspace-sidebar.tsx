import { FolderRoot, ShieldCheck } from 'lucide-react';
import { NavLink } from 'react-router-dom';

export function WorkspaceSidebar({
  roomName,
  rootNodeId,
}: Readonly<{ roomName: string; rootNodeId: string }>): React.JSX.Element {
  return (
    <div className="workspace-sidebar">
      <div className="workspace-brand" aria-label="Secure Data Room">
        <ShieldCheck size={21} strokeWidth={1.8} aria-hidden="true" />
        <span>Secure Data Room</span>
      </div>
      <div className="workspace-sidebar__room">
        <p className="eyebrow eyebrow--inverse">Data room</p>
        <p className="workspace-sidebar__room-name" title={roomName}>
          {roomName}
        </p>
      </div>
      <NavLink className="workspace-nav-link" to={`/workspace/${rootNodeId}`}>
        <FolderRoot size={18} strokeWidth={1.8} aria-hidden="true" />
        <span>All files</span>
      </NavLink>
      <p className="workspace-sidebar__assurance">Private by default. Shared deliberately.</p>
    </div>
  );
}
