import type { NodeSummary } from '@data-room/contracts';
import { AccessStatus } from './access-status.js';

export function FolderAccessPanel({ node }: Readonly<{ node: NodeSummary }>): React.JSX.Element {
  const accessState = node.isShared ? 'shared' : 'private';
  const roleLabel = {
    OWNER: 'Owner',
    EDITOR: 'Editor',
    VIEWER: 'Viewer',
  }[node.accessRole];

  return (
    <div className="folder-context-panel">
      <p className="eyebrow">Folder context</p>
      <div className="folder-context-panel__status">
        <AccessStatus state={accessState} />
        <div>
          <strong>{node.isShared ? 'Shared access' : 'Private access'}</strong>
          <p>
            {node.isShared
              ? 'This item has an active share.'
              : 'Only explicitly authorized people can open this item.'}
          </p>
        </div>
      </div>
      <dl className="folder-context-panel__facts">
        <div>
          <dt>Your role</dt>
          <dd>{roleLabel}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{node.kind === 'FOLDER' ? 'Folder' : 'PDF document'}</dd>
        </div>
      </dl>
    </div>
  );
}
