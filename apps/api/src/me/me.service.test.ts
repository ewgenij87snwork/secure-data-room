import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { authenticatedPrincipal } from '../auth/principal.js';
import { MeService } from './me.service.js';

const userId = '11111111-1111-4111-8111-111111111111';
const roomId = '22222222-2222-4222-8222-222222222222';
const rootId = '33333333-3333-4333-8333-333333333333';

function createPrisma(overrides: Record<string, unknown> = {}) {
  const tx = {
    runtimeControl: { findUnique: vi.fn().mockResolvedValue({ registrationOpen: true }) },
    userProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: userId, email: 'owner@example.com', displayName: null }),
    },
    dataRoom: {
      upsert: vi.fn().mockResolvedValue({
        id: roomId,
        ownerId: userId,
        name: 'My Data Room',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    },
    node: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: rootId }),
    },
    share: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    ...overrides,
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  return { prisma, tx };
}

describe('MeService bootstrap', () => {
  it('provisions one profile, room, root, and binds normalized pending shares atomically', async () => {
    const { prisma, tx } = createPrisma();
    const service = new MeService(prisma);

    const response = await service.bootstrap(
      authenticatedPrincipal(userId, ' Owner@Example.COM '),
    );

    expect(response).toEqual({
      user: { id: userId, email: 'owner@example.com', displayName: null },
      room: {
        id: roomId,
        name: 'My Data Room',
        rootNodeId: rootId,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(tx.userProfile.create).toHaveBeenCalledWith({
      data: { id: userId, email: 'owner@example.com' },
    });
    expect(tx.share.updateMany).toHaveBeenCalledWith({
      where: {
        principalType: 'USER',
        recipientEmail: 'owner@example.com',
        recipientUserId: null,
        revokedAt: null,
      },
      data: { recipientUserId: userId },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('is idempotent for an existing profile and existing default root', async () => {
    const existingUser = { id: userId, email: 'owner@example.com', displayName: 'Owner' };
    const existingRoot = { id: rootId, name: 'My Data Room' };
    const { prisma, tx } = createPrisma({
      userProfile: { findUnique: vi.fn().mockResolvedValue(existingUser) },
      node: { findFirst: vi.fn().mockResolvedValue(existingRoot), create: vi.fn() },
    });
    const service = new MeService(prisma);

    await service.bootstrap(authenticatedPrincipal(userId, 'owner@example.com'));
    await service.bootstrap(authenticatedPrincipal(userId, 'owner@example.com'));

    expect(tx.userProfile.create).not.toHaveBeenCalled();
    expect(tx.node.create).not.toHaveBeenCalled();
    expect(tx.dataRoom.upsert).toHaveBeenCalledTimes(2);
  });

  it('rejects new profiles while registration is closed but permits existing profiles', async () => {
    const { prisma, tx } = createPrisma({
      runtimeControl: { findUnique: vi.fn().mockResolvedValue({ registrationOpen: false }) },
    });
    const service = new MeService(prisma);

    await expect(
      service.bootstrap(authenticatedPrincipal(userId, 'new@example.com')),
    ).rejects.toMatchObject({ response: { error: { code: 'REGISTRATION_CLOSED' } } });
    expect(tx.userProfile.create).not.toHaveBeenCalled();

    tx.userProfile.findUnique = vi.fn().mockResolvedValue({
      id: userId,
      email: 'existing@example.com',
      displayName: null,
    });
    tx.node.findFirst = vi.fn().mockResolvedValue({ id: rootId, name: 'My Data Room' });
    await expect(
      service.bootstrap(authenticatedPrincipal(userId, 'existing@example.com')),
    ).resolves.toMatchObject({ user: { id: userId } });
  });
});
