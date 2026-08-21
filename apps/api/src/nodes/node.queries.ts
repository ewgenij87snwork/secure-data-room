import { Prisma } from '../generated/prisma/client.js';
import type { NodeCursor } from './node-cursor.js';

export function nodeCursorAnchorQuery(
  roomId: string,
  parentId: string,
  cursor: NodeCursor,
): Prisma.Sql {
  return Prisma.sql`
    SELECT "id"
    FROM "Node"
    WHERE "dataRoomId" = ${roomId}::uuid
      AND "parentId" = ${parentId}::uuid
      AND "deletedAt" IS NULL
      AND "kind" = ${cursor.kind}::"NodeKind"
      AND "normalizedName" = ${cursor.normalizedName}
      AND "id" = ${cursor.id}::uuid
    LIMIT 1
  `;
}

export function activeChildrenQuery(
  roomId: string,
  parentId: string,
  cursor: NodeCursor | null,
  limitPlusOne: number,
): Prisma.Sql {
  const after = cursor
    ? Prisma.sql`AND ("kind", "normalizedName", "id") > (${cursor.kind}::"NodeKind", ${cursor.normalizedName}, ${cursor.id}::uuid)`
    : Prisma.empty;
  return Prisma.sql`
    WITH RECURSIVE parent_ancestry AS (
      SELECT node."id", node."parentId", node."deletedAt", 0 AS depth, ARRAY[node."id"] AS visited
      FROM "Node" node
      WHERE node."dataRoomId" = ${roomId}::uuid
        AND node."id" = ${parentId}::uuid
        AND node."deletedAt" IS NULL
      UNION ALL
      SELECT ancestor."id", ancestor."parentId", ancestor."deletedAt", child.depth + 1,
             child.visited || ancestor."id"
      FROM "Node" ancestor
      INNER JOIN parent_ancestry child ON child."parentId" = ancestor."id"
      WHERE ancestor."dataRoomId" = ${roomId}::uuid
        AND ancestor."deletedAt" IS NULL
        AND child.depth < 64
        AND NOT ancestor."id" = ANY(child.visited)
    )
    SELECT node."id", node."dataRoomId", node."parentId", node."kind", node."name", node."normalizedName",
           node."sizeBytes", node."mimeType", node."revision", node."createdAt", node."updatedAt",
           (
             EXISTS (
               SELECT 1
               FROM "Share" share
               INNER JOIN parent_ancestry ancestor ON share."targetNodeId" = ancestor."id"
               WHERE share."revokedAt" IS NULL
             )
             OR EXISTS (
               SELECT 1
               FROM "Share" share
               WHERE share."targetNodeId" = node."id"
                 AND share."revokedAt" IS NULL
             )
           ) AS "hasActiveShare"
    FROM "Node" node
    WHERE node."dataRoomId" = ${roomId}::uuid
      AND node."parentId" = ${parentId}::uuid
      AND node."deletedAt" IS NULL
      ${after}
    ORDER BY "kind" ASC, "normalizedName" ASC, "id" ASC
    LIMIT ${limitPlusOne}
  `;
}
