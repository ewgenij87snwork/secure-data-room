import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/auth-context.js';
import { UploadQueueProvider, isFinalizeForClient, useUploadQueue } from './use-upload-queue.js';

const api = vi.hoisted(() => ({ prepare: vi.fn(), finalize: vi.fn(), cancel: vi.fn() }));
const tus = vi.hoisted(() => ({ startTusUpload: vi.fn(), abort: vi.fn() }));
vi.mock('../data-room/data-room-api.js', () => ({ prepareUploads: api.prepare, finalizeUpload: api.finalize, cancelUpload: api.cancel }));
vi.mock('./tus-upload.js', () => tus);

const userA = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as AuthContextValue['user'];
const userB = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } as AuthContextValue['user'];
const auth = (user: AuthContextValue['user'], token: string): AuthContextValue => ({ status: 'authenticated', user, accessToken: token, signInWithGoogle: vi.fn(), signOut: vi.fn(), isSigningIn: false, error: null });
const pdf = (name: string): File => new File(['%PDF-test'], name, { type: 'application/pdf' });
const prepared = (clientId: string, sessionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') => ({ clientId, sessionId, bucketName: 'private', storageKey: 'random-storage-key', tusEndpoint: 'https://storage.example.test/upload', uploadToken: 'x'.repeat(16), expiresAt: '2026-01-01T00:00:00+00:00' });
let finishTus: (() => void) | undefined;

function Probe(): React.JSX.Element {
  const queue = useUploadQueue();
  return <><button onClick={() => void queue.addFiles('dddddddd-dddd-4ddd-8ddd-dddddddddddd', [pdf('a.pdf')])}>add</button><button onClick={() => queue.cancel(queue.state.items[0]?.clientId ?? '')}>cancel</button>{queue.state.items[0]?.state === 'failed' ? <button onClick={() => queue.retry(queue.state.items[0]?.clientId ?? '')}>retry</button> : null}<output>{queue.state.items.map((item) => `${item.file.name}:${item.state}:${item.errorMessage ?? ''}`).join('|')}</output></>;
}

async function mount(authValue: AuthContextValue) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><AuthContext.Provider value={authValue}><UploadQueueProvider><Probe /></UploadQueueProvider></AuthContext.Provider></QueryClientProvider>);
}

