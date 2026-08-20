import type { NodeSummary } from '@data-room/contracts';
import { useState } from 'react';
import { ResponsiveDialog } from '../../../components/ui/responsive-dialog.js';
import { ActiveShareList } from './active-share-list.js';
import { PermissionedShareForm } from './permissioned-share-form.js';
import { PublicLinkPanel } from './public-link-panel.js';
import {
  useCreatePermissionedShare,
  useCreatePublicShare,
  useRevokeShare,
  useShares,
} from '../queries.js';

export function ShareDialog({
  node,
  open,
  onOpenChange,
  returnFocusElement,
}: {
  node: NodeSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusElement?: HTMLElement | null;
}): React.JSX.Element {
  const shares = useShares(node.id, open);
  const pub = useCreatePublicShare(node.id);
  const user = useCreatePermissionedShare(node.id);
  const revoke = useRevokeShare(node.id);
  const [url, setUrl] = useState('');
  const [revokingShareId, setRevokingShareId] = useState<string | null>(null);
  const handleRevokeSuccess = () => setRevokingShareId(null);
  const handleRevoke = (id: string) => {
    setRevokingShareId(id);
    revoke.mutate(id, { onSuccess: handleRevokeSuccess });
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Share “${node.name}”`}
      description="Choose a deliberate, view-only sharing path."
      returnFocusElement={returnFocusElement}
    >
      <div className="share-dialog">
        {pub.error ? (
          <p className="form-error" role="alert">
            The public link could not be created. Try again.
          </p>
        ) : null}
        <PublicLinkPanel
          url={url}
          onCreate={() => pub.mutate(undefined, { onSuccess: (result) => setUrl(result.url) })}
          isCreating={pub.isPending}
        />
        <PermissionedShareForm
          onSubmit={(email) => user.mutate({ email })}
          isSubmitting={user.isPending}
          error={user.error ? 'This email could not be granted access.' : null}
        />
        <ActiveShareList
          shares={shares.data?.items ?? []}
          onRevoke={handleRevoke}
          isRevoking={revoke.isPending}
          isLoading={shares.isLoading}
          error={Boolean(shares.error)}
          onRetry={() => void shares.refetch()}
          revokingShareId={revokingShareId}
          revokeError={Boolean(revoke.error)}
          onRetryRevoke={() => {
            if (revokingShareId) revoke.mutate(revokingShareId, { onSuccess: handleRevokeSuccess });
          }}
        />
      </div>
    </ResponsiveDialog>
  );
}
