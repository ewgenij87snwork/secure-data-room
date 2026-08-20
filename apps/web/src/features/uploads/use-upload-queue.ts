import { createContext, createElement, useCallback, useContext, useEffect, useLayoutEffect, useReducer, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context.js';
import { ApiClientError } from '../../lib/api-error.js';
import { cancelUpload, finalizeUpload, prepareUploads } from '../data-room/data-room-api.js';
import { nodeKeys } from '../data-room/data-room-keys.js';
import { startTusUpload } from './tus-upload.js';
import { initialUploadQueueState, uploadReducer } from './upload-reducer.js';
import type { UploadItem, UploadQueueState } from './upload-types.js';
import { validatePdfSelection } from './upload-types.js';

type QueueContextValue = Readonly<{
  state: UploadQueueState;
  addFiles: (parentId: string, files: readonly File[]) => Promise<void>;
  retry: (clientId: string) => void;
  cancel: (clientId: string) => void;
}>;

const QueueContext = createContext<QueueContextValue | null>(null);
export function useUploadQueue(): QueueContextValue {
  const value = useContext(QueueContext);
  if (!value) throw new Error('useUploadQueue must be used within UploadQueueProvider');
  return value;
}
export function useOptionalUploadQueue(): QueueContextValue | null { return useContext(QueueContext); }
function newClientId(): string { return crypto.randomUUID(); }

type Operation = { generation: number; userId: string; token: string; attempt: number; cancelled: boolean };
type Transport = { upload: { abort: () => void | Promise<void> }; settle: () => void; sessionId: string; attempt: number };
export function isFinalizeForClient(response: { clientId: string }, clientId: string): boolean { return response.clientId === clientId; }

export function UploadQueueProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(uploadReducer, initialUploadQueueState);
  const stateRef = useRef(state);
  const transports = useRef(new Map<string, Transport>());
  const operations = useRef(new Map<string, Operation>());
  const sessions = useRef(new Map<string, string>());
  const running = useRef(new Set<string>());
  const generationRef = useRef(0);
  const identityRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(auth.accessToken);
  const userId = auth.status === 'authenticated' && auth.user ? auth.user.id : null;
  const committedIdentityRef = useRef<string | null>(userId);
  stateRef.current = state;
  tokenRef.current = auth.accessToken;
  const identityMismatch = committedIdentityRef.current !== userId;
  if (identityRef.current !== userId) {
    identityRef.current = userId;
    generationRef.current += 1;
  }

  const isCurrent = useCallback((clientId: string, operation: Operation, expected?: UploadItem['state']): boolean => {
    const current = stateRef.current.items.find((item) => item.clientId === clientId);
    const phaseMatches = !expected || current?.state === expected || (expected === 'preparing' && current?.state === 'queued');
    return Boolean(current && !operation.cancelled && operation.generation === generationRef.current && operation.userId === identityRef.current && current.attempt === operation.attempt && phaseMatches);
  }, []);

  const clear = useCallback(() => {
    generationRef.current += 1;
    operations.current.forEach((operation) => { operation.cancelled = true; });
    transports.current.forEach((transport, clientId) => {
      transport.settle();
      void transport.upload.abort();
      const operation = operations.current.get(clientId);
      if (operation) void Promise.resolve(cancelUpload(operation.token, transport.sessionId)).catch(() => undefined);
    });
    transports.current.clear();
    operations.current.clear();
    sessions.current.clear();
    running.current.clear();
    if (stateRef.current.items.length > 0 || stateRef.current.intakeErrors.length > 0) dispatch({ type: 'clear' });
  }, []);

  useLayoutEffect(() => {
    if (committedIdentityRef.current !== userId) {
      committedIdentityRef.current = userId;
      clear();
    } else if (!userId && (stateRef.current.items.length > 0 || stateRef.current.intakeErrors.length > 0)) {
      clear();
    }
  }, [clear, userId]);

  const run = useCallback(async (clientId: string): Promise<void> => {
    const current = stateRef.current.items.find((item) => item.clientId === clientId);
    if (!current || current.state !== 'queued' || !auth.accessToken || !userId) return;
    const operation: Operation = { generation: generationRef.current, userId, token: auth.accessToken, attempt: current.attempt, cancelled: false };
    operations.current.set(clientId, operation);
    running.current.add(clientId);
    dispatch({ type: 'preparing', clientId });
    try {
      const prepared = (await prepareUploads(operation.token, { parentId: current.parentId, files: [{ clientId, name: current.file.name, sizeBytes: current.file.size, mimeType: 'application/pdf' }] })).find((candidate) => candidate.clientId === clientId);
      if (!prepared) throw new Error('The upload could not be prepared.');
      sessions.current.set(clientId, prepared.sessionId);
      if (!isCurrent(clientId, operation, 'preparing')) {
        await Promise.resolve(cancelUpload(operation.token, prepared.sessionId)).catch(() => undefined);
        return;
      }
      let settlePromise!: () => void;
      const completion = new Promise<void>((resolve, reject) => {
        settlePromise = () => resolve();
        const transport = startTusUpload({ file: current.file, tusEndpoint: prepared.tusEndpoint, bucketName: prepared.bucketName, storageKey: prepared.storageKey, uploadToken: prepared.uploadToken, autoStart: false,
          onProgress: (uploaded, total) => { if (isCurrent(clientId, operation, 'uploading')) dispatch({ type: 'progress', clientId, bytesUploaded: Math.min(uploaded, total) }); },
          onSuccess: resolve, onError: reject,
        });
        transports.current.set(clientId, { upload: transport, settle: settlePromise, sessionId: prepared.sessionId, attempt: operation.attempt });
        dispatch({ type: 'uploading', clientId, sessionId: prepared.sessionId });
        queueMicrotask(() => {
          if (!operation.cancelled && operation.generation === generationRef.current && operation.userId === identityRef.current) transport.start();
        });
      });
      await completion;
      transports.current.delete(clientId);
      if (!isCurrent(clientId, operation, 'uploading')) return;
      dispatch({ type: 'finalizing', clientId });
      const finalizeToken = tokenRef.current;
      if (!finalizeToken) throw new Error('The upload session expired before finalization.');
      const finalized = await finalizeUpload(finalizeToken, prepared.sessionId, clientId);
      if (!isFinalizeForClient(finalized, clientId)) throw new Error('Finalize response correlation mismatch.');
      if (!isCurrent(clientId, operation, 'finalizing')) return;
      dispatch({ type: 'succeeded', clientId, nodeId: finalized.nodeId, finalName: finalized.finalName, conflictResolved: finalized.conflictResolved });
      await queryClient.invalidateQueries({ queryKey: nodeKeys.children(current.parentId) });
    } catch (error) {
      if (isCurrent(clientId, operation)) {
        const errorCode = error instanceof ApiClientError ? error.code : undefined;
        dispatch({ type: 'failed', clientId, ...(errorCode ? { errorCode } : {}), errorMessage: error instanceof ApiClientError ? 'The upload could not be completed. Try again.' : 'The upload failed. Try again.' });
      }
    } finally {
      const active = operations.current.get(clientId);
      if (active === operation) { operations.current.delete(clientId); transports.current.delete(clientId); running.current.delete(clientId); }
    }
  }, [auth.accessToken, isCurrent, queryClient, userId]);

  useEffect(() => {
    if (identityMismatch || !auth.accessToken || !userId) return;
    const available = 3 - running.current.size;
    state.items.filter((item) => item.state === 'queued').slice(0, Math.max(0, available)).forEach((item) => void run(item.clientId));
  }, [auth.accessToken, identityMismatch, run, state, userId]);

  const addFiles = useCallback(async (parentId: string, files: readonly File[]) => {
    const selection = await validatePdfSelection(files);
    dispatch({ type: 'intake-errors', errors: selection.errors });
    if (selection.valid.length > 0) dispatch({ type: 'add', items: selection.valid.map<UploadItem>((file) => ({ clientId: newClientId(), parentId, file, state: 'queued', bytesUploaded: 0, percent: 0, attempt: 0 })) });
  }, []);

  const retry = useCallback((clientId: string) => {
    const current = stateRef.current.items.find((item) => item.clientId === clientId);
    if (!current || current.state !== 'failed') return;
    const oldSession = sessions.current.get(clientId) ?? current.sessionId;
      const token = tokenRef.current;
    const operation = operations.current.get(clientId);
    if (operation) operation.cancelled = true;
    void (async () => {
      if (oldSession && token) await Promise.resolve(cancelUpload(token, oldSession)).catch(() => undefined);
      if (identityRef.current === userId && token === tokenRef.current && stateRef.current.items.some((item) => item.clientId === clientId && item.state === 'failed')) dispatch({ type: 'retry', clientId });
    })();
  }, [userId]);

  const cancel = useCallback((clientId: string) => {
    const current = stateRef.current.items.find((item) => item.clientId === clientId);
    if (!current || ['succeeded', 'cancelled', 'finalizing'].includes(current.state)) return;
    const operation = operations.current.get(clientId);
    if (operation) operation.cancelled = true;
    const transport = transports.current.get(clientId);
    transport?.settle();
    if (transport) void transport.upload.abort();
    dispatch({ type: 'cancelled', clientId });
    const sessionId = transport?.sessionId ?? sessions.current.get(clientId) ?? current.sessionId;
    const token = tokenRef.current;
    if (sessionId && token) void Promise.resolve(cancelUpload(token, sessionId)).catch(() => undefined);
  }, []);

  const exposedState = identityMismatch ? initialUploadQueueState : state;
  return createElement(QueueContext.Provider, { value: { state: exposedState, addFiles, retry, cancel } }, children);
}
