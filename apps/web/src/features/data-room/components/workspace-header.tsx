import { LogOut, ShieldCheck } from 'lucide-react';

export function WorkspaceHeader({
  accountLabel,
  onSignOut,
}: Readonly<{ accountLabel: string; onSignOut: () => void }>): React.JSX.Element {
  return (
    <div className="workspace-header">
      <div className="workspace-header__privacy">
        <ShieldCheck size={17} strokeWidth={1.8} aria-hidden="true" />
        <span>Protected workspace</span>
      </div>
      <div className="workspace-header__account">
        <span className="workspace-header__identity" title={accountLabel}>
          {accountLabel}
        </span>
        <button className="icon-button" type="button" onClick={onSignOut} aria-label="Sign out">
          <LogOut size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
