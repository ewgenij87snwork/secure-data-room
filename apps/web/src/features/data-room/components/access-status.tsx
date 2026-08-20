import { LockKeyhole, UsersRound, type LucideIcon } from 'lucide-react';

export type AccessState = 'private' | 'shared';

const accessConfig: Record<AccessState, Readonly<{ label: string; Icon: LucideIcon }>> = {
  private: { label: 'Private', Icon: LockKeyhole },
  shared: { label: 'Shared', Icon: UsersRound },
};

export function AccessStatus({ state }: Readonly<{ state: AccessState }>): React.JSX.Element {
  const { label, Icon } = accessConfig[state];
  return (
    <span className="access-status" data-access={state} role="img" aria-label={label} title={label}>
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" focusable="false" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
