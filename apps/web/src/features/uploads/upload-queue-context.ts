import { createContext, useContext } from 'react';
import type { UploadQueueState } from './upload-types.js';

export interface QueueContextValue {
  state: UploadQueueState;
  addFiles: (parentId: string, files: readonly File[]) => Promise<void>;
  clearIntakeErrors: () => void;
  retry: (clientId: string) => void;
  cancel: (clientId: string) => void;
}

export const QueueContext = createContext<QueueContextValue | null>(null);

export function useUploadQueue(): QueueContextValue {
  const value = useContext(QueueContext);
  if (!value) throw new Error('useUploadQueue must be used within UploadQueueProvider');
  return value;
}

export function useOptionalUploadQueue(): QueueContextValue | null {
  return useContext(QueueContext);
}
