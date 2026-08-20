import { FileText, Folder } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { NodeItemViewModel } from './node-view-model.js';

export function NodeName({ item }: Readonly<{ item: NodeItemViewModel }>): React.JSX.Element {
  const Icon = item.kind === 'FOLDER' ? Folder : FileText;
  const label = (
    <span className="node-name__label" title={item.name}>
      {item.name}
    </span>
  );

  return (
    <span className="node-name">
      <span className="node-name__icon" data-kind={item.kind.toLowerCase()}>
        <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
      </span>
      {item.kind === 'FOLDER' ? (
        <Link to={`/workspace/${item.id}`}>{label}</Link>
      ) : (
        <Link to={`/files/${item.id}`}>{label}</Link>
      )}
    </span>
  );
}
