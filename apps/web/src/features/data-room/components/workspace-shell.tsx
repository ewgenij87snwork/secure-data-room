import type { PropsWithChildren, ReactNode } from 'react';
import { OnlineStatus } from '../../../lib/online-status.js';

export type WorkspaceShellProps = PropsWithChildren<{
  sidebar: ReactNode;
  header: ReactNode;
  context?: ReactNode;
  onReconnect?: () => void;
}>;

export function WorkspaceShell({
  sidebar,
  header,
  context,
  onReconnect,
  children,
}: WorkspaceShellProps): React.JSX.Element {
  return (
    <div className="workspace-shell">
      <nav className="workspace-shell__sidebar" aria-label="Workspace">
        {sidebar}
      </nav>
      <header className="workspace-shell__header">{header}</header>
      <main className="workspace-shell__main" aria-labelledby="workspace-title">
        <OnlineStatus onReconnect={onReconnect} />
        {children}
      </main>
      {context ? (
        <aside className="workspace-shell__context" aria-label="Folder context">
          {context}
        </aside>
      ) : null}
    </div>
  );
}
