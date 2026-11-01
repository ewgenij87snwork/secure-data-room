import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import type { HealthController as HealthControllerInstance } from './health.controller.js';

vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/postgres');
vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('SUPABASE_JWT_ISSUER', 'https://example.supabase.co/auth/v1');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key-that-is-long-enough');
vi.stubEnv('APP_VERSION', 'test-version');
vi.stubEnv('GIT_COMMIT_SHA', 'abc1234');

const { HealthController } = await import('./health.controller.js');

type ControllerWithMock = HealthControllerInstance & { findFirst: ReturnType<typeof vi.fn> };

function createController(queryResult: unknown = null): ControllerWithMock {
  const findFirst = vi.fn().mockResolvedValue(queryResult);
  const prisma = {
    userProfile: { findFirst },
  } as unknown as PrismaService;
  return Object.assign(new HealthController(prisma), { findFirst });
}

describe('HealthController', () => {
  it('returns the build identity used by release verification', () => {
    expect(createController().getVersion()).toEqual({
      status: 'ok',
      version: 'test-version',
      commit: 'abc1234',
    });
  });

  it('reports ready only after a database query succeeds', async () => {
    const controller = createController();
    await expect(controller.getReady()).resolves.toEqual({
      status: 'ok',
      version: 'test-version',
      commit: 'abc1234',
    });
    expect(controller.findFirst).toHaveBeenCalledWith({ select: { id: true } });
  });

  it('fails closed without leaking the database error', async () => {
    const prisma = {
      userProfile: {
        findFirst: vi.fn().mockRejectedValue(new Error('postgresql://secret@example.invalid/db')),
      },
    } as unknown as PrismaService;
    await expect(new HealthController(prisma).getReady()).rejects.toMatchObject({
      response: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'The application database is not ready.',
      },
    });
  });
});
