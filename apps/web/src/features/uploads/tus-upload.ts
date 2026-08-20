import * as tus from 'tus-js-client';
import { UPLOAD_CHUNK_SIZE } from './upload-types.js';

export function startTusUpload(input: {
  file: File;
  tusEndpoint: string;
  bucketName: string;
  storageKey: string;
  uploadToken: string;
  onProgress: (uploaded: number, total: number) => void;
  onSuccess: () => void;
  onError: (error: Error) => void;
  autoStart?: boolean;
}): tus.Upload {
  const upload = new tus.Upload(input.file, {
    endpoint: input.tusEndpoint,
    chunkSize: UPLOAD_CHUNK_SIZE,
    retryDelays: [0, 1000, 3000, 5000],
    headers: { 'x-signature': input.uploadToken, 'x-upsert': 'false' },
    metadata: { bucketName: input.bucketName, objectName: input.storageKey, contentType: 'application/pdf', cacheControl: 'no-store' },
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    onProgress: input.onProgress,
    onSuccess: input.onSuccess,
    onError: input.onError,
  });
  if (input.autoStart !== false) upload.start();
  return upload;
}
