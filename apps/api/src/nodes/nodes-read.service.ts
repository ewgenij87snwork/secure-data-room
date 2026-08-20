import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { BreadcrumbItem, NodeBreadcrumbsResponse, NodeSummary } from '@data-room/contracts';
import type { Prisma } from '../generated/prisma/client.js';
import type { AccessPrincipal } from '../access-control/access-policy.types.js';
import {
  AccessDeniedException,
  AccessPolicyService,
} from '../access-control/access-policy.service.js';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import { activeNodeQuery, breadcrumbQuery, type BreadcrumbRow } from './node.read.queries.js';
import { toNodeSummary, type NodeRow } from './node-summary.js';

export interface NodesReadDatabase {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

@Injectable()
export class NodesReadService {
  constructor(
    @Inject(PrismaService) private readonly prisma: NodesReadDatabase,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async getNode(principal: AccessPrincipal, nodeId: string): Promise<NodeSummary> {
    const access = await this.accessPolicy.assertCanReadNode(principal, nodeId);
    try {
      const rows = await this.prisma.$queryRaw<NodeRow[]>(
        activeNodeQuery(access.dataRoomId, nodeId),
      );
      const row = rows[0];
      if (!row) throw new AccessDeniedException();
      return toNodeSummary(row, access.accessRole);
    } catch (error) {
      return readFailure(error, 'Node read failed.');
    }
  }

  async getBreadcrumbs(
    principal: AccessPrincipal,
    nodeId: string,
  ): Promise<NodeBreadcrumbsResponse> {
    const access = await this.accessPolicy.assertCanReadNode(principal, nodeId);
    try {
      const rows = await this.prisma.$queryRaw<BreadcrumbRow[]>(
        breadcrumbQuery(access.dataRoomId, nodeId, access.accessRootNodeId),
      );
      if (!hasCompletePath(rows, access.accessRootNodeId, nodeId)) {
        throw new AccessDeniedException();
      }
      return freezeBreadcrumbs(rows);
    } catch (error) {
      return readFailure(error, 'Breadcrumb lookup failed.');
    }
  }
}

function freezeBreadcrumbs(rows: BreadcrumbRow[]): NodeBreadcrumbsResponse {
  const items: BreadcrumbItem[] = rows.map(({ id, name }) => Object.freeze({ id, name }));
  Object.freeze(items);
  return Object.freeze({ items });
}

function hasCompletePath(rows: BreadcrumbRow[], rootId: string, nodeId: string): boolean {
  return rows.length > 0 && rows[0]?.id === rootId && rows.at(-1)?.id === nodeId;
}

function readFailure(error: unknown, message: string): never {
  if (error instanceof HttpException) throw error;
  throw new ApiException('INTERNAL_ERROR', HttpStatus.INTERNAL_SERVER_ERROR, message);
}
