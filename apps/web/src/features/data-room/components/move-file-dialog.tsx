import type { NodeSummary } from '@data-room/contracts';
import { ChevronRight, Folder, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ResponsiveDialog } from '../../../components/ui/responsive-dialog.js';
import { ApiClientError } from '../../../lib/api-error.js';
import { mutationErrorMessage, suggestedNodeName } from '../dialog-helpers.js';
import { useMoveNode, useNodeChildren, useRenameNode } from '../data-room-queries.js';
import { useOnlineStatus } from '../../../lib/online-status-hook.js';

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
  const [effectiveNode, setEffectiveNode] = useState(node);
  const [recoveryPhase, setRecoveryPhase] = useState<'idle' | 'renaming' | 'moving' | 'partial'>(
    'idle',
  );
  const mutation = useMoveNode();
  const renameMutation = useRenameNode();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const recoveryError = renameMutation.error ?? mutation.error;
  const suggestion = suggestedNodeName(recoveryError);
  const isWorking =
    mutation.isPending ||
    renameMutation.isPending ||
    recoveryPhase === 'renaming' ||
    recoveryPhase === 'moving';

  const close = (): void => {
    mutation.reset();
    renameMutation.reset();
    setSelected(null);
    setEffectiveNode(node);
    setRecoveryPhase('idle');
    onOpenChange(false);
  };

  const changeOpen = (next: boolean) => {
    if (!next) {
      if (isWorking) return;
      close();
      return;
    }
    onOpenChange(true);
  };

  const moveCurrentNode = async (nodeToMove: NodeSummary): Promise<void> => {
    if (!isOnline || !selected || isWorking) return;
    mutation.reset();
    setRecoveryPhase('moving');
    try {
      await mutation.mutateAsync({ node: nodeToMove, targetFolderId: selected });
      close();
    } catch {
      setRecoveryPhase(nodeToMove.revision === node.revision ? 'idle' : 'partial');
    }
  };

  const renameAndMove = async (nextName: string): Promise<void> => {
    if (!isOnline || !selected || isWorking) return;
    mutation.reset();
    renameMutation.reset();
    setRecoveryPhase('renaming');
    let renamed: NodeSummary;
    try {
      renamed = await renameMutation.mutateAsync({ node: effectiveNode, name: nextName });
    } catch {
      setRecoveryPhase('idle');
      return;
    }

    setEffectiveNode(renamed);
    setRecoveryPhase('moving');
    try {
      await mutation.mutateAsync({ node: renamed, targetFolderId: selected });
      close();
    } catch {
      setRecoveryPhase('partial');
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={changeOpen}
      title={`Move ${node.name}`}
      description="Choose a destination folder. Existing files are never overwritten."
      returnFocusElement={returnFocusElement}
    >
      <div className="move-tree" role="tree" aria-label="Destination folders" aria-busy={isWorking}>
        <FolderBranch
          folderId={currentFolderId}
          currentFolderId={currentFolderId}
          selected={selected}
          onSelect={setSelected}
          disabled={isWorking}
          initial
        />
      </div>
      {recoveryPhase === 'renaming' || recoveryPhase === 'moving' ? (
        <p className="management-form__status" role="status" aria-live="polite">
          {recoveryPhase === 'renaming'
            ? 'Renaming the file before moving it…'
            : 'Moving the renamed file…'}
        </p>
      ) : null}
      {recoveryPhase === 'partial' ? (
        <div className="management-form__error" role="alert">
          <p>The file was renamed to “{effectiveNode.name}”, but the move did not finish.</p>
          <p>{mutationErrorMessage(mutation.error)}</p>
          {suggestion ? (
            <button
              className="text-button"
              type="button"
              onClick={() => void renameAndMove(suggestion)}
            >
              Rename to “{suggestion}” and retry
            </button>
          ) : (
            <button
              className="text-button"
              type="button"
              onClick={() => void moveCurrentNode(effectiveNode)}
            >
              Retry move
            </button>
          )}
        </div>
      ) : recoveryError ? (
        <div className="management-form__error" role="alert">
          {recoveryError instanceof ApiClientError && recoveryError.code === 'CONFLICT' ? (
            <>
              <p>This item changed elsewhere. Refresh the folder and choose again.</p>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  mutation.reset();
                  renameMutation.reset();
                  void queryClient.invalidateQueries({
                    queryKey: ['nodes', 'children', currentFolderId],
                  });
                }}
              >
                Refresh folder
              </button>
            </>
          ) : recoveryError instanceof ApiClientError && recoveryError.code === 'NAME_CONFLICT' ? (
            <>
              <p>A file with this name already exists there. No file was overwritten.</p>
              {suggestion ? (
                <button
                  className="text-button"
                  type="button"
                  disabled={renameMutation.isPending || mutation.isPending}
                  onClick={() => void renameAndMove(suggestion)}
                >
                  {renameMutation.isPending || mutation.isPending
                    ? 'Renaming and moving…'
                    : `Rename to “${suggestion}” and move`}
                </button>
              ) : null}
            </>
          ) : (
            mutationErrorMessage(recoveryError)
          )}
        </div>
      ) : null}
      <div className="management-form__actions">
        <button
          className="secondary-button"
          type="button"
          disabled={isWorking}
          onClick={() => changeOpen(false)}
        >
          Cancel
        </button>
        <button
          className="primary-button"
          type="button"
          disabled={!isOnline || !selected || selected === currentFolderId || isWorking}
          onClick={() => void moveCurrentNode(effectiveNode)}
        >
          {isWorking ? 'Moving…' : 'Move file'}
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
  disabled,
  initial = false,
}: Readonly<{
  folderId: string;
  currentFolderId: string;
  selected: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
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
        disabled={disabled}
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
                disabled={disabled || folder.id === currentFolderId}
                onClick={() => onSelect(folder.id)}
              >
                {folder.name}
              </button>
              <FolderBranch
                folderId={folder.id}
                currentFolderId={currentFolderId}
                selected={selected}
                onSelect={onSelect}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
