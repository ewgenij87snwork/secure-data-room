import { useEffect, useState } from 'react';
import { useOnlineStatus } from './online-status-hook.js';

export function OnlineStatus({
  onReconnect,
}: Readonly<{ onReconnect?: (() => void) | undefined }>): React.JSX.Element | null {
  const isOnline = useOnlineStatus();
  const [reconnected, setReconnected] = useState(false);
  useEffect(() => {
    const online = (): void => setReconnected(true);
    const offline = (): void => setReconnected(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);
  if (!isOnline)
    return (
      <div className="online-status online-status--offline" role="status" aria-live="polite">
        You are offline. Changes will not be sent until your connection returns.
      </div>
    );
  if (!reconnected) return null;
  return (
    <div className="online-status online-status--reconnected" role="status" aria-live="polite">
      <span>You are back online. Refresh to check for updates.</span>
      {onReconnect ? (
        <button className="online-status__action" type="button" onClick={onReconnect}>
          Refresh now
        </button>
      ) : null}
    </div>
  );
}
