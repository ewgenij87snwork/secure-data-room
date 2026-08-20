import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Move } from 'lucide-react';
import { useRef } from 'react';
import type { NodeItemViewModel } from './node-view-model.js';

export function NodeActionsMenu({
  item,
  onRename,
  onDelete,
  onMove,
}: Readonly<{
  item: NodeItemViewModel;
  onRename: (node: NodeItemViewModel['node'], returnFocusElement: HTMLElement | null) => void;
  onDelete: (node: NodeItemViewModel['node'], returnFocusElement: HTMLElement | null) => void;
  onMove:
    ((node: NodeItemViewModel['node'], returnFocusElement: HTMLElement | null) => void) | undefined;
}>): React.JSX.Element | null {
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (!item.canManage) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          ref={triggerRef}
          className="icon-button"
          type="button"
          aria-label={`Actions for ${item.name}`}
        >
          <MoreHorizontal size={19} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="node-actions-menu" sideOffset={6} align="end">
          <DropdownMenu.Item
            className="node-actions-menu__item"
            onSelect={() => onRename(item.node, triggerRef.current)}
          >
            <Pencil size={16} strokeWidth={1.8} aria-hidden="true" />
            Rename
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="node-actions-menu__separator" />
          {onMove && item.kind === 'FILE' ? (
            <DropdownMenu.Item
              className="node-actions-menu__item"
              onSelect={() => onMove(item.node, triggerRef.current)}
            >
              <Move size={16} aria-hidden="true" />
              Move
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Separator className="node-actions-menu__separator" />
          <DropdownMenu.Item
            className="node-actions-menu__item node-actions-menu__item--danger"
            onSelect={() => onDelete(item.node, triggerRef.current)}
          >
            <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
