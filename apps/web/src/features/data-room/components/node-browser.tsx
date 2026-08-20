import type { NodeSummary } from '@data-room/contracts';
import { LoaderCircle } from 'lucide-react';
import { NodeCardList } from './node-card-list.js';
import { NodeTable } from './node-table.js';
import { toNodeViewModel } from './node-view-model.js';

export function NodeBrowser({
  nodes,
  canManage,
  isLoading = false,
  isError = false,
  isRefreshing = false,
  hasNextPage = false,
  isLoadingMore = false,
  onLoadMore,
  onRename,
  onDelete,
  onMove,
}: Readonly<{
  nodes: readonly NodeSummary[];
  canManage: boolean;
  isLoading?: boolean;
  isError?: boolean;
  isRefreshing?: boolean;
  hasNextPage?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onRename: (node: NodeSummary, returnFocusElement: HTMLElement | null) => void;
  onDelete: (node: NodeSummary, returnFocusElement: HTMLElement | null) => void;
  onMove?: (node: NodeSummary, returnFocusElement: HTMLElement | null) => void;
}>): React.JSX.Element {
  const items = nodes.map((node) => toNodeViewModel(node, canManage));

  if (isLoading && items.length === 0) {
    return (
      <div className="node-browser-state" role="status">
        <LoaderCircle className="spin" size={19} aria-hidden="true" />
        Loading folder contents…
      </div>
    );
  }

  if (isError && items.length === 0) {
    return (
      <div className="node-browser-state node-browser-state--error" role="alert">
        Folder contents could not be loaded. Try again in a moment.
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty-folder-state">
        <p className="eyebrow">Nothing here yet</p>
        <h2>This folder is ready for its first document.</h2>
        <p>
          {canManage
            ? 'Create a folder now, or add PDFs when uploads become available.'
            : 'The owner has not added anything here yet.'}
        </p>
      </div>
    );
  }

  return (
    <section className="node-browser" aria-label="Folder contents" aria-busy={isRefreshing}>
      {isRefreshing ? (
        <span className="node-browser__refresh" role="status">
          Refreshing…
        </span>
      ) : null}
      <NodeTable items={items} onRename={onRename} onDelete={onDelete} onMove={onMove} />
      <NodeCardList items={items} onRename={onRename} onDelete={onDelete} onMove={onMove} />
      {hasNextPage ? (
        <button
          className="secondary-button node-browser__load-more"
          type="button"
          onClick={onLoadMore}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </section>
  );
}
