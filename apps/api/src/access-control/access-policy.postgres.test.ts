import type { Prisma } from '../generated/prisma/client.js';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authenticatedPrincipal } from '../auth/principal.js';
import {
  AccessDeniedException,
  AccessPolicyService,
  type AccessPolicyDatabase,
  type AccessPolicyRow,
  publicLinkPrincipal,
} from './access-policy.service.js';
import { accessPolicyQuery } from './access-policy.queries.js';
import type { AccessPrincipal } from './access-policy.types.js';

const databaseUrl = process.env.ACCESS_POLICY_TEST_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const ids = {
  owner: '11111111-1111-4111-8111-111111111111',
  boundedViewer: '22222222-2222-4222-8222-222222222222',
  precedenceViewer: '22222222-2222-4222-8222-222222222223',
  unrelated: '33333333-3333-4333-8333-333333333333',
  room: '44444444-4444-4444-8444-444444444444',
  otherRoom: '44444444-4444-4444-8444-444444444445',
  root: '55555555-5555-4555-8555-555555555555',
  folder: '55555555-5555-4555-8555-555555555556',
  child: '55555555-5555-4555-8555-555555555557',
  sibling: '55555555-5555-4555-8555-555555555558',
  deleted: '55555555-5555-4555-8555-555555555559',
  deletedChild: '55555555-5555-4555-8555-555555555560',
  otherRoot: '55555555-5555-4555-8555-555555555561',
  boundedShare: '77777777-7777-4777-8777-777777777771',
  publicShare: '77777777-7777-4777-8777-777777777772',
  editorRoot: '77777777-7777-4777-8777-777777777773',
  viewerFolder: '77777777-7777-4777-8777-777777777774',
  viewerRoot: '77777777-7777-4777-8777-777777777775',
  stableLow: '77777777-7777-4777-8777-777777777776',
  stableHigh: '77777777-7777-4777-8777-777777777777',
};

const owner = authenticatedPrincipal(ids.owner, 'owner@example.com');
const boundedViewer = authenticatedPrincipal(ids.boundedViewer, 'bounded@example.com');
const precedenceViewer = authenticatedPrincipal(ids.precedenceViewer, 'precedence@example.com');
const unrelated = authenticatedPrincipal(ids.unrelated, 'unrelated@example.com');
const schema = `access_policy_${process.pid}_${Date.now()}`;

interface ShareSeed {
  id: string;
  targetNodeId: string;
  principalType: 'USER' | 'PUBLIC_LINK';
  role: 'VIEWER' | 'EDITOR';
  recipientUserId?: string;
}

