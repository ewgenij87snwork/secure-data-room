import { FolderPlus } from 'lucide-react';

export function FolderToolbar({
  canManage,
  onCreateFolder,
}: Readonly<{
  canManage: boolean;
  onCreateFolder: (returnFocusElement: HTMLButtonElement) => void;
}>): React.JSX.Element | null {
  if (!canManage) return null;

  return (
    <div className="folder-toolbar" aria-label="Folder actions">
      <button
        className="primary-button"
        type="button"
        onClick={(event) => onCreateFolder(event.currentTarget)}
      >
        <FolderPlus size={18} strokeWidth={1.8} aria-hidden="true" />
        New folder
      </button>
    </div>
  );
}
