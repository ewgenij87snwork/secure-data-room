import type { UploadItem } from '../upload-types.js';
import { UploadProgress } from './upload-progress.js';

const stateLabels: Record<UploadItem['state'], string> = {
  queued: 'Queued',
  preparing: 'Preparing',
  uploading: 'Uploading',
  finalizing: 'Finishing',
  succeeded: 'Uploaded',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function UploadQueueItem({
  item,
  onRetry,
  onCancel,
}: {
  item: UploadItem;
  onRetry: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const active = ['queued', 'preparing', 'uploading', 'finalizing'].includes(item.state);
  return (
    <li className="upload-queue__item">
      <div className="upload-queue__item-heading">
        <strong>{item.file.name}</strong>
        <span>{stateLabels[item.state]}</span>
      </div>
      {item.state === 'uploading' || item.state === 'finalizing' ? (
        <UploadProgress item={item} />
      ) : null}
      {item.state === 'succeeded' ? (
        <p role="status">
          Uploaded as {item.finalName}
          {item.conflictResolved ? ' (renamed to resolve a conflict).' : '.'}
        </p>
      ) : null}
      {item.errorMessage ? <p role="alert">{item.errorMessage}</p> : null}
      <div className="upload-queue__actions">
        {item.state === 'failed' ? (
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
        {active && item.state !== 'finalizing' ? (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </li>
  );
}
