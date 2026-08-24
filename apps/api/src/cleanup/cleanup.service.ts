import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';

const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;
const INITIAL_RETRY_DELAY_MS = 5 * 1000;
const CLAIM_LEASE_MS = 15 * 60 * 1000;
const MAX_JOBS_PER_RUN = 25;
const MAX_SUBTREE_DEPTH = 64;

interface CleanupJob {
  id: string;
  rootNodeId: string;
  attempts: number;
}

interface CleanupDatabase {
  storageCleanupJob: {
    findMany(args: unknown): Promise<readonly CleanupJob[]>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  uploadSession?: {
    findMany(args: unknown): Promise<readonly { id: string; storageKey: string }[]>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
  $executeRaw<T>(query: Prisma.Sql): Promise<T>;
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

interface CleanupStorageRow {
  storageKey: string | null;
  rootExists: boolean;
  traversalComplete: boolean;
}

export type CleanupRunResult = Readonly<{
  claimed: number;
  succeeded: number;
  failed: number;
  superseded: number;
}>;

type CleanupJobOutcome = 'succeeded' | 'failed' | 'superseded';

@Injectable()
export class CleanupService {
  constructor(
    @Inject(PrismaService) private readonly prisma: CleanupDatabase,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async runDueJobs(now = new Date()): Promise<CleanupRunResult> {
    const candidates = await this.prisma.storageCleanupJob.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED', 'RUNNING'] },
        nextAttemptAt: { lte: now },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: MAX_JOBS_PER_RUN,
    });

    let claimed = 0;
    let succeeded = 0;
    let failed = 0;
    let superseded = 0;
    for (const candidate of candidates) {
      const job = await this.claim(candidate, now);
      if (!job) continue;
      claimed += 1;
      const outcome = await this.processClaimedJob(job, now);
      if (outcome === 'succeeded') succeeded += 1;
      if (outcome === 'failed') failed += 1;
      if (outcome === 'superseded') superseded += 1;
    }
    await this.cleanupAbandonedUploads(now);
    return { claimed, succeeded, failed, superseded };
  }

  private async cleanupAbandonedUploads(now: Date): Promise<void> {
    const uploads = this.prisma.uploadSession;
    if (!uploads) return;
    const abandonedStates = [
      { status: { in: ['CANCELLED', 'EXPIRED', 'REJECTED'] } },
      { status: { in: ['PREPARED', 'UPLOADING'] }, expiresAt: { lte: now } },
    ];
    const abandoned = await uploads.findMany({
      where: { OR: abandonedStates },
      orderBy: { updatedAt: 'asc' },
      take: MAX_JOBS_PER_RUN,
      select: { id: true, storageKey: true },
    });
    if (abandoned.length === 0) return;
    try {
      await this.storage.remove(abandoned.map((upload) => upload.storageKey));
    } catch {
      return;
    }
    await uploads.deleteMany({
      where: {
        OR: abandoned.map((upload) => ({
          id: upload.id,
          storageKey: upload.storageKey,
          OR: abandonedStates,
        })),
      },
    });
  }

  private async claim(candidate: CleanupJob, now: Date): Promise<CleanupJob | null> {
    const result = await this.prisma.storageCleanupJob.updateMany({
      where: {
        id: candidate.id,
        attempts: candidate.attempts,
        status: { in: ['PENDING', 'FAILED', 'RUNNING'] },
        nextAttemptAt: { lte: now },
      },
      data: {
        status: 'RUNNING',
        attempts: { increment: 1 },
        nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS),
        updatedAt: now,
      },
    });
    if (result.count !== 1) return null;
    return { ...candidate, attempts: candidate.attempts + 1 };
  }

  private async processClaimedJob(job: CleanupJob, now: Date): Promise<CleanupJobOutcome> {
    let rows: readonly CleanupStorageRow[];
    try {
      rows = await this.prisma.$queryRaw<readonly CleanupStorageRow[]>(
        tombstonedStorageKeysQuery(job.rootNodeId),
      );
    } catch {
      return (await this.markRetryable(job, now, 'CLEANUP_READ_FAILED')) ? 'failed' : 'superseded';
    }

    const boundary = rows[0];
    if (!boundary?.rootExists || !boundary.traversalComplete) {
      return (await this.markRetryable(job, now, 'CLEANUP_TRAVERSAL_FAILED'))
        ? 'failed'
        : 'superseded';
    }

    const keys = rows.flatMap((row) => (row.storageKey ? [row.storageKey] : []));
    try {
      await this.storage.remove(keys);
    } catch {
      return (await this.markRetryable(job, now, 'STORAGE_REMOVE_FAILED'))
        ? 'failed'
        : 'superseded';
    }

    try {
      await this.prisma.$executeRaw(confirmedTombstonesUpdate(job.rootNodeId));
    } catch {
      return (await this.markRetryable(job, now, 'CLEANUP_MARK_FAILED')) ? 'failed' : 'superseded';
    }

    const result = await this.prisma.storageCleanupJob.updateMany({
      where: { id: job.id, status: 'RUNNING', attempts: job.attempts },
      data: { status: 'SUCCEEDED', lastErrorCode: null, updatedAt: now },
    });
    return result.count === 1 ? 'succeeded' : 'superseded';
  }

  private async markRetryable(job: CleanupJob, now: Date, errorCode: string): Promise<boolean> {
    const result = await this.prisma.storageCleanupJob.updateMany({
      where: { id: job.id, status: 'RUNNING', attempts: job.attempts },
      data: {
        status: 'FAILED',
        lastErrorCode: errorCode,
        nextAttemptAt: new Date(now.getTime() + retryDelayMs(job.attempts)),
        updatedAt: now,
      },
    });
    return result.count === 1;
  }
}

function confirmedTombstonesUpdate(rootNodeId: string): Prisma.Sql {
  return Prisma.sql`
    WITH RECURSIVE subtree AS (
      SELECT node."id", node."dataRoomId",
             0 AS depth, ARRAY[node."id"]::uuid[] AS path
      FROM "Node" node
      WHERE node."id" = ${rootNodeId}::uuid
        AND node."deletedAt" IS NOT NULL
      UNION ALL
      SELECT child."id", child."dataRoomId",
             parent.depth + 1, parent.path || child."id"
      FROM "Node" child
      JOIN subtree parent ON child."parentId" = parent."id"
      WHERE child."deletedAt" IS NOT NULL
        AND child."dataRoomId" = parent."dataRoomId"
        AND parent.depth < ${MAX_SUBTREE_DEPTH}
        AND NOT child."id" = ANY(parent.path)
    )
    UPDATE "Node" SET "storageKey" = NULL, "sizeBytes" = 0
    WHERE "id" IN (SELECT "id" FROM subtree)
  `;
}

export function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * 2 ** exponent);
}

