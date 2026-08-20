import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { BootstrapResponse } from '@data-room/contracts';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from './app.module.js';
import { AUTH_CONFIG } from './auth/auth.config.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { authenticatedPrincipal, type AuthenticatedPrincipal } from './auth/principal.js';
import { PrismaService } from './database/prisma.service.js';
import { MeService } from './me/me.service.js';
import { AccessPolicyService } from './access-control/access-policy.service.js';
import { RuntimeControlsService } from './runtime-controls/runtime-controls.service.js';
import { NodesService } from './nodes/nodes.service.js';

const principal = authenticatedPrincipal(
  '11111111-1111-4111-8111-111111111111',
  'owner@example.com',
);
const bootstrapResponse: BootstrapResponse = {
  user: {
    id: principal.userId,
    email: principal.email,
    displayName: null,
  },
  room: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'My Data Room',
    rootNodeId: '33333333-3333-4333-8333-333333333333',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  runtime: {
    registrationOpen: true,
    uploadsEnabled: false,
    publicLinksEnabled: false,
    maintenanceMode: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
};

describe('AppModule identity bootstrap', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('registers the guarded POST /v1/me/bootstrap route', async () => {
    const bootstrap = vi.fn().mockResolvedValue(bootstrapResponse);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_CONFIG)
      .useValue({
        issuer: 'http://localhost/auth/v1',
        audience: 'authenticated',
        allowInsecureLoopbackIssuer: true,
      })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(MeService)
      .useValue({ bootstrap })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext): boolean {
          const request = context.switchToHttp().getRequest<{ user?: AuthenticatedPrincipal }>();
          request.user = principal;
          return true;
        },
      })
      .compile();

    expect(moduleRef.get(AccessPolicyService)).toBeInstanceOf(AccessPolicyService);
    expect(moduleRef.get(RuntimeControlsService)).toBeInstanceOf(RuntimeControlsService);
    expect(moduleRef.get(NodesService)).toBeInstanceOf(NodesService);

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    const response = await request(app.getHttpServer() as Server)
      .post('/v1/me/bootstrap')
      .expect(201);

    expect(response.body).toEqual(bootstrapResponse);
    expect(bootstrap).toHaveBeenCalledOnce();
    expect(bootstrap).toHaveBeenCalledWith(principal);
  });
});
