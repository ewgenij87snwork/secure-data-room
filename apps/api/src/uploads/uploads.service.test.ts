import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { prepareUploadRequestSchema } from '@data-room/contracts';
import { ApiException } from '../common/api-exception.js';
import { authenticatedPrincipal } from '../auth/principal.js';
import { UploadsService } from './uploads.service.js';

const owner = authenticatedPrincipal('11111111-1111-4111-8111-111111111111', 'owner@example.com');
const parent = {
  nodeId: '22222222-2222-4222-8222-222222222222',
  dataRoomId: '33333333-3333-4333-8333-333333333333',
  parentId: null,
  kind: 'FOLDER' as const,
  accessRole: 'OWNER' as const,
  accessRootNodeId: '44444444-4444-4444-8444-444444444444',
};
const input = prepareUploadRequestSchema.parse({
  parentId: parent.nodeId,
  files: [{
    clientId: '55555555-5555-4555-8555-555555555555',
    name: 'deal.pdf',
    sizeBytes: 12,
    mimeType: 'application/pdf',
  }],
});
const clientId = input.files[0]?.clientId;
if (!clientId) throw new Error('Test fixture must include a client id.');

function database() {
    const session = {
    create: vi.fn().mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      ownerId: owner.userId,
      parentNodeId: parent.nodeId,
      clientId,
      storageKey: 'rooms/room/objects/object',
      requestedName: 'deal.pdf',
      normalizedName: 'deal.pdf',
      expectedSizeBytes: 12n,
      mimeType: 'application/pdf',
      status: 'PREPARED',
      expiresAt: new Date('2026-08-20T12:00:00.000Z'),
      fileNodeId: null,
    }),
    findUnique: vi.fn().mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      ownerId: owner.userId,
      parentNodeId: parent.nodeId,
      clientId,
      storageKey: 'rooms/r/objects/o',
      requestedName: 'deal.pdf',
      normalizedName: 'deal.pdf',
      expectedSizeBytes: 12n,
      mimeType: 'application/pdf',
      status: 'PREPARED',
      expiresAt: new Date(Date.now() + 60_000),
      fileNodeId: null,
    }),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  return {
    uploadSession: session,
    node: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      uploadSession: session,
      node: { create: session.create, findUnique: session.findUnique },
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: parent.nodeId, dataRoomId: parent.dataRoomId, ownerId: owner.userId, kind: 'FOLDER', deletedAt: null }])
        .mockResolvedValue([]),
    })),
    $queryRaw: vi.fn(),
  };
}

