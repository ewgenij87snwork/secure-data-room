import type { UploadItem, UploadQueueState } from './upload-types.js';
import { clampProgress } from './upload-types.js';

export type UploadAction =
  | { type: 'add'; items: readonly UploadItem[] }
  | { type: 'preparing'; clientId: string }
  | { type: 'uploading'; clientId: string; sessionId: string }
  | { type: 'progress'; clientId: string; bytesUploaded: number }
  | { type: 'finalizing'; clientId: string }
  | { type: 'succeeded'; clientId: string; nodeId: string; finalName: string; conflictResolved: boolean }
  | { type: 'failed'; clientId: string; errorCode?: string; errorMessage: string }
  | { type: 'retry'; clientId: string }
  | { type: 'cancelled'; clientId: string }
  | { type: 'clear' }
  | { type: 'intake-errors'; errors: readonly string[] };

const transitions: Record<UploadItem['state'], readonly UploadItem['state'][]> = {
  queued: ['preparing', 'cancelled'],
  preparing: ['uploading', 'failed', 'cancelled'],
  uploading: ['finalizing', 'failed', 'cancelled'],
  finalizing: ['succeeded', 'failed'],
  succeeded: [],
  failed: ['queued', 'cancelled'],
  cancelled: [],
};

function item(state: UploadQueueState, clientId: string): UploadItem {
  const found = state.items.find((candidate) => candidate.clientId === clientId);
  if (!found) throw new Error(`Unknown upload item: ${clientId}`);
  return found;
}

function change(
  state: UploadQueueState,
  clientId: string,
  next: UploadItem['state'],
  update: (current: UploadItem) => UploadItem,
): UploadQueueState {
  const current = item(state, clientId);
  if (!transitions[current.state].includes(next)) {
    throw new Error(`Invalid upload transition ${current.state} -> ${next}`);
  }
  return { ...state, items: state.items.map((candidate) => candidate.clientId === clientId ? update(current) : candidate) };
}

export const initialUploadQueueState: UploadQueueState = { items: [], intakeErrors: [] };

export function uploadReducer(state: UploadQueueState, action: UploadAction): UploadQueueState {
  switch (action.type) {
    case 'add': return { ...state, items: [...state.items, ...action.items] };
    case 'preparing': return change(state, action.clientId, 'preparing', (current) => {
      const next = { ...current, state: 'preparing' as const };
      delete next.errorCode;
      delete next.errorMessage;
      return next;
    });
    case 'uploading': return change(state, action.clientId, 'uploading', (current) => ({ ...current, state: 'uploading', sessionId: action.sessionId }));
    case 'progress': {
      const current = item(state, action.clientId);
      if (current.state !== 'uploading') throw new Error(`Progress is only valid while uploading: ${current.state}`);
      const bytesUploaded = Math.max(0, Math.min(current.file.size, action.bytesUploaded));
      return { ...state, items: state.items.map((candidate) => candidate.clientId === action.clientId ? { ...current, bytesUploaded, percent: clampProgress(bytesUploaded, current.file.size) } : candidate) };
    }
    case 'finalizing': return change(state, action.clientId, 'finalizing', (current) => ({ ...current, state: 'finalizing', bytesUploaded: current.file.size, percent: 100 }));
    case 'succeeded': {
      if (!action.nodeId || !action.finalName) throw new Error('A successful upload requires nodeId and finalName.');
      return change(state, action.clientId, 'succeeded', (current) => ({ ...current, state: 'succeeded', finalNodeId: action.nodeId, finalName: action.finalName, conflictResolved: action.conflictResolved, bytesUploaded: current.file.size, percent: 100 }));
    }
    case 'failed': return change(state, action.clientId, 'failed', (current) => ({ ...current, state: 'failed', ...(action.errorCode ? { errorCode: action.errorCode } : {}), errorMessage: action.errorMessage }));
    case 'retry': return change(state, action.clientId, 'queued', (current) => {
      const next = { ...current, state: 'queued' as const, bytesUploaded: 0, percent: 0, attempt: current.attempt + 1 };
      delete next.sessionId;
      delete next.errorCode;
      delete next.errorMessage;
      return next;
    });
    case 'cancelled': return change(state, action.clientId, 'cancelled', (current) => ({ ...current, state: 'cancelled' }));
    case 'clear': return initialUploadQueueState;
    case 'intake-errors': return { ...state, intakeErrors: action.errors };
  }
}
