CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TYPE "NodeKind" AS ENUM ('FOLDER', 'FILE');
CREATE TYPE "UploadStatus" AS ENUM ('PREPARED', 'UPLOADING', 'FINALIZED', 'CANCELLED', 'EXPIRED', 'REJECTED');
CREATE TYPE "SharePrincipalType" AS ENUM ('USER', 'PUBLIC_LINK');
CREATE TYPE "ShareRole" AS ENUM ('VIEWER', 'EDITOR');
CREATE TYPE "CleanupStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "UserProfile" (
  "id" UUID NOT NULL,
  "email" CITEXT NOT NULL,
  "displayName" VARCHAR(120),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataRoom" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ownerId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Node" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "dataRoomId" UUID NOT NULL,
  "parentId" UUID,
  "kind" "NodeKind" NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "normalizedName" VARCHAR(120) NOT NULL,
  "sizeBytes" BIGINT,
  "mimeType" VARCHAR(100),
  "storageKey" VARCHAR(300),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Node_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UploadSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ownerId" UUID NOT NULL,
  "parentNodeId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "storageKey" VARCHAR(300) NOT NULL,
  "requestedName" VARCHAR(120) NOT NULL,
  "normalizedName" VARCHAR(120) NOT NULL,
  "expectedSizeBytes" BIGINT NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "status" "UploadStatus" NOT NULL DEFAULT 'PREPARED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "finalizedAt" TIMESTAMP(3),
  "fileNodeId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Share" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "targetNodeId" UUID NOT NULL,
  "grantedByUserId" UUID NOT NULL,
  "principalType" "SharePrincipalType" NOT NULL,
  "role" "ShareRole" NOT NULL DEFAULT 'VIEWER',
  "recipientUserId" UUID,
  "recipientEmail" CITEXT,
  "tokenHash" BYTEA,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StorageCleanupJob" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "rootNodeId" UUID NOT NULL,
  "status" "CleanupStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastErrorCode" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorageCleanupJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RuntimeControl" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "registrationOpen" BOOLEAN NOT NULL DEFAULT false,
  "uploadsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "publicLinksEnabled" BOOLEAN NOT NULL DEFAULT false,
  "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RuntimeControl_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserProfile_email_key" ON "UserProfile"("email");
CREATE UNIQUE INDEX "DataRoom_ownerId_key" ON "DataRoom"("ownerId");
CREATE UNIQUE INDEX "Node_storageKey_key" ON "Node"("storageKey");
CREATE INDEX "Node_dataRoomId_parentId_deletedAt_idx" ON "Node"("dataRoomId", "parentId", "deletedAt");
CREATE UNIQUE INDEX "UploadSession_storageKey_key" ON "UploadSession"("storageKey");
CREATE UNIQUE INDEX "UploadSession_fileNodeId_key" ON "UploadSession"("fileNodeId");
CREATE UNIQUE INDEX "UploadSession_ownerId_clientId_key" ON "UploadSession"("ownerId", "clientId");
CREATE INDEX "UploadSession_ownerId_status_expiresAt_idx" ON "UploadSession"("ownerId", "status", "expiresAt");
CREATE INDEX "Share_targetNodeId_revokedAt_idx" ON "Share"("targetNodeId", "revokedAt");
CREATE INDEX "Share_recipientUserId_revokedAt_idx" ON "Share"("recipientUserId", "revokedAt");
CREATE INDEX "Share_recipientEmail_revokedAt_idx" ON "Share"("recipientEmail", "revokedAt");
CREATE UNIQUE INDEX "StorageCleanupJob_rootNodeId_key" ON "StorageCleanupJob"("rootNodeId");
CREATE INDEX "StorageCleanupJob_status_nextAttemptAt_idx" ON "StorageCleanupJob"("status", "nextAttemptAt");

CREATE UNIQUE INDEX "node_active_sibling_name_uq"
  ON "Node" ("dataRoomId", "parentId", "normalizedName")
  WHERE "deletedAt" IS NULL AND "parentId" IS NOT NULL;

CREATE UNIQUE INDEX "node_room_root_uq"
  ON "Node" ("dataRoomId")
  WHERE "parentId" IS NULL;

