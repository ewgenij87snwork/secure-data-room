import { PrismaPg } from '@prisma/adapter-pg';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma/client.js';
import { authenticatedPrincipal } from '../auth/principal.js';
import { AccessPolicyService } from '../access-control/access-policy.service.js';
import { RuntimeControlsService } from '../runtime-controls/runtime-controls.service.js';
import { SharesService } from './shares.service.js';

const databaseUrl =
  process.env.SHARES_TEST_DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  process.env.NODE_TEST_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const schema = `shares_${process.pid}_${Date.now()}`;
const ids = {
  owner: '11111111-1111-4111-8111-111111111111',
  recipient: '22222222-2222-4222-8222-222222222222',
  room: '33333333-3333-4333-8333-333333333333',
  root: '44444444-4444-4444-8444-444444444444',
  target: '55555555-5555-4555-8555-555555555555',
  child: '55555555-5555-4555-8555-555555555556',
  sibling: '55555555-5555-4555-8555-555555555557',
};
const owner = authenticatedPrincipal(ids.owner, 'owner@example.com');
const recipient = authenticatedPrincipal(ids.recipient, 'recipient@example.com');

run('SharesService PostgreSQL integration', () => {
  let admin: Client;
  let pool: Pool;
  let prisma: PrismaClient;
  let shares: SharesService;
  let policy: AccessPolicyService;

  beforeAll(async () => {
    admin = new Client({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`
      CREATE TYPE "NodeKind" AS ENUM ('FOLDER', 'FILE');
      CREATE TYPE "SharePrincipalType" AS ENUM ('USER', 'PUBLIC_LINK');
      CREATE TYPE "ShareRole" AS ENUM ('VIEWER', 'EDITOR');
      CREATE TABLE "UserProfile" (
        "id" uuid PRIMARY KEY, "email" text NOT NULL, "displayName" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "DataRoom" (
        "id" uuid PRIMARY KEY, "ownerId" uuid NOT NULL, "name" text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "Node" (
        "id" uuid PRIMARY KEY, "dataRoomId" uuid NOT NULL, "parentId" uuid,
        "kind" "NodeKind" NOT NULL, "name" text NOT NULL, "normalizedName" text NOT NULL,
        "sizeBytes" bigint, "mimeType" text, "storageKey" text,
        "revision" integer NOT NULL DEFAULT 1, "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(), "deletedAt" timestamptz
      );
      CREATE TABLE "Share" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "targetNodeId" uuid NOT NULL,
        "grantedByUserId" uuid NOT NULL, "principalType" "SharePrincipalType" NOT NULL,
        "role" "ShareRole" NOT NULL DEFAULT 'VIEWER', "recipientUserId" uuid,
        "recipientEmail" text, "tokenHash" bytea, "createdAt" timestamptz NOT NULL DEFAULT now(),
        "revokedAt" timestamptz
      );
      CREATE TABLE "RuntimeControl" (
        "id" integer PRIMARY KEY DEFAULT 1, "registrationOpen" boolean NOT NULL DEFAULT false,
        "uploadsEnabled" boolean NOT NULL DEFAULT false, "publicLinksEnabled" boolean NOT NULL DEFAULT true,
        "maintenanceMode" boolean NOT NULL DEFAULT false, "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "share_public_token_hash_uq" ON "Share" ("tokenHash") WHERE "tokenHash" IS NOT NULL;
      CREATE UNIQUE INDEX "share_active_recipient_user_uq" ON "Share" ("targetNodeId", "recipientUserId")
        WHERE "revokedAt" IS NULL AND "principalType" = 'USER' AND "recipientUserId" IS NOT NULL;
      CREATE UNIQUE INDEX "share_active_recipient_email_uq" ON "Share" ("targetNodeId", "recipientEmail")
        WHERE "revokedAt" IS NULL AND "principalType" = 'USER' AND "recipientUserId" IS NULL AND "recipientEmail" IS NOT NULL;
    `);
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    prisma = new PrismaClient({
      adapter: new PrismaPg(pool, { schema, disposeExternalPool: false }),
    });
    policy = new AccessPolicyService(prisma);
    shares = new SharesService(prisma as never, policy, new RuntimeControlsService());
  });

  beforeEach(async () => {
    await admin.query('DELETE FROM "Share"');
    await admin.query('DELETE FROM "Node"');
    await admin.query('DELETE FROM "DataRoom"');
    await admin.query('DELETE FROM "UserProfile"');
    await admin.query('DELETE FROM "RuntimeControl"');
    await admin.query(
      'INSERT INTO "UserProfile" ("id", "email", "displayName") VALUES ($1, $2, $3), ($4, $5, $6)',
      [
        ids.owner,
        owner.email,
        'Owner Profile',
        ids.recipient,
        recipient.email,
        'Recipient Profile',
      ],
    );
    await admin.query('INSERT INTO "DataRoom" ("id", "ownerId", "name") VALUES ($1, $2, $3)', [
      ids.room,
      ids.owner,
      'Room',
    ]);
    await admin.query(
      `INSERT INTO "Node" ("id", "dataRoomId", "parentId", "kind", "name", "normalizedName")
       VALUES ($1, $2, NULL, 'FOLDER', 'Root', 'root'), ($3, $2, $1, 'FOLDER', 'Target', 'target'),
       ($4, $2, $1, 'FILE', 'Sibling.pdf', 'sibling.pdf')`,
      [ids.root, ids.room, ids.target, ids.sibling],
    );
    await admin.query('INSERT INTO "RuntimeControl" ("id", "publicLinksEnabled") VALUES (1, true)');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    await pool.end();
  });

  it('persists an unregistered recipient email and permits later bootstrap binding', async () => {
    const email = 'new-user@example.com';
    const result = await shares.createPermissioned(owner, ids.target, { email, role: 'VIEWER' });
    const row = await prisma.share.findUnique({ where: { id: result.id } });
    expect(row).toMatchObject({
      recipientEmail: email,
      recipientUserId: null,
      principalType: 'USER',
    });

    await prisma.userProfile.create({
      data: { id: '66666666-6666-4666-8666-666666666666', email },
    });
    await prisma.share.update({
      where: { id: result.id },
      data: { recipientUserId: '66666666-6666-4666-8666-666666666666' },
    });
    await expect(prisma.share.findUnique({ where: { id: result.id } })).resolves.toMatchObject({
      recipientEmail: email,
      recipientUserId: '66666666-6666-4666-8666-666666666666',
    });
  });

  it('binds an existing user immediately and exposes the owner profile in cursor pages', async () => {
    const created = await shares.createPermissioned(owner, ids.target, {
      email: ` ${recipient.email.toUpperCase()} `,
      role: 'VIEWER',
    });
    expect(await prisma.share.findUnique({ where: { id: created.id } })).toMatchObject({
      recipientEmail: recipient.email,
      recipientUserId: ids.recipient,
    });

    const later = new Date('2026-08-20T12:00:00.000Z');
    const earlier = new Date('2026-08-20T11:00:00.000Z');
    await prisma.share.update({ where: { id: created.id }, data: { createdAt: later } });
    await prisma.share.create({
      data: {
        targetNodeId: ids.root,
        grantedByUserId: ids.owner,
        principalType: 'USER',
        recipientUserId: ids.recipient,
        recipientEmail: recipient.email,
        createdAt: earlier,
      },
    });
    const first = await shares.sharedWithMe(recipient, undefined, 1);
    expect(first.items.map((item) => item.share.targetNodeId)).toEqual([ids.target]);
    expect(first.items[0]?.owner).toEqual({
      id: ids.owner,
      email: owner.email,
      displayName: 'Owner Profile',
    });
    expect(first.pageInfo.hasNextPage).toBe(true);
    const second = await shares.sharedWithMe(recipient, first.pageInfo.nextCursor!, 1);
    expect(second.items.map((item) => item.share.targetNodeId)).toEqual([ids.root]);
    expect(second.pageInfo.nextCursor).toBeNull();
  });

  it('maps concurrent duplicate permissioned creation through the real unique index', async () => {
    const results = await Promise.allSettled([
      shares.createPermissioned(owner, ids.target, { email: 'race@example.com', role: 'VIEWER' }),
      shares.createPermissioned(owner, ids.target, { email: 'race@example.com', role: 'VIEWER' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      status: 'rejected',
      reason: { response: { error: { code: 'CONFLICT' } } },
    });
    await expect(
      prisma.share.count({ where: { targetNodeId: ids.target, revokedAt: null } }),
    ).resolves.toBe(1);
  });

  it('stores only a 32-byte public digest and denies resolution and policy reads after revoke', async () => {
    const created = await shares.createPublic(owner, ids.target);
    const token = created.url.split('#token=')[1]!;
    const row = await prisma.share.findUnique({ where: { id: created.shareId } });
    expect(row?.tokenHash).toBeInstanceOf(Buffer);
    expect((row?.tokenHash as Buffer).length).toBe(32);
    expect((row?.tokenHash as Buffer).toString('base64url')).not.toBe(token);
    expect(row?.tokenHash?.toString()).not.toContain(token);

    const publicPrincipal = await shares.resolvePublic(token);
    await expect(policy.assertCanReadNode(publicPrincipal, ids.target)).resolves.toMatchObject({
      nodeId: ids.target,
    });
    await shares.revoke(owner, created.shareId);
    await expect(shares.resolvePublic(token)).rejects.toThrow(/invalid public share token/i);
    await expect(policy.assertCanReadNode(publicPrincipal, ids.target)).rejects.toThrow(
      /access denied/i,
    );
  });

  it('allows public target descendants but denies the ancestor and sibling', async () => {
    const created = await shares.createPublic(owner, ids.target);
    const publicPrincipal = await shares.resolvePublic(created.url.split('#token=')[1]);
    await admin.query(
      `INSERT INTO "Node" ("id", "dataRoomId", "parentId", "kind", "name", "normalizedName")
       VALUES ($1, $2, $3, 'FILE', 'Child.pdf', 'child.pdf')`,
      [ids.child, ids.room, ids.target],
    );
    await expect(policy.assertCanReadNode(publicPrincipal, ids.child)).resolves.toMatchObject({
      accessRootNodeId: ids.target,
    });
    await expect(policy.assertCanReadNode(publicPrincipal, ids.root)).rejects.toThrow(
      /access denied/i,
    );
    await expect(policy.assertCanReadNode(publicPrincipal, ids.sibling)).rejects.toThrow(
      /access denied/i,
    );
  });
});