describe('UploadQueueProvider async safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.prepare.mockImplementation(async (_token: string, input: { files: [{ clientId: string }] }) => [prepared(input.files[0].clientId)]);
    api.finalize.mockImplementation(async (_token: string, _session: string, clientId: string) => ({ clientId, nodeId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', finalName: 'a.pdf', conflictResolved: false }));
    finishTus = undefined;
    tus.abort.mockReset();
    tus.startTusUpload.mockImplementation((input: { onSuccess: () => void }) => ({ start: () => { finishTus = input.onSuccess; }, abort: tus.abort }));
  });

  it('keeps up to three transports active', async () => {
    let release: (() => void)[] = [];
    tus.startTusUpload.mockImplementation((input: { onSuccess: () => void }) => ({ start: () => new Promise<void>((resolve) => release.push(() => { input.onSuccess(); resolve(); })), abort: vi.fn() }));
    const queryClient = new QueryClient();
    function AddFour(): React.JSX.Element { const q = useUploadQueue(); return <><button onClick={() => void q.addFiles('dddddddd-dddd-4ddd-8ddd-dddddddddddd', [pdf('1.pdf'), pdf('2.pdf'), pdf('3.pdf'), pdf('4.pdf')])}>add</button><output>{q.state.items.map((i) => i.state).join(',')}</output></>; }
    render(<QueryClientProvider client={queryClient}><AuthContext.Provider value={auth(userA, 'token-a')}><UploadQueueProvider><AddFour /></UploadQueueProvider></AuthContext.Provider></QueryClientProvider>);
    await act(async () => screen.getByRole('button', { name: 'add' }).click());
    await waitFor(() => expect(tus.startTusUpload).toHaveBeenCalledTimes(3));
    expect(api.prepare).toHaveBeenCalledTimes(3);
    release.forEach((finish) => finish());
  });

  it('cancels an old prepared session when auth generation changes', async () => {
    let resolvePrepare!: (value: unknown) => void;
    api.prepare.mockReturnValueOnce(new Promise((resolve) => { resolvePrepare = resolve; }));
    const view = await mount(auth(userA, 'token-a'));
    await act(async () => screen.getByRole('button', { name: 'add' }).click());
    await waitFor(() => expect(api.prepare).toHaveBeenCalled());
    const clientId = api.prepare.mock.calls[0]![1].files[0].clientId as string;
    view.rerender(<QueryClientProvider client={new QueryClient()}><AuthContext.Provider value={auth(userB, 'token-b')}><UploadQueueProvider><Probe /></UploadQueueProvider></AuthContext.Provider></QueryClientProvider>);
    await act(async () => resolvePrepare([prepared(clientId)]));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('token-a', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'));
    expect(api.finalize).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(''));
  });

  it('moves an item to failed when finalize rejects', async () => {
    api.finalize.mockRejectedValueOnce(new Error('finalize rejected'));
    await mount(auth(userA, 'token-a'));
    await act(async () => screen.getByRole('button', { name: 'add' }).click());
    await waitFor(() => expect(tus.startTusUpload).toHaveBeenCalledTimes(1));
    await act(async () => finishTus?.());
    await waitFor(() => expect(screen.getByText('a.pdf:failed:The upload failed. Try again.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'retry' })).toBeInTheDocument();
  });

  it('moves an item to failed when finalize returns another clientId', async () => {
    api.finalize.mockResolvedValueOnce({ clientId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', nodeId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', finalName: 'a.pdf', conflictResolved: false });
    await mount(auth(userA, 'token-a'));
    await act(async () => screen.getByRole('button', { name: 'add' }).click());
    await waitFor(() => expect(tus.startTusUpload).toHaveBeenCalledTimes(1));
    await act(async () => finishTus?.());
    await waitFor(() => expect(screen.getByText(/a\.pdf:failed:The upload failed/)).toBeInTheDocument());
    expect(isFinalizeForClient({ clientId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(false);
  });

  it('uses a refreshed token for finalize without restarting the healthy upload', async () => {
    tus.startTusUpload.mockImplementation((input: { onSuccess: () => void }) => ({ start: () => { finishTus = input.onSuccess; }, abort: vi.fn() }));
    const view = await mount(auth(userA, 'expired-token'));
    await act(async () => screen.getByRole('button', { name: 'add' }).click());
    await waitFor(() => expect(tus.startTusUpload).toHaveBeenCalledTimes(1));
    view.rerender(<QueryClientProvider client={new QueryClient()}><AuthContext.Provider value={auth(userA, 'refreshed-token')}><UploadQueueProvider><Probe /></UploadQueueProvider></AuthContext.Provider></QueryClientProvider>);
    await act(async () => finishTus?.());
    await waitFor(() => expect(api.finalize).toHaveBeenCalledWith('refreshed-token', expect.any(String), expect.any(String)));
    expect(tus.startTusUpload).toHaveBeenCalledTimes(1);
  });

  it('fails with retry when the token disappears before finalize', async () => {
    const view = await mount(auth(userA, 'token-a'));
    await act(async () => screen.getByRole('button', { name: 'add' }).click());
    await waitFor(() => expect(tus.startTusUpload).toHaveBeenCalledTimes(1));
    view.rerender(<QueryClientProvider client={new QueryClient()}><AuthContext.Provider value={{ ...auth(userA, 'token-a'), accessToken: null }}><UploadQueueProvider><Probe /></UploadQueueProvider></AuthContext.Provider></QueryClientProvider>);
    await act(async () => finishTus?.());
    await waitFor(() => expect(screen.getByText(/a\.pdf:failed:The upload failed/)).toBeInTheDocument());
    expect(api.finalize).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'retry' })).toBeInTheDocument();
  });

  it('clears and aborts the old queue before the new identity can observe it', async () => {
    const view = await mount(auth(userA, 'token-a'));
    await act(async () => screen.getByRole('button', { name: 'add' }).click());
    await waitFor(() => expect(tus.startTusUpload).toHaveBeenCalledTimes(1));
    await act(async () => view.rerender(<QueryClientProvider client={new QueryClient()}><AuthContext.Provider value={auth(userB, 'token-b')}><UploadQueueProvider><Probe /></UploadQueueProvider></AuthContext.Provider></QueryClientProvider>));
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(tus.abort).toHaveBeenCalledTimes(1);
    expect(api.cancel).toHaveBeenCalledWith('token-a', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  });
});
