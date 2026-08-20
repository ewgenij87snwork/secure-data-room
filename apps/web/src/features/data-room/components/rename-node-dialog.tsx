import type { NodeSummary } from '@data-room/contracts';
import { useRef, useState } from 'react';
import { ResponsiveDialog } from '../../../components/ui/responsive-dialog.js';
import { mutationErrorMessage, parseNodeName, suggestedNodeName } from '../dialog-helpers.js';
import { useRenameNode } from '../data-room-queries.js';

export function RenameNodeDialog({
  open,
  onOpenChange,
  node,
  returnFocusElement,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: NodeSummary;
  returnFocusElement?: HTMLElement | null;
}>): React.JSX.Element {
  const [name, setName] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const mutation = useRenameNode();
  const parsedName = parseNodeName(name);
  const suggestion = suggestedNodeName(mutation.error);

  const changeOpen = (next: boolean): void => {
    if (!next) mutation.reset();
    onOpenChange(next);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={changeOpen}
      title={`Rename ${node.name}`}
      description="The new name will appear anywhere this item is accessible."
      returnFocusElement={returnFocusElement}
    >
      <form
        className="management-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!parsedName || parsedName === node.name) return;
          mutation.mutate({ node, name: parsedName }, { onSuccess: () => changeOpen(false) });
        }}
      >
        <label htmlFor={`rename-node-${node.id}`}>Name</label>
        <input
          ref={inputRef}
          id={`rename-node-${node.id}`}
          name="name"
          value={name}
          maxLength={120}
          autoComplete="off"
          autoFocus
          onChange={(event) => {
            setName(event.target.value);
            if (mutation.isError) mutation.reset();
          }}
        />
        {mutation.isError ? (
          <div className="management-form__error" role="alert">
            <p>{mutationErrorMessage(mutation.error)}</p>
            {suggestion ? (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setName(suggestion);
                  inputRef.current?.focus();
                }}
              >
                Use “{suggestion}”
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="management-form__actions">
          <button className="secondary-button" type="button" onClick={() => changeOpen(false)}>
            Cancel
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={!parsedName || parsedName === node.name || mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : 'Save name'}
          </button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
