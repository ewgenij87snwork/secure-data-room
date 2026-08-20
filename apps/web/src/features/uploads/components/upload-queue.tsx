import { useOptionalUploadQueue } from '../upload-queue-context.js';
import { UploadQueueItem } from './upload-queue-item.js';

export function UploadQueue(): React.JSX.Element | null {
  const queue = useOptionalUploadQueue();
  if (!queue) return null;
  const { state, retry, cancel } = queue;
  if (state.items.length === 0 && state.intakeErrors.length === 0) return null;
  const transitions = state.items.filter((item) =>
    ['succeeded', 'failed', 'cancelled'].includes(item.state),
  ).length;
  return (
    <aside className="upload-queue" aria-label="PDF uploads">
      <details open>
        <summary className="upload-queue__header">
          <span>
            <span className="eyebrow">Quiet Authority</span>
            <h2>Uploads</h2>
          </span>
          <span className="upload-queue__summary">
            {state.items.length} file{state.items.length === 1 ? '' : 's'}
          </span>
        </summary>
        <div className="upload-queue__announcer" role="status" aria-live="polite">
          {transitions > 0
            ? `${transitions} upload status update${transitions === 1 ? '' : 's'}.`
            : ''}
        </div>
        {state.intakeErrors.length > 0 ? (
          <div className="upload-queue__errors" role="alert">
            {state.intakeErrors.map((error, index) => (
              <p key={`${index}-${error}`}>{error}</p>
            ))}
          </div>
        ) : null}
        {state.items.length > 0 ? (
          <ul>
            {state.items.map((item) => (
              <UploadQueueItem
                key={item.clientId}
                item={item}
                onRetry={() => retry(item.clientId)}
                onCancel={() => cancel(item.clientId)}
              />
            ))}
          </ul>
        ) : null}
      </details>
    </aside>
  );
}
