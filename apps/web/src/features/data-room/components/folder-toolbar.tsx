import { FolderPlus, Share2 } from 'lucide-react';

export function FolderToolbar({
  canManage,
  onCreateFolder,
  onShare,
  showCreateFolder = true,
}: Readonly<{
  canManage: boolean;
  onCreateFolder: (returnFocusElement: HTMLButtonElement) => void;
  onShare?: (returnFocusElement: HTMLButtonElement) => void;
  showCreateFolder?: boolean;
}>): React.JSX.Element | null {
  if (!canManage) return null;

  return (
    <div className="folder-toolbar" aria-label="Folder actions">
      {showCreateFolder ? (
        <button
          className="primary-button"
          type="button"
          onClick={(event) => onCreateFolder(event.currentTarget)}
        >
          <FolderPlus size={18} strokeWidth={1.8} aria-hidden="true" />
          New folder
        </button>
      ) : null}
      {onShare ? (
        <button
          className="secondary-button"
          type="button"
          onClick={(event) => onShare(event.currentTarget)}
        >
          <Share2 size={17} aria-hidden="true" /> Share
        </button>
      ) : null}
    </div>
  );
}