CREATE INDEX "node_children_page_idx"
  ON "Node" ("dataRoomId", "parentId", "kind", "normalizedName", "id")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "share_public_token_hash_uq"
  ON "Share" ("tokenHash")
  WHERE "tokenHash" IS NOT NULL;

CREATE UNIQUE INDEX "share_active_recipient_user_uq"
  ON "Share" ("targetNodeId", "recipientUserId")
  WHERE "revokedAt" IS NULL AND "principalType" = 'USER' AND "recipientUserId" IS NOT NULL;

CREATE UNIQUE INDEX "share_active_recipient_email_uq"
  ON "Share" ("targetNodeId", "recipientEmail")
  WHERE "revokedAt" IS NULL AND "principalType" = 'USER' AND "recipientUserId" IS NULL AND "recipientEmail" IS NOT NULL;

ALTER TABLE "Node" ADD CONSTRAINT "node_kind_fields_ck" CHECK (
  ("kind" = 'FOLDER' AND "sizeBytes" IS NULL AND "mimeType" IS NULL AND "storageKey" IS NULL)
  OR
  ("kind" = 'FILE' AND "sizeBytes" IS NOT NULL AND "sizeBytes" >= 0 AND "mimeType" = 'application/pdf' AND "storageKey" IS NOT NULL)
);

ALTER TABLE "Node" ADD CONSTRAINT "node_root_is_folder_ck" CHECK (
  "parentId" IS NOT NULL OR "kind" = 'FOLDER'
);

ALTER TABLE "UploadSession" ADD CONSTRAINT "upload_expected_fields_ck" CHECK (
  "expectedSizeBytes" > 0 AND "expectedSizeBytes" <= 10485760 AND "mimeType" = 'application/pdf'
);

ALTER TABLE "UploadSession" ADD CONSTRAINT "upload_finalize_fields_ck" CHECK (
  ("status" = 'FINALIZED' AND "fileNodeId" IS NOT NULL AND "finalizedAt" IS NOT NULL)
  OR
  ("status" <> 'FINALIZED' AND "fileNodeId" IS NULL AND "finalizedAt" IS NULL)
);

ALTER TABLE "Share" ADD CONSTRAINT "share_principal_fields_ck" CHECK (
  ("principalType" = 'PUBLIC_LINK' AND "tokenHash" IS NOT NULL AND octet_length("tokenHash") = 32 AND "recipientUserId" IS NULL AND "recipientEmail" IS NULL)
  OR
  ("principalType" = 'USER' AND "tokenHash" IS NULL AND ("recipientUserId" IS NOT NULL OR "recipientEmail" IS NOT NULL))
);

ALTER TABLE "RuntimeControl" ADD CONSTRAINT "runtime_control_singleton_ck" CHECK ("id" = 1);

ALTER TABLE "DataRoom" ADD CONSTRAINT "DataRoom_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Node" ADD CONSTRAINT "Node_dataRoomId_fkey"
  FOREIGN KEY ("dataRoomId") REFERENCES "DataRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Node" ADD CONSTRAINT "Node_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_parentNodeId_fkey"
  FOREIGN KEY ("parentNodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_fileNodeId_fkey"
  FOREIGN KEY ("fileNodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Share" ADD CONSTRAINT "Share_targetNodeId_fkey"
  FOREIGN KEY ("targetNodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Share" ADD CONSTRAINT "Share_grantedByUserId_fkey"
  FOREIGN KEY ("grantedByUserId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Share" ADD CONSTRAINT "Share_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StorageCleanupJob" ADD CONSTRAINT "StorageCleanupJob_rootNodeId_fkey"
  FOREIGN KEY ("rootNodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- NestJS/Prisma is the sole application data path. Even if Supabase Data API is
-- accidentally left enabled, browser roles cannot read or mutate application tables.
ALTER TABLE "UserProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataRoom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Node" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UploadSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Share" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StorageCleanupJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RuntimeControl" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  "UserProfile",
  "DataRoom",
  "Node",
  "UploadSession",
  "Share",
  "StorageCleanupJob",
  "RuntimeControl"
FROM anon, authenticated;

INSERT INTO "RuntimeControl" (
  "id", "registrationOpen", "uploadsEnabled", "publicLinksEnabled", "maintenanceMode", "updatedAt"
) VALUES (1, false, false, false, false, CURRENT_TIMESTAMP);
