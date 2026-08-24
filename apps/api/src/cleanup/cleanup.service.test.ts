import { describe, expect, it, vi } from 'vitest';
import { CleanupService, retryDelayMs } from './cleanup.service.js';

interface SqlTemplate {
  strings: readonly string[];
}

const jobId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const rootNodeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function harness() {
  const database = {
    storageCleanupJob: {
      findMany: vi.fn().mockResolvedValue([{ id: jobId, rootNodeId, attempts: 0 }]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $executeRaw: vi.fn().mockResolvedValue(2),
    $queryRaw: vi.fn().mockResolvedValue([
      { storageKey: 'rooms/r/objects/a', rootExists: true, traversalComplete: true },
      { storageKey: 'rooms/r/objects/b', rootExists: true, traversalComplete: true },
    ]),
  };
  const storage = { remove: vi.fn().mockResolvedValue(undefined) };
  return { database, storage };
}

describe('CleanupService', () => {
  it('bounds each run and can reclaim an expired running lease', async () => {
    const h = harness();
    const service = new CleanupService(h.database as never, h.storage as never);
    const now = new Date('2026-08-20T10:00:00.000Z');

    await service.runDueJobs(now);

    expect(h.database.storageCleanupJob.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['PENDING', 'FAILED', 'RUNNING'] },
        nextAttemptAt: { lte: now },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: 25,
    });
    expect(h.database.storageCleanupJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: jobId,
        attempts: 0,
        status: { in: ['PENDING', 'FAILED', 'RUNNING'] },
        nextAttemptAt: { lte: now },
      },
      data: {
        status: 'RUNNING',
        attempts: { increment: 1 },
        nextAttemptAt: new Date('2026-08-20T10:15:00.000Z'),
        updatedAt: now,
      },
    });
  });

  it('marks a job successful only after all tombstoned objects are removed', async () => {
    const h = harness();
    const service = new CleanupService(h.database as never, h.storage as never);
    const now = new Date('2026-08-20T10:00:00.000Z');

    await expect(service.runDueJobs(now)).resolves.toEqual({
      claimed: 1,
      succeeded: 1,
      failed: 0,
      superseded: 0,
    });

    expect(h.storage.remove).toHaveBeenCalledWith(['rooms/r/objects/a', 'rooms/r/objects/b']);
    expect(h.database.storageCleanupJob.updateMany).toHaveBeenCalledWith({
      where: { id: jobId, status: 'RUNNING', attempts: 1 },
      data: { status: 'SUCCEEDED', lastErrorCode: null, updatedAt: now },
    });
  });

  it('leaves a failed job retryable with a bounded exponential schedule', async () => {
    const h = harness();
    h.storage.remove.mockRejectedValueOnce(new Error('injected storage failure'));
    const service = new CleanupService(h.database as never, h.storage as never);
    const now = new Date('2026-08-20T10:00:00.000Z');

    await expect(service.runDueJobs(now)).resolves.toEqual({
      claimed: 1,
      succeeded: 0,
      failed: 1,
      superseded: 0,
    });

    expect(h.database.storageCleanupJob.updateMany).toHaveBeenCalledWith({
      where: { id: jobId, status: 'RUNNING', attempts: 1 },
      data: {
        status: 'FAILED',
        lastErrorCode: 'STORAGE_REMOVE_FAILED',
        nextAttemptAt: new Date('2026-08-20T10:00:05.000Z'),
        updatedAt: now,
      },
    });
  });

  it('fails closed and remains retryable when tombstone traversal is incomplete', async () => {
    const h = harness();
    h.database.$queryRaw.mockResolvedValueOnce([
      { storageKey: null, rootExists: true, traversalComplete: false },
    ]);
    const service = new CleanupService(h.database as never, h.storage as never);
    const now = new Date('2026-08-20T10:00:00.000Z');

    await expect(service.runDueJobs(now)).resolves.toEqual({
      claimed: 1,
      succeeded: 0,
      failed: 1,
      superseded: 0,
    });

    expect(h.storage.remove).not.toHaveBeenCalled();
    expect(h.database.storageCleanupJob.updateMany).toHaveBeenCalledWith({
      where: { id: jobId, status: 'RUNNING', attempts: 1 },
      data: {
        status: 'FAILED',
        lastErrorCode: 'CLEANUP_TRAVERSAL_FAILED',
        nextAttemptAt: new Date('2026-08-20T10:00:05.000Z'),
        updatedAt: now,
      },
    });
  });

  it('retries a failed job and remains idempotent after success', async () => {
    const h = harness();
    h.database.storageCleanupJob.findMany
      .mockResolvedValueOnce([{ id: jobId, rootNodeId, attempts: 0 }])
      .mockResolvedValueOnce([{ id: jobId, rootNodeId, attempts: 1 }]);
    h.storage.remove.mockRejectedValueOnce(new Error('injected storage failure'));
    const service = new CleanupService(h.database as never, h.storage as never);
    const firstRunAt = new Date('2026-08-20T10:00:00.000Z');

    await service.runDueJobs(firstRunAt);
    await expect(service.runDueJobs(new Date('2026-08-20T10:00:05.000Z'))).resolves.toEqual({
      claimed: 1,
      succeeded: 1,
      failed: 0,
      superseded: 0,
    });

    expect(h.storage.remove).toHaveBeenCalledTimes(2);
    expect(h.database.storageCleanupJob.updateMany).toHaveBeenCalledWith({
      where: { id: jobId, status: 'RUNNING', attempts: 2 },
      data: {
        status: 'SUCCEEDED',
        lastErrorCode: null,
        updatedAt: new Date('2026-08-20T10:00:05.000Z'),
      },
    });
  });

  it('does not hard-delete tombstoned nodes or cleanup evidence', async () => {
    const h = harness();
    const service = new CleanupService(h.database as never, h.storage as never);

    await service.runDueJobs();

    expect(h.database).not.toHaveProperty('node.deleteMany');
    expect(h.database.storageCleanupJob).not.toHaveProperty('deleteMany');
  });

  it('cannot overwrite a newer claim generation after its lease expires', async () => {
    const h = harness();
    h.database.storageCleanupJob.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const service = new CleanupService(h.database as never, h.storage as never);

    await expect(service.runDueJobs(new Date('2026-08-20T10:00:00.000Z'))).resolves.toEqual({
      claimed: 1,
      succeeded: 0,
      failed: 0,
      superseded: 1,
    });

    expect(h.database.storageCleanupJob.updateMany).toHaveBeenLastCalledWith({
      where: { id: jobId, status: 'RUNNING', attempts: 1 },
      data: {
        status: 'SUCCEEDED',
        lastErrorCode: null,
        updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      },
    });
  });

  it('caps retry backoff at one hour', () => {
    expect(retryDelayMs(1000)).toBe(60 * 60 * 1000);
  });

  it('deletes abandoned upload objects only after provider removal succeeds', async () => {
    const h = harness();
    const uploadSession = {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', storageKey: 'rooms/r/objects/expired' },
        ]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    (h.database as typeof h.database & { uploadSession: typeof uploadSession }).uploadSession =
      uploadSession;
    const executeRaw = vi.fn<(sql: SqlTemplate) => Promise<number>>().mockResolvedValue(2);
    (h.database as typeof h.database & { $executeRaw: typeof executeRaw }).$executeRaw = executeRaw;

    await new CleanupService(h.database as never, h.storage as never).runDueJobs();

    expect(h.storage.remove).toHaveBeenCalledWith(['rooms/r/objects/expired']);
    expect(uploadSession.deleteMany).toHaveBeenCalledTimes(1);
    expect(h.storage.remove.mock.invocationCallOrder[0]).toBeLessThan(
      uploadSession.deleteMany.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('deletes only the abandoned upload version that provider cleanup removed', async () => {
    const h = harness();
    h.database.storageCleanupJob.findMany.mockResolvedValue([]);
    const uploadId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const storageKey = 'rooms/r/objects/expired';
    const uploadSession = {
      findMany: vi.fn().mockResolvedValue([{ id: uploadId, storageKey }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    (h.database as typeof h.database & { uploadSession: typeof uploadSession }).uploadSession =
      uploadSession;
    const now = new Date('2026-08-20T10:00:00.000Z');

    await new CleanupService(h.database as never, h.storage as never).runDueJobs(now);

    expect(uploadSession.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            id: uploadId,
            storageKey,
            OR: [
              { status: { in: ['CANCELLED', 'EXPIRED', 'REJECTED'] } },
              { status: { in: ['PREPARED', 'UPLOADING'] }, expiresAt: { lte: now } },
            ],
          },
        ],
      },
    });
  });

  it('bounds abandoned upload cleanup work per run', async () => {
    const h = harness();
    h.database.storageCleanupJob.findMany.mockResolvedValue([]);
    const uploadSession = {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    (h.database as typeof h.database & { uploadSession: typeof uploadSession }).uploadSession =
      uploadSession;
    const now = new Date('2026-08-20T10:00:00.000Z');

    await new CleanupService(h.database as never, h.storage as never).runDueJobs(now);

    expect(uploadSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { updatedAt: 'asc' }, take: 25 }),
    );
  });

  it('bounds confirmed tombstone metadata cleanup to the validated subtree', async () => {
    const h = harness();
    const executeRaw = vi.fn<(sql: SqlTemplate) => Promise<number>>().mockResolvedValue(2);
    (h.database as typeof h.database & { $executeRaw: typeof executeRaw }).$executeRaw = executeRaw;

    await new CleanupService(h.database as never, h.storage as never).runDueJobs();

    const sql = executeRaw.mock.calls[0]?.[0]?.strings.join('') ?? '';
    expect(sql).toContain('parent.depth < ');
    expect(sql).toContain('NOT child."id" = ANY(parent.path)');
    expect(sql).toContain('child."dataRoomId" = parent."dataRoomId"');
  });
});
