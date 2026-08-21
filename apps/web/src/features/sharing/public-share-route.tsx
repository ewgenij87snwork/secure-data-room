import type { NodeSummary } from '@data-room/contracts';
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePublicShare, usePublicChildren } from './queries.js';
import { capturePublicShareToken, clearPublicShareToken } from '../../lib/public-token.js';
import { readPublicFileViewUrl } from './api.js';
import { EmbeddedPdf } from '../pdf-viewer/components/embedded-pdf.js';
import { ViewerState, type ViewerStateName } from '../pdf-viewer/components/viewer-state.js';
import { ApiClientError } from '../../lib/api-error.js';
import { NodeBrowser } from '../data-room/components/node-browser.js';
import { ReadOnlyBanner } from './components/read-only-banner.js';
export function PublicShareRoute(): React.JSX.Element {
  const query = usePublicShare();
  const token = capturePublicShareToken();
  const [stack, setStack] = useState<readonly NodeSummary[]>([]);
  const node = stack.at(-1) ?? query.data;
  const folder = node?.kind === 'FOLDER';
  const children = usePublicChildren(token, node?.id ?? '', Boolean(folder));
  if (!token || query.isError)
    return (
      <main className="sharing-page">
        <p className="eyebrow">Public link</p>
        <h1>
          {query.isError &&
          query.error instanceof ApiClientError &&
          query.error.code === 'SHARE_REVOKED'
            ? 'This public link was revoked.'
            : 'This public link is invalid or expired.'}
        </h1>
        <p role="alert">Ask the owner for a new link.</p>
      </main>
    );
  if (query.isLoading || !node)
    return (
      <main className="sharing-page">
        <p role="status">Opening public link…</p>
      </main>
    );
  return (
    <main className="sharing-page">
      <ReadOnlyBanner />
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <span aria-current="page">{node.name}</span>
      </nav>
      <p className="eyebrow">Public view</p>
      <h1>{node.name}</h1>
      {folder ? (
        <NodeBrowser
          nodes={children.data?.pages.flatMap((page) => page.items) ?? []}
          canManage={false}
          isLoading={children.isLoading || !children.isSuccess}
          isError={children.isError}
          onRetry={() => void children.refetch()}
          hasNextPage={children.hasNextPage}
          isLoadingMore={children.isFetchingNextPage}
          onLoadMore={() => void children.fetchNextPage()}
          onRename={() => undefined}
          onDelete={() => undefined}
          resolveDestination={() => '/share'}
          onOpen={(child) => setStack((current) => [...current, child])}
        />
      ) : node.kind === 'FILE' ? (
        <PublicPdf nodeId={node.id} token={token} name={node.name} />
      ) : (
        <p>This PDF is available in read-only mode.</p>
      )}
      {stack.length > 0 ? (
        <button
          className="secondary-button"
          type="button"
          onClick={() => setStack((current) => current.slice(0, -1))}
        >
          Back
        </button>
      ) : null}
      <Link className="secondary-button" to="/sign-in" onClick={() => clearPublicShareToken()}>
        Sign in
      </Link>
    </main>
  );
}

export function PublicPdf({
  nodeId,
  token,
  name,
}: {
  nodeId: string;
  token: string;
  name: string;
}): React.JSX.Element {
  const [view, setView] = useState<{ url: string; expiresAt: string } | null>(null);
  const [state, setState] = useState<ViewerStateName>('loading');
  const requestGeneration = useRef(0);
  const mounted = useRef(true);
  const load = useCallback(() => {
    const generation = ++requestGeneration.current;
    setView(null);
    setState('loading');
    void readPublicFileViewUrl(token, nodeId)
      .then((next) => {
        if (mounted.current && generation === requestGeneration.current) setView(next);
      })
      .catch((error: unknown) => {
        if (mounted.current && generation === requestGeneration.current) {
          setView(null);
          setState(publicViewerErrorState(error));
        }
      });
  }, [nodeId, token]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    // Route changes synchronize the viewer request with the public node.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  useEffect(() => {
    if (!view) return;
    const timer = window.setTimeout(
      load,
      Math.max(0, new Date(view.expiresAt).getTime() - Date.now() - 1000),
    );
    return () => window.clearTimeout(timer);
  }, [load, view]);
  if (!view) return <ViewerState state={state} />;
  return (
    <>
      <button className="secondary-button" type="button" onClick={load}>
        Refresh document
      </button>
      <EmbeddedPdf url={view.url} name={name} />
    </>
  );
}

function publicViewerErrorState(error: unknown): ViewerStateName {
  if (error instanceof ApiClientError) {
    if (error.code === 'SHARE_REVOKED') return 'revoked';
    if (error.code === 'RESOURCE_GONE' || error.code === 'RESOURCE_NOT_FOUND') return 'deleted';
    if (error.code === 'ACCESS_DENIED') return 'forbidden';
  }
  return 'network';
}
