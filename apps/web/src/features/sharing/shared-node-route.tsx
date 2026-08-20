import { Link, useParams } from 'react-router-dom';
import { useSharedChildren, useSharedNode } from './queries.js';
import { NodeBrowser } from '../data-room/components/node-browser.js';
import { ReadOnlyBanner } from './components/read-only-banner.js';
export function SharedNodeRoute(): React.JSX.Element {
  const { nodeId = '' } = useParams();
  const node = useSharedNode(nodeId);
  const folder = node.data?.kind === 'FOLDER';
  const children = useSharedChildren(nodeId, folder);
  const current = node.data;
  if (node.isLoading)
    return (
      <main className="sharing-page">
        <p role="status">Opening shared item…</p>
      </main>
    );
  if (node.isError || !current)
    return (
      <main className="sharing-page">
        <h1>This shared item is no longer available.</h1>
        <p role="alert">The owner may have revoked access or deleted the item.</p>
        <Link className="secondary-button" to="/shared">
          Open Shared with me
        </Link>
      </main>
    );
  return (
    <main className="sharing-page">
      <ReadOnlyBanner />
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <span aria-current="page">{current.name}</span>
      </nav>
      <p className="eyebrow">{folder ? 'Shared folder' : 'Shared PDF'}</p>
      <h1>{current.name}</h1>
      {folder ? (
        <NodeBrowser
          nodes={children.data?.pages.flatMap((page) => page.items) ?? []}
          canManage={false}
          isLoading={children.isLoading}
          isError={children.isError}
          hasNextPage={children.hasNextPage}
          isLoadingMore={children.isFetchingNextPage}
          onLoadMore={() => void children.fetchNextPage()}
          onRename={() => undefined}
          onDelete={() => undefined}
          resolveDestination={(child) =>
            child.kind === 'FOLDER' ? `/shared/${child.id}` : `/files/${child.id}`
          }
        />
      ) : (
        <Link className="primary-button" to={`/files/${current.id}`}>
          Open PDF
        </Link>
      )}
    </main>
  );
}
