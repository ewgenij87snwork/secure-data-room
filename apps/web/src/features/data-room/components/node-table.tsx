import type { NodeSummary } from '@data-room/contracts';
import { AccessStatus } from './access-status.js';
import { NodeActionsMenu } from './node-actions-menu.js';
import { NodeName } from './node-name.js';
import type { NodeItemViewModel } from './node-view-model.js';
import { NodeDownloadButton } from './node-download-button.js';

export function NodeTable({
  items,
  onRename,
  onDelete,
  onMove,
  onShare,
  resolveDestination,
  onOpen,
  onDownload,
}: Readonly<{
  items: readonly NodeItemViewModel[];
  onRename: (node: NodeSummary, returnFocusElement: HTMLElement | null) => void;
  onDelete: (node: NodeSummary, returnFocusElement: HTMLElement | null) => void;
  onMove: ((node: NodeSummary, returnFocusElement: HTMLElement | null) => void) | undefined;
  onShare?: ((node: NodeSummary, returnFocusElement: HTMLElement | null) => void) | undefined;
  resolveDestination?: ((node: NodeSummary) => string) | undefined;
  onOpen?: ((node: NodeSummary) => void) | undefined;
  onDownload?: ((node: NodeSummary) => Promise<void>) | undefined;
}>): React.JSX.Element {
  return (
    <div className="node-table-wrap">
      <table className="node-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Modified</th>
            <th scope="col">Access</th>
            <th scope="col">Size</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <NodeName item={item} resolveDestination={resolveDestination} onOpen={onOpen} />
              </td>
              <td>{item.modifiedLabel}</td>
              <td>
                <AccessStatus state={item.accessState} />
              </td>
              <td>{item.sizeLabel}</td>
              <td className="node-table__actions">
                <NodeDownloadButton node={item.node} onDownload={onDownload} />
                <NodeActionsMenu
                  item={item}
                  onRename={onRename}
                  onDelete={onDelete}
                  onMove={onMove}
                  onShare={onShare}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
