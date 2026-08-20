import { describe, expect, it, vi } from 'vitest';
import type { BootstrapResponse } from '@data-room/contracts';
import { authenticatedPrincipal } from '../auth/principal.js';
import { MeService, type BootstrapDatabase, type BootstrapTransaction } from './me.service.js';
import { RuntimeControlsService } from '../runtime-controls/runtime-controls.service.js';

const userId = '11111111-1111-4111-8111-111111111111';
const roomId = '22222222-2222-4222-8222-222222222222';
const rootId = '33333333-3333-4333-8333-333333333333';
const createdAt = new Date('2026-01-01T00:00:00.000Z');

interface BootstrapState {
  user: { id: string; email: string; displayName: string | null } | null;
  room: { id: string; ownerId: string; name: string; createdAt: Date } | null;
  root: { id: string; name: string } | null;
}

interface RuntimeRow {
  registrationOpen: boolean;
  uploadsEnabled: boolean;
  publicLinksEnabled: boolean;
  maintenanceMode: boolean;
  updatedAt: Date;
}

interface HarnessOptions {
  runtime?: Partial<RuntimeRow>;
  state?: Partial<BootstrapState>;
  stateAfterFailures?: BootstrapState;
  transactionFailures?: string[];
}

type UserUpsertArgs = Parameters<BootstrapTransaction['userProfile']['upsert']>[0];
type RoomCreateArgs = Parameters<BootstrapTransaction['dataRoom']['create']>[0];
type RootCreateArgs = Parameters<BootstrapTransaction['node']['create']>[0];

