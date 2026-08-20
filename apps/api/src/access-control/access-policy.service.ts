import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { isAuthenticatedPrincipal, type AuthenticatedPrincipal } from '../auth/principal.js';
import { accessPolicyQuery, type AccessPolicyRow } from './access-policy.queries.js';
import type { AccessPrincipal } from './access-policy.types.js';
import { isPublicLinkPrincipal } from './access-policy.types.js';

export interface AccessPolicyDatabase {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

export { AccessDeniedException };
export { AccessInternalException };
export type { AccessPolicyRow };
export { publicLinkPrincipal } from './access-policy.types.js';

type NodeAccess = Readonly<{
  nodeId: string;
  dataRoomId: string;
  parentId: string | null;
  kind: 'FOLDER' | 'FILE';
  accessRole: 'OWNER' | 'VIEWER' | 'EDITOR';
  accessRootNodeId: string;
}>;

export type AccessibleNode = NodeAccess;
export type OwnedNode = NodeAccess & Readonly<{ accessRole: 'OWNER' }>;
export type OwnedFolder = OwnedNode & Readonly<{ kind: 'FOLDER' }>;

class AccessDeniedException extends ForbiddenException {
  constructor() {
    super({
      error: {
        code: 'ACCESS_DENIED',
        message: 'Access denied.',
        requestId: randomUUID(),
      },
    });
  }
}

class AccessInternalException extends InternalServerErrorException {
  constructor() {
    super({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Access policy unavailable.',
        requestId: randomUUID(),
      },
    });
  }
}

@Injectable()
export class AccessPolicyService {
  constructor(@Inject(PrismaService) private readonly prisma: AccessPolicyDatabase) {}

  async assertCanReadNode(principal: AccessPrincipal, nodeId: string): Promise<AccessibleNode> {
    if (!isAuthenticatedPrincipal(principal) && !isPublicLinkPrincipal(principal)) {
      throw new AccessDeniedException();
    }
    const policy = await this.readPolicy(principal, nodeId);
    const isOwner = !isPublicLinkPrincipal(principal) && policy.ownerId === principal.userId;
    if (
      !policy.targetExists ||
      policy.hasDeletedAncestor ||
      (!isOwner && policy.winningRole === null)
    ) {
      throw new AccessDeniedException();
    }
    if (isOwner) return toAccessRecord(policy, 'OWNER');
    const winningRole = policy.winningRole;
    if (winningRole === null) throw new AccessDeniedException();
    return toAccessRecord(policy, winningRole);
  }

  async assertCanManageNode(
    authenticated: AuthenticatedPrincipal,
    nodeId: string,
  ): Promise<OwnedNode> {
    if (!isAuthenticatedPrincipal(authenticated)) throw new AccessDeniedException();
    const policy = await this.readPolicy(authenticated, nodeId);
    if (
      !policy.targetExists ||
      policy.hasDeletedAncestor ||
      policy.ownerId !== authenticated.userId
    ) {
      throw new AccessDeniedException();
    }
    return toAccessRecord(policy, 'OWNER');
  }

  async assertCanCreateChild(
    authenticated: AuthenticatedPrincipal,
    parentId: string,
  ): Promise<OwnedFolder> {
    if (!isAuthenticatedPrincipal(authenticated)) throw new AccessDeniedException();
    const policy = await this.readPolicy(authenticated, parentId);
    if (
      !policy.targetExists ||
      policy.hasDeletedAncestor ||
      policy.targetKind !== 'FOLDER' ||
      policy.ownerId !== authenticated.userId
    ) {
      throw new AccessDeniedException();
    }
    return toOwnedFolderRecord(policy);
  }

  private async readPolicy(principal: AccessPrincipal, nodeId: string): Promise<AccessPolicyRow> {
    try {
      const rows = await this.prisma.$queryRaw<AccessPolicyRow[]>(
        accessPolicyQuery(principal, nodeId),
      );
      return rows[0] ?? deniedPolicy;
    } catch {
      throw new AccessInternalException();
    }
  }
}

const deniedPolicy: AccessPolicyRow = Object.freeze({
  targetId: null,
  targetExists: false,
  targetKind: null,
  parentId: null,
  dataRoomId: null,
  ownerId: null,
  hasDeletedAncestor: true,
  roomRootNodeId: null,
  winningRole: null,
  winningShareId: null,
  winningTargetNodeId: null,
  winningAccessRootNodeId: null,
});

function toAccessRecord(policy: AccessPolicyRow, accessRole: 'OWNER'): OwnedNode;
function toAccessRecord(policy: AccessPolicyRow, accessRole: 'VIEWER' | 'EDITOR'): AccessibleNode;
function toAccessRecord(
  policy: AccessPolicyRow,
  accessRole: 'OWNER' | 'VIEWER' | 'EDITOR',
): NodeAccess {
  if (
    policy.targetId === null ||
    policy.targetKind === null ||
    policy.dataRoomId === null ||
    policy.roomRootNodeId === null
  ) {
    throw new AccessDeniedException();
  }
  const accessRootNodeId =
    accessRole === 'OWNER' ? policy.roomRootNodeId : policy.winningAccessRootNodeId;
  if (accessRootNodeId === null) throw new AccessDeniedException();
  return Object.freeze({
    nodeId: policy.targetId,
    dataRoomId: policy.dataRoomId,
    parentId: policy.parentId,
    kind: policy.targetKind,
    accessRole,
    accessRootNodeId,
  });
}

function toOwnedFolderRecord(policy: AccessPolicyRow): OwnedFolder {
  if (policy.targetKind !== 'FOLDER') throw new AccessDeniedException();
  const owned = toAccessRecord(policy, 'OWNER');
  return Object.freeze({ ...owned, kind: 'FOLDER' as const });
}
