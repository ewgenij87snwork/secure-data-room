import { useRef, useState } from 'react';
import { ResponsiveDialog } from '../../../components/ui/responsive-dialog.js';
import { mutationErrorMessage, parseNodeName, suggestedNodeName } from '../dialog-helpers.js';
import { useCreateFolder } from '../data-room-queries.js';

export function CreateFolderDialog({
  open,
  onOpenChange,
  parentId,
  returnFocusElement,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId: string;
  returnFocusElement?: HTMLElement | null;
}>): React.JSX.Element {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const mutation = useCreateFolder();
  const parsedName = parseNodeName(name);
  const suggestion = suggestedNodeName(mutation.error);

  const changeOpen = (next: boolean): void => {
    if (!next) {
      setName('');
      mutation.reset();
    }
    onOpenChange(next);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={changeOpen}
      title="Create a folder"
      description="Add a private folder inside the current location."
      returnFocusElement={returnFocusElement}
    >
      <form
        className="management-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!parsedName) return;
          mutation.mutate({ parentId, name: parsedName }, { onSuccess: () => changeOpen(false) });
        }}
      >
        <label htmlFor="create-folder-name">Folder name</label>
        <input
          ref={inputRef}
          id="create-folder-name"
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
            disabled={!parsedName || mutation.isPending}
          >
            {mutation.isPending ? 'Creating…' : 'Create folder'}
          </button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
