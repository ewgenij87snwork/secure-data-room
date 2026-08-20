import { Prisma } from '../generated/prisma/client.js';

const MAX_SUBTREE_DEPTH = 64;

export type DeleteImpactRow = Readonly<{
  rootNodeId: string;
  folderCount: number;
  fileCount: number;
  totalBytes: string;
  activeShareCount: number;
  rootExists: boolean;
  traversalComplete: boolean;
}>;

export type DeleteMutationRow = DeleteImpactRow &
  Readonly<{
    tombstonedCount: number;
  }>;

export type LockedDeleteTargetRow = Readonly<{
  id: string;
  parentId: string | null;
  deletedAt: Date | null;
  cleanupJobExists: boolean;
}>;

export function deleteImpactQuery(dataRoomId: string, rootNodeId: string): Prisma.Sql {
  return Prisma.sql`
    WITH RECURSIVE ${activeSubtreeCte(dataRoomId, rootNodeId)}
    SELECT ${rootNodeId}::uuid AS "rootNodeId",
      COUNT(*) FILTER (
        WHERE "id" <> ${rootNodeId}::uuid AND "kind" = 'FOLDER'
      )::int AS "folderCount",
      COUNT(*) FILTER (
        WHERE "id" <> ${rootNodeId}::uuid AND "kind" = 'FILE'
      )::int AS "fileCount",
      COALESCE(SUM("sizeBytes") FILTER (WHERE "kind" = 'FILE'), 0)::text AS "totalBytes",
      (
        SELECT COUNT(*)::int
        FROM "Share" share
        WHERE share."revokedAt" IS NULL
          AND share."targetNodeId" IN (SELECT "id" FROM subtree)
      ) AS "activeShareCount",
      EXISTS (
        SELECT 1 FROM subtree WHERE "id" = ${rootNodeId}::uuid
      ) AS "rootExists",
      NOT EXISTS (SELECT 1 FROM traversal_boundary) AS "traversalComplete"
    FROM subtree
  `;
}

export function lockDeleteTargetQuery(
  ownerId: string,
  dataRoomId: string,
  nodeId: string,
): Prisma.Sql {
  return Prisma.sql`
    SELECT target."id", target."parentId", target."deletedAt",
      EXISTS (
        SELECT 1
        FROM "StorageCleanupJob" job
        WHERE job."rootNodeId" = target."id"
      ) AS "cleanupJobExists"
    FROM "DataRoom" room
    INNER JOIN "Node" target ON target."dataRoomId" = room."id"
    WHERE room."id" = ${dataRoomId}::uuid
      AND room."ownerId" = ${ownerId}::uuid
      AND target."id" = ${nodeId}::uuid
    FOR UPDATE OF room, target
  `;
}

