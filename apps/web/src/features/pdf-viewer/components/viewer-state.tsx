export type ViewerStateName = 'deleted' | 'revoked' | 'forbidden' | 'network' | 'loading';
const copy: Record<ViewerStateName, string> = {
  deleted: 'This document is no longer available.',
  revoked: 'Your access to this document was revoked.',
  forbidden: 'You do not have permission to view this document.',
  network: 'The document could not be loaded.',
  loading: 'Opening private document…',
};

export function ViewerState({ state }: Readonly<{ state: ViewerStateName }>): React.JSX.Element {
  return (
    <section className="workspace-state pdf-viewer__state" aria-live="polite">
      <h1>{copy[state]}</h1>
      {state !== 'loading' ? (
        <p>Please return to the file list and try again if appropriate.</p>
      ) : null}
    </section>
  );
}
