import { PrismaPg } from '@prisma/adapter-pg';
import { Client, Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteImpactSchema,
  listNodeChildrenResponseSchema,
  nodeBreadcrumbsResponseSchema,
  nodeSummarySchema,
} from '@data-room/contracts';
import { authenticatedPrincipal } from '../auth/principal.js';
import { AccessPolicyService } from '../access-control/access-policy.service.js';
import { RuntimeControlsService } from '../runtime-controls/runtime-controls.service.js';
import { NodesListService } from './nodes-list.service.js';
import { NodesService } from './nodes.service.js';
import { NodesReadService } from './nodes-read.service.js';
import { DeleteService } from './delete.service.js';

const databaseUrl = process.env.NODE_TEST_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const ids = {
  owner: '11111111-1111-4111-8111-111111111111',
  room: '22222222-2222-4222-8222-222222222222',
  root: '33333333-3333-4333-8333-333333333333',
  child: '44444444-4444-4444-8444-444444444444',
  file: '55555555-5555-4555-8555-555555555555',
  unrelated: '66666666-6666-4666-8666-666666666666',
  viewer: '12121212-1212-4121-8121-121212121212',
  legal: '13131313-1313-4131-8131-131313131313',
  contracts: '14141414-1414-4141-8141-141414141414',
  agreement: '15151515-1515-4151-8151-151515151515',
  sibling: '16161616-1616-4161-8161-161616161616',
  share: '17171717-1717-4171-8171-171717171717',
  tombstonedAncestor: '18181818-1818-4181-8181-181818181818',
  tombstonedDescendant: '19191919-1919-4191-8191-191919191919',
  deletedTarget: '20202020-2020-4202-8202-202020202020',
  missingTarget: '21212121-2121-4212-8212-212121212121',
  pageParent: '77777777-7777-4777-8777-777777777777',
  otherParent: '88888888-8888-4888-8888-888888888888',
  beforeCursor: '99999999-9999-4999-8999-999999999999',
  afterCursor: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  deletedChild: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  foreignRoom: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  foreignRoot: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  foreignChildA: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  foreignChildB: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  renameTarget: '30000000-0000-4000-8000-000000000001',
  renamePeer: '30000000-0000-4000-8000-000000000002',
  renameRaceA: '30000000-0000-4000-8000-000000000003',
  renameRaceB: '30000000-0000-4000-8000-000000000004',
  deleteRoot: '40000000-0000-4000-8000-000000000001',
  deleteFolder: '40000000-0000-4000-8000-000000000002',
  deleteFileA: '40000000-0000-4000-8000-000000000003',
  deleteFileB: '40000000-0000-4000-8000-000000000004',
  deleteOldBranch: '40000000-0000-4000-8000-000000000005',
  deleteOutside: '40000000-0000-4000-8000-000000000006',
  deleteShareRoot: '50000000-0000-4000-8000-000000000001',
  deleteShareFile: '50000000-0000-4000-8000-000000000002',
  deleteShareOld: '50000000-0000-4000-8000-000000000003',
  deleteShareOutside: '50000000-0000-4000-8000-000000000004',
  concurrentDeleteRoot: '60000000-0000-4000-8000-000000000001',
  concurrentDeleteFile: '60000000-0000-4000-8000-000000000002',
};
const schema = `nodes_${process.pid}_${Date.now()}`;
const owner = authenticatedPrincipal(ids.owner, 'owner@example.com');
const viewer = authenticatedPrincipal(ids.viewer, 'viewer@example.com');

