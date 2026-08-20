import type { NodeSummary } from '@data-room/contracts';
import { NodeCardList } from './node-card-list.js';
import { NodeTable } from './node-table.js';
import { toNodeViewModel } from './node-view-model.js';
import { DataRoomState } from './data-room-state.js';

export function NodeBrowser({
  nodes,
  canManage,
  isLoading = false,
  isError = false,
  isRefreshing = false,
  hasNextPage = false,
  isLoadingMore = false,
  onLoadMore,
  onRetry,
  onRename,
  onDelete,
  onMove,
  resolveDestination,
  onOpen,
}: Readonly<{
  nodes: readonly NodeSummary[];
  canManage: boolean;
  isLoading?: boolean;
  isError?: boolean;
  isRefreshing?: boolean;
  hasNextPage?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
  onRename: (node: NodeSummary, returnFocusElement: HTMLElement | null) => void;
  onDelete: (node: NodeSummary, returnFocusElement: HTMLElement | null) => void;
  onMove?: (node: NodeSummary, returnFocusElement: HTMLElement | null) => void;
  resolveDestination?: (node: NodeSummary) => string;
  onOpen?: (node: NodeSummary) => void;
}>): React.JSX.Element {
  const items = nodes.map((node) => toNodeViewModel(node, canManage));

  if (isLoading && items.length === 0) {
    return <DataRoomState kind="loading" label="Loading folder contents…" />;
  }

  if (isError && items.length === 0) {
    return (
      <DataRoomState
        kind="error"
        title="Folder contents are unavailable"
        message="The connection could not be completed. Your data is unchanged."
        onRetry={onRetry}
      />
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
      {isError ? (
        <div className="node-browser__stale-error" role="alert">
          <span>Folder contents could not be refreshed. Showing the last available data.</span>
          {onRetry ? (
            <button className="secondary-button" type="button" onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {isRefreshing ? (
        <span className="node-browser__refresh" role="status">
          Refreshing…
        </span>
      ) : null}
      <NodeTable
        items={items}
        onRename={onRename}
        onDelete={onDelete}
        onMove={onMove}
        resolveDestination={resolveDestination}
        onOpen={onOpen}
      />
      <NodeCardList
        items={items}
        onRename={onRename}
        onDelete={onDelete}
        onMove={onMove}
        resolveDestination={resolveDestination}
        onOpen={onOpen}
      />
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
