import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { FinalizeUploadResponse, PrepareUploadRequest } from '@data-room/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedPrincipal } from '../auth/principal.js';
import { AccessPolicyService } from '../access-control/access-policy.service.js';
import {
  RuntimeControlsService,
  type RuntimeControlsTransaction,
} from '../runtime-controls/runtime-controls.service.js';
import { ApiException } from '../common/api-exception.js';
import { normalizedNodeName } from '../nodes/node-name.service.js';
import { StorageService } from '../storage/storage.service.js';
import { UploadQuotaService } from './upload-quota.service.js';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const PDF_SIGNATURE = new Uint8Array([37, 80, 68, 70, 45]);
const MAX_FINALIZE_RETRIES = 3;
const MAX_PREPARE_RETRIES = 3;

export type UploadSessionRow = Readonly<{
  id: string;
  ownerId: string;
  parentNodeId: string;
  clientId: string;
  storageKey: string;
  requestedName: string;
  normalizedName: string;
  expectedSizeBytes: bigint;
  mimeType: string;
  status: string;
  expiresAt: Date;
  fileNodeId: string | null;
}>;

type NodeRow = Readonly<{ id: string; name: string }>;

export interface UploadDelegates {
  uploadSession: {
    create(args: { data: Record<string, unknown> }): Promise<UploadSessionRow>;
    findUnique(args: { where: Record<string, unknown> }): Promise<UploadSessionRow | null>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  node: {
    create(args: { data: Record<string, unknown> }): Promise<NodeRow>;
    findUnique(args: { where: Record<string, string> }): Promise<NodeRow | null>;
  };
}

export interface UploadTransaction extends UploadDelegates, RuntimeControlsTransaction {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

interface UploadDatabase extends UploadDelegates {
  $transaction<T>(
    callback: (transaction: UploadTransaction) => Promise<T>,
    options?: { isolationLevel: Prisma.TransactionIsolationLevel },
  ): Promise<T>;
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

@Injectable()
export class UploadsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: UploadDatabase,
    private readonly accessPolicy: AccessPolicyService,
    private readonly runtimeControls: RuntimeControlsService,
    @Inject(StorageService) private readonly storage: StorageService,
    private readonly quota: UploadQuotaService,
  ) {}

