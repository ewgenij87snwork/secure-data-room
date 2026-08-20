import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { DeleteImpact } from '@data-room/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedPrincipal } from '../auth/principal.js';
import {
  AccessDeniedException,
  AccessPolicyService,
  type OwnedNode,
} from '../access-control/access-policy.service.js';
import { ApiException } from '../common/api-exception.js';
import {
  deleteImpactQuery,
  deletionReceiptQuery,
  deleteSubtreeQuery,
  lockDeleteTargetQuery,
  type DeleteImpactRow,
  type DeleteMutationRow,
  type LockedDeleteTargetRow,
} from './delete.queries.js';

interface DeleteTransaction {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

export interface DeleteDatabase extends DeleteTransaction {
  $transaction<T>(
    callback: (transaction: DeleteTransaction) => Promise<T>,
    options: { isolationLevel: Prisma.TransactionIsolationLevel },
  ): Promise<T>;
}

@Injectable()
export class DeleteService {
  constructor(
    @Inject(PrismaService) private readonly prisma: DeleteDatabase,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async getDeleteImpact(principal: AuthenticatedPrincipal, nodeId: string): Promise<DeleteImpact> {
    const access = await this.accessPolicy.assertCanManageNode(principal, nodeId);
    try {
      const rows = await this.prisma.$queryRaw<DeleteImpactRow[]>(
        deleteImpactQuery(access.dataRoomId, nodeId),
      );
      return impactFromRow(requireCompleteImpact(rows[0]));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw internalDeleteError('Delete impact failed.');
    }
  }

  async deleteNode(principal: AuthenticatedPrincipal, nodeId: string): Promise<DeleteImpact> {
    const access = await this.authorizeDeleteOrReadReceipt(principal, nodeId);
    if (access === null) return emptyImpact(nodeId);
    if (access.parentId === null) throw rootDeleteConflict();

    try {
      return await this.deleteWithOneSerializationRetry(principal, access);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw internalDeleteError('Node deletion failed.');
    }
  }

  private async authorizeDeleteOrReadReceipt(
    principal: AuthenticatedPrincipal,
    nodeId: string,
  ): Promise<OwnedNode | null> {
    try {
      return await this.accessPolicy.assertCanManageNode(principal, nodeId);
    } catch (error) {
      if (!(error instanceof AccessDeniedException)) throw error;
      try {
        const receipt = await this.prisma.$queryRaw<Readonly<{ id: string }>[]>(
          deletionReceiptQuery(principal.userId, nodeId),
        );
        if (receipt[0]?.id === nodeId) return null;
      } catch {
        // Preserve the policy's non-revealing denial when no receipt can be proved.
      }
      throw error;
    }
  }

  private async deleteWithOneSerializationRetry(
    principal: AuthenticatedPrincipal,
    access: OwnedNode,
  ): Promise<DeleteImpact> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          (transaction) => this.deleteInTransaction(transaction, principal, access),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (attempt === 0 && isSerializationConflict(error)) continue;
        throw error;
      }
    }
    throw internalDeleteError('Node deletion failed.');
  }

  private async deleteInTransaction(
    transaction: DeleteTransaction,
    principal: AuthenticatedPrincipal,
    access: OwnedNode,
  ): Promise<DeleteImpact> {
    const lockedRows = await transaction.$queryRaw<LockedDeleteTargetRow[]>(
      lockDeleteTargetQuery(principal.userId, access.dataRoomId, access.nodeId),
    );
    const locked = lockedRows[0];
    if (!locked) throw resourceGone();
    if (locked.deletedAt !== null) {
      if (locked.cleanupJobExists) return emptyImpact(access.nodeId);
      throw resourceGone();
    }
    if (locked.parentId === null) throw rootDeleteConflict();

    const deletedAt = new Date();
    const rows = await transaction.$queryRaw<DeleteMutationRow[]>(
      deleteSubtreeQuery(access.dataRoomId, access.nodeId, deletedAt),
    );
    const row = requireCompleteImpact(rows[0]);
    const expectedTombstones = row.folderCount + row.fileCount + 1;
    if (row.tombstonedCount !== expectedTombstones) {
      throw internalDeleteError('Node deletion failed.');
    }
    return impactFromRow(row);
  }
}

function requireCompleteImpact<T extends DeleteImpactRow>(row: T | undefined): T {
  if (!row?.rootExists) throw resourceGone();
  if (!row.traversalComplete) throw internalDeleteError('Subtree traversal failed.');
  return row;
}

function impactFromRow(row: DeleteImpactRow): DeleteImpact {
  return Object.freeze({
    rootNodeId: row.rootNodeId,
    folderCount: row.folderCount,
    fileCount: row.fileCount,
    totalBytes: String(row.totalBytes),
    activeShareCount: row.activeShareCount,
  });
}

function emptyImpact(rootNodeId: string): DeleteImpact {
  return Object.freeze({
    rootNodeId,
    folderCount: 0,
    fileCount: 0,
    totalBytes: '0',
    activeShareCount: 0,
  });
}

function rootDeleteConflict(): ApiException {
  return new ApiException('CONFLICT', HttpStatus.CONFLICT, 'The room root cannot be deleted.');
}

function resourceGone(): ApiException {
  return new ApiException('RESOURCE_GONE', HttpStatus.GONE, 'The node is no longer available.');
}

function internalDeleteError(message: string): ApiException {
  return new ApiException('INTERNAL_ERROR', HttpStatus.INTERNAL_SERVER_ERROR, message);
}

function isSerializationConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && error.code === 'P2034') return true;
  if (!('meta' in error) || typeof error.meta !== 'object' || error.meta === null) return false;
  return 'code' in error.meta && error.meta.code === '40001';
}
