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
import { useOnlineStatus } from '../../../lib/online-status-hook.js';

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
  const isOnline = useOnlineStatus();
  const [url, setUrl] = useState('');
  const [revokingShareId, setRevokingShareId] = useState<string | null>(null);
  const handleRevokeSuccess = () => setRevokingShareId(null);
  const handleRevoke = (id: string) => {
    if (!isOnline) return;
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
          onCreate={() => {
            if (isOnline) pub.mutate(undefined, { onSuccess: (result) => setUrl(result.url) });
          }}
          isCreating={pub.isPending}
          disabled={!isOnline}
        />
        <PermissionedShareForm
          onSubmit={(email) => {
            if (isOnline) user.mutate({ email });
          }}
          isSubmitting={user.isPending}
          disabled={!isOnline}
          error={user.error ? 'This email could not be granted access.' : null}
        />
        <ActiveShareList
          shares={shares.data?.items ?? []}
          onRevoke={handleRevoke}
          isRevoking={revoke.isPending || !isOnline}
          isLoading={shares.isLoading}
          error={Boolean(shares.error)}
          onRetry={() => void shares.refetch()}
          revokingShareId={revokingShareId}
          revokeError={Boolean(revoke.error)}
          onRetryRevoke={() => {
            if (isOnline && revokingShareId) {
              revoke.mutate(revokingShareId, { onSuccess: handleRevokeSuccess });
            }
          }}
        />
      </div>
    </ResponsiveDialog>
  );
}
