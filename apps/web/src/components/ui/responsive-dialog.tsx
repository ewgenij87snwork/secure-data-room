import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { PropsWithChildren } from 'react';

export type ResponsiveDialogProps = PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  returnFocusElement?: HTMLElement | null | undefined;
}>;

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  returnFocusElement,
  children,
}: ResponsiveDialogProps): React.JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="responsive-dialog__overlay" />
        <Dialog.Content
          className="responsive-dialog__content"
          onCloseAutoFocus={(event) => {
            if (!returnFocusElement) return;
            event.preventDefault();
            returnFocusElement.focus();
          }}
        >
          <div className="responsive-dialog__heading">
            <Dialog.Title className="responsive-dialog__title">{title}</Dialog.Title>
            {description ? (
              <Dialog.Description className="responsive-dialog__description">
                {description}
              </Dialog.Description>
            ) : null}
          </div>
          <div className="responsive-dialog__body">{children}</div>
          <Dialog.Close className="responsive-dialog__close" aria-label={`Close ${title}`}>
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
