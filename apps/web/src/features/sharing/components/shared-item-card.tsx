import type { SharedWithMeItem } from '../api.js';
import { ArrowUpRight, CalendarDays, Folder, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
export function SharedItemCard({ item }: { item: SharedWithMeItem }): React.JSX.Element {
  return (
    <Link className="shared-item-card" to={`/shared/${item.node.id}`}>
      <div className="shared-item-card__icon">
        <Folder size={20} aria-hidden="true" />
      </div>
      <div>
        <h2>{item.node.name}</h2>
        <p>
          <UserRound size={14} aria-hidden="true" /> {item.owner.displayName ?? item.owner.email}
        </p>
        <p>
          <CalendarDays size={14} aria-hidden="true" />{' '}
          {new Date(item.share.createdAt).toLocaleDateString()}
        </p>
      </div>
      <ArrowUpRight size={18} aria-hidden="true" />
    </Link>
  );
}
