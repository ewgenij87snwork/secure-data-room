import { Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { ApiException } from '../common/api-exception.js';
import type { UploadTransaction } from './uploads.service.js';

export const MAX_ACTIVE_UPLOAD_SESSIONS = 5;
export const MAX_FINALIZED_BYTES = 50 * 1024 * 1024;
export const MAX_GLOBAL_STORAGE_BYTES = 200 * 1024 * 1024;
export const MAX_PROVIDER_OBJECT_BYTES = 10 * 1024 * 1024;
export const MAX_ACTIVE_FILES = 100;
const MAX_SUBTREE_DEPTH = 64;

@Injectable()
export class UploadQuotaService {
  async assertBatchFits(
    tx: UploadTransaction,
    ownerId: string,
    additionalReservations: number,
    requestedBytes: number,
  ): Promise<void> {
    const rows = await tx.$queryRaw<
      Readonly<{
        activeSessions: bigint | number;
        reservedBytes: bigint | number;
        finalizedBytes: bigint | number;
        activeFiles: bigint | number;
        globalStorageBytes: bigint | number;
      }>[]
    >(Prisma.sql`
      WITH RECURSIVE runtime_lock AS (
        SELECT id FROM "RuntimeControl" WHERE id = 1 FOR UPDATE
      ), purged_nodes AS (
        SELECT node."id", node."dataRoomId",
               0 AS depth, ARRAY[node."id"]::uuid[] AS path
        FROM "Node" node
        JOIN "StorageCleanupJob" job ON job."rootNodeId" = node.id
        WHERE job.status = 'SUCCEEDED'
          AND node."deletedAt" IS NOT NULL
        UNION ALL
        SELECT child."id", child."dataRoomId",
               parent.depth + 1, parent.path || child."id"
        FROM "Node" child
        JOIN purged_nodes parent ON child."parentId" = parent."id"
        WHERE child."deletedAt" IS NOT NULL
          AND child."dataRoomId" = parent."dataRoomId"
          AND parent.depth < ${MAX_SUBTREE_DEPTH}
          AND NOT child."id" = ANY(parent.path)
      )
      SELECT
        (SELECT count(*) FROM "UploadSession" WHERE "ownerId" = ${ownerId}::uuid AND "status" IN ('PREPARED', 'UPLOADING') AND "expiresAt" > now()) AS "activeSessions",
        (SELECT coalesce(sum("expectedSizeBytes"), 0) FROM "UploadSession" WHERE "ownerId" = ${ownerId}::uuid AND "status" IN ('PREPARED', 'UPLOADING') AND "expiresAt" > now()) AS "reservedBytes",
        (SELECT coalesce(sum(n."sizeBytes"), 0) FROM "Node" n JOIN "DataRoom" r ON r.id = n."dataRoomId" WHERE r."ownerId" = ${ownerId}::uuid AND n.kind = 'FILE' AND n."deletedAt" IS NULL) AS "finalizedBytes",
        (SELECT count(*) FROM "Node" n JOIN "DataRoom" r ON r.id = n."dataRoomId" WHERE r."ownerId" = ${ownerId}::uuid AND n.kind = 'FILE' AND n."deletedAt" IS NULL) AS "activeFiles",
        (SELECT coalesce(sum(GREATEST("expectedSizeBytes", ${MAX_PROVIDER_OBJECT_BYTES})), 0) FROM "UploadSession" WHERE "status" <> 'FINALIZED') +
        (SELECT coalesce(sum("sizeBytes"), 0) FROM "Node" WHERE kind = 'FILE' AND id NOT IN (SELECT id FROM purged_nodes)) AS "globalStorageBytes"
      FROM runtime_lock
    `);
    const row = rows[0];
    if (!row) {
      throw new ApiException(
        'INTERNAL_ERROR',
        HttpStatus.SERVICE_UNAVAILABLE,
        'Upload quota is temporarily unavailable.',
      );
    }
    if (
      Number(row.activeSessions) + additionalReservations > MAX_ACTIVE_UPLOAD_SESSIONS ||
      Number(row.finalizedBytes) + Number(row.reservedBytes) + requestedBytes >
        MAX_FINALIZED_BYTES ||
      Number(row.activeFiles) + Number(row.activeSessions) + additionalReservations >
        MAX_ACTIVE_FILES ||
      Number(row.globalStorageBytes) +
        Math.max(requestedBytes, additionalReservations * MAX_PROVIDER_OBJECT_BYTES) >
        MAX_GLOBAL_STORAGE_BYTES
    ) {
      throw new ApiException('QUOTA_EXCEEDED', HttpStatus.CONFLICT, 'Upload quota exceeded.');
    }
  }
}