function createHarness(options: HarnessOptions = {}) {
  const state: BootstrapState = {
    user: null,
    room: null,
    root: null,
    ...options.state,
  };
  const runtimeUpsert = vi.fn().mockResolvedValue({
    registrationOpen: false,
    uploadsEnabled: false,
    publicLinksEnabled: false,
    maintenanceMode: false,
    updatedAt: createdAt,
    ...options.runtime,
  });
  const userFind = vi.fn().mockImplementation(() => Promise.resolve(state.user));
  const userUpsert = vi.fn().mockImplementation(({ create, update }: UserUpsertArgs) => {
    state.user = state.user
      ? { ...state.user, email: update.email }
      : { id: create.id, email: create.email, displayName: null };
    return Promise.resolve(state.user);
  });
  const shareUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const roomFind = vi.fn().mockImplementation(() => Promise.resolve(state.room));
  const roomCreate = vi.fn().mockImplementation(({ data }: RoomCreateArgs) => {
    state.room = { id: roomId, createdAt, ...data };
    return Promise.resolve(state.room);
  });
  const rootFind = vi.fn().mockImplementation(() => Promise.resolve(state.root));
  const rootCreate = vi.fn().mockImplementation(({ data }: RootCreateArgs) => {
    state.root = { id: rootId, name: data.name };
    return Promise.resolve(state.root);
  });
  const tx = {
    runtimeControl: { upsert: runtimeUpsert },
    userProfile: { findUnique: userFind, upsert: userUpsert },
    share: { updateMany: shareUpdateMany },
    dataRoom: { findUnique: roomFind, create: roomCreate },
    node: { findFirst: rootFind, create: rootCreate },
  } satisfies BootstrapTransaction;

  let transactionTail = Promise.resolve();
  let transactionAttempt = 0;
  const transactionOptions: { isolationLevel: 'Serializable' }[] = [];
  const transaction = vi.fn(
    (
      callback: (client: BootstrapTransaction) => Promise<BootstrapResponse>,
      transactionConfig: { isolationLevel: 'Serializable' },
    ): Promise<BootstrapResponse> => {
      transactionOptions.push(transactionConfig);
      const failureCode = options.transactionFailures?.[transactionAttempt];
      transactionAttempt += 1;
      const result = transactionTail.then(() => {
        if (failureCode) {
          if (
            transactionAttempt === options.transactionFailures?.length &&
            options.stateAfterFailures
          ) {
            Object.assign(state, options.stateAfterFailures);
          }
          throw Object.assign(new Error('transaction failed'), { code: failureCode });
        }
        return callback(tx);
      });
      transactionTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  );
  const database: BootstrapDatabase = { $transaction: transaction };

  return {
    database,
    state,
    transaction,
    runtimeUpsert,
    userUpsert,
    shareUpdateMany,
    roomCreate,
    rootCreate,
  };
}

function existingState(): BootstrapState {
  return {
    user: { id: userId, email: 'owner@example.com', displayName: 'Owner' },
    room: { id: roomId, ownerId: userId, name: 'My Data Room', createdAt },
    root: { id: rootId, name: 'My Data Room' },
  };
}

describe('MeService bootstrap', () => {
  it('converges concurrent calls on one profile, room, and root', async () => {
    const harness = createHarness({ runtime: { registrationOpen: true } });
    const service = new MeService(harness.database, new RuntimeControlsService());
    const principal = authenticatedPrincipal(userId, ' Owner@Example.COM ');

    const [first, second] = await Promise.all([
      service.bootstrap(principal),
      service.bootstrap(principal),
    ]);

    expect(first).toEqual(second);
    expect(harness.state).toMatchObject({
      user: { id: userId, email: 'owner@example.com' },
      room: { id: roomId, ownerId: userId },
      root: { id: rootId },
    });
    expect(harness.roomCreate).toHaveBeenCalledTimes(1);
    expect(harness.rootCreate).toHaveBeenCalledTimes(1);
    expect(harness.transaction).toHaveBeenCalledTimes(2);
  });

  it('binds normalized pending shares and refreshes the verified profile email atomically', async () => {
    const harness = createHarness({ runtime: { registrationOpen: true }, state: existingState() });
    const service = new MeService(harness.database, new RuntimeControlsService());

    const response = await service.bootstrap(
      authenticatedPrincipal(userId, ' Updated@Example.COM '),
    );

    expect(response).toEqual({
      user: { id: userId, email: 'updated@example.com', displayName: 'Owner' },
      room: {
        id: roomId,
        name: 'My Data Room',
        rootNodeId: rootId,
        createdAt: createdAt.toISOString(),
      },
      runtime: {
        registrationOpen: true,
        uploadsEnabled: false,
        publicLinksEnabled: false,
        maintenanceMode: false,
        updatedAt: createdAt.toISOString(),
      },
    });
    expect(harness.userUpsert).toHaveBeenCalledWith({
      where: { id: userId },
      create: { id: userId, email: 'updated@example.com' },
      update: { email: 'updated@example.com' },
    });
    expect(harness.shareUpdateMany).toHaveBeenCalledWith({
      where: {
        principalType: 'USER',
        recipientEmail: 'updated@example.com',
        recipientUserId: null,
        revokedAt: null,
      },
      data: { recipientUserId: userId },
    });
    expect(harness.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('retries serialization and unique conflicts at most twice', async () => {
    const harness = createHarness({
      runtime: { registrationOpen: true },
      transactionFailures: ['P2034', 'P2002'],
    });
    const service = new MeService(harness.database, new RuntimeControlsService());

    await expect(
      service.bootstrap(authenticatedPrincipal(userId, 'owner@example.com')),
    ).resolves.toMatchObject({ room: { rootNodeId: rootId } });
    expect(harness.transaction).toHaveBeenCalledTimes(3);
    expect(harness.roomCreate).toHaveBeenCalledTimes(1);
    expect(harness.rootCreate).toHaveBeenCalledTimes(1);
  });

  it('does not retry an unrelated database failure', async () => {
    const harness = createHarness({
      runtime: { registrationOpen: true },
      transactionFailures: ['P2025'],
    });
    const service = new MeService(harness.database, new RuntimeControlsService());

    await expect(
      service.bootstrap(authenticatedPrincipal(userId, 'owner@example.com')),
    ).rejects.toMatchObject({ code: 'P2025' });
    expect(harness.transaction).toHaveBeenCalledTimes(1);
  });

  it('re-reads the committed profile, room, and root after exhausting conflict retries', async () => {
    const harness = createHarness({
      runtime: {
        registrationOpen: false,
        uploadsEnabled: true,
        publicLinksEnabled: true,
        maintenanceMode: true,
        updatedAt: new Date('2026-02-02T03:04:05.000Z'),
      },
      transactionFailures: ['P2034', 'P2034', 'P2034'],
      stateAfterFailures: existingState(),
    });
    const service = new MeService(harness.database, new RuntimeControlsService());

    await expect(
      service.bootstrap(authenticatedPrincipal(userId, 'owner@example.com')),
    ).resolves.toMatchObject({
      user: { id: userId },
      room: { id: roomId, rootNodeId: rootId },
      runtime: {
        registrationOpen: false,
        uploadsEnabled: true,
        publicLinksEnabled: true,
        maintenanceMode: true,
        updatedAt: '2026-02-02T03:04:05.000Z',
      },
    });
    expect(harness.transaction).toHaveBeenCalledTimes(4);
    expect(harness.roomCreate).not.toHaveBeenCalled();
    expect(harness.rootCreate).not.toHaveBeenCalled();
  });

  it('rejects new profiles while registration is closed but permits existing profiles', async () => {
    const closedRuntime = {
      registrationOpen: false,
      uploadsEnabled: false,
      publicLinksEnabled: false,
      maintenanceMode: false,
      updatedAt: createdAt,
    };
    const closedNew = createHarness({ runtime: closedRuntime });
    const newService = new MeService(closedNew.database, new RuntimeControlsService());

    await expect(
      newService.bootstrap(authenticatedPrincipal(userId, 'new@example.com')),
    ).rejects.toMatchObject({ response: { error: { code: 'REGISTRATION_CLOSED' } } });
    expect(closedNew.userUpsert).not.toHaveBeenCalled();
    expect(closedNew.roomCreate).not.toHaveBeenCalled();
    expect(closedNew.rootCreate).not.toHaveBeenCalled();

    const closedExisting = createHarness({ runtime: closedRuntime, state: existingState() });
    const existingService = new MeService(closedExisting.database, new RuntimeControlsService());
    await expect(
      existingService.bootstrap(authenticatedPrincipal(userId, 'owner@example.com')),
    ).resolves.toMatchObject({
      user: { id: userId },
      runtime: {
        registrationOpen: false,
        uploadsEnabled: false,
        publicLinksEnabled: false,
        maintenanceMode: false,
        updatedAt: createdAt.toISOString(),
      },
    });
  });

  it('fails closed when an existing room has no root', async () => {
    const state = existingState();
    state.root = null;
    const harness = createHarness({ state });
    const service = new MeService(harness.database, new RuntimeControlsService());

    await expect(
      service.bootstrap(authenticatedPrincipal(userId, 'owner@example.com')),
    ).rejects.toMatchObject({ response: { error: { code: 'INTERNAL_ERROR' } } });
    expect(harness.rootCreate).not.toHaveBeenCalled();
  });
});
