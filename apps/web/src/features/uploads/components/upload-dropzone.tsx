import { FileUp } from 'lucide-react';
import { useId, type ChangeEvent, type DragEvent } from 'react';

type UploadDropzoneProps = Readonly<{
  disabled: boolean;
  onFilesSelected: (files: readonly File[]) => void;
}>;

export function UploadDropzone({ disabled, onFilesSelected }: UploadDropzoneProps): React.JSX.Element {
  const inputId = useId();
  const emit = (files: FileList | null): void => onFilesSelected(files ? Array.from(files) : []);
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (!disabled) emit(event.dataTransfer.files);
  };
  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    emit(event.currentTarget.files);
    event.currentTarget.value = '';
  };
  return (
    <div className="upload-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <FileUp aria-hidden="true" size={20} />
      <label htmlFor={inputId}>Choose PDF files</label>
      <input id={inputId} className="sr-only" type="file" accept="application/pdf,.pdf" multiple disabled={disabled} onChange={onChange} />
      <p>PDF only · 10 MiB per file · up to 10 files</p>
    </div>
  );
}
