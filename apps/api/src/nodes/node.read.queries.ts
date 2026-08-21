import { Prisma } from '../generated/prisma/client.js';
import type { NodeRow } from './node-summary.js';

export function activeNodeQuery(dataRoomId: string, nodeId: string): Prisma.Sql {
  return Prisma.sql`
    WITH RECURSIVE ancestry AS (
      SELECT node."id", node."dataRoomId", node."parentId", node."kind", node."name", node."normalizedName",
             node."sizeBytes", node."mimeType", node."revision", node."createdAt", node."updatedAt",
             0 AS depth, ARRAY[node."id"] AS visited
      FROM "Node" node
      WHERE node."dataRoomId" = ${dataRoomId}::uuid
        AND node."id" = ${nodeId}::uuid
        AND node."deletedAt" IS NULL
      UNION ALL
      SELECT parent."id", parent."dataRoomId", parent."parentId", parent."kind", parent."name", parent."normalizedName",
             parent."sizeBytes", parent."mimeType", parent."revision", parent."createdAt", parent."updatedAt",
             child.depth + 1, child.visited || parent."id"
      FROM "Node" parent
      INNER JOIN ancestry child ON child."parentId" = parent."id"
      WHERE parent."dataRoomId" = ${dataRoomId}::uuid
        AND parent."deletedAt" IS NULL
        AND child.depth < 64
        AND NOT parent."id" = ANY(child.visited)
    )
    SELECT node."id", node."dataRoomId", node."parentId", node."kind", node."name", node."normalizedName",
           node."sizeBytes", node."mimeType", node."revision", node."createdAt", node."updatedAt",
           EXISTS (
             SELECT 1
             FROM "Share" share
             INNER JOIN ancestry ancestor ON share."targetNodeId" = ancestor."id"
             WHERE node.depth = 0
               AND share."revokedAt" IS NULL
           ) AS "hasActiveShare"
    FROM ancestry node
    WHERE node.depth = 0
    LIMIT 1
  `;
}

export function breadcrumbQuery(
  dataRoomId: string,
  nodeId: string,
  accessRootNodeId: string,
): Prisma.Sql {
  return Prisma.sql`
    WITH RECURSIVE trail AS (
      SELECT "id", "parentId", "name", 0 AS depth, ARRAY["id"] AS visited
      FROM "Node"
      WHERE "dataRoomId" = ${dataRoomId}::uuid
        AND "id" = ${nodeId}::uuid
        AND "deletedAt" IS NULL
      UNION ALL
      SELECT parent."id", parent."parentId", parent."name", child.depth + 1,
             child.visited || parent."id"
      FROM "Node" parent
      INNER JOIN trail child
        ON child."parentId" = parent."id"
       AND parent."dataRoomId" = ${dataRoomId}::uuid
      WHERE parent."deletedAt" IS NULL
        AND child."id" <> ${accessRootNodeId}::uuid
        AND child.depth < 64
        AND NOT parent."id" = ANY(child.visited)
    )
    SELECT "id", "name", "depth"
    FROM trail
    ORDER BY depth DESC
  `;
}

export type ActiveNodeRow = NodeRow;
export type BreadcrumbRow = Readonly<{ id: string; name: string; depth: number }>;
