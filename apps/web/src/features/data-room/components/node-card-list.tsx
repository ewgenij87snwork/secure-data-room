import type { NodeSummary } from '@data-room/contracts';
import { AccessStatus } from './access-status.js';
import { NodeActionsMenu } from './node-actions-menu.js';
import { NodeName } from './node-name.js';
import type { NodeItemViewModel } from './node-view-model.js';

export function NodeCardList({
  items,
  onRename,
  onDelete,
  onMove,
  resolveDestination,
  onOpen,
}: Readonly<{
  items: readonly NodeItemViewModel[];
  onRename: (node: NodeSummary, returnFocusElement: HTMLElement | null) => void;
  onDelete: (node: NodeSummary, returnFocusElement: HTMLElement | null) => void;
  onMove: ((node: NodeSummary, returnFocusElement: HTMLElement | null) => void) | undefined;
  resolveDestination?: ((node: NodeSummary) => string) | undefined;
  onOpen?: ((node: NodeSummary) => void) | undefined;
}>): React.JSX.Element {
  return (
    <ul className="node-card-list" aria-label="Folder contents">
      {items.map((item) => (
        <li className="node-card" key={item.id}>
          <div className="node-card__name">
            <NodeName item={item} resolveDestination={resolveDestination} onOpen={onOpen} />
            <NodeActionsMenu item={item} onRename={onRename} onDelete={onDelete} onMove={onMove} />
          </div>
          <dl className="node-card__metadata">
            <div>
              <dt>Modified</dt>
              <dd>{item.modifiedLabel}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>
                <AccessStatus state={item.accessState} />
              </dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{item.sizeLabel}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