function service(overrides: { controls?: object; storage?: object; db?: ReturnType<typeof database>; quota?: object } = {}) {
  const db = overrides.db ?? database();
  const policy = { assertCanCreateChild: vi.fn().mockResolvedValue(parent) };
  const controls = { read: vi.fn().mockResolvedValue({ uploadsEnabled: true, maintenanceMode: false, ...(overrides.controls ?? {}) }) };
  const storage = { createSignedUpload: vi.fn().mockResolvedValue({ token: 'token-token-token', tusEndpoint: 'https://project.supabase.co/storage/v1/upload/resumable', expiresAt: new Date('2026-08-20T12:00:00.000Z') }), getMetadata: vi.fn().mockResolvedValue({ sizeBytes: 12, contentType: 'application/pdf' }), readPrefix: vi.fn().mockResolvedValue(Uint8Array.from([37, 80, 68, 70, 45])), remove: vi.fn(), ...(overrides.storage ?? {}) };
  const quota = { assertBatchFits: vi.fn().mockResolvedValue(undefined), ...(overrides.quota ?? {}) };
  return { service: new UploadsService(db as never, policy as never, controls as never, storage as never, quota as never), db, policy, controls, storage, quota };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

describe('UploadsService', () => {
  it('reuses an identical active client session without creating another reservation', async () => {
    const db = database();
    db.uploadSession.findUnique.mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666', ownerId: owner.userId, parentNodeId: parent.nodeId,
      clientId, storageKey: 'rooms/r/objects/o', requestedName: 'deal.pdf', normalizedName: 'deal.pdf',
      expectedSizeBytes: 12n, mimeType: 'application/pdf', status: 'PREPARED',
      expiresAt: new Date(Date.now() + 60_000), fileNodeId: null,
    });
    const { service: subject } = service({ db });
    await expect(subject.prepare(owner, input)).resolves.toMatchObject({ uploads: [{ sessionId: '66666666-6666-4666-8666-666666666666', clientId }] });
    expect(db.uploadSession.create).not.toHaveBeenCalled();
  });

  it('reinitializes a matching terminal session with a fresh storage key', async () => {
    const db = database();
    db.uploadSession.findUnique.mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666', ownerId: owner.userId, parentNodeId: parent.nodeId,
      clientId, storageKey: 'rooms/r/objects/old', requestedName: 'deal.pdf', normalizedName: 'deal.pdf',
      expectedSizeBytes: 12n, mimeType: 'application/pdf', status: 'CANCELLED',
      expiresAt: new Date(Date.now() - 60_000), fileNodeId: null,
    });
    const { service: subject } = service({ db });
    await subject.prepare(owner, input);
    expect(db.uploadSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: '66666666-6666-4666-8666-666666666666' }),
      data: expect.objectContaining({ status: 'PREPARED', storageKey: expect.stringMatching(/\/objects\/[0-9a-f-]{36}$/u) }),
    }));
  });

  it('returns successful signed siblings and rejects only failed sessions', async () => {
    const second = { ...input.files[0], clientId: '55555555-5555-4555-8555-555555555556' };
    const batch = prepareUploadRequestSchema.parse({ parentId: parent.nodeId, files: [input.files[0], second] });
    const db = database();
    db.uploadSession.findUnique.mockResolvedValue(null);
    db.uploadSession.create
      .mockResolvedValueOnce({ id: '66666666-6666-4666-8666-666666666666', ownerId: owner.userId, parentNodeId: parent.nodeId, clientId: input.files[0]!.clientId, storageKey: 'rooms/r/objects/one', requestedName: 'deal.pdf', normalizedName: 'deal.pdf', expectedSizeBytes: 12n, mimeType: 'application/pdf', status: 'PREPARED', expiresAt: new Date(Date.now() + 60_000), fileNodeId: null })
      .mockResolvedValueOnce({ id: '66666666-6666-4666-8666-666666666667', ownerId: owner.userId, parentNodeId: parent.nodeId, clientId: second.clientId, storageKey: 'rooms/r/objects/two', requestedName: 'deal.pdf', normalizedName: 'deal.pdf', expectedSizeBytes: 12n, mimeType: 'application/pdf', status: 'PREPARED', expiresAt: new Date(Date.now() + 60_000), fileNodeId: null });
    const { service: subject, storage } = service({ db, storage: { createSignedUpload: vi.fn()
      .mockResolvedValueOnce({ token: 'token-token-token', bucketName: 'bucket', tusEndpoint: 'https://example.test/sign', expiresAt: new Date(Date.now() + 60_000) })
      .mockRejectedValueOnce(new Error('provider')) } });
    await expect(subject.prepare(owner, batch)).resolves.toMatchObject({ uploads: [{ clientId: input.files[0]!.clientId }] });
    expect(db.uploadSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: '66666666-6666-4666-8666-666666666667' }), data: { status: 'REJECTED' } }));
    expect(storage.remove).toHaveBeenCalledWith(['rooms/r/objects/two']);
  });

  it('does not let a competing signing failure reject a session after success won the CAS', async () => {
    const db = database();
    const session = await db.uploadSession.findUnique({ where: {} });
    if (!session) throw new Error('missing session fixture');
    let status = 'PREPARED';
    db.uploadSession.findUnique.mockResolvedValue({ ...session, status });
    db.uploadSession.updateMany.mockImplementation(async ({ where, data }) => {
      const statusFilter = typeof where.status === 'string' ? [where.status] : (where.status?.in as string[] | undefined);
      if (statusFilter?.includes(status)) {
        status = data.status as string;
        return { count: 1 };
      }
      return { count: 0 };
    });
    const success = deferred<{ token: string; bucketName: string; tusEndpoint: string; expiresAt: Date }>();
    const failure = deferred<never>();
    const { service: subject, storage } = service({ db, storage: {
      createSignedUpload: vi.fn()
        .mockReturnValueOnce(success.promise)
        .mockReturnValueOnce(failure.promise),
    } });

    const first = subject.prepare(owner, input);
    const second = subject.prepare(owner, input);
    success.resolve({ token: 'winning-token', bucketName: 'bucket', tusEndpoint: 'https://example.test/sign', expiresAt: new Date(Date.now() + 60_000) });
    await expect(first).resolves.toMatchObject({ uploads: [{ uploadToken: 'winning-token' }] });
    failure.reject(new Error('provider failure'));
    await expect(second).rejects.toMatchObject({ response: { error: { code: 'INTERNAL_ERROR' } } });
    expect(status).toBe('UPLOADING');
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('does not let an old signing result activate a reinitialized session generation', async () => {
    const db = database();
    const oldKey = 'rooms/r/objects/old-generation';
    const newKey = 'rooms/r/objects/new-generation';
    const oldSession = { ...(await db.uploadSession.findUnique({ where: {} }))!, storageKey: oldKey };
    db.uploadSession.findUnique.mockResolvedValueOnce(oldSession).mockResolvedValue({ ...oldSession, storageKey: newKey, status: 'PREPARED' });
    db.uploadSession.updateMany.mockImplementation(async ({ where }) => ({ count: where.storageKey === newKey ? 1 : 0 }));
    const signing = deferred<{ token: string; bucketName: string; tusEndpoint: string; expiresAt: Date }>();
    const { service: subject, storage } = service({ db, storage: { createSignedUpload: vi.fn().mockReturnValue(signing.promise) } });

    const pending = subject.prepare(owner, input);
    await vi.waitFor(() => expect(storage.createSignedUpload).toHaveBeenCalledWith(oldKey));
    signing.resolve({ token: 'old-token', bucketName: 'bucket', tusEndpoint: 'https://example.test/sign', expiresAt: new Date(Date.now() + 60_000) });

    await expect(pending).rejects.toMatchObject({ response: { error: { code: 'INTERNAL_ERROR' } } });
    expect(storage.remove).toHaveBeenCalledWith([oldKey]);
    expect(db.uploadSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storageKey: oldKey }) }));
  });

  it('rejects prepare while uploads are disabled', async () => {
    const { service: subject } = service({ controls: { uploadsEnabled: false } });
    await expect(subject.prepare(owner, input)).rejects.toMatchObject({
      response: { error: { code: 'UPLOADS_DISABLED' } },
    });
  });

  it('does not prepare for a non-owner or when the active-session quota is full', async () => {
    const denied = service();
    denied.policy.assertCanCreateChild.mockRejectedValue(new ApiException('ACCESS_DENIED', HttpStatus.FORBIDDEN, 'Access denied.'));
    await expect(denied.service.prepare(owner, input)).rejects.toMatchObject({ response: { error: { code: 'ACCESS_DENIED' } } });

    const quota = service({ quota: { assertBatchFits: vi.fn().mockRejectedValue(new ApiException('QUOTA_EXCEEDED', HttpStatus.CONFLICT, 'Upload quota exceeded.')) } });
    await expect(quota.service.prepare(owner, input)).rejects.toMatchObject({ response: { error: { code: 'QUOTA_EXCEEDED' } } });
  });

  it('re-proves the policy parent and room inside the transaction before reserving quota', async () => {
    const db = database();
    const queryRaw = vi.fn().mockResolvedValue([]);
    db.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      uploadSession: db.uploadSession,
      node: db.node,
      $queryRaw: queryRaw,
    }));
    const { service: subject, quota } = service({ db });

    await expect(subject.prepare(owner, input)).rejects.toMatchObject({ response: { error: { code: 'RESOURCE_GONE' } } });
    expect(queryRaw).toHaveBeenCalledOnce();
    const query = queryRaw.mock.calls[0]?.[0] as { strings?: readonly string[] } | undefined;
    expect(query?.strings?.join('')).toContain('DataRoom');
    expect(quota.assertBatchFits).not.toHaveBeenCalled();
  });

  it('uses a random room object key and marks sessions rejected when signing fails', async () => {
    const db = database();
    db.uploadSession.findUnique.mockResolvedValue(null);
    const { service: subject, storage } = service({ db, storage: { createSignedUpload: vi.fn().mockRejectedValue(new Error('provider')) } });
    await expect(subject.prepare(owner, input)).rejects.toBeInstanceOf(ApiException);
    expect(db.uploadSession.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        storageKey: expect.stringMatching(/^rooms\/33333333-3333-4333-8333-333333333333\/objects\/[0-9a-f-]{36}$/u),
      }),
    }));
    expect(db.uploadSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'REJECTED' } }));
    expect(storage.createSignedUpload).toHaveBeenCalledOnce();
  });

  it('rejects finalize when the object is missing, wrong-sized, non-PDF, or has no PDF signature', async () => {
    const cases = [
      { metadata: null, prefix: new Uint8Array() },
      { metadata: { sizeBytes: 11, contentType: 'application/pdf' }, prefix: Uint8Array.from([37, 80, 68, 70, 45]) },
      { metadata: { sizeBytes: 12, contentType: 'text/plain' }, prefix: Uint8Array.from([37, 80, 68, 70, 45]) },
      { metadata: { sizeBytes: 12, contentType: 'application/pdf' }, prefix: Uint8Array.from([78, 79, 80, 68, 70]) },
    ];
    for (const current of cases) {
      const { service: subject, storage } = service({ storage: { getMetadata: vi.fn().mockResolvedValue(current.metadata), readPrefix: vi.fn().mockResolvedValue(current.prefix) } });
      await expect(subject.finalize(owner, '66666666-6666-4666-8666-666666666666', { clientId })).rejects.toMatchObject({
        response: { error: { code: 'UPLOAD_NOT_READY' } },
      });
      expect(storage.getMetadata).toHaveBeenCalled();
    }
  });

  it('returns the same node for repeated finalize and cancels only the owner session', async () => {
    const db = database();
    db.uploadSession.findUnique.mockResolvedValue({ id: '66666666-6666-4666-8666-666666666666', ownerId: owner.userId, parentNodeId: parent.nodeId, clientId, storageKey: 'rooms/r/objects/o', requestedName: 'deal.pdf', normalizedName: 'deal.pdf', expectedSizeBytes: 12n, mimeType: 'application/pdf', status: 'FINALIZED', expiresAt: new Date(Date.now() + 60_000), fileNodeId: '77777777-7777-4777-8777-777777777777' });
    db.node.findUnique.mockResolvedValue({ id: '77777777-7777-4777-8777-777777777777', name: 'deal.pdf' });
    const { service: subject } = service({ db });
    await expect(subject.finalize(owner, '66666666-6666-4666-8666-666666666666', { clientId })).resolves.toMatchObject({ nodeId: '77777777-7777-4777-8777-777777777777' });

    db.uploadSession.findUnique.mockResolvedValue({ ownerId: owner.userId, status: 'PREPARED', storageKey: 'rooms/r/objects/o' });
    await subject.cancel(owner, '66666666-6666-4666-8666-666666666666');
    expect(db.uploadSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'CANCELLED' } }));
  });

  it('selects the first available deterministic suffix under a unique-name conflict', async () => {
    const db = database();
    let creates = 0;
    db.node.create.mockImplementation(async ({ data }) => {
      creates += 1;
      if (creates === 1) throw { code: 'P2002' };
      return { id: '77777777-7777-4777-8777-777777777777', name: String(data.name) };
    });
    let attempt = 0;
    db.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      attempt += 1;
      let queryCall = 0;
      const queryRaw = vi.fn(async () => {
        queryCall += 1;
        if (queryCall === 1) return [{
          id: '66666666-6666-4666-8666-666666666666', ownerId: owner.userId, parentNodeId: parent.nodeId,
          clientId, storageKey: 'rooms/r/objects/o', requestedName: 'deal.pdf',
          normalizedName: 'deal.pdf', expectedSizeBytes: 12n, mimeType: 'application/pdf', status: 'PREPARED',
          expiresAt: new Date(Date.now() + 60_000), fileNodeId: null,
        }];
        if (queryCall === 2) return [{ id: parent.nodeId, dataRoomId: parent.dataRoomId, ownerId: owner.userId, kind: 'FOLDER', deletedAt: null }];
        return attempt === 1 ? [] : [{ normalizedName: 'deal.pdf' }];
      });
      return callback({ uploadSession: db.uploadSession, node: db.node, $queryRaw: queryRaw, runtimeControl: { upsert: vi.fn() } });
    });
    const { service: subject } = service({ db });
    await expect(subject.finalize(owner, '66666666-6666-4666-8666-666666666666', { clientId })).resolves.toMatchObject({ finalName: 'deal (1).pdf', conflictResolved: true });
  });

  it('maps service errors to the stable upload status', () => {
    expect(new ApiException('UPLOAD_NOT_READY', HttpStatus.CONFLICT, 'Upload is not ready.')).toBeInstanceOf(ApiException);
  });

  it('maps an unexpected finalize database failure to internal error', async () => {
    const db = database();
    db.$transaction.mockRejectedValue(new Error('connection failed'));
    const { service: subject } = service({ db });
    await expect(subject.finalize(owner, '66666666-6666-4666-8666-666666666666', { clientId })).rejects.toMatchObject({
      response: { error: { code: 'INTERNAL_ERROR' } },
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  });
});
