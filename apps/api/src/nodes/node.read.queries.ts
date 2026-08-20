import { Prisma } from '../generated/prisma/client.js';
import type { NodeRow } from './node-summary.js';

export function activeNodeQuery(dataRoomId: string, nodeId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT "id", "dataRoomId", "parentId", "kind", "name", "normalizedName",
           "sizeBytes", "mimeType", "revision", "createdAt", "updatedAt"
    FROM "Node"
    WHERE "dataRoomId" = ${dataRoomId}::uuid
      AND "id" = ${nodeId}::uuid
      AND "deletedAt" IS NULL
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
