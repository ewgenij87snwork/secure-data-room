import { PrismaPg } from '@prisma/adapter-pg';
import { Client, Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nodeSummarySchema } from '@data-room/contracts';
import { authenticatedPrincipal } from '../auth/principal.js';
import { AccessPolicyService } from '../access-control/access-policy.service.js';
import { RuntimeControlsService } from '../runtime-controls/runtime-controls.service.js';
import { NodesService } from './nodes.service.js';

const databaseUrl = process.env.NODE_TEST_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const ids = {
  owner: '11111111-1111-4111-8111-111111111111',
  room: '22222222-2222-4222-8222-222222222222',
  root: '33333333-3333-4333-8333-333333333333',
  child: '44444444-4444-4444-8444-444444444444',
  file: '55555555-5555-4555-8555-555555555555',
  unrelated: '66666666-6666-4666-8666-666666666666',
};
const schema = `nodes_${process.pid}_${Date.now()}`;
const owner = authenticatedPrincipal(ids.owner, 'owner@example.com');

run('NodesService PostgreSQL integration', () => {
  let admin: Client | undefined;
  let pool: Pool | undefined;
  let prisma: PrismaClient | undefined;
  let service: NodesService | undefined;

  beforeAll(async () => {
    const connectionString = requireDatabaseUrl();
    admin = new Client({ connectionString, options: `-c search_path=${schema}` });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`
      CREATE TYPE "NodeKind" AS ENUM ('FOLDER', 'FILE');
      CREATE TYPE "SharePrincipalType" AS ENUM ('USER', 'PUBLIC_LINK');
      CREATE TYPE "ShareRole" AS ENUM ('VIEWER', 'EDITOR');
      CREATE TABLE "UserProfile" ("id" uuid PRIMARY KEY, "email" text NOT NULL);
      CREATE TABLE "DataRoom" ("id" uuid PRIMARY KEY, "ownerId" uuid NOT NULL, "name" varchar(120) NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
      CREATE TABLE "Node" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "dataRoomId" uuid NOT NULL, "parentId" uuid,
        "kind" "NodeKind" NOT NULL, "name" varchar(120) NOT NULL, "normalizedName" varchar(120) NOT NULL,
        "sizeBytes" bigint, "mimeType" varchar(100), "storageKey" varchar(300), "revision" integer NOT NULL DEFAULT 1,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "deletedAt" timestamptz
      );
      CREATE TABLE "Share" (
        "id" uuid PRIMARY KEY, "targetNodeId" uuid NOT NULL, "grantedByUserId" uuid NOT NULL,
        "principalType" "SharePrincipalType" NOT NULL, "role" "ShareRole" NOT NULL,
        "recipientUserId" uuid, "recipientEmail" text, "revokedAt" timestamptz
      );
      CREATE TABLE "RuntimeControl" (
        "id" integer PRIMARY KEY DEFAULT 1, "registrationOpen" boolean NOT NULL DEFAULT false,
        "uploadsEnabled" boolean NOT NULL DEFAULT false, "publicLinksEnabled" boolean NOT NULL DEFAULT false,
        "maintenanceMode" boolean NOT NULL DEFAULT false, "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE "Node" ADD CONSTRAINT "node_kind_fields_ck" CHECK (
        ("kind" = 'FOLDER' AND "sizeBytes" IS NULL AND "mimeType" IS NULL AND "storageKey" IS NULL)
        OR
        ("kind" = 'FILE' AND "sizeBytes" IS NOT NULL AND "sizeBytes" >= 0 AND "mimeType" = 'application/pdf' AND "storageKey" IS NOT NULL)
      );
      ALTER TABLE "Node" ADD CONSTRAINT "node_root_is_folder_ck" CHECK ("parentId" IS NOT NULL OR "kind" = 'FOLDER');
      ALTER TABLE "RuntimeControl" ADD CONSTRAINT "runtime_control_singleton_ck" CHECK ("id" = 1);
      CREATE UNIQUE INDEX "node_active_sibling_name_uq" ON "Node" ("dataRoomId", "parentId", "normalizedName") WHERE "deletedAt" IS NULL AND "parentId" IS NOT NULL;
    `);
    await admin.query('INSERT INTO "UserProfile" ("id", "email") VALUES ($1, $2)', [
      ids.owner,
      'owner@example.com',
    ]);
    await admin.query('INSERT INTO "UserProfile" ("id", "email") VALUES ($1, $2)', [
      ids.unrelated,
      'unrelated@example.com',
    ]);
    await admin.query('INSERT INTO "DataRoom" ("id", "ownerId", "name") VALUES ($1, $2, $3)', [
      ids.room,
      ids.owner,
      'Room',
    ]);
    await admin.query(
      'INSERT INTO "Node" ("id", "dataRoomId", "kind", "name", "normalizedName") VALUES ($1, $2, $3, $4, $5)',
      [ids.root, ids.room, 'FOLDER', 'Root', 'root'],
    );
    await admin.query(
      'INSERT INTO "Node" ("id", "dataRoomId", "parentId", "kind", "name", "normalizedName") VALUES ($1, $2, $3, $4, $5, $6)',
      [ids.child, ids.room, ids.root, 'FOLDER', 'Existing', 'existing'],
    );
    await admin.query(
      'INSERT INTO "Node" ("id", "dataRoomId", "parentId", "kind", "name", "normalizedName", "sizeBytes", "mimeType", "storageKey") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        ids.file,
        ids.room,
        ids.root,
        'FILE',
        'File.pdf',
        'file.pdf',
        1,
        'application/pdf',
        'tests/file.pdf',
      ],
    );
    await admin.query('INSERT INTO "RuntimeControl" ("id") VALUES (1)');
    pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
    prisma = new PrismaClient({
      adapter: new PrismaPg(pool, { schema, disposeExternalPool: false }),
    });
    service = new NodesService(
      prisma,
      new AccessPolicyService(prisma),
      new RuntimeControlsService(),
    );
  });

  beforeEach(async () => {
    const database = requirePrisma(prisma);
    await database.runtimeControl.update({
      where: { id: 1 },
      data: { maintenanceMode: false },
    });
    await database.node.deleteMany({
      where: { id: { notIn: [ids.root, ids.child, ids.file] } },
    });
  });

  afterAll(async () => {
    let cleanupPassed = true;
    const database = prisma;
    const setupPool = pool;
    const setupClient = admin;
    if (database)
      cleanupPassed = (await attemptCleanup(() => database.$disconnect())) && cleanupPassed;
    if (setupClient) {
      cleanupPassed =
        (await attemptCleanup(() =>
          setupClient.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`),
        )) && cleanupPassed;
    }
    if (setupPool) cleanupPassed = (await attemptCleanup(() => setupPool.end())) && cleanupPassed;
    if (setupClient)
      cleanupPassed = (await attemptCleanup(() => setupClient.end())) && cleanupPassed;
    if (!cleanupPassed) throw new Error('PostgreSQL integration cleanup failed.');
  });

  it('creates nested folders with PostgreSQL-backed room and sibling integrity', async () => {
    const nodes = requireService(service);
    const database = requirePrisma(prisma);
    const legal = await nodes.createFolder(owner, { parentId: ids.root, name: 'Legal' });
    const contracts = await nodes.createFolder(owner, { parentId: legal.id, name: 'Contracts' });

    expect(nodeSummarySchema.parse(legal)).toMatchObject({
      parentId: ids.root,
      name: 'Legal',
      kind: 'FOLDER',
    });
    expect(nodeSummarySchema.parse(contracts)).toMatchObject({
      parentId: legal.id,
      name: 'Contracts',
      kind: 'FOLDER',
    });
    const rows = await database.node.findMany({
      orderBy: { createdAt: 'asc' },
      select: { dataRoomId: true, parentId: true, kind: true, name: true, normalizedName: true },
    });
    expect(rows.slice(-2)).toEqual([
      {
        dataRoomId: ids.room,
        parentId: ids.root,
        kind: 'FOLDER',
        name: 'Legal',
        normalizedName: 'legal',
      },
      {
        dataRoomId: ids.room,
        parentId: legal.id,
        kind: 'FOLDER',
        name: 'Contracts',
        normalizedName: 'contracts',
      },
    ]);
  });

  it('denies an unrelated principal without an exact attempted write', async () => {
    const nodes = requireService(service);
    const database = requirePrisma(prisma);
    const unrelated = authenticatedPrincipal(ids.unrelated, 'unrelated@example.com');
    await expect(
      nodes.createFolder(unrelated, { parentId: ids.root, name: 'Unrelated attempt' }),
    ).rejects.toMatchObject({
      response: { error: { code: 'ACCESS_DENIED' } },
    });
    await expectAttemptAbsent(database, ids.root, 'Unrelated attempt');
  });

  it('denies a file parent without an exact attempted write', async () => {
    const nodes = requireService(service);
    const database = requirePrisma(prisma);
    await expect(
      nodes.createFolder(owner, { parentId: ids.file, name: 'File attempt' }),
    ).rejects.toMatchObject({
      response: { error: { code: 'ACCESS_DENIED' } },
    });
    await expectAttemptAbsent(database, ids.file, 'File attempt');
  });

  it('blocks maintenance without an exact attempted write', async () => {
    const nodes = requireService(service);
    const database = requirePrisma(prisma);
    await database.runtimeControl.update({ where: { id: 1 }, data: { maintenanceMode: true } });
    await expect(
      nodes.createFolder(owner, { parentId: ids.root, name: 'Maintenance attempt' }),
    ).rejects.toMatchObject({
      response: { error: { code: 'MAINTENANCE_MODE' } },
    });
    await expectAttemptAbsent(database, ids.root, 'Maintenance attempt');
  });

  it('maps the real sibling index conflict without an extra row', async () => {
    const nodes = requireService(service);
    const database = requirePrisma(prisma);
    await expect(
      nodes.createFolder(owner, { parentId: ids.root, name: 'Existing' }),
    ).rejects.toMatchObject({
      response: {
        error: { code: 'NAME_CONFLICT', details: { suggestedName: 'Existing (1)' } },
      },
    });
    const siblings = await database.node.findMany({
      where: {
        dataRoomId: ids.room,
        parentId: ids.root,
        normalizedName: 'existing',
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(siblings).toHaveLength(1);
  });

  it('serializes concurrent creators at the 50-folder quota boundary', async () => {
    const nodes = requireService(service);
    const database = requirePrisma(prisma);
    await database.node.createMany({
      data: Array.from({ length: 48 }, (_, index) => ({
        id: `70000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        dataRoomId: ids.room,
        parentId: ids.root,
        kind: 'FOLDER' as const,
        name: `Quota seed ${index}`,
        normalizedName: `quota seed ${index}`,
      })),
    });

    const results = await Promise.allSettled([
      nodes.createFolder(owner, { parentId: ids.root, name: 'Concurrent A' }),
      nodes.createFolder(owner, { parentId: ids.root, name: 'Concurrent B' }),
    ]);
    const success = results.find(
      (
        result,
      ): result is PromiseFulfilledResult<Awaited<ReturnType<NodesService['createFolder']>>> =>
        result.status === 'fulfilled',
    );
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(nodeSummarySchema.parse(success?.value)).toMatchObject({ kind: 'FOLDER' });
    expect(failure).toMatchObject({
      reason: { response: { error: { code: 'QUOTA_EXCEEDED' } } },
    });
    await expect(
      database.node.count({
        where: {
          dataRoomId: ids.room,
          parentId: { not: null },
          kind: 'FOLDER',
          deletedAt: null,
        },
      }),
    ).resolves.toBe(50);
  });
});

function requireDatabaseUrl(): string {
  if (!databaseUrl) throw new Error('NODE_TEST_DATABASE_URL is required for this suite.');
  return databaseUrl;
}

function requirePrisma(prisma: PrismaClient | undefined): PrismaClient {
  if (!prisma) throw new Error('PostgreSQL integration database is unavailable.');
  return prisma;
}

function requireService(service: NodesService | undefined): NodesService {
  if (!service) throw new Error('PostgreSQL integration service is unavailable.');
  return service;
}

async function expectAttemptAbsent(
  prisma: PrismaClient,
  parentId: string,
  name: string,
): Promise<void> {
  const rows = await prisma.node.findMany({
    where: { dataRoomId: ids.room, parentId, name, deletedAt: null },
    select: { id: true },
  });
  expect(rows).toEqual([]);
}

async function attemptCleanup(action: () => Promise<unknown>): Promise<boolean> {
  try {
    await action();
    return true;
  } catch {
    return false;
  }
}
