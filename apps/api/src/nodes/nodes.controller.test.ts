import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { nodeSummarySchema, type NodeSummary } from '@data-room/contracts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_CONFIG } from '../auth/auth.config.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { authenticatedPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { NodesModule } from './nodes.module.js';
import { NodesService } from './nodes.service.js';

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

describe('NodesController', () => {
  let app: INestApplication | undefined;

  afterEach(async () => app?.close());

  async function createApp(createFolder = vi.fn().mockResolvedValue(responseBody)) {
    const moduleRef = await Test.createTestingModule({ imports: [NodesModule] })
      .overrideProvider(AUTH_CONFIG)
      .useValue({
        issuer: 'http://localhost/auth/v1',
        audience: 'authenticated',
        allowInsecureLoopbackIssuer: true,
      })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(NodesService)
      .useValue({ createFolder })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext): boolean {
          context.switchToHttp().getRequest<{ user?: typeof principal }>().user = principal;
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    return { createFolder };
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
});
