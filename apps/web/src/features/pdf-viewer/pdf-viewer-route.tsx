import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context.js';
import { ApiClientError } from '../../lib/api-error.js';
import { readFileViewUrl } from '../data-room/data-room-api.js';
import { useNode } from '../data-room/data-room-queries.js';
import { EmbeddedPdf } from './components/embedded-pdf.js';
import { PdfViewerToolbar } from './components/pdf-viewer-toolbar.js';
import { ViewerState, type ViewerStateName } from './components/viewer-state.js';

export function PdfViewerRoute(): React.JSX.Element {
  const nodeId = useParams().nodeId ?? '';
  const { accessToken } = useAuth();
  const node = useNode(nodeId);
  const [view, setView] = useState<{ url: string; expiresAt: string } | null>(null);
  const [state, setState] = useState<ViewerStateName>('loading');
  const requestGeneration = useRef(0);
  const load = useCallback(() => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    setView(null);
    setState('loading');
    if (!accessToken || !node.data) return;

    void readFileViewUrl(accessToken, node.data.id)
      .then((next) => {
        if (requestGeneration.current !== generation) return;
        setView(next);
      })
      .catch((error: unknown) => {
        if (requestGeneration.current !== generation) return;
        setView(null);
        setState(viewerErrorState(error));
      });
  }, [accessToken, node.data]);
  useEffect(() => {
    // The loader synchronizes the route state with the protected API response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  useEffect(() => {
    if (!view) return;
    const delay = Math.max(0, new Date(view.expiresAt).getTime() - Date.now() - 1000);
    const timer = window.setTimeout(load, Math.min(delay, 60000));
    return () => window.clearTimeout(timer);
  }, [view, load]);
  if (node.isLoading || (state === 'loading' && !node.data)) {
    return (
      <main className="pdf-viewer">
        <PdfViewerToolbar name="Opening document…" onRefresh={load} />
        <section
          className="pdf-viewer__loading-skeleton"
          data-testid="pdf-viewer-skeleton"
          role="status"
          aria-label="Loading document"
        >
          <span className="sr-only">Loading document</span>
          <div className="content-skeleton content-skeleton--pdf-title" aria-hidden="true" />
          <div className="content-skeleton content-skeleton--pdf-page" aria-hidden="true" />
        </section>
      </main>
    );
  }
  if (node.isError || !node.data) return <ViewerState state={viewerErrorState(node.error)} />;
  return (
    <main className="pdf-viewer">
      <PdfViewerToolbar name={node.data.name} onRefresh={load} />
      {view ? <EmbeddedPdf url={view.url} name={node.data.name} /> : <ViewerState state={state} />}
    </main>
  );
}

function viewerErrorState(error: unknown): ViewerStateName {
  if (error instanceof ApiClientError) {
    if (error.code === 'RESOURCE_GONE' || error.code === 'RESOURCE_NOT_FOUND') return 'deleted';
    if (error.code === 'SHARE_REVOKED') return 'revoked';
    if (error.code === 'ACCESS_DENIED') return 'forbidden';
  }
  return 'network';
}
