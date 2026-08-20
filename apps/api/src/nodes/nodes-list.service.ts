import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { AccessRole, ListNodeChildrenResponse, PaginationQuery } from '@data-room/contracts';
import type { Prisma } from '../generated/prisma/client.js';
import type { AccessPrincipal } from '../access-control/access-policy.types.js';
import {
  AccessPolicyService,
  type AccessibleNode,
} from '../access-control/access-policy.service.js';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import { decodeNodeCursor, encodeNodeCursor, type NodeCursor } from './node-cursor.js';
import { activeChildrenQuery, nodeCursorAnchorQuery } from './node.queries.js';
import { toNodeSummary, type NodeRow } from './node-summary.js';

export interface NodesListDatabase {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

type FolderAccess = AccessibleNode & Readonly<{ kind: 'FOLDER' }>;

@Injectable()
export class NodesListService {
  constructor(
    @Inject(PrismaService) private readonly prisma: NodesListDatabase,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async listChildren(
    principal: AccessPrincipal,
    parentId: string,
    query: PaginationQuery,
  ): Promise<ListNodeChildrenResponse> {
    const access = await this.accessPolicy.assertCanReadNode(principal, parentId);
    assertFolder(access);
    const cursor = query.cursor ? decodeNodeCursor(query.cursor) : null;
    try {
      return await this.readPage(access, parentId, cursor, query.limit);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ApiException(
        'INTERNAL_ERROR',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Node listing failed.',
      );
    }
  }

  private async readPage(
    access: FolderAccess,
    parentId: string,
    cursor: NodeCursor | null,
    limit: number,
  ): Promise<ListNodeChildrenResponse> {
    if (cursor) await this.assertCursorAnchor(access.dataRoomId, parentId, cursor);
    const rows = await this.prisma.$queryRaw<NodeRow[]>(
      activeChildrenQuery(access.dataRoomId, parentId, cursor, limit + 1),
    );
    return toChildrenPage(rows, limit, access.accessRole);
  }

  private async assertCursorAnchor(
    dataRoomId: string,
    parentId: string,
    cursor: NodeCursor,
  ): Promise<void> {
    const anchors = await this.prisma.$queryRaw<{ id: string }[]>(
      nodeCursorAnchorQuery(dataRoomId, parentId, cursor),
    );
    if (!anchors[0]) throw invalidCursor();
  }
}

function assertFolder(access: AccessibleNode): asserts access is FolderAccess {
  if (access.kind !== 'FOLDER') {
    throw new ApiException(
      'INVALID_PARENT',
      HttpStatus.BAD_REQUEST,
      'Children can only be listed for a folder.',
    );
  }
}

function toChildrenPage(
  rows: NodeRow[],
  limit: number,
  accessRole: AccessRole,
): ListNodeChildrenResponse {
  const hasNextPage = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);
  const nextCursor = hasNextPage && last ? encodeNodeCursor(toCursor(last)) : null;
  const items = Object.freeze(pageRows.map((row) => toNodeSummary(row, accessRole)));
  return Object.freeze({
    items,
    pageInfo: Object.freeze({ nextCursor, hasNextPage }),
  }) as ListNodeChildrenResponse;
}

function toCursor(row: NodeRow): NodeCursor {
  return { kind: row.kind, normalizedName: row.normalizedName, id: row.id };
}

function invalidCursor(): ApiException {
  return new ApiException(
    'VALIDATION_FAILED',
    HttpStatus.BAD_REQUEST,
    'Pagination cursor is invalid.',
  );
}