run('AccessPolicyService PostgreSQL integration', () => {
  let client: Client;
  let service: AccessPolicyService;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TYPE "NodeKind" AS ENUM ('FOLDER', 'FILE');
      CREATE TYPE "SharePrincipalType" AS ENUM ('USER', 'PUBLIC_LINK');
      CREATE TYPE "ShareRole" AS ENUM ('VIEWER', 'EDITOR');
      CREATE TABLE "DataRoom" ("id" uuid PRIMARY KEY, "ownerId" uuid NOT NULL);
      CREATE TABLE "Node" (
        "id" uuid PRIMARY KEY, "dataRoomId" uuid NOT NULL, "parentId" uuid,
        "kind" "NodeKind" NOT NULL, "deletedAt" timestamptz
      );
      CREATE TABLE "Share" (
        "id" uuid PRIMARY KEY, "targetNodeId" uuid NOT NULL,
        "principalType" "SharePrincipalType" NOT NULL, "role" "ShareRole" NOT NULL,
        "recipientUserId" uuid, "revokedAt" timestamptz
      );
    `);
    await client.query(
      `
      INSERT INTO "DataRoom" ("id", "ownerId") VALUES ($1, $2), ($3, $4)
    `,
      [ids.room, ids.owner, ids.otherRoom, ids.unrelated],
    );
    await client.query(
      `
      INSERT INTO "Node" ("id", "dataRoomId", "parentId", "kind", "deletedAt") VALUES
      ($1, $2, NULL, 'FOLDER', NULL), ($3, $2, $1, 'FOLDER', NULL),
      ($4, $2, $3, 'FILE', NULL), ($5, $2, $1, 'FILE', NULL),
      ($6, $2, NULL, 'FOLDER', now()), ($7, $2, $6, 'FILE', NULL),
      ($8, $9, NULL, 'FOLDER', NULL)
    `,
      [
        ids.root,
        ids.room,
        ids.folder,
        ids.child,
        ids.sibling,
        ids.deleted,
        ids.deletedChild,
        ids.otherRoot,
        ids.otherRoom,
      ],
    );
    service = new AccessPolicyService({
      $queryRaw: async <T>(query: Prisma.Sql) => {
        const text = query.strings.reduce(
          (sql, part, index) => sql + part + (index < query.values.length ? `$${index + 1}` : ''),
          '',
        );
        const result = await client.query(text, [...query.values]);
        return result.rows as T;
      },
    } satisfies AccessPolicyDatabase);
  });

  beforeEach(async () => {
    await client.query('DELETE FROM "Share"');
  });

  afterAll(async () => {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  });

  async function seedShares(shares: ShareSeed[]): Promise<void> {
    for (const share of shares) {
      await client.query(
        `
        INSERT INTO "Share" ("id", "targetNodeId", "principalType", "role", "recipientUserId", "revokedAt")
        VALUES ($1, $2, $3, $4, $5, NULL)
      `,
        [
          share.id,
          share.targetNodeId,
          share.principalType,
          share.role,
          share.recipientUserId ?? null,
        ],
      );
    }
  }

  async function executePolicyQuery(
    principal: AccessPrincipal,
    nodeId: string,
  ): Promise<AccessPolicyRow> {
    const query = accessPolicyQuery(principal, nodeId);
    const text = query.strings.reduce(
      (sql, part, index) => sql + part + (index < query.values.length ? `$${index + 1}` : ''),
      '',
    );
    const result = await client.query(text, [...query.values]);
    return result.rows[0] as AccessPolicyRow;
  }

  it('allows the room owner to read a child without shares', async () => {
    const access = await service.assertCanReadNode(owner, ids.child);
    expect(access).toMatchObject({
      nodeId: ids.child,
      dataRoomId: ids.room,
      accessRole: 'OWNER',
      accessRootNodeId: ids.root,
    });
  });

  it('bounds a viewer to its only folder share and revocation removes child access', async () => {
    await seedShares([
      {
        id: ids.boundedShare,
        targetNodeId: ids.folder,
        principalType: 'USER',
        role: 'VIEWER',
        recipientUserId: ids.boundedViewer,
      },
    ]);
    await expect(service.assertCanReadNode(boundedViewer, ids.child)).resolves.toMatchObject({
      accessRootNodeId: ids.folder,
    });
    await expect(service.assertCanReadNode(boundedViewer, ids.root)).rejects.toBeInstanceOf(
      AccessDeniedException,
    );
    await expect(service.assertCanReadNode(boundedViewer, ids.sibling)).rejects.toBeInstanceOf(
      AccessDeniedException,
    );
    await client.query('UPDATE "Share" SET "revokedAt" = now() WHERE "id" = $1', [
      ids.boundedShare,
    ]);
    await expect(service.assertCanReadNode(boundedViewer, ids.child)).rejects.toBeInstanceOf(
      AccessDeniedException,
    );
  });

  it('applies editor precedence, then nearer viewer precedence after revocation', async () => {
    await seedShares([
      {
        id: ids.editorRoot,
        targetNodeId: ids.root,
        principalType: 'USER',
        role: 'EDITOR',
        recipientUserId: ids.precedenceViewer,
      },
      {
        id: ids.viewerFolder,
        targetNodeId: ids.folder,
        principalType: 'USER',
        role: 'VIEWER',
        recipientUserId: ids.precedenceViewer,
      },
      {
        id: ids.viewerRoot,
        targetNodeId: ids.root,
        principalType: 'USER',
        role: 'VIEWER',
        recipientUserId: ids.precedenceViewer,
      },
    ]);
    await expect(service.assertCanReadNode(precedenceViewer, ids.child)).resolves.toMatchObject({
      accessRole: 'EDITOR',
      accessRootNodeId: ids.root,
    });
    await client.query('UPDATE "Share" SET "revokedAt" = now() WHERE "id" = $1', [ids.editorRoot]);
    await expect(service.assertCanReadNode(precedenceViewer, ids.child)).resolves.toMatchObject({
      accessRole: 'VIEWER',
      accessRootNodeId: ids.folder,
    });
  });

  it('chooses the ascending share id for same-role same-target ties', async () => {
    await seedShares([
      {
        id: ids.stableHigh,
        targetNodeId: ids.folder,
        principalType: 'USER',
        role: 'VIEWER',
        recipientUserId: ids.precedenceViewer,
      },
      {
        id: ids.stableLow,
        targetNodeId: ids.folder,
        principalType: 'USER',
        role: 'VIEWER',
        recipientUserId: ids.precedenceViewer,
      },
    ]);
    const row = await executePolicyQuery(precedenceViewer, ids.child);
    expect(row.winningShareId).toBe(ids.stableLow);
    await expect(service.assertCanReadNode(precedenceViewer, ids.child)).resolves.toMatchObject({
      accessRole: 'VIEWER',
      accessRootNodeId: ids.folder,
    });
  });

  it('requires an exact active public share and rejects USER-share masquerading', async () => {
    await seedShares([
      {
        id: ids.publicShare,
        targetNodeId: ids.folder,
        principalType: 'PUBLIC_LINK',
        role: 'VIEWER',
      },
      {
        id: ids.boundedShare,
        targetNodeId: ids.folder,
        principalType: 'USER',
        role: 'VIEWER',
        recipientUserId: ids.boundedViewer,
      },
    ]);
    const link = publicLinkPrincipal(ids.publicShare, ids.folder);
    await expect(service.assertCanReadNode(link, ids.child)).resolves.toMatchObject({
      accessRootNodeId: ids.folder,
    });
    await expect(
      service.assertCanReadNode(publicLinkPrincipal(ids.publicShare, ids.root), ids.child),
    ).rejects.toBeInstanceOf(AccessDeniedException);
    await expect(
      service.assertCanReadNode(publicLinkPrincipal(ids.boundedShare, ids.folder), ids.child),
    ).rejects.toBeInstanceOf(AccessDeniedException);
    await client.query('UPDATE "Share" SET "revokedAt" = now() WHERE "id" = $1', [ids.publicShare]);
    await expect(service.assertCanReadNode(link, ids.child)).rejects.toBeInstanceOf(
      AccessDeniedException,
    );
  });

  it('denies deleted, cross-room, and unrelated access including owners under deleted ancestors', async () => {
    await seedShares([
      {
        id: ids.boundedShare,
        targetNodeId: ids.root,
        principalType: 'USER',
        role: 'VIEWER',
        recipientUserId: ids.boundedViewer,
      },
    ]);
    await expect(service.assertCanReadNode(owner, ids.deleted)).rejects.toBeInstanceOf(
      AccessDeniedException,
    );
    await expect(service.assertCanReadNode(owner, ids.deletedChild)).rejects.toBeInstanceOf(
      AccessDeniedException,
    );
    await expect(service.assertCanReadNode(boundedViewer, ids.otherRoot)).rejects.toBeInstanceOf(
      AccessDeniedException,
    );
    await expect(service.assertCanReadNode(unrelated, ids.child)).rejects.toBeInstanceOf(
      AccessDeniedException,
    );
  });
});
