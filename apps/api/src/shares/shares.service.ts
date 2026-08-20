import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  publicShareTokenHeaderSchema,
  isoDateTimeSchema,
  uuidSchema,
  type CreatePermissionedShareRequest,
  type CreatePermissionedShareResponse,
  type CreatePublicShareResponse,
  type ListSharesResponse,
  type RevokeShareResponse,
  type ShareSummary,
  type SharedWithMeResponse,
} from '@data-room/contracts';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedPrincipal } from '../auth/principal.js';
import {
  publicLinkPrincipal,
  type PublicLinkPrincipal,
} from '../access-control/access-policy.types.js';
import { AccessPolicyService } from '../access-control/access-policy.service.js';
import {
  RuntimeControlsService,
  type RuntimeControlsTransaction,
} from '../runtime-controls/runtime-controls.service.js';
import { toNodeSummary, type NodeRow } from '../nodes/node-summary.js';
import { decodeCanonicalBase64Json, encodeCanonicalBase64Json } from '../common/pagination.js';
import { ApiException } from '../common/api-exception.js';

type ShareRecord = Readonly<{
  id: string;
  targetNodeId: string;
  principalType: 'USER' | 'PUBLIC_LINK';
  role: 'VIEWER' | 'EDITOR';
  recipientEmail: string | null;
  createdAt: Date;
  revokedAt: Date | null;
}>;
type NodeRecord = NodeRow & Readonly<{ deletedAt: Date | null; storageKey: string | null }>;

export interface SharesDatabase {
  share: {
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: Record<string, string>[];
    }): Promise<ShareRecord[]>;
    findFirst(args: {
      where: Record<string, unknown>;
    }): Promise<(ShareRecord & { targetNode: { name: string } }) | null>;
    findUnique(args: {
      where: { id: string };
    }): Promise<(ShareRecord & { grantedByUserId: string }) | null>;
    create(args: { data: Record<string, unknown> }): Promise<ShareRecord>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  userProfile: {
    findUnique(args: {
      where: Record<string, unknown>;
    }): Promise<{ id: string; email: string; displayName: string | null } | null>;
  };
  node: { findUnique(args: { where: { id: string } }): Promise<NodeRecord | null> };
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

@Injectable()
export class SharesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: SharesDatabase,
    private readonly accessPolicy: AccessPolicyService,
    private readonly runtimeControls: RuntimeControlsService,
  ) {}

  async list(principal: AuthenticatedPrincipal, nodeId: string): Promise<ListSharesResponse> {
    await this.accessPolicy.assertCanManageNode(principal, nodeId);
    const shares = await this.prisma.share.findMany({
      where: { targetNodeId: nodeId, revokedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException();
    return { items: shares.map((share) => this.toSummary(share, node.name)) };
  }

  async createPublic(
    principal: AuthenticatedPrincipal,
    nodeId: string,
  ): Promise<CreatePublicShareResponse> {
    const access = await this.accessPolicy.assertCanManageNode(principal, nodeId);
    await this.assertPublicLinksEnabled();
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (node?.deletedAt !== null) throw new NotFoundException();
    const raw = randomBytes(32);
    const token = raw.toString('base64url');
    const tokenHash = createHash('sha256').update(raw).digest();
    const share = await this.prisma.share.create({
      data: {
        targetNodeId: access.nodeId,
        grantedByUserId: principal.userId,
        principalType: 'PUBLIC_LINK',
        role: 'VIEWER',
        tokenHash,
      },
    });
    return {
      shareId: share.id,
      url: `${this.publicOrigin()}/share#token=${token}`,
      targetName: node.name,
    };
  }

  async createPermissioned(
    principal: AuthenticatedPrincipal,
    nodeId: string,
    input: CreatePermissionedShareRequest,
  ): Promise<CreatePermissionedShareResponse> {
    const access = await this.accessPolicy.assertCanManageNode(principal, nodeId);
    const email = input.email.trim().toLowerCase();
    if (email === principal.email.trim().toLowerCase())
      throw new ConflictException('Cannot share with yourself.');
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (node?.deletedAt !== null) throw new NotFoundException();
    const existing = await this.prisma.share.findFirst({
      where: {
        targetNodeId: nodeId,
        principalType: 'USER',
        recipientEmail: email,
        revokedAt: null,
      },
    });
    if (existing) throw activeShareConflict();
    const recipient = await this.prisma.userProfile.findUnique({ where: { email } });
    let share: ShareRecord;
    try {
      share = await this.prisma.share.create({
        data: {
          targetNodeId: access.nodeId,
          grantedByUserId: principal.userId,
          principalType: 'USER',
          role: 'VIEWER',
          recipientEmail: email,
          recipientUserId: recipient?.id ?? null,
        },
      });
    } catch (error) {
      if (isUniqueConflict(error)) throw activeShareConflict();
      throw error;
    }
    return this.toSummary(share, node.name);
  }

  async revoke(principal: AuthenticatedPrincipal, shareId: string): Promise<RevokeShareResponse> {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId, grantedByUserId: principal.userId },
    });
    if (!share) throw new NotFoundException();
    await this.prisma.share.updateMany({
      where: { id: shareId, grantedByUserId: principal.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { shareId, revoked: true };
  }

  async resolvePublic(token: string | undefined): Promise<PublicLinkPrincipal> {
    const parsed = publicShareTokenHeaderSchema.safeParse(token);
    if (!parsed.success) throw new ForbiddenException('Invalid public share token.');
    const raw = Buffer.from(parsed.data, 'base64url');
    if (raw.length !== 32) throw new ForbiddenException('Invalid public share token.');
    const share = await this.prisma.share.findFirst({
      where: {
        principalType: 'PUBLIC_LINK',
        tokenHash: createHash('sha256').update(raw).digest(),
        revokedAt: null,
      },
    });
    if (!share) throw new ForbiddenException('Invalid public share token.');
    await this.assertPublicLinksEnabled();
    return publicLinkPrincipal(share.id, share.targetNodeId);
  }

  async sharedWithMe(
    principal: AuthenticatedPrincipal,
    cursor: string | undefined,
    limit: number,
  ): Promise<SharedWithMeResponse> {
    const anchor = cursor ? decodeShareCursor(cursor) : null;
    const rows = await this.prisma.$queryRaw<ShareJoinRow[]>(
      sharedWithMeQuery(principal.userId, anchor, limit + 1),
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        share: this.toSummary(
          {
            id: row.shareId,
            targetNodeId: row.targetNodeId,
            principalType: row.principalType,
            role: row.role,
            recipientEmail: row.recipientEmail,
            createdAt: row.shareCreatedAt,
            revokedAt: row.revokedAt,
          },
          row.targetName,
        ),
        node: toNodeSummary(row, 'VIEWER'),
        owner: { id: row.ownerId, email: row.ownerEmail, displayName: row.ownerDisplayName },
      })),
      pageInfo: {
        hasNextPage: rows.length > limit,
        nextCursor:
          rows.length > limit && last ? encodeShareCursor(last.shareCreatedAt, last.shareId) : null,
      },
    };
  }

  private async assertPublicLinksEnabled(): Promise<void> {
    const runtime = await this.runtimeControls.read(
      this.prisma as unknown as RuntimeControlsTransaction,
    );
    if (!runtime.publicLinksEnabled)
      throw new ApiException('ACCESS_DENIED', HttpStatus.FORBIDDEN, 'Public links are disabled.');
  }
  private publicOrigin(): string {
    return (process.env.WEB_ORIGINS ?? 'http://localhost:5173')
      .split(',')[0]!
      .trim()
      .replace(/\/$/u, '');
  }
  private toSummary(share: ShareRecord, targetName: string): ShareSummary {
    return {
      id: share.id,
      targetNodeId: share.targetNodeId,
      targetName,
      principalType: share.principalType,
      role: share.role,
      recipientEmail: share.recipientEmail,
      createdAt: share.createdAt.toISOString(),
      revokedAt: share.revokedAt?.toISOString() ?? null,
    };
  }
}

