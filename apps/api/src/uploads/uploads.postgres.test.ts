import { PrismaPg } from '@prisma/adapter-pg';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma/client.js';
import { authenticatedPrincipal } from '../auth/principal.js';
import { RuntimeControlsService } from '../runtime-controls/runtime-controls.service.js';
import { UploadQuotaService } from './upload-quota.service.js';
import { UploadsService } from './uploads.service.js';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.NODE_TEST_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const schema = `uploads_${process.pid}_${Date.now()}`;
const ownerId = '11111111-1111-4111-8111-111111111111';
const otherOwnerId = '22222222-2222-4222-8222-222222222222';
const roomId = '33333333-3333-4333-8333-333333333333';
const rootId = '44444444-4444-4444-8444-444444444444';
const owner = authenticatedPrincipal(ownerId, 'owner@example.com');
const otherOwner = authenticatedPrincipal(otherOwnerId, 'other@example.com');

run('UploadsService PostgreSQL integration', () => {
  let admin: Client;
  let pool: Pool;
  let prisma: PrismaClient;
  let service: UploadsService;

  beforeAll(async () => {
    admin = new Client({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`
      CREATE TYPE "NodeKind" AS ENUM ('FOLDER', 'FILE');
      CREATE TYPE "UploadStatus" AS ENUM ('PREPARED', 'UPLOADING', 'FINALIZED', 'CANCELLED', 'EXPIRED', 'REJECTED');
      CREATE TABLE "UserProfile" ("id" uuid PRIMARY KEY, "email" text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
      CREATE TABLE "DataRoom" ("id" uuid PRIMARY KEY, "ownerId" uuid NOT NULL, "name" varchar(120) NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
      CREATE TABLE "Node" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "dataRoomId" uuid NOT NULL, "parentId" uuid,
        "kind" "NodeKind" NOT NULL, "name" varchar(120) NOT NULL, "normalizedName" varchar(120) NOT NULL,
        "sizeBytes" bigint, "mimeType" varchar(100), "storageKey" varchar(300), "revision" integer NOT NULL DEFAULT 1,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "deletedAt" timestamptz
      );
      CREATE TABLE "UploadSession" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "ownerId" uuid NOT NULL, "parentNodeId" uuid NOT NULL,
        "clientId" uuid NOT NULL, "storageKey" varchar(300) NOT NULL UNIQUE, "requestedName" varchar(120) NOT NULL,
        "normalizedName" varchar(120) NOT NULL, "expectedSizeBytes" bigint NOT NULL, "mimeType" varchar(100) NOT NULL,
        "status" "UploadStatus" NOT NULL DEFAULT 'PREPARED', "expiresAt" timestamptz NOT NULL, "finalizedAt" timestamptz,
        "fileNodeId" uuid UNIQUE, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "RuntimeControl" ("id" integer PRIMARY KEY DEFAULT 1, "registrationOpen" boolean NOT NULL DEFAULT false, "uploadsEnabled" boolean NOT NULL DEFAULT true, "publicLinksEnabled" boolean NOT NULL DEFAULT false, "maintenanceMode" boolean NOT NULL DEFAULT false, "updatedAt" timestamptz NOT NULL DEFAULT now());
      CREATE UNIQUE INDEX "UploadSession_ownerId_clientId_key" ON "UploadSession" ("ownerId", "clientId");
      CREATE UNIQUE INDEX "node_active_sibling_name_uq" ON "Node" ("dataRoomId", "parentId", "normalizedName") WHERE "deletedAt" IS NULL AND "parentId" IS NOT NULL;
    `);
    await admin.query('INSERT INTO "UserProfile" ("id", "email") VALUES ($1, $2), ($3, $4)', [
      ownerId,
      'owner@example.com',
      otherOwnerId,
      'other@example.com',
    ]);
    await admin.query('INSERT INTO "DataRoom" ("id", "ownerId", "name") VALUES ($1, $2, $3)', [
      roomId,
      ownerId,
      'Room',
    ]);
    await admin.query(
      'INSERT INTO "Node" ("id", "dataRoomId", "kind", "name", "normalizedName") VALUES ($1, $2, \'FOLDER\', \'Root\', \'root\')',
      [rootId, roomId],
    );
    await admin.query('INSERT INTO "RuntimeControl" ("id", "uploadsEnabled") VALUES (1, true)');
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    prisma = new PrismaClient({
      adapter: new PrismaPg(pool, { schema, disposeExternalPool: false }),
    });
    service = new UploadsService(
      prisma as never,
      {
        assertCanCreateChild: (principal: typeof owner, parentId: string) =>
          Promise.resolve(
            principal.userId === ownerId && parentId === rootId
              ? {
                  nodeId: rootId,
                  dataRoomId: roomId,
                  parentId: null,
                  kind: 'FOLDER',
                  accessRole: 'OWNER',
                  accessRootNodeId: rootId,
                }
              : (() => {
                  throw new Error('denied');
                })(),
          ),
      } as never,
      new RuntimeControlsService(),
      {
        createSignedUpload: (storageKey: string) =>
          Promise.resolve({
            token: `token-${storageKey}`,
            bucketName: 'bucket',
            tusEndpoint: 'https://example.test/sign',
            expiresAt: new Date(Date.now() + 60_000),
          }),
        getMetadata: () => Promise.resolve({ sizeBytes: 12, contentType: 'application/pdf' }),
        readPrefix: () => Promise.resolve(Uint8Array.from([37, 80, 68, 70, 45])),
        createSignedReadUrl: () => Promise.resolve('https://example.test/read'),
        remove: () => Promise.resolve(),
      },
      new UploadQuotaService(),
    );
  });

  beforeEach(async () => {
    await prisma.uploadSession.deleteMany();
    await prisma.node.deleteMany({ where: { id: { not: rootId } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    await pool.end();
  });

  function request(clientId: string, name = 'deal.pdf') {
    return {
      parentId: rootId,
      files: [{ clientId, name, sizeBytes: 12, mimeType: 'application/pdf' as const }],
    };
  }

  it('serializes concurrent prepare reservations at the owner profile row', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) =>
        service.prepare(owner, request(`55555555-5555-4555-8555-55555555555${index + 1}`)),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(
      prisma.uploadSession.count({ where: { ownerId, status: 'PREPARED' } }),
    ).resolves.toBe(5);
  });

  it('does not reveal or finalize another owner session', async () => {
    const prepared = await service.prepare(owner, request('66666666-6666-4666-8666-666666666666'));
    const sessionId = prepared.uploads[0]?.sessionId;
    if (!sessionId) throw new Error('missing session');
    await expect(
      service.finalize(otherOwner, sessionId, { clientId: '66666666-6666-4666-8666-666666666666' }),
    ).rejects.toMatchObject({ response: { error: { code: 'RESOURCE_GONE' } } });
  });

  it('does not reserve a session when the locked parent is tombstoned concurrently', async () => {
    await admin.query('BEGIN');
    await admin.query('SELECT id FROM "Node" WHERE id = $1::uuid FOR UPDATE', [rootId]);
    const pending = service.prepare(owner, request('88888888-8888-4888-8888-888888888888'));
    await admin.query('UPDATE "Node" SET "deletedAt" = now() WHERE id = $1::uuid', [rootId]);
    await admin.query('COMMIT');
    await expect(pending).rejects.toMatchObject({ response: { error: { code: 'RESOURCE_GONE' } } });
    await admin.query('UPDATE "Node" SET "deletedAt" = NULL WHERE id = $1::uuid', [rootId]);
    await expect(
      prisma.uploadSession.count({
        where: { ownerId, clientId: '88888888-8888-4888-8888-888888888888' },
      }),
    ).resolves.toBe(0);
  });

  it('finalizes repeated concurrent requests to one node with a deterministic suffix', async () => {
    await prisma.node.create({
      data: {
        dataRoomId: roomId,
        parentId: rootId,
        kind: 'FILE',
        name: 'deal.pdf',
        normalizedName: 'deal.pdf',
        sizeBytes: 12n,
        mimeType: 'application/pdf',
        storageKey: 'rooms/r/objects/existing',
      },
    });
    const prepared = await service.prepare(owner, request('77777777-7777-4777-8777-777777777777'));
    const sessionId = prepared.uploads[0]?.sessionId;
    if (!sessionId) throw new Error('missing session');
    const results = await Promise.all([
      service.finalize(owner, sessionId, { clientId: '77777777-7777-4777-8777-777777777777' }),
      service.finalize(owner, sessionId, { clientId: '77777777-7777-4777-8777-777777777777' }),
    ]);
    expect(results[0]).toMatchObject({ finalName: 'deal (1).pdf' });
    expect(results[1]).toMatchObject({ nodeId: results[0].nodeId, finalName: 'deal (1).pdf' });
    await expect(prisma.node.count({ where: { normalizedName: 'deal (1).pdf' } })).resolves.toBe(1);
  });
});