export function deletionReceiptQuery(ownerId: string, nodeId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT target."id"
    FROM "Node" target
    INNER JOIN "DataRoom" room ON room."id" = target."dataRoomId"
    INNER JOIN "StorageCleanupJob" job ON job."rootNodeId" = target."id"
    WHERE target."id" = ${nodeId}::uuid
      AND target."deletedAt" IS NOT NULL
      AND room."ownerId" = ${ownerId}::uuid
    LIMIT 1
  `;
}

export function deleteSubtreeQuery(
  dataRoomId: string,
  rootNodeId: string,
  deletedAt: Date,
): Prisma.Sql {
  return Prisma.sql`
    WITH RECURSIVE ${activeSubtreeCte(dataRoomId, rootNodeId)},
    ${safeSubtreeCte()},
    ${deleteImpactCte(rootNodeId)},
    ${revokeSharesCte(deletedAt)},
    ${tombstoneNodesCte(deletedAt)},
    ${enqueueCleanupCte(rootNodeId, deletedAt)}
    SELECT ${rootNodeId}::uuid AS "rootNodeId",
      impact."folderCount", impact."fileCount", impact."totalBytes",
      (SELECT COUNT(*)::int FROM revoked) AS "activeShareCount",
      EXISTS (
        SELECT 1 FROM subtree WHERE "id" = ${rootNodeId}::uuid
      ) AS "rootExists",
      NOT EXISTS (SELECT 1 FROM traversal_boundary) AS "traversalComplete",
      (SELECT COUNT(*)::int FROM tombstoned) AS "tombstonedCount",
      (SELECT COUNT(*)::int FROM cleanup) AS "cleanupInsertCount"
    FROM impact
  `;
}

function safeSubtreeCte(): Prisma.Sql {
  return Prisma.sql`
    safe_subtree AS (
      SELECT *
      FROM subtree
      WHERE NOT EXISTS (SELECT 1 FROM traversal_boundary)
    )
  `;
}

function deleteImpactCte(rootNodeId: string): Prisma.Sql {
  return Prisma.sql`
    impact AS (
      SELECT
        COUNT(*) FILTER (
          WHERE "id" <> ${rootNodeId}::uuid AND "kind" = 'FOLDER'
        )::int AS "folderCount",
        COUNT(*) FILTER (
          WHERE "id" <> ${rootNodeId}::uuid AND "kind" = 'FILE'
        )::int AS "fileCount",
        COALESCE(SUM("sizeBytes") FILTER (WHERE "kind" = 'FILE'), 0)::text AS "totalBytes"
      FROM safe_subtree
    )
  `;
}

function revokeSharesCte(deletedAt: Date): Prisma.Sql {
  return Prisma.sql`
    revoked AS (
      UPDATE "Share" share
      SET "revokedAt" = ${deletedAt}
      WHERE share."revokedAt" IS NULL
        AND share."targetNodeId" IN (SELECT "id" FROM safe_subtree)
      RETURNING share."id"
    )
  `;
}

function tombstoneNodesCte(deletedAt: Date): Prisma.Sql {
  return Prisma.sql`
    tombstoned AS (
      UPDATE "Node" node
      SET "deletedAt" = ${deletedAt}, "updatedAt" = ${deletedAt},
          "revision" = node."revision" + 1
      WHERE node."deletedAt" IS NULL
        AND node."id" IN (SELECT "id" FROM safe_subtree)
      RETURNING node."id"
    )
  `;
}

function enqueueCleanupCte(rootNodeId: string, deletedAt: Date): Prisma.Sql {
  return Prisma.sql`
    cleanup AS (
      INSERT INTO "StorageCleanupJob" ("rootNodeId", "updatedAt")
      SELECT ${rootNodeId}::uuid, ${deletedAt}
      WHERE EXISTS (
        SELECT 1 FROM safe_subtree WHERE "id" = ${rootNodeId}::uuid
      )
      ON CONFLICT ("rootNodeId") DO NOTHING
      RETURNING "id"
    )
  `;
}

function activeSubtreeCte(dataRoomId: string, rootNodeId: string): Prisma.Sql {
  return Prisma.sql`
    subtree AS (
      SELECT node."id", node."kind", node."sizeBytes", node."storageKey",
             0 AS depth, ARRAY[node."id"]::uuid[] AS path
      FROM "Node" node
      WHERE node."id" = ${rootNodeId}::uuid
        AND node."dataRoomId" = ${dataRoomId}::uuid
        AND node."deletedAt" IS NULL
      UNION ALL
      SELECT child."id", child."kind", child."sizeBytes", child."storageKey",
             parent.depth + 1, parent.path || child."id"
      FROM "Node" child
      INNER JOIN subtree parent ON child."parentId" = parent."id"
      WHERE child."dataRoomId" = ${dataRoomId}::uuid
        AND child."deletedAt" IS NULL
        AND parent.depth < ${MAX_SUBTREE_DEPTH}
        AND NOT child."id" = ANY(parent.path)
    ),
    traversal_boundary AS (
      SELECT 1
      FROM subtree parent
      INNER JOIN "Node" child ON child."parentId" = parent."id"
      WHERE child."dataRoomId" = ${dataRoomId}::uuid
        AND child."deletedAt" IS NULL
        AND (
          parent.depth >= ${MAX_SUBTREE_DEPTH}
          OR child."id" = ANY(parent.path)
        )
      LIMIT 1
    )
  `;
}
