import { Link, useParams } from 'react-router-dom';
import { useSharedChildren, useSharedNode } from './queries.js';
import { NodeBrowser } from '../data-room/components/node-browser.js';
import { ReadOnlyBanner } from './components/read-only-banner.js';
import { useAuth } from '../auth/auth-context.js';
import { readFileViewUrl } from '../data-room/data-room-api.js';
import { startFileDownload } from '../pdf-viewer/download-file.js';
export function SharedNodeRoute(): React.JSX.Element {
  const { nodeId = '' } = useParams();
  const auth = useAuth();
  const node = useSharedNode(nodeId);
  const folder = node.data?.kind === 'FOLDER';
  const children = useSharedChildren(nodeId, folder);
  const current = node.data;
  if (node.isLoading)
    return (
      <section className="sharing-page">
        <h1 id="workspace-title" className="sr-only">
          Shared item
        </h1>
        <p role="status">Opening shared item…</p>
      </section>
    );
  if (node.isError || !current)
    return (
      <section className="sharing-page">
        <h1 id="workspace-title">This shared item is no longer available.</h1>
        <p role="alert">The owner may have revoked access or deleted the item.</p>
        <Link className="secondary-button" to="/shared">
          Open Shared with me
        </Link>
      </section>
    );
  return (
    <section className="sharing-page">
      <ReadOnlyBanner />
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <span aria-current="page">{current.name}</span>
      </nav>
      <p className="eyebrow">{folder ? 'Shared folder' : 'Shared PDF'}</p>
      <h1 id="workspace-title">{current.name}</h1>
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
          onDownload={async (file) => {
            if (!auth.accessToken) throw new Error('An authenticated session is required.');
            const view = await readFileViewUrl(auth.accessToken, file.id);
            startFileDownload(view.downloadUrl, file.name);
          }}
        />
      ) : (
        <Link className="primary-button" to={`/files/${current.id}`}>
          Open PDF
        </Link>
      )}
    </section>
  );
}
