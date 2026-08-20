import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';

vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/postgres');
vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('SUPABASE_JWKS_URL', 'https://example.supabase.co/auth/v1/.well-known/jwks.json');
vi.stubEnv('SUPABASE_JWT_ISSUER', 'https://example.supabase.co/auth/v1');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key-that-is-long-enough');
vi.stubEnv('APP_VERSION', 'test-version');
vi.stubEnv('GIT_COMMIT_SHA', 'abc1234');

const { HealthController } = await import('./health.controller.js');

function createController(queryResult: unknown = [{ one: 1 }]): HealthController {
  const prisma = { $queryRaw: vi.fn().mockResolvedValue(queryResult) } as unknown as PrismaService;
  return new HealthController(prisma);
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
    await expect(createController().getReady()).resolves.toEqual({
      status: 'ok',
      version: 'test-version',
      commit: 'abc1234',
    });
  });

  it('fails closed without leaking the database error', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('postgresql://secret@example.invalid/db')),
    } as unknown as PrismaService;
    await expect(new HealthController(prisma).getReady()).rejects.toMatchObject({
      response: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'The application database is not ready.',
      },
    });
  });
});
