import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { CreateFolderRequest, NodeSummary } from '@data-room/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedPrincipal } from '../auth/principal.js';
import {
  AccessPolicyService,
  AccessDeniedException,
  type OwnedFolder,
} from '../access-control/access-policy.service.js';
import {
  RuntimeControlsService,
  type RuntimeControlsTransaction,
} from '../runtime-controls/runtime-controls.service.js';
import { ApiException } from '../common/api-exception.js';
import { normalizedNodeName, suffixedNodeName } from './node-name.service.js';
import { toNodeSummary, type NodeRow } from './node-summary.js';

interface ParentProof {
  dataRoomId: string;
  parentId: string;
  kind: 'FOLDER';
  ownerId: string;
}

export interface NodesTransaction extends RuntimeControlsTransaction {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
  node: {
    count(args: {
      where: { dataRoomId: string; parentId: { not: null }; kind: 'FOLDER'; deletedAt: null };
    }): Promise<number>;
    create(args: {
      data: {
        dataRoomId: string;
        parentId: string;
        kind: 'FOLDER';
        name: string;
        normalizedName: string;
        sizeBytes: null;
        mimeType: null;
        storageKey: null;
      };
    }): Promise<NodeRow>;
  };
}

export interface NodesDatabase {
  $transaction<T>(callback: (tx: NodesTransaction) => Promise<T>): Promise<T>;
  node: {
    findMany(args: {
      where: { dataRoomId: string; parentId: string; deletedAt: null };
      select: { normalizedName: true };
    }): Promise<{ normalizedName: string }[]>;
  };
}

@Injectable()
export class NodesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: NodesDatabase,
    private readonly accessPolicy: AccessPolicyService,
    private readonly runtimeControls: RuntimeControlsService,
  ) {}

  async createFolder(
    principal: AuthenticatedPrincipal,
    input: CreateFolderRequest,
  ): Promise<NodeSummary> {
    const access = await this.accessPolicy.assertCanCreateChild(principal, input.parentId);
    try {
      return await this.prisma.$transaction((tx) =>
        this.createInTransaction(tx, principal, access, input),
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isUniqueConflict(error)) throw await this.nameConflict(access, input.name);
      throw new ApiException(
        'INTERNAL_ERROR',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Folder creation failed.',
      );
    }
  }

  private async createInTransaction(
    tx: NodesTransaction,
    principal: AuthenticatedPrincipal,
    access: OwnedFolder,
    input: CreateFolderRequest,
  ): Promise<NodeSummary> {
    const runtime = await this.runtimeControls.read(tx);
    if (runtime.maintenanceMode) {
      throw new ApiException(
        'MAINTENANCE_MODE',
        HttpStatus.SERVICE_UNAVAILABLE,
        'The service is in maintenance mode.',
      );
    }
    const parent = await proveParent(tx, principal, access);
    const activeCount = await tx.node.count({
      where: {
        dataRoomId: parent.dataRoomId,
        parentId: { not: null },
        kind: 'FOLDER',
        deletedAt: null,
      },
    });
    if (activeCount >= 50) {
      throw new ApiException('QUOTA_EXCEEDED', HttpStatus.CONFLICT, 'Folder quota exceeded.');
    }
    const node = await tx.node.create({
      data: {
        dataRoomId: parent.dataRoomId,
        parentId: input.parentId,
        kind: 'FOLDER',
        name: input.name,
        normalizedName: normalizedNodeName(input.name),
        sizeBytes: null,
        mimeType: null,
        storageKey: null,
      },
    });
    return toNodeSummary(node, 'OWNER');
  }

  private async nameConflict(access: OwnedFolder, name: string): Promise<ApiException> {
    let siblings: { normalizedName: string }[];
    try {
      siblings = await this.prisma.node.findMany({
        where: { dataRoomId: access.dataRoomId, parentId: access.nodeId, deletedAt: null },
        select: { normalizedName: true },
      });
    } catch {
      throw new ApiException(
        'INTERNAL_ERROR',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Folder creation failed.',
      );
    }
    const names = new Set(siblings.map((sibling) => sibling.normalizedName));
    let suggestedName = suffixedNodeName(name, 1);
    for (let attempt = 1; attempt <= 100; attempt += 1) {
      const candidate = suffixedNodeName(name, attempt);
      if (!names.has(normalizedNodeName(candidate))) {
        suggestedName = candidate;
        break;
      }
    }
    return new ApiException(
      'NAME_CONFLICT',
      HttpStatus.CONFLICT,
      'An item with this name already exists in this folder.',
      { suggestedName },
    );
  }
}

async function proveParent(
  tx: NodesTransaction,
  principal: AuthenticatedPrincipal,
  access: OwnedFolder,
): Promise<ParentProof> {
  const rows = await tx.$queryRaw<ParentProof[]>(Prisma.sql`
    SELECT room."id" AS "dataRoomId", parent."id" AS "parentId",
           parent."kind" AS "kind", room."ownerId" AS "ownerId"
    FROM "DataRoom" room
    INNER JOIN "Node" parent ON parent."dataRoomId" = room."id"
    WHERE room."id" = ${access.dataRoomId}::uuid
      AND room."ownerId" = ${principal.userId}::uuid
      AND parent."id" = ${access.nodeId}::uuid
      AND parent."kind" = 'FOLDER'
      AND parent."deletedAt" IS NULL
    FOR UPDATE OF room, parent
  `);
  const parent = rows[0];
  if (!parent?.ownerId || parent.ownerId !== principal.userId) {
    throw new AccessDeniedException();
  }
  return parent;
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export { normalizedNodeName, suffixedNodeName } from './node-name.service.js';
