import { HttpException, HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import {
  moveFileRequestSchema,
  type CreateFolderRequest,
  type NodeSummary,
  type RenameNodeRequest,
} from '@data-room/contracts';
import { z } from 'zod';
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
import { StorageService } from '../storage/storage.service.js';

export type MoveFileRequest = z.infer<typeof moveFileRequestSchema>;
export type ViewUrlResponse = Readonly<{ url: string; expiresAt: string }>;

interface ParentProof {
  dataRoomId: string;
  parentId: string;
  kind: 'FOLDER';
  ownerId: string;
}

type PersistedNodeRow = NodeRow & Readonly<{ deletedAt: Date | null; storageKey?: string | null }>;

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
        name?: string;
        normalizedName?: string;
        revision: { increment: 1 };
        parentId?: string;
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
    findUnique(args: { where: { id: string } }): Promise<PersistedNodeRow | null>;
  };
}

@Injectable()
export class NodesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: NodesDatabase,
    private readonly accessPolicy: AccessPolicyService,
    private readonly runtimeControls: RuntimeControlsService,
    @Optional() private readonly storage?: StorageService,
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

  async moveFile(
    principal: AuthenticatedPrincipal,
    nodeId: string,
    input: MoveFileRequest,
  ): Promise<NodeSummary> {
    const access = await this.accessPolicy.assertCanManageNode(principal, nodeId);
    if (access.kind !== 'FILE') throw invalidFile();
    let source: PersistedNodeRow | null;
    try {
      source = await this.prisma.node.findUnique({ where: { id: nodeId } });
    } catch {
      throw persistenceFailure('File move failed.');
    }
    if (source?.deletedAt !== null) throw resourceGone();
    try {
      return await this.prisma.$transaction((transaction) =>
        moveInTransaction(transaction, access, input),
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isUniqueConflict(error)) {
        throw await this.nameConflict({
          access,
          name: source.name,
          parentId: input.targetFolderId,
          preserveExtension: true,
          failureMessage: 'File move failed.',
        });
      }
      throw new ApiException(
        'INTERNAL_ERROR',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'File move failed.',
      );
    }
  }

  async createViewUrl(principal: AuthenticatedPrincipal, nodeId: string): Promise<ViewUrlResponse> {
    const access = await this.accessPolicy.assertCanReadNode(principal, nodeId);
    let node: PersistedNodeRow | null;
    try {
      node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    } catch {
      throw persistenceFailure('Viewing failed.');
    }
    if (
      node?.deletedAt !== null ||
      node.dataRoomId !== access.dataRoomId ||
      node.kind !== 'FILE' ||
      typeof node.storageKey !== 'string'
    ) {
      throw invalidFile();
    }
    const storage = this.storage;
    if (!storage) {
      throw new ApiException(
        'INTERNAL_ERROR',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Viewing is unavailable.',
      );
    }
    const ttlSeconds = 60;
    let url: string;
    try {
      url = await storage.createSignedReadUrl(node.storageKey, ttlSeconds);
    } catch {
      throw persistenceFailure('Viewing failed.');
    }
    return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
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
    preserveExtension?: boolean;
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
    const suffixName = (attempt: number) =>
      input.preserveExtension
        ? suffixedFileName(input.name, attempt)
        : suffixedNodeName(input.name, attempt);
    let suggestedName = suffixName(1);
    for (let attempt = 1; attempt <= 100; attempt += 1) {
      const candidate = suffixName(attempt);
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

function suffixedFileName(name: string, attempt: number): string {
  const extensionIndex = name.lastIndexOf('.');
  if (extensionIndex <= 0 || extensionIndex === name.length - 1) {
    return suffixedNodeName(name, attempt);
  }
  const base = name.slice(0, extensionIndex);
  const extension = name.slice(extensionIndex);
  const suffix = ` (${attempt})`;
  const stemLength = Math.max(1, 120 - suffix.length - extension.length);
  return `${base.slice(0, stemLength)}${suffix}${extension}`;
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

async function moveInTransaction(
  transaction: NodesTransaction,
  access: OwnedNode,
  input: MoveFileRequest,
): Promise<NodeSummary> {
  const targets = await transaction.$queryRaw<
    { id: string; dataRoomId: string; kind: NodeRow['kind']; deletedAt: Date | null }[]
  >(Prisma.sql`
    SELECT "id", "dataRoomId", "kind", "deletedAt"
    FROM "Node"
    WHERE "id" = ${input.targetFolderId}::uuid
      AND "kind" = 'FOLDER'
    FOR UPDATE
  `);
  const target = targets.at(0);
  if (target === undefined) throw new AccessDeniedException();
  if (
    target.id === access.nodeId ||
    target.kind !== 'FOLDER' ||
    target.dataRoomId !== access.dataRoomId ||
    target.deletedAt !== null
  ) {
    throw new AccessDeniedException();
  }
  const current = await transaction.node.findUnique({ where: { id: access.nodeId } });
  if (current?.deletedAt !== null) throw resourceGone();
  const updated = await transaction.node.updateMany({
    where: {
      id: access.nodeId,
      dataRoomId: access.dataRoomId,
      revision: input.expectedRevision,
      deletedAt: null,
    },
    data: { parentId: input.targetFolderId, revision: { increment: 1 } },
  });
  const after = await transaction.node.findUnique({ where: { id: access.nodeId } });
  if (updated.count === 1 && after?.deletedAt === null) return toNodeSummary(after, 'OWNER');
  if (after?.dataRoomId === access.dataRoomId && after.deletedAt === null) {
    throw new ApiException('CONFLICT', HttpStatus.CONFLICT, 'The node changed.');
  }
  throw resourceGone();
}

function invalidFile(): ApiException {
  return new ApiException(
    'INVALID_FILE',
    HttpStatus.BAD_REQUEST,
    'The node is not an active file.',
  );
}

function resourceGone(): ApiException {
  return new ApiException('RESOURCE_GONE', HttpStatus.GONE, 'The node is no longer available.');
}

function persistenceFailure(message: string): ApiException {
  return new ApiException('INTERNAL_ERROR', HttpStatus.INTERNAL_SERVER_ERROR, message);
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
