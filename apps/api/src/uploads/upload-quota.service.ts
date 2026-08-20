import { Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { ApiException } from '../common/api-exception.js';
import type { UploadTransaction } from './uploads.service.js';

export const MAX_ACTIVE_UPLOAD_SESSIONS = 5;
export const MAX_FINALIZED_BYTES = 100 * 1024 * 1024;
export const MAX_ACTIVE_FILES = 100;

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
      }>[]
    >(Prisma.sql`
      SELECT
        (SELECT count(*) FROM "UploadSession" WHERE "ownerId" = ${ownerId}::uuid AND "status" IN ('PREPARED', 'UPLOADING') AND "expiresAt" > now()) AS "activeSessions",
        (SELECT coalesce(sum("expectedSizeBytes"), 0) FROM "UploadSession" WHERE "ownerId" = ${ownerId}::uuid AND "status" IN ('PREPARED', 'UPLOADING') AND "expiresAt" > now()) AS "reservedBytes",
        (SELECT coalesce(sum(n."sizeBytes"), 0) FROM "Node" n JOIN "DataRoom" r ON r.id = n."dataRoomId" WHERE r."ownerId" = ${ownerId}::uuid AND n.kind = 'FILE' AND n."deletedAt" IS NULL) AS "finalizedBytes",
        (SELECT count(*) FROM "Node" n JOIN "DataRoom" r ON r.id = n."dataRoomId" WHERE r."ownerId" = ${ownerId}::uuid AND n.kind = 'FILE' AND n."deletedAt" IS NULL) AS "activeFiles"
    `);
    const row = rows[0];
    if (
      Number(row?.activeSessions ?? 0) + additionalReservations > MAX_ACTIVE_UPLOAD_SESSIONS ||
      Number(row?.finalizedBytes ?? 0) + Number(row?.reservedBytes ?? 0) + requestedBytes >
        MAX_FINALIZED_BYTES ||
      Number(row?.activeFiles ?? 0) + Number(row?.activeSessions ?? 0) + additionalReservations >
        MAX_ACTIVE_FILES
    ) {
      throw new ApiException('QUOTA_EXCEEDED', HttpStatus.CONFLICT, 'Upload quota exceeded.');
    }
  }
}
