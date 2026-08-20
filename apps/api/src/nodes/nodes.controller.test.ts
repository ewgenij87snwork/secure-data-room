import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  listNodeChildrenResponseSchema,
  nodeSummarySchema,
  nodeBreadcrumbsResponseSchema,
  type ListNodeChildrenResponse,
  type NodeSummary,
  type DeleteImpact,
} from '@data-room/contracts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_CONFIG } from '../auth/auth.config.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { authenticatedPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { NodesModule } from './nodes.module.js';
import { NodesListService } from './nodes-list.service.js';
import { NodesReadService } from './nodes-read.service.js';
import { NodesService } from './nodes.service.js';
import { DeleteService } from './delete.service.js';

const principal = authenticatedPrincipal(
  '11111111-1111-4111-8111-111111111111',
  'owner@example.com',
);
const responseBody: NodeSummary = {
  id: '22222222-2222-4222-8222-222222222222',
  dataRoomId: '33333333-3333-4333-8333-333333333333',
  parentId: '44444444-4444-4444-8444-444444444444',
  kind: 'FOLDER',
  name: 'Legal',
  sizeBytes: null,
  mimeType: null,
  revision: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  isShared: false,
  accessRole: 'OWNER',
};
const childrenResponse: ListNodeChildrenResponse = {
  items: [responseBody],
  pageInfo: { nextCursor: null, hasNextPage: false },
};
const breadcrumbsResponse = { items: [{ id: responseBody.id, name: responseBody.name }] };
const impactResponse: DeleteImpact = {
  rootNodeId: responseBody.id,
  folderCount: 2,
  fileCount: 3,
  totalBytes: '42',
  activeShareCount: 1,
};

describe('NodesController', () => {
  let app: INestApplication | undefined;

  afterEach(async () => app?.close());

  async function createApp(options: { useRealAuth?: boolean } = {}) {
    const createFolder = vi.fn().mockResolvedValue(responseBody);
    const listChildren = vi.fn().mockResolvedValue(childrenResponse);
    const getNode = vi.fn().mockResolvedValue(responseBody);
    const getBreadcrumbs = vi.fn().mockResolvedValue(breadcrumbsResponse);
    const renameNode = vi.fn().mockResolvedValue(responseBody);
    const getDeleteImpact = vi.fn().mockResolvedValue(impactResponse);
    const deleteNode = vi.fn().mockResolvedValue(impactResponse);
    const moduleBuilder = Test.createTestingModule({ imports: [NodesModule] })
      .overrideProvider(AUTH_CONFIG)
      .useValue({
        issuer: 'http://localhost/auth/v1',
        audience: 'authenticated',
        allowInsecureLoopbackIssuer: true,
      })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(NodesService)
      .useValue({ createFolder, renameNode })
      .overrideProvider(DeleteService)
      .useValue({ getDeleteImpact, deleteNode })
      .overrideProvider(NodesListService)
      .useValue({ listChildren })
      .overrideProvider(NodesReadService)
      .useValue({ getNode, getBreadcrumbs });
    if (!options.useRealAuth) {
      moduleBuilder.overrideGuard(JwtAuthGuard).useValue({
        canActivate(context: ExecutionContext): boolean {
          context.switchToHttp().getRequest<{ user?: typeof principal }>().user = principal;
          return true;
        },
      });
    }
    const moduleRef = await moduleBuilder.compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    return {
      createFolder,
      listChildren,
      getNode,
      getBreadcrumbs,
      renameNode,
      getDeleteImpact,
      deleteNode,
    };
  }

  it('creates a folder through the guarded normalized route', async () => {
    const { createFolder } = await createApp();
    const response = await request((requestMessage: IncomingMessage, response: ServerResponse) =>
      (
        app?.getHttpAdapter().getInstance() as (
          message: IncomingMessage,
          reply: ServerResponse,
        ) => void
      )(requestMessage, response),
    )
      .post('/v1/folders')
      .send({ parentId: responseBody.parentId, name: '  Ｌｅｇａｌ  ' })
      .expect(201);

    expect(nodeSummarySchema.parse(response.body as unknown)).toEqual(responseBody);
    expect(createFolder).toHaveBeenCalledWith(principal, {
      parentId: responseBody.parentId,
      name: 'Legal',
    });
  });

  it('returns a safe validation envelope and does not call the service', async () => {
    const { createFolder } = await createApp();
    const response = await request((requestMessage: IncomingMessage, response: ServerResponse) =>
      (
        app?.getHttpAdapter().getInstance() as (
          message: IncomingMessage,
          reply: ServerResponse,
        ) => void
      )(requestMessage, response),
    )
      .post('/v1/folders')
      .send({ parentId: responseBody.parentId, name: '../Legal' })
      .expect(400);

    const body = response.body as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(createFolder).not.toHaveBeenCalled();
  });

  it('lists children with a default and an explicitly coerced page size', async () => {
    const { listChildren } = await createApp();
    const first = await apiRequest().get(`/v1/nodes/${responseBody.parentId}/children`).expect(200);
    expect(listNodeChildrenResponseSchema.parse(first.body as unknown)).toEqual(childrenResponse);
    expect(listChildren).toHaveBeenLastCalledWith(principal, responseBody.parentId, { limit: 50 });

    await apiRequest()
      .get(`/v1/nodes/${responseBody.parentId}/children`)
      .query({ cursor: 'opaque-cursor', limit: '2' })
      .expect(200);
    expect(listChildren).toHaveBeenLastCalledWith(principal, responseBody.parentId, {
      cursor: 'opaque-cursor',
      limit: 2,
    });
  });

  it('reads node detail and breadcrumbs through the guarded routes', async () => {
    const { getNode, getBreadcrumbs } = await createApp();
    const detail = await apiRequest().get(`/v1/nodes/${responseBody.id}`).expect(200);
    expect(nodeSummarySchema.parse(detail.body as unknown)).toEqual(responseBody);
    expect(getNode).toHaveBeenCalledWith(principal, responseBody.id);

    const breadcrumbs = await apiRequest()
      .get(`/v1/nodes/${responseBody.id}/breadcrumbs`)
      .expect(200);
    expect(nodeBreadcrumbsResponseSchema.parse(breadcrumbs.body as unknown)).toEqual(
      breadcrumbsResponse,
    );
    expect(getBreadcrumbs).toHaveBeenCalledWith(principal, responseBody.id);
  });

  it('routes owner node mutations with validated inputs', async () => {
    const { renameNode, getDeleteImpact, deleteNode } = await createApp();
    await apiRequest()
      .patch(`/v1/nodes/${responseBody.id}/name`)
      .send({ name: 'Renamed', expectedRevision: 1 })
      .expect(200);
    expect(renameNode).toHaveBeenCalledWith(principal, responseBody.id, {
      name: 'Renamed',
      expectedRevision: 1,
    });
    await apiRequest().get(`/v1/nodes/${responseBody.id}/delete-impact`).expect(200);
    expect(getDeleteImpact).toHaveBeenCalledWith(principal, responseBody.id);
    await apiRequest().delete(`/v1/nodes/${responseBody.id}`).expect(200);
    expect(deleteNode).toHaveBeenCalledWith(principal, responseBody.id);
  });

  it('rejects malformed mutation inputs before service invocation', async () => {
    const { renameNode, getDeleteImpact, deleteNode } = await createApp();
    await apiRequest()
      .patch(`/v1/nodes/${responseBody.id}/name`)
      .send({ name: 'Renamed', expectedRevision: 0 })
      .expect(400);
    await apiRequest()
      .patch('/v1/nodes/not-a-uuid/name')
      .send({ name: 'Renamed', expectedRevision: 1 })
      .expect(400);
    await apiRequest().get('/v1/nodes/not-a-uuid/delete-impact').expect(400);
    await apiRequest().delete('/v1/nodes/not-a-uuid').expect(400);
    expect(renameNode).not.toHaveBeenCalled();
    expect(getDeleteImpact).not.toHaveBeenCalled();
    expect(deleteNode).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated mutations through the real guard', async () => {
    const { renameNode, getDeleteImpact, deleteNode } = await createApp({ useRealAuth: true });
    await apiRequest()
      .patch(`/v1/nodes/${responseBody.id}/name`)
      .send({ name: 'Renamed', expectedRevision: 1 })
      .expect(401);
    await apiRequest().get(`/v1/nodes/${responseBody.id}/delete-impact`).expect(401);
    await apiRequest().delete(`/v1/nodes/${responseBody.id}`).expect(401);
    expect(renameNode).not.toHaveBeenCalled();
    expect(getDeleteImpact).not.toHaveBeenCalled();
    expect(deleteNode).not.toHaveBeenCalled();
  });

  it('rejects malformed read UUIDs before service invocation', async () => {
    const { getNode, getBreadcrumbs } = await createApp();
    await apiRequest().get('/v1/nodes/not-a-uuid').expect(400);
    await apiRequest().get('/v1/nodes/not-a-uuid/breadcrumbs').expect(400);
    expect(getNode).not.toHaveBeenCalled();
    expect(getBreadcrumbs).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated reads through the real guard before service invocation', async () => {
    const { getNode, getBreadcrumbs } = await createApp({ useRealAuth: true });
    await apiRequest().get(`/v1/nodes/${responseBody.id}`).expect(401);
    await apiRequest().get(`/v1/nodes/${responseBody.id}/breadcrumbs`).expect(401);
    expect(getNode).not.toHaveBeenCalled();
    expect(getBreadcrumbs).not.toHaveBeenCalled();
  });

  it.each(['0', '101', '-1', '1.5', 'not-a-number'])(
    'rejects invalid page size %s before service invocation',
    async (limit) => {
      const { listChildren } = await createApp();
      const response = await apiRequest()
        .get(`/v1/nodes/${responseBody.parentId}/children`)
        .query({ limit })
        .expect(400);
      expect((response.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
      expect(listChildren).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['/v1/nodes/not-a-uuid/children', {}],
    [`/v1/nodes/${responseBody.parentId}/children`, { cursor: 'a'.repeat(513) }],
  ])('rejects invalid route input before listing', async (path, query) => {
    const { listChildren } = await createApp();
    const response = await apiRequest().get(path).query(query).expect(400);
    expect((response.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
    expect(listChildren).not.toHaveBeenCalled();
  });

  function apiRequest() {
    return request((requestMessage: IncomingMessage, response: ServerResponse) =>
      (
        app?.getHttpAdapter().getInstance() as (
          message: IncomingMessage,
          reply: ServerResponse,
        ) => void
      )(requestMessage, response),
    );
  }
});
