import type { NodeSummary } from '@data-room/contracts';
import { ResponsiveDialog } from '../../../components/ui/responsive-dialog.js';
import { ApiClientError } from '../../../lib/api-error.js';
import { mutationErrorMessage, pluralize } from '../dialog-helpers.js';
import { useDeleteImpact, useDeleteNode } from '../data-room-queries.js';
import { formatBytes } from './node-view-model.js';

export function DeleteNodeDialog({
  open,
  onOpenChange,
  node,
  returnFocusElement,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: NodeSummary;
  returnFocusElement?: HTMLElement | null;
}>): React.JSX.Element {
  const impact = useDeleteImpact(node.id, open);
  const mutation = useDeleteNode();

  const close = (): void => {
    mutation.reset();
    onOpenChange(false);
  };

  const changeOpen = (next: boolean): void => {
    if (!next) {
      if (mutation.isPending) return;
      close();
      return;
    }
    onOpenChange(true);
  };

  const isGone =
    impact.error instanceof ApiClientError &&
    (impact.error.code === 'RESOURCE_GONE' || impact.error.code === 'RESOURCE_NOT_FOUND');

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={changeOpen}
      title={`Delete ${node.name}?`}
      description="Deletion is permanent and cannot be undone."
      returnFocusElement={returnFocusElement}
    >
      <div className="delete-impact" aria-live="polite">
        {impact.isLoading ? <p role="status">Calculating exact impact…</p> : null}
        {impact.isError ? (
          <p className="management-form__error" role="alert">
            {isGone
              ? 'This item is no longer available.'
              : 'The deletion impact could not be loaded. Nothing has been deleted.'}
          </p>
        ) : null}
        {impact.data ? (
          <div className="delete-impact__summary">
            <p>This permanently removes:</p>
            <dl>
              <div>
                <dt>Folders</dt>
                <dd>
                  {impact.data.folderCount} {pluralize('folder', impact.data.folderCount)}
                </dd>
              </div>
              <div>
                <dt>Files</dt>
                <dd>
                  {impact.data.fileCount} {pluralize('file', impact.data.fileCount)}
                </dd>
              </div>
              <div>
                <dt>Storage</dt>
                <dd>{formatBytes(impact.data.totalBytes)}</dd>
              </div>
              <div>
                <dt>Active shares revoked</dt>
                <dd>
                  {impact.data.activeShareCount} active{' '}
                  {pluralize('share', impact.data.activeShareCount)}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
        {mutation.isError ? (
          <p className="management-form__error" role="alert">
            {mutationErrorMessage(mutation.error)}
          </p>
        ) : null}
      </div>
      <div className="management-form__actions">
        <button
          className="secondary-button"
          type="button"
          disabled={mutation.isPending}
          onClick={() => changeOpen(false)}
        >
          Cancel
        </button>
        <button
          className="destructive-button"
          type="button"
          disabled={!impact.data || mutation.isPending}
          onClick={() =>
            mutation.mutate(node, {
              onSuccess: close,
            })
          }
        >
          {mutation.isPending ? 'Deleting…' : 'Delete permanently'}
        </button>
      </div>
    </ResponsiveDialog>
  );
}
