import { FileText, Folder } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { NodeItemViewModel } from './node-view-model.js';

export function NodeName({
  item,
  resolveDestination,
  onOpen,
}: Readonly<{
  item: NodeItemViewModel;
  resolveDestination?: ((node: NodeItemViewModel['node']) => string) | undefined;
  onOpen?: ((node: NodeItemViewModel['node']) => void) | undefined;
}>): React.JSX.Element {
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
      <Link
        to={
          resolveDestination?.(item.node) ??
          (item.kind === 'FOLDER' ? `/workspace/${item.id}` : `/files/${item.id}`)
        }
        onClick={
          onOpen
            ? (event) => {
                event.preventDefault();
                onOpen(item.node);
              }
            : undefined
        }
      >
        {label}
      </Link>
    </span>
  );
}
