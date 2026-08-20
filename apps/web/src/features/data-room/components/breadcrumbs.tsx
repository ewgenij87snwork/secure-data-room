import type { BreadcrumbItem } from '@data-room/contracts';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Breadcrumbs({ items }: Readonly<{ items: readonly BreadcrumbItem[] }>) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          return (
            <li key={item.id}>
              {index > 0 ? <ChevronRight size={14} strokeWidth={1.8} aria-hidden="true" /> : null}
              {isCurrent ? (
                <span aria-current="page" title={item.name}>
                  {item.name}
                </span>
              ) : (
                <Link to={`/workspace/${item.id}`} title={item.name}>
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
