import type { ShareSummary } from '@data-room/contracts';
import { Ban } from 'lucide-react';
export function ActiveShareList({
  shares,
  onRevoke,
  isRevoking,
  isLoading = false,
  error,
  onRetry,
  revokingShareId,
  revokeError,
  onRetryRevoke,
}: {
  shares: readonly ShareSummary[];
  onRevoke: (id: string) => void;
  isRevoking?: boolean;
  isLoading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  revokingShareId?: string | null;
  revokeError?: boolean;
  onRetryRevoke?: () => void;
}): React.JSX.Element {
  return (
    <section className="share-section" aria-labelledby="active-shares-title">
      <div className="share-section__title">
        <h2 id="active-shares-title">Active access</h2>
      </div>
      {isLoading ? (
        <p role="status">Loading active shares…</p>
      ) : error ? (
        <div role="alert">
          <p>Active shares could not be loaded.</p>
          <button className="secondary-button" type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : shares.length === 0 ? (
        <p>No active shares.</p>
      ) : (
        <ul className="active-share-list" aria-label="Active access grants">
          {shares
            .filter((share) => !share.revokedAt)
            .map((share, index) => (
              <li className="active-share-list__item" key={share.id}>
                <div className="active-share-list__identity">
                  <strong>
                    {share.principalType === 'PUBLIC_LINK' ? 'Public link' : share.recipientEmail}
                  </strong>
                  <span>
                    {share.principalType === 'PUBLIC_LINK' ? `Link ${index + 1} · ` : ''}
                    {share.targetName} · View only
                  </span>
                </div>
                <button
                  className="quiet-danger-button"
                  type="button"
                  onClick={() => onRevoke(share.id)}
                  disabled={isRevoking}
                >
                  <Ban size={15} aria-hidden="true" />
                  {revokingShareId === share.id ? 'Revoking…' : 'Revoke'}
                </button>
                {revokeError && revokingShareId === share.id ? (
                  <div role="alert">
                    <span>Revoke failed.</span>{' '}
                    <button className="secondary-button" type="button" onClick={onRetryRevoke}>
                      Retry
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
