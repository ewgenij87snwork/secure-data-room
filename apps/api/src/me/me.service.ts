import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { BootstrapResponse } from '@data-room/contracts';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedPrincipal } from '../auth/principal.js';

const DEFAULT_ROOM_NAME = 'My Data Room';
const MAX_TRANSACTION_ATTEMPTS = 3;

export interface BootstrapTransaction {
  runtimeControl: {
    upsert(args: {
      where: { id: number };
      create: { id: number };
      update: Record<string, never>;
      select: { registrationOpen: true };
    }): Promise<{ registrationOpen: boolean }>;
  };
  userProfile: {
    findUnique(args: { where: { id: string } }): Promise<{
      id: string;
      email: string;
      displayName: string | null;
    } | null>;
    upsert(args: {
      where: { id: string };
      create: { id: string; email: string };
      update: { email: string };
    }): Promise<{ id: string; email: string; displayName: string | null }>;
  };
  share: {
    updateMany(args: {
      where: {
        principalType: 'USER';
        recipientEmail: string;
        recipientUserId: null;
        revokedAt: null;
      };
      data: { recipientUserId: string };
    }): Promise<{ count: number }>;
  };
  dataRoom: {
    findUnique(args: { where: { ownerId: string } }): Promise<{
      id: string;
      ownerId: string;
      name: string;
      createdAt: Date;
    } | null>;
    create(args: { data: { ownerId: string; name: string } }): Promise<{
      id: string;
      ownerId: string;
      name: string;
      createdAt: Date;
    }>;
  };
  node: {
    findFirst(args: {
      where: { dataRoomId: string; parentId: null; deletedAt: null };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(args: {
      data: {
        dataRoomId: string;
        parentId: null;
        kind: 'FOLDER';
        name: string;
        normalizedName: string;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
}

export interface BootstrapDatabase {
  $transaction<T>(
    callback: (tx: BootstrapTransaction) => Promise<T>,
    options: { isolationLevel: 'Serializable' },
  ): Promise<T>;
}

function registrationClosed(): ForbiddenException {
  return new ForbiddenException({
    error: {
      code: 'REGISTRATION_CLOSED',
      message: 'Registration is currently closed.',
      requestId: randomUUID(),
    },
  });
}

function roomUnavailable(): InternalServerErrorException {
  return new InternalServerErrorException({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'The data room is temporarily unavailable.',
      requestId: randomUUID(),
    },
  });
}

function isRetryableTransactionConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = 'code' in error ? error.code : undefined;
  return code === 'P2002' || code === 'P2034';
}

function toBootstrapResponse(
  user: { id: string; email: string; displayName: string | null },
  room: { id: string; name: string; createdAt: Date },
  root: { id: string },
): BootstrapResponse {
  return {
    user: { id: user.id, email: user.email, displayName: user.displayName },
    room: {
      id: room.id,
      name: room.name,
      rootNodeId: root.id,
      createdAt: room.createdAt.toISOString(),
    },
  };
}

@Injectable()
export class MeService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: BootstrapDatabase,
  ) {}

  async bootstrap(principal: AuthenticatedPrincipal): Promise<BootstrapResponse> {
    let lastConflict: unknown;
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.bootstrapOnce(principal);
      } catch (error) {
        if (!isRetryableTransactionConflict(error)) throw error;
        lastConflict = error;
        if (attempt === MAX_TRANSACTION_ATTEMPTS) break;
      }
    }
    return this.readCommittedBootstrap(principal, lastConflict);
  }

  private bootstrapOnce(principal: AuthenticatedPrincipal): Promise<BootstrapResponse> {
    const email = principal.email.trim().toLowerCase();

    return this.prisma.$transaction(
      async (tx) => {
        const runtimeControl = await tx.runtimeControl.upsert({
          where: { id: 1 },
          create: { id: 1 },
          update: {},
          select: { registrationOpen: true },
        });
        const existingUser = await tx.userProfile.findUnique({ where: { id: principal.userId } });

        if (!existingUser && !runtimeControl.registrationOpen) throw registrationClosed();

        const user = await tx.userProfile.upsert({
          where: { id: principal.userId },
          create: { id: principal.userId, email },
          update: { email },
        });

        await tx.share.updateMany({
          where: {
            principalType: 'USER',
            recipientEmail: email,
            recipientUserId: null,
            revokedAt: null,
          },
          data: { recipientUserId: user.id },
        });

        let room = await tx.dataRoom.findUnique({ where: { ownerId: user.id } });
        let root;
        if (room) {
          root = await tx.node.findFirst({
            where: { dataRoomId: room.id, parentId: null, deletedAt: null },
            select: { id: true },
          });
          if (!root) throw roomUnavailable();
        } else {
          room = await tx.dataRoom.create({
            data: { ownerId: user.id, name: DEFAULT_ROOM_NAME },
          });
          root = await tx.node.create({
            data: {
              dataRoomId: room.id,
              parentId: null,
              kind: 'FOLDER',
              name: DEFAULT_ROOM_NAME,
              normalizedName: DEFAULT_ROOM_NAME.toLocaleLowerCase('en-US'),
            },
            select: { id: true },
          });
        }

        return toBootstrapResponse(user, room, root);
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private readCommittedBootstrap(
    principal: AuthenticatedPrincipal,
    lastConflict: unknown,
  ): Promise<BootstrapResponse> {
    const email = principal.email.trim().toLowerCase();
    return this.prisma.$transaction(
      async (tx) => {
        const user = await tx.userProfile.findUnique({ where: { id: principal.userId } });
        if (user?.email.trim().toLowerCase() !== email) throw lastConflict;

        const room = await tx.dataRoom.findUnique({ where: { ownerId: user.id } });
        if (!room) throw lastConflict;
        const root = await tx.node.findFirst({
          where: { dataRoomId: room.id, parentId: null, deletedAt: null },
          select: { id: true },
        });
        if (!root) throw roomUnavailable();

        await tx.share.updateMany({
          where: {
            principalType: 'USER',
            recipientEmail: email,
            recipientUserId: null,
            revokedAt: null,
          },
          data: { recipientUserId: user.id },
        });
        return toBootstrapResponse(user, room, root);
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
