import type { UploadItem } from '../upload-types.js';

export function UploadProgress({ item }: { item: UploadItem }): React.JSX.Element {
  return (
    <div
      role="progressbar"
      aria-label={`Uploading ${item.file.name}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={item.percent}
    >
      <div className="upload-progress__track">
        <span style={{ width: `${item.percent}%` }} />
      </div>
      <span>
        {item.bytesUploaded.toLocaleString()} of {item.file.size.toLocaleString()} bytes ·{' '}
        {item.percent}%
      </span>
    </div>
  );
}
