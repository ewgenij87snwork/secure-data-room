import type { NodeSummary } from '@data-room/contracts';
import { ChevronRight, Folder, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ResponsiveDialog } from '../../../components/ui/responsive-dialog.js';
import { ApiClientError } from '../../../lib/api-error.js';
import { useMoveNode, useNodeChildren } from '../data-room-queries.js';

export function MoveFileDialog({
  open,
  onOpenChange,
  node,
  currentFolderId,
  returnFocusElement,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: NodeSummary;
  currentFolderId: string;
  returnFocusElement?: HTMLElement | null;
}>): React.JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);
  const mutation = useMoveNode();
  const queryClient = useQueryClient();
  const changeOpen = (next: boolean) => {
    if (!next) {
      mutation.reset();
      setSelected(null);
    }
    onOpenChange(next);
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={changeOpen}
      title={`Move ${node.name}`}
      description="Choose a destination folder. Existing files are never overwritten."
      returnFocusElement={returnFocusElement}
    >
      <div className="move-tree" role="tree" aria-label="Destination folders">
        <FolderBranch
          folderId={currentFolderId}
          currentFolderId={currentFolderId}
          selected={selected}
          onSelect={setSelected}
          initial
        />
      </div>
      {mutation.isError ? (
        <div className="management-form__error" role="alert">
          {mutation.error instanceof ApiClientError && mutation.error.code === 'CONFLICT' ? (
            <>
              <p>This item changed elsewhere. Refresh the folder and choose again.</p>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  mutation.reset();
                  void queryClient.invalidateQueries({
                    queryKey: ['nodes', 'children', currentFolderId],
                  });
                }}
              >
                Refresh folder
              </button>
            </>
          ) : mutation.error instanceof ApiClientError &&
            mutation.error.code === 'NAME_CONFLICT' ? (
            <>
              <p>A file with this name already exists there. No file was overwritten.</p>
              {typeof mutation.error.details?.suggestedName === 'string' ? (
                <p>Suggested available name: “{mutation.error.details.suggestedName}”</p>
              ) : null}
            </>
          ) : (
            'The file could not be moved. Please try again.'
          )}
        </div>
      ) : null}
      <div className="management-form__actions">
        <button className="secondary-button" type="button" onClick={() => changeOpen(false)}>
          Cancel
        </button>
        <button
          className="primary-button"
          type="button"
          disabled={!selected || selected === currentFolderId || mutation.isPending}
          onClick={() => {
            if (selected) {
              mutation.mutate(
                { node, targetFolderId: selected },
                { onSuccess: () => changeOpen(false) },
              );
            }
          }}
        >
          {mutation.isPending ? 'Moving…' : 'Move file'}
        </button>
      </div>
    </ResponsiveDialog>
  );
}

function FolderBranch({
  folderId,
  currentFolderId,
  selected,
  onSelect,
  initial = false,
}: Readonly<{
  folderId: string;
  currentFolderId: string;
  selected: string | null;
  onSelect: (id: string) => void;
  initial?: boolean;
}>): React.JSX.Element {
  const [expanded, setExpanded] = useState(initial);
  const query = useNodeChildren(folderId, expanded);
  const folders =
    query.data?.pages.flatMap((page) => page.items).filter((item) => item.kind === 'FOLDER') ?? [];
  return (
    <div role="treeitem" aria-selected={selected === folderId} className="move-tree__branch">
      <button
        type="button"
        className="move-tree__folder"
        aria-label={expanded ? `Collapse ${folderId}` : 'Load folders'}
        onClick={() => setExpanded((value) => !value)}
      >
        <ChevronRight
          size={16}
          aria-hidden="true"
          className={expanded ? 'move-tree__chevron--open' : ''}
        />
        <Folder size={17} aria-hidden="true" />
        {folderId === currentFolderId ? 'Current folder' : folderId}
        <span className="sr-only">{query.isFetching ? 'Loading' : ''}</span>
      </button>
      {query.isLoading ? (
        <span role="status">
          <LoaderCircle size={15} aria-label="Loading folders" />
        </span>
      ) : null}
      {expanded ? (
        <div className="move-tree__children">
          {folders.map((folder) => (
            <div key={folder.id}>
              <button
                type="button"
                className="move-tree__target"
                disabled={folder.id === currentFolderId}
                onClick={() => onSelect(folder.id)}
              >
                {folder.name}
              </button>
              <FolderBranch
                folderId={folder.id}
                currentFolderId={currentFolderId}
                selected={selected}
                onSelect={onSelect}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