function tombstonedStorageKeysQuery(rootNodeId: string): Prisma.Sql {
  return Prisma.sql`
    WITH RECURSIVE subtree AS (
      SELECT node."id", node."dataRoomId", node."storageKey",
             0 AS depth, ARRAY[node."id"]::uuid[] AS path
      FROM "Node" node
      WHERE node."id" = ${rootNodeId}::uuid
        AND node."deletedAt" IS NOT NULL
      UNION ALL
      SELECT child."id", child."dataRoomId", child."storageKey",
             parent.depth + 1, parent.path || child."id"
      FROM "Node" child
      INNER JOIN subtree parent ON child."parentId" = parent."id"
      WHERE child."deletedAt" IS NOT NULL
        AND child."dataRoomId" = parent."dataRoomId"
        AND parent.depth < ${MAX_SUBTREE_DEPTH}
        AND NOT child."id" = ANY(parent.path)
    ),
    traversal_boundary AS (
      SELECT 1
      FROM subtree parent
      INNER JOIN "Node" child ON child."parentId" = parent."id"
      WHERE child."deletedAt" IS NOT NULL
        AND child."dataRoomId" = parent."dataRoomId"
        AND (
          parent.depth >= ${MAX_SUBTREE_DEPTH}
          OR child."id" = ANY(parent.path)
        )
      LIMIT 1
    )
    SELECT subtree."storageKey",
      EXISTS (
        SELECT 1 FROM subtree WHERE "id" = ${rootNodeId}::uuid
      ) AS "rootExists",
      NOT EXISTS (SELECT 1 FROM traversal_boundary) AS "traversalComplete"
    FROM (SELECT 1) seed
    LEFT JOIN subtree ON TRUE
  `;
}
