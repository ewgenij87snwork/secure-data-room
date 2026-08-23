import { FileUp } from 'lucide-react';
import { useId, type ChangeEvent, type DragEvent } from 'react';

type UploadDropzoneProps = Readonly<{
  disabled: boolean;
  onFilesSelected: (files: readonly File[]) => void;
  onPickerOpen?: () => void;
}>;

export function UploadDropzone({
  disabled,
  onFilesSelected,
  onPickerOpen,
}: UploadDropzoneProps): React.JSX.Element {
  const inputId = useId();
  const emit = (files: FileList | null): void => onFilesSelected(files ? Array.from(files) : []);
  const onDrop = (event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    if (!disabled) emit(event.dataTransfer.files);
  };
  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    emit(event.currentTarget.files);
    event.currentTarget.value = '';
  };
  return (
    <label
      className="upload-dropzone"
      htmlFor={inputId}
      aria-disabled={disabled}
      onClick={() => onPickerOpen?.()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <FileUp aria-hidden="true" size={20} />
      <span className="upload-dropzone__label">Choose PDF files</span>
      <input
        id={inputId}
        className="sr-only"
        type="file"
        aria-label="Choose PDF files"
        accept="application/pdf,.pdf"
        multiple
        disabled={disabled}
        onChange={onChange}
      />
      <p>PDF only · 10 MiB per file · up to 10 files</p>
    </label>
  );
}
