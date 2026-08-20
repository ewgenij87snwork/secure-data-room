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
    SELECT "id", "dataRoomId", "parentId", "kind", "name", "normalizedName",
           "sizeBytes", "mimeType", "revision", "createdAt", "updatedAt"
    FROM "Node"
    WHERE "dataRoomId" = ${roomId}::uuid
      AND "parentId" = ${parentId}::uuid
      AND "deletedAt" IS NULL
      ${after}
    ORDER BY "kind" ASC, "normalizedName" ASC, "id" ASC
    LIMIT ${limitPlusOne}
  `;
}
