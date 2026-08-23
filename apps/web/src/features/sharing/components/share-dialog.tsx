import type { NodeSummary } from '@data-room/contracts';
import type { ShareSummary } from '@data-room/contracts';
import { Check, Copy } from 'lucide-react';
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
  const [permissionedShare, setPermissionedShare] = useState<ShareSummary | null>(null);
  const [invitationCopied, setInvitationCopied] = useState(false);
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
            if (isOnline) user.mutate({ email }, { onSuccess: setPermissionedShare });
          }}
          isSubmitting={user.isPending}
          disabled={!isOnline}
          error={user.error ? 'This email could not be granted access.' : null}
        />
        {permissionedShare?.recipientEmail ? (
          <section className="access-confirmation" aria-labelledby="access-confirmation-title">
            <div>
              <h2 id="access-confirmation-title">Access granted</h2>
              <p>
                {permissionedShare.recipientEmail} can now open {node.name} in Shared with me.
              </p>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(`${window.location.origin}/shared`)
                  .then(() => setInvitationCopied(true))
                  .catch(() => setInvitationCopied(false));
              }}
            >
              {invitationCopied ? (
                <>
                  <Check size={16} aria-hidden="true" /> Copied
                </>
              ) : (
                <>
                  <Copy size={16} aria-hidden="true" /> Copy invitation link
                </>
              )}
            </button>
            <p className="access-confirmation__hint">
              Send this link to them. If they are already signed in with that email, the shared
              folder opens immediately; otherwise they sign in first. If another Google account is
              active, they should sign out and use the invited address.
            </p>
          </section>
        ) : null}
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
