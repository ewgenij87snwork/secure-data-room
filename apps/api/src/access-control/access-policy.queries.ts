import { Prisma } from '../generated/prisma/client.js';
import type { AccessPrincipal } from './access-policy.types.js';
import { isPublicLinkPrincipal } from './access-policy.types.js';

export type AccessPolicyRow = Readonly<{
  targetId: string | null;
  targetExists: boolean;
  targetKind: 'FOLDER' | 'FILE' | null;
  parentId: string | null;
  dataRoomId: string | null;
  ownerId: string | null;
  hasDeletedAncestor: boolean;
  roomRootNodeId: string | null;
  winningRole: 'VIEWER' | 'EDITOR' | null;
  winningShareId: string | null;
  winningTargetNodeId: string | null;
  winningAccessRootNodeId: string | null;
}>;

export function accessPolicyQuery(principal: AccessPrincipal, nodeId: string): Prisma.Sql {
  const principalShare = isPublicLinkPrincipal(principal)
    ? Prisma.sql`share."id" = ${principal.shareId}::uuid
        AND share."principalType" = 'PUBLIC_LINK'
        AND share."targetNodeId" = ${principal.targetNodeId}::uuid
        AND share."role" = 'VIEWER'`
    : Prisma.sql`share."principalType" = 'USER'
        AND share."recipientUserId" = ${principal.userId}::uuid`;

  return Prisma.sql`
    WITH RECURSIVE ancestry AS (
      SELECT node."id", node."dataRoomId", node."parentId", node."kind", node."deletedAt", 0 AS depth,
             ARRAY[node."id"] AS visited
      FROM "Node" node
      WHERE node."id" = ${nodeId}::uuid
      UNION ALL
      SELECT parent."id", parent."dataRoomId", parent."parentId", parent."kind", parent."deletedAt",
             child.depth + 1, child.visited || parent."id"
      FROM "Node" parent
      INNER JOIN ancestry child
        ON child."parentId" = parent."id"
       AND child."dataRoomId" = parent."dataRoomId"
      WHERE child.depth < 64
        AND NOT parent."id" = ANY(child.visited)
    )
    SELECT
      EXISTS (
        SELECT 1 FROM ancestry target
        WHERE target."id" = ${nodeId}::uuid AND target."deletedAt" IS NULL
      ) AS "targetExists",
      (SELECT target."id" FROM ancestry target WHERE target."id" = ${nodeId}::uuid) AS "targetId",
      (SELECT target."kind" FROM ancestry target WHERE target."id" = ${nodeId}::uuid) AS "targetKind",
      (SELECT target."parentId" FROM ancestry target WHERE target."id" = ${nodeId}::uuid) AS "parentId",
      (SELECT target."dataRoomId" FROM ancestry target WHERE target."id" = ${nodeId}::uuid) AS "dataRoomId",
      room."ownerId" AS "ownerId",
      (SELECT root."id" FROM ancestry root WHERE root."parentId" IS NULL ORDER BY root.depth DESC LIMIT 1) AS "roomRootNodeId",
      EXISTS (
        SELECT 1 FROM ancestry deleted_parent
        WHERE deleted_parent."id" <> ${nodeId}::uuid AND deleted_parent."deletedAt" IS NOT NULL
      ) AS "hasDeletedAncestor",
      winning."role" AS "winningRole",
      winning."shareId" AS "winningShareId",
      winning."targetNodeId" AS "winningTargetNodeId",
      winning."targetNodeId" AS "winningAccessRootNodeId"
    FROM (SELECT 1) singleton
    LEFT JOIN "DataRoom" room
      ON room."id" = (SELECT target."dataRoomId" FROM ancestry target WHERE target."id" = ${nodeId}::uuid)
    LEFT JOIN LATERAL (
      SELECT share."role", share."id" AS "shareId", share."targetNodeId",
             CASE WHEN share."role" = 'EDITOR' THEN 0 ELSE 1 END AS share_role_rank
      FROM "Share" share
      INNER JOIN "Node" share_target ON share_target."id" = share."targetNodeId"
      INNER JOIN ancestry bound_target ON bound_target."id" = share."targetNodeId"
      WHERE share."revokedAt" IS NULL
        AND share_target."deletedAt" IS NULL
        AND ${principalShare}
      ORDER BY share_role_rank ASC,
               bound_target.depth ASC,
               share."id" ASC
      LIMIT 1
    ) winning ON TRUE
  `;
}