type ShareJoinRow = NodeRow &
  Readonly<{
    shareId: string;
    targetNodeId: string;
    targetName: string;
    principalType: 'USER';
    role: 'VIEWER';
    recipientEmail: string | null;
    shareCreatedAt: Date;
    revokedAt: null;
    ownerId: string;
    ownerEmail: string;
    ownerDisplayName: string | null;
  }>;
function sharedWithMeQuery(
  userId: string,
  anchor: { createdAt: string; id: string } | null,
  limit: number,
): Prisma.Sql {
  return Prisma.sql`
 SELECT share."id" AS "shareId", node."id", share."targetNodeId", share."principalType", share."role", share."recipientEmail", share."createdAt" AS "shareCreatedAt", share."revokedAt", node."dataRoomId", node."parentId", node."kind", node."name", node."name" AS "targetName", node."normalizedName", node."sizeBytes", node."mimeType", node."revision", node."createdAt", node."updatedAt", room."ownerId", owner."email" AS "ownerEmail", owner."displayName" AS "ownerDisplayName"
 FROM "Share" share JOIN "Node" node ON node."id" = share."targetNodeId" JOIN "DataRoom" room ON room."id" = node."dataRoomId" JOIN "UserProfile" owner ON owner."id" = room."ownerId"
 WHERE share."principalType" = 'USER' AND share."recipientUserId" = ${userId}::uuid AND share."revokedAt" IS NULL AND node."deletedAt" IS NULL
 ${anchor ? Prisma.sql`AND (share."createdAt", share."id") < (${new Date(anchor.createdAt)}, ${anchor.id}::uuid)` : Prisma.empty}
 ORDER BY share."createdAt" DESC, share."id" DESC LIMIT ${limit}`;
}
function encodeShareCursor(createdAt: Date, id: string): string {
  return encodeCanonicalBase64Json({ createdAt: createdAt.toISOString(), id });
}
function decodeShareCursor(value: string): { createdAt: string; id: string } {
  const parsed = decodeCanonicalBase64Json(value);
  const result = zShareCursor.safeParse(parsed);
  if (!result.success)
    throw new ApiException('VALIDATION_FAILED', 400, 'Pagination cursor is invalid.');
  return result.data;
}

const zShareCursor = z.object({ createdAt: isoDateTimeSchema, id: uuidSchema }).strict();

function activeShareConflict(): ApiException {
  return new ApiException('CONFLICT', HttpStatus.CONFLICT, 'An active share already exists.');
}

function isUniqueConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  if (error.code === 'P2002' || error.code === '23505') return true;
  if (error.code !== 'P2010' || !('meta' in error)) return false;
  const meta = error.meta;
  return typeof meta === 'object' && meta !== null && 'code' in meta && meta.code === '23505';
}