  async prepare(principal: AuthenticatedPrincipal, input: PrepareUploadRequest) {
    const parent = await this.accessPolicy.assertCanCreateChild(principal, input.parentId);
    let sessions: UploadSessionRow[] = [];
    let now = new Date();
    for (let attempt = 1; attempt <= MAX_PREPARE_RETRIES; attempt += 1) {
      now = new Date();
      try {
        sessions = await this.prisma.$transaction(
          (tx) => this.prepareInTransaction(tx, principal, input, parent, now),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        break;
      } catch (error) {
        if (!isRetryableTransactionConflict(error)) throw error;
        if (attempt === MAX_PREPARE_RETRIES)
          throw new ApiException('CONFLICT', HttpStatus.CONFLICT, 'Upload preparation conflicted.');
      }
    }

    const signed = await Promise.allSettled(
      sessions.map((session) => this.signSession(session, now)),
    );
    const uploads = signed.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    if (uploads.length === 0)
      throw new ApiException(
        'INTERNAL_ERROR',
        HttpStatus.SERVICE_UNAVAILABLE,
        'Upload provider unavailable.',
      );
    return { uploads };
  }

  private async signSession(session: UploadSessionRow, now: Date) {
    let capability: Awaited<ReturnType<StorageService['createSignedUpload']>>;
    try {
      capability = await this.storage.createSignedUpload(session.storageKey);
    } catch (error) {
      const rejected = await this.prisma.uploadSession.updateMany({
        where: {
          id: session.id,
          ownerId: session.ownerId,
          clientId: session.clientId,
          storageKey: session.storageKey,
          status: 'PREPARED',
        },
        data: { status: 'REJECTED' },
      });
      if (rejected.count === 1) {
        try {
          await this.storage.remove([session.storageKey]);
        } catch {
          /* durable REJECTED state is the cleanup source */
        }
      }
      throw error;
    }

    const activated = await this.prisma.uploadSession.updateMany({
      where: {
        id: session.id,
        ownerId: session.ownerId,
        clientId: session.clientId,
        storageKey: session.storageKey,
        status: 'PREPARED',
      },
      data: { status: 'UPLOADING' },
    });
    if (activated.count !== 1) {
      const current = await this.prisma.uploadSession.findUnique({ where: { id: session.id } });
      if (
        !current?.ownerId ||
        current.ownerId !== session.ownerId ||
        current.clientId !== session.clientId ||
        current.storageKey !== session.storageKey ||
        current.status !== 'UPLOADING'
      ) {
        try {
          await this.storage.remove([session.storageKey]);
        } catch {
          /* no capability is returned for terminal state */
        }
        throw uploadGone();
      }
    }
    const expiresAt = new Date(
      Math.min(capability.expiresAt.getTime(), now.getTime() + SESSION_TTL_MS),
    );
    return {
      clientId: session.clientId,
      sessionId: session.id,
      bucketName: capability.bucketName,
      storageKey: session.storageKey,
      tusEndpoint: capability.tusEndpoint,
      uploadToken: capability.token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async prepareInTransaction(
    tx: UploadTransaction,
    principal: AuthenticatedPrincipal,
    input: PrepareUploadRequest,
    parent: { nodeId: string; dataRoomId: string },
    now: Date,
  ): Promise<UploadSessionRow[]> {
    const parentRows = await tx.$queryRaw<
      Readonly<{
        id: string;
        dataRoomId: string;
        ownerId: string;
        kind: string;
        deletedAt: Date | null;
      }>[]
    >(Prisma.sql`
      SELECT n.id, n."dataRoomId", r."ownerId", n.kind, n."deletedAt"
      FROM "Node" n
      JOIN "DataRoom" r ON r.id = n."dataRoomId"
      WHERE n.id = ${parent.nodeId}::uuid
        AND n."dataRoomId" = ${parent.dataRoomId}::uuid
        AND r."ownerId" = ${principal.userId}::uuid
        AND n.kind = 'FOLDER'
        AND n."deletedAt" IS NULL
      FOR UPDATE OF n, r
    `);
    const lockedParent = parentRows[0];
    if (
      !lockedParent?.id ||
      lockedParent.id !== parent.nodeId ||
      lockedParent.dataRoomId !== parent.dataRoomId ||
      lockedParent.ownerId !== principal.userId ||
      lockedParent.kind !== 'FOLDER' ||
      lockedParent.deletedAt !== null
    )
      throw uploadGone();
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "UserProfile" WHERE id = ${principal.userId}::uuid FOR UPDATE`,
    );
    const sessions: UploadSessionRow[] = [];
    const creates: { data: Record<string, unknown> }[] = [];
    const reinitializations: { id: string; data: Record<string, unknown> }[] = [];
    let newReservations = 0;
    let newBytes = 0;
    for (const file of input.files) {
      const existing = await tx.uploadSession.findUnique({
        where: { ownerId_clientId: { ownerId: principal.userId, clientId: file.clientId } },
      });
      const expected = {
        ownerId: principal.userId,
        parentNodeId: parent.nodeId,
        clientId: file.clientId,
        requestedName: file.name,
        normalizedName: normalizedNodeName(file.name),
        expectedSizeBytes: BigInt(file.sizeBytes),
        mimeType: 'application/pdf',
      };
      if (existing) {
        if (!sameUploadRequest(existing, expected)) throw uploadGone();
        if (existing.status === 'FINALIZED') throw uploadGone();
        if (existing.status === 'PREPARED' || existing.status === 'UPLOADING') {
          sessions.push(existing);
          continue;
        }
        const storageKey = `rooms/${parent.dataRoomId}/objects/${crypto.randomUUID()}`;
        const data = {
          ...expected,
          storageKey,
          status: 'PREPARED',
          expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
          finalizedAt: null,
          fileNodeId: null,
        };
        reinitializations.push({ id: existing.id, data });
        sessions.push({
          ...existing,
          ...expected,
          storageKey,
          status: 'PREPARED',
          expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
          fileNodeId: null,
        });
        newReservations += 1;
        newBytes += file.sizeBytes;
        continue;
      }
      newReservations += 1;
      newBytes += file.sizeBytes;
      creates.push({
        data: {
          ...expected,
          storageKey: `rooms/${parent.dataRoomId}/objects/${crypto.randomUUID()}`,
          expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        },
      });
    }
    const controls = await this.runtimeControls.read(tx);
    if (controls.maintenanceMode)
      throw new ApiException(
        'MAINTENANCE_MODE',
        HttpStatus.SERVICE_UNAVAILABLE,
        'The service is in maintenance mode.',
      );
    if (!controls.uploadsEnabled)
      throw new ApiException(
        'UPLOADS_DISABLED',
        HttpStatus.SERVICE_UNAVAILABLE,
        'Uploads are disabled.',
      );
    await this.quota.assertBatchFits(tx, principal.userId, newReservations, newBytes);
    for (const plan of reinitializations) {
      const updated = await tx.uploadSession.updateMany({
        where: {
          id: plan.id,
          ownerId: principal.userId,
          status: { in: ['CANCELLED', 'REJECTED', 'EXPIRED'] },
        },
        data: plan.data,
      });
      if (updated.count !== 1) throw uploadGone();
    }
    for (const plan of creates) sessions.push(await tx.uploadSession.create(plan));
    return sessions;
  }

  async finalize(
    principal: AuthenticatedPrincipal,
    sessionId: string,
    input: { clientId: string },
  ): Promise<FinalizeUploadResponse> {
    const first = await this.prisma.uploadSession.findUnique({ where: { id: sessionId } });
    if (!first?.ownerId || first.ownerId !== principal.userId || first.clientId !== input.clientId)
      throw uploadGone();
    if (first.status === 'FINALIZED' && first.fileNodeId)
      return this.existingResult(first, input.clientId);
    if (first.status === 'CANCELLED' || first.status === 'REJECTED' || first.status === 'EXPIRED')
      throw uploadGone();
    if (first.expiresAt.getTime() <= Date.now()) return this.expire(first);
    await this.verifyObject(first);

    for (let attempt = 0; attempt < MAX_FINALIZE_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          (tx) => this.finalizeInTransaction(tx, sessionId, principal.userId, input.clientId),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof HttpException) throw error;
        if (!isRetryableTransactionConflict(error))
          throw new ApiException(
            'INTERNAL_ERROR',
            HttpStatus.INTERNAL_SERVER_ERROR,
            'The upload could not be finalized.',
          );
        if (attempt === MAX_FINALIZE_RETRIES - 1)
          throw new ApiException(
            'CONFLICT',
            HttpStatus.CONFLICT,
            'Upload finalization conflicted.',
          );
      }
    }
    throw new ApiException('CONFLICT', HttpStatus.CONFLICT, 'Upload finalization conflicted.');
  }

  async cancel(principal: AuthenticatedPrincipal, sessionId: string): Promise<void> {
    const session = await this.prisma.uploadSession.findUnique({ where: { id: sessionId } });
    if (!session?.ownerId || session.ownerId !== principal.userId || session.status === 'FINALIZED')
      return;
    const changed = await this.prisma.uploadSession.updateMany({
      where: { id: session.id, ownerId: principal.userId, status: { not: 'FINALIZED' } },
      data: { status: 'CANCELLED' },
    });
    if (changed.count > 0) {
      try {
        await this.storage.remove([session.storageKey]);
      } catch {
        /* cleanup is best effort */
      }
    }
  }

  private async finalizeInTransaction(
    tx: UploadTransaction,
    sessionId: string,
    ownerId: string,
    clientId: string,
  ): Promise<FinalizeUploadResponse> {
    const locked = await tx.$queryRaw<UploadSessionRow[]>(
      Prisma.sql`SELECT id, "ownerId", "parentNodeId", "clientId", "storageKey", "requestedName", "normalizedName", "expectedSizeBytes", "mimeType", status, "expiresAt", "fileNodeId" FROM "UploadSession" WHERE id = ${sessionId}::uuid FOR UPDATE`,
    );
    const current = locked[0];
    if (!current?.ownerId || current.ownerId !== ownerId || current.clientId !== clientId)
      throw uploadGone();
    if (current.status === 'FINALIZED' && current.fileNodeId)
      return this.existingResult(current, clientId, tx);
    if (current.status !== 'PREPARED' && current.status !== 'UPLOADING') throw uploadGone();
    if (current.expiresAt.getTime() <= Date.now()) {
      const expired = await tx.uploadSession.updateMany({
        where: { id: current.id, status: { in: ['PREPARED', 'UPLOADING'] } },
        data: { status: 'EXPIRED' },
      });
      if (expired.count !== 1) throw uploadGone();
      throw new ApiException('UPLOAD_EXPIRED', HttpStatus.GONE, 'The upload session has expired.');
    }
    const parentRows = await tx.$queryRaw<
      Readonly<{
        id: string;
        dataRoomId: string;
        ownerId: string;
        kind: string;
        deletedAt: Date | null;
      }>[]
    >(Prisma.sql`
      SELECT n.id, n."dataRoomId", r."ownerId", n.kind, n."deletedAt"
      FROM "Node" n
      JOIN "DataRoom" r ON r.id = n."dataRoomId"
      WHERE n.id = ${current.parentNodeId}::uuid
      FOR UPDATE OF n, r
    `);
    const parent = parentRows[0];
    if (
      !parent?.ownerId ||
      parent.ownerId !== current.ownerId ||
      parent.kind !== 'FOLDER' ||
      parent.deletedAt !== null
    )
      throw uploadGone();
    const candidates = Array.from({ length: 101 }, (_, suffix) =>
      suffix === 0 ? current.requestedName : uploadSuffixName(current.requestedName, suffix),
    );
    const occupied = await tx.$queryRaw<Readonly<{ normalizedName: string }>[]>(
      Prisma.sql`SELECT "normalizedName" FROM "Node" WHERE "parentId" = ${parent.id}::uuid AND "deletedAt" IS NULL AND "normalizedName" IN (${Prisma.join(candidates.map(normalizedNodeName))})`,
    );
    const used = new Set(occupied.map((row) => row.normalizedName));
    const suffix = candidates.findIndex((name) => !used.has(normalizedNodeName(name)));
    if (suffix < 0)
      throw new ApiException('CONFLICT', HttpStatus.CONFLICT, 'No available filename exists.');
    const selectedName = candidates[suffix];
    if (selectedName === undefined)
      throw new ApiException('CONFLICT', HttpStatus.CONFLICT, 'No available filename exists.');
    const node = await tx.node.create({
      data: {
        dataRoomId: parent.dataRoomId,
        parentId: parent.id,
        kind: 'FILE',
        name: selectedName,
        normalizedName: normalizedNodeName(selectedName),
        sizeBytes: current.expectedSizeBytes,
        mimeType: 'application/pdf',
        storageKey: current.storageKey,
      },
    });
    const finalized = await tx.uploadSession.updateMany({
      where: {
        id: current.id,
        ownerId: current.ownerId,
        clientId,
        status: { in: ['PREPARED', 'UPLOADING'] },
        fileNodeId: null,
      },
      data: { status: 'FINALIZED', finalizedAt: new Date(), fileNodeId: node.id },
    });
    if (finalized.count !== 1)
      throw new ApiException('CONFLICT', HttpStatus.CONFLICT, 'Upload finalization conflicted.');
    return { clientId, nodeId: node.id, finalName: node.name, conflictResolved: suffix > 0 };
  }

  private async verifyObject(session: UploadSessionRow): Promise<void> {
    try {
      const metadata = await this.storage.getMetadata(session.storageKey);
      if (
        metadata?.sizeBytes !== Number(session.expectedSizeBytes) ||
        metadata.contentType?.toLowerCase() !== 'application/pdf'
      )
        throw notReady();
      const prefix = await this.storage.readPrefix(session.storageKey, PDF_SIGNATURE.length);
      if (!startsWith(prefix, PDF_SIGNATURE)) throw notReady();
    } catch (error) {
      if (error instanceof ApiException) throw error;
      throw notReady();
    }
  }

  private async expire(session: UploadSessionRow): Promise<never> {
    await this.prisma.uploadSession.updateMany({
      where: { id: session.id, status: { in: ['PREPARED', 'UPLOADING'] } },
      data: { status: 'EXPIRED' },
    });
    throw new ApiException('UPLOAD_EXPIRED', HttpStatus.GONE, 'The upload session has expired.');
  }

  private async existingResult(
    session: UploadSessionRow,
    clientId: string,
    tx?: UploadTransaction,
  ): Promise<FinalizeUploadResponse> {
    const node = tx
      ? await tx.node.findUnique({ where: { id: session.fileNodeId! } })
      : await this.prisma.node.findUnique({ where: { id: session.fileNodeId! } });
    if (!node) throw uploadGone();
    return {
      clientId,
      nodeId: node.id,
      finalName: node.name,
      conflictResolved: node.name !== session.requestedName,
    };
  }
}

function startsWith(value: Uint8Array, prefix: Uint8Array): boolean {
  return prefix.every((byte, index) => value[index] === byte);
}
function uploadSuffixName(name: string, suffixNumber: number): string {
  const suffix = ` (${suffixNumber})`;
  const extensionIndex = name.lastIndexOf('.');
  const extension = extensionIndex > 0 ? name.slice(extensionIndex) : '';
  const stem = extension ? name.slice(0, extensionIndex) : name;
  return `${stem.slice(0, Math.max(1, 120 - suffix.length - extension.length))}${suffix}${extension}`;
}
function uploadGone(): ApiException {
  return new ApiException(
    'RESOURCE_GONE',
    HttpStatus.GONE,
    'The upload session is no longer available.',
  );
}
function notReady(): ApiException {
  return new ApiException(
    'UPLOAD_NOT_READY',
    HttpStatus.CONFLICT,
    'The uploaded PDF is not ready.',
  );
}
function isRetryableTransactionConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = 'code' in error ? error.code : undefined;
  if (code === 'P2002' || code === 'P2034' || code === '23505' || code === '40001') return true;
  const meta =
    'meta' in error && typeof error.meta === 'object' && error.meta !== null
      ? error.meta
      : undefined;
  if (meta && 'code' in meta && (meta.code === '40001' || meta.code === 'P2034')) return true;
  const adapter =
    meta &&
    'driverAdapterError' in meta &&
    typeof meta.driverAdapterError === 'object' &&
    meta.driverAdapterError !== null
      ? meta.driverAdapterError
      : undefined;
  const cause =
    adapter && 'cause' in adapter && typeof adapter.cause === 'object' && adapter.cause !== null
      ? adapter.cause
      : undefined;
  return (
    Boolean(cause && 'kind' in cause && cause.kind === 'TransactionWriteConflict') ||
    Boolean(cause && 'originalCode' in cause && cause.originalCode === '40001')
  );
}

function sameUploadRequest(
  session: UploadSessionRow,
  expected: {
    ownerId: string;
    parentNodeId: string;
    clientId: string;
    requestedName: string;
    normalizedName: string;
    expectedSizeBytes: bigint;
    mimeType: string;
  },
): boolean {
  return (
    session.ownerId === expected.ownerId &&
    session.parentNodeId === expected.parentNodeId &&
    session.clientId === expected.clientId &&
    session.requestedName === expected.requestedName &&
    session.normalizedName === expected.normalizedName &&
    session.expectedSizeBytes === expected.expectedSizeBytes &&
    session.mimeType === expected.mimeType
  );
}
