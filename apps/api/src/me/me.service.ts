import { ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { BootstrapResponse } from '@data-room/contracts';
import type { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedPrincipal } from '../auth/principal.js';

const DEFAULT_ROOM_NAME = 'My Data Room';

function registrationClosed(): ForbiddenException {
  return new ForbiddenException({
    error: {
      code: 'REGISTRATION_CLOSED',
      message: 'Registration is currently closed.',
      requestId: randomUUID(),
    },
  });
}

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async bootstrap(principal: AuthenticatedPrincipal): Promise<BootstrapResponse> {
    const email = principal.email.trim().toLowerCase();

    return this.prisma.$transaction(
      async (tx) => {
        const runtimeControl = await tx.runtimeControl.findUnique({
          where: { id: 1 },
          select: { registrationOpen: true },
        });
        const existingUser = await tx.userProfile.findUnique({ where: { id: principal.userId } });

        if (!existingUser && !runtimeControl?.registrationOpen) {
          throw registrationClosed();
        }

        const user =
          existingUser ??
          (await tx.userProfile.create({
            data: { id: principal.userId, email },
          }));

        await tx.share.updateMany({
          where: {
            principalType: 'USER',
            recipientEmail: email,
            recipientUserId: null,
            revokedAt: null,
          },
          data: { recipientUserId: principal.userId },
        });

        const room = await tx.dataRoom.upsert({
          where: { ownerId: principal.userId },
          update: {},
          create: { ownerId: principal.userId, name: DEFAULT_ROOM_NAME },
        });
        let root = await tx.node.findFirst({
          where: { dataRoomId: room.id, parentId: null, deletedAt: null },
          select: { id: true, name: true },
        });
        root ??= await tx.node.create({
          data: {
            dataRoomId: room.id,
            kind: 'FOLDER',
            name: DEFAULT_ROOM_NAME,
            normalizedName: DEFAULT_ROOM_NAME.toLowerCase(),
          },
          select: { id: true, name: true },
        });

        return {
          user: { id: user.id, email: user.email, displayName: user.displayName },
          room: {
            id: room.id,
            name: room.name,
            rootNodeId: root.id,
            createdAt: room.createdAt.toISOString(),
          },
        } satisfies BootstrapResponse;
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
