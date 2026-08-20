import { MAX_PDF_BYTES, MAX_UPLOAD_BATCH } from '@data-room/contracts';

export const UPLOAD_CHUNK_SIZE = 6 * 1024 * 1024;

export type UploadState =
  'queued' | 'preparing' | 'uploading' | 'finalizing' | 'succeeded' | 'failed' | 'cancelled';

export type UploadItem = Readonly<{
  clientId: string;
  parentId: string;
  file: File;
  state: UploadState;
  bytesUploaded: number;
  percent: number;
  attempt: number;
  sessionId?: string;
  finalNodeId?: string;
  finalName?: string;
  conflictResolved?: boolean;
  errorCode?: string;
  errorMessage?: string;
}>;

export type UploadQueueState = Readonly<{
  items: readonly UploadItem[];
  intakeErrors: readonly string[];
}>;

export function clampProgress(uploaded: number, total: number): number {
  if (!Number.isFinite(uploaded) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((uploaded / total) * 100)));
}

export async function validatePdf(file: File): Promise<string | null> {
  if (file.size <= 0) return 'The file is empty.';
  if (file.size > MAX_PDF_BYTES) return 'PDF files must be 10 MB or smaller.';
  if (file.type !== 'application/pdf') return 'Only PDF files are supported.';
  if (!file.name.toLocaleLowerCase('en-US').endsWith('.pdf')) {
    return 'The file must use the .pdf extension.';
  }
  const signature = await readSignature(file);
  return signature === '%PDF-' ? null : 'The selected file does not have a valid PDF signature.';
}

async function readSignature(file: Blob): Promise<string> {
  if (typeof file.arrayBuffer === 'function') {
    return new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(new TextDecoder().decode(reader.result as ArrayBuffer).slice(0, 5));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected file.'));
    reader.readAsArrayBuffer(file.slice(0, 5));
  });
}

export async function validatePdfSelection(
  files: readonly File[],
): Promise<Readonly<{ valid: readonly File[]; errors: readonly string[] }>> {
  const selected = files.slice(0, MAX_UPLOAD_BATCH);
  const errors = files.length > MAX_UPLOAD_BATCH ? ['Select up to 10 PDF files at a time.'] : [];
  const results = await Promise.all(
    selected.map(async (file) => ({ file, error: await validatePdf(file) })),
  );
  return {
    valid: results.filter((result) => !result.error).map((result) => result.file),
    errors: [
      ...errors,
      ...results
        .filter((result) => result.error)
        .map((result) => `${result.file.name}: ${result.error}`),
    ],
  };
}