run('NodesService PostgreSQL integration', () => {
  let admin: Client | undefined;
  let pool: Pool | undefined;
  let prisma: PrismaClient | undefined;
  let service: NodesService | undefined;
  const signedReadCalls: {
    storageKey: string;
    ttlSeconds: number;
    downloadName?: string;
  }[] = [];
  let listService: NodesListService | undefined;
  let readService: NodesReadService | undefined;
  let deleteService: DeleteService | undefined;

  beforeAll(async () => {
    const connectionString = requireDatabaseUrl();
    admin = new Client({ connectionString, options: `-c search_path=${schema}` });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`
      CREATE TYPE "NodeKind" AS ENUM ('FOLDER', 'FILE');
      CREATE TYPE "SharePrincipalType" AS ENUM ('USER', 'PUBLIC_LINK');
      CREATE TYPE "ShareRole" AS ENUM ('VIEWER', 'EDITOR');
      CREATE TYPE "CleanupStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');
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
        "recipientUserId" uuid, "recipientEmail" text, "tokenHash" bytea,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "revokedAt" timestamptz
      );
      CREATE TABLE "RuntimeControl" (
        "id" integer PRIMARY KEY DEFAULT 1, "registrationOpen" boolean NOT NULL DEFAULT false,
        "uploadsEnabled" boolean NOT NULL DEFAULT false, "publicLinksEnabled" boolean NOT NULL DEFAULT false,
        "maintenanceMode" boolean NOT NULL DEFAULT false, "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "StorageCleanupJob" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "rootNodeId" uuid NOT NULL,
        "status" "CleanupStatus" NOT NULL DEFAULT 'PENDING', "attempts" integer NOT NULL DEFAULT 0,
        "nextAttemptAt" timestamptz NOT NULL DEFAULT now(), "lastErrorCode" varchar(80),
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL,
        CONSTRAINT "StorageCleanupJob_rootNodeId_fkey" FOREIGN KEY ("rootNodeId") REFERENCES "Node" ("id")
      );
      ALTER TABLE "Node" ADD CONSTRAINT "node_kind_fields_ck" CHECK (
        ("kind" = 'FOLDER' AND "sizeBytes" IS NULL AND "mimeType" IS NULL AND "storageKey" IS NULL)
        OR
        ("kind" = 'FILE' AND "sizeBytes" IS NOT NULL AND "sizeBytes" >= 0 AND "mimeType" = 'application/pdf' AND "storageKey" IS NOT NULL)
      );
      ALTER TABLE "Node" ADD CONSTRAINT "node_root_is_folder_ck" CHECK ("parentId" IS NOT NULL OR "kind" = 'FOLDER');
      ALTER TABLE "RuntimeControl" ADD CONSTRAINT "runtime_control_singleton_ck" CHECK ("id" = 1);
      CREATE UNIQUE INDEX "node_active_sibling_name_uq" ON "Node" ("dataRoomId", "parentId", "normalizedName") WHERE "deletedAt" IS NULL AND "parentId" IS NOT NULL;
      CREATE INDEX "node_children_page_idx" ON "Node" ("dataRoomId", "parentId", "kind", "normalizedName", "id") WHERE "deletedAt" IS NULL;
      CREATE UNIQUE INDEX "StorageCleanupJob_rootNodeId_key" ON "StorageCleanupJob" ("rootNodeId");
    `);
    await admin.query('INSERT INTO "UserProfile" ("id", "email") VALUES ($1, $2)', [
      ids.owner,
      'owner@example.com',
    ]);
    await admin.query('INSERT INTO "UserProfile" ("id", "email") VALUES ($1, $2)', [
      ids.unrelated,
      'unrelated@example.com',
    ]);
    await admin.query('INSERT INTO "UserProfile" ("id", "email") VALUES ($1, $2)', [
      ids.viewer,
      'viewer@example.com',
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
    const accessPolicy = new AccessPolicyService(prisma);
    service = new NodesService(prisma, accessPolicy, new RuntimeControlsService(), {
      createSignedReadUrl: (storageKey: string, ttlSeconds: number, downloadName?: string) => {
        signedReadCalls.push({ storageKey, ttlSeconds, ...(downloadName ? { downloadName } : {}) });
        return downloadName ? 'signed-download-url' : 'signed-url';
      },
    } as never);
    listService = new NodesListService(prisma, accessPolicy);
    readService = new NodesReadService(prisma, accessPolicy);
    deleteService = new DeleteService(prisma, accessPolicy);
  });

  beforeEach(async () => {
    const database = requirePrisma(prisma);
    await database.storageCleanupJob.deleteMany({});
    await database.share.deleteMany({});
    await database.runtimeControl.update({
      where: { id: 1 },
      data: { maintenanceMode: false },
    });
    await database.node.deleteMany({
      where: { id: { notIn: [ids.root, ids.child, ids.file] } },
    });
    await database.node.update({
      where: { id: ids.file },
      data: {
        parentId: ids.root,
        name: 'File.pdf',
        normalizedName: 'file.pdf',
        revision: 1,
        deletedAt: null,
      },
    });
    signedReadCalls.length = 0;
    await database.dataRoom.deleteMany({ where: { id: ids.foreignRoom } });
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

  it('proves owner and viewer reads stay inside the authorized breadcrumb root', async () => {
    const database = requirePrisma(prisma);
    const reader = requireReadService(readService);
    await seedReadTree(database);
    await database.share.create({
      data: {
        id: ids.share,
        targetNodeId: ids.legal,
        grantedByUserId: ids.owner,
        principalType: 'USER',
        role: 'VIEWER',
        recipientUserId: ids.viewer,
      },
    });
    const observedIds = [ids.root, ids.legal, ids.contracts, ids.agreement];
    const ownerSharedState = new Map([
      [ids.root, false],
      [ids.legal, true],
      [ids.contracts, true],
      [ids.agreement, true],
    ]);
    const before = await database.node.findMany({
      where: { id: { in: observedIds } },
      select: { id: true, revision: true, updatedAt: true },
    });

    for (const nodeId of observedIds) {
      expect(nodeSummarySchema.parse(await reader.getNode(owner, nodeId))).toMatchObject({
        id: nodeId,
        dataRoomId: ids.room,
        accessRole: 'OWNER',
        isShared: ownerSharedState.get(nodeId),
      });
    }
    expect(nodeSummarySchema.parse(await reader.getNode(owner, ids.agreement))).toMatchObject({
      parentId: ids.contracts,
      kind: 'FILE',
      name: 'Agreement.pdf',
      sizeBytes: '1',
      mimeType: 'application/pdf',
      revision: 1,
    });
    expect(
      nodeBreadcrumbsResponseSchema
        .parse(await reader.getBreadcrumbs(owner, ids.agreement))
        .items.map(({ name }) => name),
    ).toEqual(['Root', 'Legal', 'Contracts', 'Agreement.pdf']);
    expect(nodeSummarySchema.parse(await reader.getNode(viewer, ids.agreement))).toMatchObject({
      id: ids.agreement,
      accessRole: 'VIEWER',
      isShared: true,
    });
    expect(
      (await reader.getBreadcrumbs(viewer, ids.agreement)).items.map(({ name }) => name),
    ).toEqual(['Legal', 'Contracts', 'Agreement.pdf']);
    expect((await reader.getBreadcrumbs(viewer, ids.legal)).items).toHaveLength(1);
    await expect(reader.getNode(viewer, ids.root)).rejects.toMatchObject({
      response: { error: { code: 'ACCESS_DENIED' } },
    });
    await expect(reader.getNode(viewer, ids.sibling)).rejects.toMatchObject({
      response: { error: { code: 'ACCESS_DENIED' } },
    });
    const after = await database.node.findMany({
      where: { id: { in: observedIds } },
      select: { id: true, revision: true, updatedAt: true },
    });
    expect(after).toEqual(before);
  });

  it('denies unrelated, foreign-room, deleted, missing, and revoked-share reads', async () => {
    const database = requirePrisma(prisma);
    const reader = requireReadService(readService);
    const client = requireAdmin(admin);
    const unrelated = authenticatedPrincipal(ids.unrelated, 'unrelated@example.com');
    await seedReadTree(database);
    await seedForeignRoom(client);
    await database.node.createMany({
      data: [
        {
          id: ids.tombstonedAncestor,
          dataRoomId: ids.room,
          parentId: ids.root,
          kind: 'FOLDER',
          name: 'Archived',
          normalizedName: 'archived',
          deletedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: ids.tombstonedDescendant,
          dataRoomId: ids.room,
          parentId: ids.tombstonedAncestor,
          kind: 'FOLDER',
          name: 'Still active',
          normalizedName: 'still active',
        },
        {
          id: ids.deletedTarget,
          dataRoomId: ids.room,
          parentId: ids.root,
          kind: 'FOLDER',
          name: 'Deleted target',
          normalizedName: 'deleted target',
          deletedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });
    await database.share.create({
      data: {
        id: ids.share,
        targetNodeId: ids.legal,
        grantedByUserId: ids.owner,
        principalType: 'USER',
        role: 'VIEWER',
        recipientUserId: ids.viewer,
        revokedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    const deniedReads = [
      () => reader.getNode(unrelated, ids.agreement),
      () => reader.getNode(owner, ids.foreignChildA),
      () => reader.getBreadcrumbs(owner, ids.tombstonedDescendant),
      () => reader.getNode(owner, ids.deletedTarget),
      () => reader.getNode(owner, ids.missingTarget),
      () => reader.getBreadcrumbs(viewer, ids.agreement),
    ];
    for (const read of deniedReads) {
      await expect(read()).rejects.toMatchObject({
        response: { error: { code: 'ACCESS_DENIED', message: 'Access denied.' } },
      });
    }
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

  it('renames with revision compare-and-swap and maps sibling conflicts safely', async () => {
    const nodes = requireService(service);
    const database = requirePrisma(prisma);
    await createFolderFixture(database, ids.renameTarget, ids.root, 'Rename target');
    await createFolderFixture(database, ids.renamePeer, ids.root, 'Existing peer');

    const renamed = nodeSummarySchema.parse(
      await nodes.renameNode(owner, ids.renameTarget, {
        name: 'Renamed target',
        expectedRevision: 1,
      }),
    );
    expect(renamed).toMatchObject({
      id: ids.renameTarget,
      name: 'Renamed target',
      revision: 2,
      accessRole: 'OWNER',
    });
    await expect(
      nodes.renameNode(owner, ids.renameTarget, { name: 'Stale overwrite', expectedRevision: 1 }),
    ).rejects.toMatchObject({ response: { error: { code: 'CONFLICT' } } });
    await expect(
      nodes.renameNode(owner, ids.renameTarget, { name: 'Existing peer', expectedRevision: 2 }),
    ).rejects.toMatchObject({
      response: {
        error: { code: 'NAME_CONFLICT', details: { suggestedName: 'Existing peer (1)' } },
      },
    });

    const after = await database.node.findUniqueOrThrow({ where: { id: ids.renameTarget } });
    expect(after).toMatchObject({
      name: 'Renamed target',
      normalizedName: 'renamed target',
      revision: 2,
    });
    await database.share.create({
      data: {
        id: ids.share,
        targetNodeId: ids.renameTarget,
        grantedByUserId: ids.owner,
        principalType: 'USER',
        role: 'VIEWER',
        recipientUserId: ids.viewer,
      },
    });
    await expect(
      nodes.renameNode(viewer, ids.renameTarget, { name: 'Viewer attempt', expectedRevision: 2 }),
    ).rejects.toMatchObject({ response: { error: { code: 'ACCESS_DENIED' } } });
    await expect(
      database.node.findUniqueOrThrow({ where: { id: ids.renameTarget } }),
    ).resolves.toMatchObject({
      name: 'Renamed target',
      revision: 2,
    });
  });

  it('moves an active file within the room without changing its storage key', async () => {
    const nodes = requireService(service);
    const database = requirePrisma(prisma);
    const before = await database.node.findUniqueOrThrow({ where: { id: ids.file } });
    const moved = nodeSummarySchema.parse(
      await nodes.moveFile(owner, ids.file, { targetFolderId: ids.child, expectedRevision: 1 }),
    );
    expect(moved).toMatchObject({ id: ids.file, parentId: ids.child, revision: 2 });
    const after = await database.node.findUniqueOrThrow({ where: { id: ids.file } });
    expect(after).toMatchObject({
      parentId: ids.child,
      revision: 2,
      storageKey: before.storageKey,
    });
  });

  it('denies cross-room and deleted move targets without changing the file', async () => {
    const nodes = requireService(service);
    const database = requirePrisma(prisma);
    const client = requireAdmin(admin);
    await seedForeignRoom(client);
    await database.node.create({
      data: {
        id: ids.deletedTarget,
        dataRoomId: ids.room,
        parentId: ids.root,
        kind: 'FOLDER',
        name: 'Deleted target',
        normalizedName: 'deleted target',
        deletedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    for (const targetFolderId of [ids.foreignChildA, ids.deletedTarget]) {
      await expect(
        nodes.moveFile(owner, ids.file, { targetFolderId, expectedRevision: 1 }),
      ).rejects.toMatchObject({ response: { error: { code: 'ACCESS_DENIED' } } });
    }
    await expect(
      database.node.findUniqueOrThrow({ where: { id: ids.file } }),
    ).resolves.toMatchObject({
      parentId: ids.root,
      revision: 1,
    });
  });

  it('returns a suggestion on move name conflict without overwriting the target', async () => {
    const nodes = requireService(service);
    const database = requirePrisma(prisma);
    await createFileFixture(database, ids.beforeCursor, ids.child, 'File.pdf', 'file.pdf');
    await expect(
      nodes.moveFile(owner, ids.file, { targetFolderId: ids.child, expectedRevision: 1 }),
    ).rejects.toMatchObject({
      response: { error: { code: 'NAME_CONFLICT', details: { suggestedName: 'File (1).pdf' } } },
    });
    await expect(
      database.node.findUniqueOrThrow({ where: { id: ids.file } }),
    ).resolves.toMatchObject({
      parentId: ids.root,
      revision: 1,
      storageKey: 'tests/file.pdf',
    });
  });

  it('creates a 60-second URL for a shared viewer and never for revoked or deleted access', async () => {
    const nodes = requireService(service);
    const database = requirePrisma(prisma);
    await database.share.create({
      data: {
        id: ids.share,
        targetNodeId: ids.file,
        grantedByUserId: ids.owner,
        principalType: 'USER',
        role: 'VIEWER',
        recipientUserId: ids.viewer,
      },
    });
    await expect(nodes.createViewUrl(viewer, ids.file)).resolves.toMatchObject({
      url: 'signed-url',
      downloadUrl: 'signed-download-url',
      expiresAt: expect.any(String) as string,
    });
    expect(signedReadCalls).toEqual([
      { storageKey: 'tests/file.pdf', ttlSeconds: 60 },
      { storageKey: 'tests/file.pdf', ttlSeconds: 60, downloadName: 'File.pdf' },
    ]);
    await database.share.update({ where: { id: ids.share }, data: { revokedAt: new Date() } });
    await expect(nodes.createViewUrl(viewer, ids.file)).rejects.toMatchObject({
      response: { error: { code: 'ACCESS_DENIED' } },
    });
    await database.node.update({ where: { id: ids.file }, data: { deletedAt: new Date() } });
    await expect(nodes.createViewUrl(owner, ids.file)).rejects.toMatchObject({
      response: { error: { code: 'ACCESS_DENIED' } },
    });
    expect(signedReadCalls).toHaveLength(2);
  });

  it('allows one same-revision rename and one same-sibling-name winner under concurrency', async () => {
    const nodes = requireService(service);
    const database = requirePrisma(prisma);
    await createFolderFixture(database, ids.renameRaceA, ids.root, 'Race A');
    await createFolderFixture(database, ids.renameRaceB, ids.root, 'Race B');

    const sameNode = await Promise.allSettled([
      nodes.renameNode(owner, ids.renameRaceA, { name: 'First tab', expectedRevision: 1 }),
      nodes.renameNode(owner, ids.renameRaceA, { name: 'Second tab', expectedRevision: 1 }),
    ]);
    expect(sameNode.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(sameNode.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(sameNode.find(({ status }) => status === 'rejected')).toMatchObject({
      reason: { response: { error: { code: 'CONFLICT' } } },
    });
    await expect(
      database.node.findUniqueOrThrow({ where: { id: ids.renameRaceA } }),
    ).resolves.toMatchObject({
      revision: 2,
    });

    const siblingRace = await Promise.allSettled([
      nodes.renameNode(owner, ids.renameRaceA, { name: 'Collision', expectedRevision: 2 }),
      nodes.renameNode(owner, ids.renameRaceB, { name: 'Collision', expectedRevision: 1 }),
    ]);
    expect(siblingRace.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(siblingRace.find(({ status }) => status === 'rejected')).toMatchObject({
      reason: { response: { error: { code: 'NAME_CONFLICT' } } },
    });
    await expect(
      database.node.count({
        where: {
          dataRoomId: ids.room,
          parentId: ids.root,
          normalizedName: 'collision',
          deletedAt: null,
        },
      }),
    ).resolves.toBe(1);
  });

  it('returns exact delete impact and atomically tombstones, revokes, and enqueues once', async () => {
    const deletion = requireDeleteService(deleteService);
    const reader = requireReadService(readService);
    const database = requirePrisma(prisma);
    await seedDeleteTree(database);

    const expectedImpact = {
      rootNodeId: ids.deleteRoot,
      folderCount: 1,
      fileCount: 2,
      totalBytes: '18',
      activeShareCount: 2,
    };
    expect(deleteImpactSchema.parse(await deletion.getDeleteImpact(owner, ids.deleteRoot))).toEqual(
      expectedImpact,
    );
    expect(deleteImpactSchema.parse(await deletion.deleteNode(owner, ids.deleteRoot))).toEqual(
      expectedImpact,
    );

    const deleted = await database.node.findMany({
      where: { id: { in: [ids.deleteRoot, ids.deleteFolder, ids.deleteFileA, ids.deleteFileB] } },
      orderBy: { id: 'asc' },
      select: { id: true, revision: true, deletedAt: true },
    });
    expect(deleted).toHaveLength(4);
    expect(deleted.every(({ revision, deletedAt }) => revision === 2 && deletedAt !== null)).toBe(
      true,
    );
    expect(new Set(deleted.map(({ deletedAt }) => deletedAt?.toISOString())).size).toBe(1);
    await expect(
      database.node.findUniqueOrThrow({ where: { id: ids.deleteOldBranch } }),
    ).resolves.toMatchObject({
      revision: 1,
      deletedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await expect(
      database.node.findUniqueOrThrow({ where: { id: ids.deleteOutside } }),
    ).resolves.toMatchObject({
      revision: 1,
      deletedAt: null,
    });

    const shares = await database.share.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, revokedAt: true },
    });
    expect(
      shares
        .filter(({ id }) => [ids.deleteShareRoot, ids.deleteShareFile].includes(id))
        .every(({ revokedAt }) => revokedAt !== null),
    ).toBe(true);
    expect(
      shares
        .filter(({ id }) => [ids.deleteShareOld, ids.deleteShareOutside].includes(id))
        .every(({ revokedAt }) => revokedAt === null),
    ).toBe(true);
    await expect(
      database.storageCleanupJob.count({ where: { rootNodeId: ids.deleteRoot } }),
    ).resolves.toBe(1);
    await expect(reader.getNode(owner, ids.deleteRoot)).rejects.toMatchObject({
      response: { error: { code: 'ACCESS_DENIED' } },
    });

    const beforeRepeat = deleted.map(({ id, revision, deletedAt }) => ({
      id,
      revision,
      deletedAt,
    }));
    expect(deleteImpactSchema.parse(await deletion.deleteNode(owner, ids.deleteRoot))).toEqual({
      rootNodeId: ids.deleteRoot,
      folderCount: 0,
      fileCount: 0,
      totalBytes: '0',
      activeShareCount: 0,
    });
    const afterRepeat = await database.node.findMany({
      where: { id: { in: [ids.deleteRoot, ids.deleteFolder, ids.deleteFileA, ids.deleteFileB] } },
      orderBy: { id: 'asc' },
      select: { id: true, revision: true, deletedAt: true },
    });
    expect(afterRepeat).toEqual(beforeRepeat);
    await expect(
      database.storageCleanupJob.count({ where: { rootNodeId: ids.deleteRoot } }),
    ).resolves.toBe(1);
    await expect(deletion.deleteNode(viewer, ids.deleteRoot)).rejects.toMatchObject({
      response: { error: { code: 'ACCESS_DENIED' } },
    });
  });

  it('rejects room-root deletion without a node, share, or cleanup-job write', async () => {
    const deletion = requireDeleteService(deleteService);
    const database = requirePrisma(prisma);
    const before = await database.node.findUniqueOrThrow({ where: { id: ids.root } });

    await expect(deletion.deleteNode(owner, ids.root)).rejects.toMatchObject({
      response: { error: { code: 'CONFLICT' } },
    });
    await expect(database.node.findUniqueOrThrow({ where: { id: ids.root } })).resolves.toEqual(
      before,
    );
    await expect(database.storageCleanupJob.count()).resolves.toBe(0);
  });

  it('keeps concurrent delete idempotent with one cleanup job and no partial state', async () => {
    const deletion = requireDeleteService(deleteService);
    const database = requirePrisma(prisma);
    await createFolderFixture(database, ids.concurrentDeleteRoot, ids.root, 'Concurrent delete');
    await createFileFixture(
      database,
      ids.concurrentDeleteFile,
      ids.concurrentDeleteRoot,
      'Concurrent.pdf',
      'concurrent.pdf',
    );

    const results = await Promise.allSettled([
      deletion.deleteNode(owner, ids.concurrentDeleteRoot),
      deletion.deleteNode(owner, ids.concurrentDeleteRoot),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(2);
    expect(
      results
        .map((result) => {
          if (result.status !== 'fulfilled') throw result.reason;
          return deleteImpactSchema.parse(result.value).fileCount;
        })
        .toSorted(),
    ).toEqual([0, 1]);
    const nodes = await database.node.findMany({
      where: { id: { in: [ids.concurrentDeleteRoot, ids.concurrentDeleteFile] } },
      select: { revision: true, deletedAt: true },
    });
    expect(nodes.every(({ revision, deletedAt }) => revision === 2 && deletedAt !== null)).toBe(
      true,
    );
    await expect(
      database.storageCleanupJob.count({ where: { rootNodeId: ids.concurrentDeleteRoot } }),
    ).resolves.toBe(1);
  });

  it('serializes create versus delete so returned impact matches the tombstoned subtree', async () => {
    const nodes = requireService(service);
    const deletion = requireDeleteService(deleteService);
    const database = requirePrisma(prisma);
    await createFolderFixture(database, ids.deleteRoot, ids.root, 'Delete versus create');
    await createFolderFixture(database, ids.deleteFolder, ids.deleteRoot, 'Existing descendant');

    const [deleteResult, createResult] = await Promise.allSettled([
      deletion.deleteNode(owner, ids.deleteRoot),
      nodes.createFolder(owner, { parentId: ids.deleteRoot, name: 'Racing descendant' }),
    ]);
    expect(deleteResult.status).toBe('fulfilled');
    const impact = deleteImpactSchema.parse(
      (deleteResult as PromiseFulfilledResult<unknown>).value,
    );
    const tombstonedDescendantFolders = await database.node.count({
      where: {
        dataRoomId: ids.room,
        parentId: ids.deleteRoot,
        kind: 'FOLDER',
        deletedAt: { not: null },
      },
    });
    expect(impact.folderCount).toBe(tombstonedDescendantFolders);
    if (createResult.status === 'fulfilled') {
      const created = await database.node.findUniqueOrThrow({
        where: { id: createResult.value.id },
      });
      expect(created).toMatchObject({ revision: 2 });
      expect(created.deletedAt).toBeInstanceOf(Date);
    } else {
      expect(createResult.reason).toMatchObject({
        response: { error: { code: 'ACCESS_DENIED' } },
      });
    }
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

  it('paginates 51 children stably across inserts with no writes or duplicates', async () => {
    const reader = requireListService(listService);
    const database = requirePrisma(prisma);
    await createFolderFixture(database, ids.pageParent, ids.root, 'Page Parent');
    const original = Array.from({ length: 51 }, (_, index) => paginationChild(index));
    await database.node.createMany({ data: original });
    await createFileFixture(
      database,
      ids.deletedChild,
      ids.pageParent,
      'Deleted.pdf',
      'deleted.pdf',
      new Date('2026-01-01T00:00:00.000Z'),
    );

    const first = listNodeChildrenResponseSchema.parse(
      await reader.listChildren(owner, ids.pageParent, { limit: 50 }),
    );
    expect(first.items.map(({ id }) => id)).toEqual(original.slice(0, 50).map(({ id }) => id));
    expect(first.pageInfo.hasNextPage).toBe(true);
    const cursor = requireCursor(first.pageInfo.nextCursor);

    await createFileFixture(
      database,
      ids.beforeCursor,
      ids.pageParent,
      'Item 048z.pdf',
      'item-048z.pdf',
    );
    await createFileFixture(
      database,
      ids.afterCursor,
      ids.pageParent,
      'Item 999.pdf',
      'item-999.pdf',
    );
    const beforeRead = await paginationSnapshot(database);
    const second = listNodeChildrenResponseSchema.parse(
      await reader.listChildren(owner, ids.pageParent, { cursor, limit: 50 }),
    );
    const afterRead = await paginationSnapshot(database);

    expect(second.items.map(({ id }) => id)).toEqual([original[50]?.id, ids.afterCursor]);
    expect(second.pageInfo).toEqual({ nextCursor: null, hasNextPage: false });
    expect(afterRead).toEqual(beforeRead);
    assertStableTraversal(
      first.items,
      second.items,
      original.map(({ id }) => id),
    );
    for (const item of [...first.items, ...second.items]) nodeSummarySchema.parse(item);
  });

  it('binds cursors and authorization to the exact parent context', async () => {
    const reader = requireListService(listService);
    const database = requirePrisma(prisma);
    const client = requireAdmin(admin);
    await createFolderFixture(database, ids.pageParent, ids.root, 'Page Parent');
    await createFolderFixture(database, ids.otherParent, ids.root, 'Other Parent');
    await database.node.createMany({
      data: Array.from({ length: 2 }, (_, index) => paginationChild(index)),
    });
    const first = await reader.listChildren(owner, ids.pageParent, { limit: 1 });
    const cursor = requireCursor(first.pageInfo.nextCursor);

    await expect(
      reader.listChildren(owner, ids.otherParent, { cursor, limit: 50 }),
    ).rejects.toMatchObject({ response: { error: { code: 'VALIDATION_FAILED' } } });
    const unrelated = authenticatedPrincipal(ids.unrelated, 'unrelated@example.com');
    await expect(
      reader.listChildren(unrelated, ids.pageParent, { limit: 50 }),
    ).rejects.toMatchObject({ response: { error: { code: 'ACCESS_DENIED' } } });

    await seedForeignRoom(client);
    const foreignPage = await reader.listChildren(unrelated, ids.foreignRoot, { limit: 1 });
    const foreignCursor = requireCursor(foreignPage.pageInfo.nextCursor);
    await expect(
      reader.listChildren(owner, ids.pageParent, { cursor: foreignCursor, limit: 50 }),
    ).rejects.toMatchObject({ response: { error: { code: 'VALIDATION_FAILED' } } });
    await expect(reader.listChildren(owner, ids.foreignRoot, { limit: 50 })).rejects.toMatchObject({
      response: { error: { code: 'ACCESS_DENIED' } },
    });
  });

  it('installs the exact production partial children-page index', async () => {
    const client = requireAdmin(admin);
    const result = await client.query<{ indexdef: string }>(
      'SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND indexname = $2',
      [schema, 'node_children_page_idx'],
    );
    const definition = result.rows[0]?.indexdef.replaceAll('"', '').replace(/\s+/gu, ' ');
    expect(definition).toContain('(dataRoomId, parentId, kind, normalizedName, id)');
    expect(definition).toContain('WHERE (deletedAt IS NULL)');
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

function requireListService(service: NodesListService | undefined): NodesListService {
  if (!service) throw new Error('PostgreSQL list service is unavailable.');
  return service;
}

function requireReadService(service: NodesReadService | undefined): NodesReadService {
  if (!service) throw new Error('PostgreSQL read service is unavailable.');
  return service;
}

function requireDeleteService(service: DeleteService | undefined): DeleteService {
  if (!service) throw new Error('PostgreSQL delete service is unavailable.');
  return service;
}

function requireAdmin(admin: Client | undefined): Client {
  if (!admin) throw new Error('PostgreSQL integration admin client is unavailable.');
  return admin;
}

function requireCursor(cursor: string | null): string {
  if (!cursor) throw new Error('Expected a next-page cursor.');
  return cursor;
}

function paginationChild(index: number) {
  const kind = index < 26 ? ('FOLDER' as const) : ('FILE' as const);
  const position = String(index).padStart(3, '0');
  return {
    id: `80000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    dataRoomId: ids.room,
    parentId: ids.pageParent,
    kind,
    name:
      index % 2 === 0
        ? `ITEM ${position}${kind === 'FILE' ? '.pdf' : ''}`
        : `Item ${position}${kind === 'FILE' ? '.pdf' : ''}`,
    normalizedName: `item-${position}${kind === 'FILE' ? '.pdf' : ''}`,
    sizeBytes: kind === 'FILE' ? BigInt(index + 1) : null,
    mimeType: kind === 'FILE' ? 'application/pdf' : null,
    storageKey: kind === 'FILE' ? `tests/page/${position}.pdf` : null,
  };
}

async function seedReadTree(prisma: PrismaClient): Promise<void> {
  await prisma.node.createMany({
    data: [
      {
        id: ids.legal,
        dataRoomId: ids.room,
        parentId: ids.root,
        kind: 'FOLDER',
        name: 'Legal',
        normalizedName: 'legal',
      },
      {
        id: ids.contracts,
        dataRoomId: ids.room,
        parentId: ids.legal,
        kind: 'FOLDER',
        name: 'Contracts',
        normalizedName: 'contracts',
      },
      {
        id: ids.agreement,
        dataRoomId: ids.room,
        parentId: ids.contracts,
        kind: 'FILE',
        name: 'Agreement.pdf',
        normalizedName: 'agreement.pdf',
        sizeBytes: 1n,
        mimeType: 'application/pdf',
        storageKey: 'private/agreement',
      },
      {
        id: ids.sibling,
        dataRoomId: ids.room,
        parentId: ids.root,
        kind: 'FOLDER',
        name: 'Outside',
        normalizedName: 'outside',
      },
    ],
  });
}

async function seedDeleteTree(prisma: PrismaClient): Promise<void> {
  await prisma.node.createMany({
    data: [
      {
        id: ids.deleteRoot,
        dataRoomId: ids.room,
        parentId: ids.root,
        kind: 'FOLDER',
        name: 'Delete root',
        normalizedName: 'delete root',
      },
      {
        id: ids.deleteFolder,
        dataRoomId: ids.room,
        parentId: ids.deleteRoot,
        kind: 'FOLDER',
        name: 'Delete child',
        normalizedName: 'delete child',
      },
      {
        id: ids.deleteFileA,
        dataRoomId: ids.room,
        parentId: ids.deleteRoot,
        kind: 'FILE',
        name: 'Seven.pdf',
        normalizedName: 'seven.pdf',
        sizeBytes: 7n,
        mimeType: 'application/pdf',
        storageKey: 'tests/delete/seven.pdf',
      },
      {
        id: ids.deleteFileB,
        dataRoomId: ids.room,
        parentId: ids.deleteFolder,
        kind: 'FILE',
        name: 'Eleven.pdf',
        normalizedName: 'eleven.pdf',
        sizeBytes: 11n,
        mimeType: 'application/pdf',
        storageKey: 'tests/delete/eleven.pdf',
      },
      {
        id: ids.deleteOldBranch,
        dataRoomId: ids.room,
        parentId: ids.deleteRoot,
        kind: 'FOLDER',
        name: 'Already deleted',
        normalizedName: 'already deleted',
        deletedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: ids.deleteOutside,
        dataRoomId: ids.room,
        parentId: ids.root,
        kind: 'FOLDER',
        name: 'Outside delete',
        normalizedName: 'outside delete',
      },
    ],
  });
  await prisma.share.createMany({
    data: [
      {
        id: ids.deleteShareRoot,
        targetNodeId: ids.deleteRoot,
        grantedByUserId: ids.owner,
        principalType: 'USER',
        role: 'VIEWER',
        recipientUserId: ids.viewer,
      },
      {
        id: ids.deleteShareFile,
        targetNodeId: ids.deleteFileB,
        grantedByUserId: ids.owner,
        principalType: 'USER',
        role: 'VIEWER',
        recipientUserId: ids.viewer,
      },
      {
        id: ids.deleteShareOld,
        targetNodeId: ids.deleteOldBranch,
        grantedByUserId: ids.owner,
        principalType: 'USER',
        role: 'VIEWER',
        recipientUserId: ids.viewer,
      },
      {
        id: ids.deleteShareOutside,
        targetNodeId: ids.deleteOutside,
        grantedByUserId: ids.owner,
        principalType: 'USER',
        role: 'VIEWER',
        recipientUserId: ids.viewer,
      },
    ],
  });
}

async function createFolderFixture(
  prisma: PrismaClient,
  id: string,
  parentId: string,
  name: string,
): Promise<void> {
  await prisma.node.create({
    data: {
      id,
      dataRoomId: ids.room,
      parentId,
      kind: 'FOLDER',
      name,
      normalizedName: name.toLocaleLowerCase('en-US'),
    },
  });
}

async function createFileFixture(
  prisma: PrismaClient,
  id: string,
  parentId: string,
  name: string,
  normalizedName: string,
  deletedAt: Date | null = null,
): Promise<void> {
  await prisma.node.create({
    data: {
      id,
      dataRoomId: ids.room,
      parentId,
      kind: 'FILE',
      name,
      normalizedName,
      sizeBytes: 1n,
      mimeType: 'application/pdf',
      storageKey: `tests/page/${id}.pdf`,
      deletedAt,
    },
  });
}

async function seedForeignRoom(client: Client): Promise<void> {
  await client.query('INSERT INTO "DataRoom" ("id", "ownerId", "name") VALUES ($1, $2, $3)', [
    ids.foreignRoom,
    ids.unrelated,
    'Foreign Room',
  ]);
  await client.query(
    'INSERT INTO "Node" ("id", "dataRoomId", "kind", "name", "normalizedName") VALUES ($1, $2, $3, $4, $5)',
    [ids.foreignRoot, ids.foreignRoom, 'FOLDER', 'Foreign Root', 'foreign root'],
  );
  for (const [id, suffix] of [
    [ids.foreignChildA, 'a'],
    [ids.foreignChildB, 'b'],
  ]) {
    await client.query(
      'INSERT INTO "Node" ("id", "dataRoomId", "parentId", "kind", "name", "normalizedName") VALUES ($1, $2, $3, $4, $5, $6)',
      [id, ids.foreignRoom, ids.foreignRoot, 'FOLDER', `Foreign ${suffix}`, `foreign-${suffix}`],
    );
  }
}

async function paginationSnapshot(prisma: PrismaClient) {
  return prisma.node.findMany({
    where: { dataRoomId: ids.room, parentId: ids.pageParent },
    orderBy: { id: 'asc' },
    select: { id: true, revision: true, updatedAt: true, deletedAt: true },
  });
}

function assertStableTraversal(
  first: { id: string }[],
  second: { id: string }[],
  originalIds: string[],
): void {
  const traversed = [...first, ...second].map(({ id }) => id);
  expect(new Set(traversed).size).toBe(traversed.length);
  expect(traversed).not.toContain(ids.beforeCursor);
  expect(traversed.filter((id) => id === ids.afterCursor)).toHaveLength(1);
  expect(traversed).not.toContain(ids.deletedChild);
  expect(traversed.filter((id) => originalIds.includes(id)).sort()).toEqual(originalIds.toSorted());
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
