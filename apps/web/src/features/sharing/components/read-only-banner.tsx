import { Eye } from 'lucide-react';
export function ReadOnlyBanner({ owner }: { owner?: string | null }): React.JSX.Element {
  return (
    <div className="read-only-banner" role="status">
      <Eye size={16} aria-hidden="true" />
      <span>Read-only access{owner ? ` · Shared by ${owner}` : ''}</span>
    </div>
  );
}
