import type { NodeSummary } from '@data-room/contracts';
import { Download } from 'lucide-react';
import { useState } from 'react';

export function NodeDownloadButton({
  node,
  onDownload,
}: Readonly<{
  node: NodeSummary;
  onDownload?: ((node: NodeSummary) => Promise<void>) | undefined;
}>): React.JSX.Element | null {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  if (node.kind !== 'FILE' || !onDownload) return null;

  return (
    <>
      <button
        className="icon-button node-download-button"
        type="button"
        aria-label={`Download ${node.name}`}
        disabled={state === 'loading'}
        onClick={() => {
          setState('loading');
          void onDownload(node).then(
            () => setState('idle'),
            () => setState('error'),
          );
        }}
      >
        <Download size={18} aria-hidden="true" />
      </button>
      {state === 'error' ? (
        <span className="sr-only" role="alert">
          {node.name} could not be downloaded. Try again.
        </span>
      ) : null}
    </>
  );
}
