import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { CreateFolderRequest, NodeSummary, RenameNodeRequest } from '@data-room/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedPrincipal } from '../auth/principal.js';
import {
  AccessPolicyService,
  AccessDeniedException,
  type OwnedFolder,
  type OwnedNode,
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

type PersistedNodeRow = NodeRow & Readonly<{ deletedAt: Date | null }>;

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
    updateMany(args: {
      where: {
        id: string;
        dataRoomId: string;
        revision: number;
        deletedAt: null;
      };
      data: {
        name: string;
        normalizedName: string;
        revision: { increment: 1 };
      };
    }): Promise<{ count: number }>;
    findUnique(args: { where: { id: string } }): Promise<PersistedNodeRow | null>;
  };
}

export interface NodesDatabase {
  $transaction<T>(callback: (tx: NodesTransaction) => Promise<T>): Promise<T>;
  node: {
    findMany(args: {
      where: { dataRoomId: string; parentId: string | null; deletedAt: null };
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
      if (isUniqueConflict(error)) {
        throw await this.nameConflict({
          access,
          name: input.name,
          parentId: access.nodeId,
          failureMessage: 'Folder creation failed.',
        });
      }
      throw new ApiException(
        'INTERNAL_ERROR',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Folder creation failed.',
      );
    }
  }

  async renameNode(
    principal: AuthenticatedPrincipal,
    nodeId: string,
    input: RenameNodeRequest,
  ): Promise<NodeSummary> {
    const access = await this.accessPolicy.assertCanManageNode(principal, nodeId);
    try {
      return await this.prisma.$transaction((transaction) =>
        renameInTransaction(transaction, access, input),
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isUniqueConflict(error)) {
        throw await this.nameConflict({
          access,
          name: input.name,
          parentId: access.parentId,
          failureMessage: 'Node rename failed.',
        });
      }
      throw new ApiException(
        'INTERNAL_ERROR',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Node rename failed.',
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

  private async nameConflict(input: {
    access: OwnedNode;
    name: string;
    parentId: string | null;
    failureMessage: string;
  }): Promise<ApiException> {
    let siblings: { normalizedName: string }[];
    try {
      siblings = await this.prisma.node.findMany({
        where: {
          dataRoomId: input.access.dataRoomId,
          parentId: input.parentId,
          deletedAt: null,
        },
        select: { normalizedName: true },
      });
    } catch {
      throw new ApiException(
        'INTERNAL_ERROR',
        HttpStatus.INTERNAL_SERVER_ERROR,
        input.failureMessage,
      );
    }
    const names = new Set(siblings.map((sibling) => sibling.normalizedName));
    let suggestedName = suffixedNodeName(input.name, 1);
    for (let attempt = 1; attempt <= 100; attempt += 1) {
      const candidate = suffixedNodeName(input.name, attempt);
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

async function renameInTransaction(
  transaction: NodesTransaction,
  access: OwnedNode,
  input: RenameNodeRequest,
): Promise<NodeSummary> {
  const updated = await transaction.node.updateMany({
    where: {
      id: access.nodeId,
      dataRoomId: access.dataRoomId,
      revision: input.expectedRevision,
      deletedAt: null,
    },
    data: {
      name: input.name,
      normalizedName: normalizedNodeName(input.name),
      revision: { increment: 1 },
    },
  });
  const current = await transaction.node.findUnique({ where: { id: access.nodeId } });
  if (updated.count === 1 && current?.deletedAt === null) {
    return toNodeSummary(current, 'OWNER');
  }
  if (current?.dataRoomId === access.dataRoomId && current.deletedAt === null) {
    throw new ApiException('CONFLICT', HttpStatus.CONFLICT, 'The node changed.');
  }
  throw new ApiException('RESOURCE_GONE', HttpStatus.GONE, 'The node is no longer available.');
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
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  if (error.code === 'P2002' || error.code === '23505') return true;
  if (error.code !== 'P2010' || !('meta' in error)) return false;
  const meta = error.meta;
  return typeof meta === 'object' && meta !== null && 'code' in meta && meta.code === '23505';
}

export { normalizedNodeName, suffixedNodeName } from './node-name.service.js';
