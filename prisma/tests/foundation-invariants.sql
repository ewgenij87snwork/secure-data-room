\set ON_ERROR_STOP on

BEGIN;

DO $foundation_structure$
DECLARE
  protected_table_count INTEGER;
BEGIN
  SELECT count(*)
  INTO protected_table_count
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (
      'UserProfile',
      'DataRoom',
      'Node',
      'UploadSession',
      'Share',
      'StorageCleanupJob',
      'RuntimeControl'
    )
    AND relation.relrowsecurity = true;

  IF protected_table_count <> 7 THEN
    RAISE EXCEPTION 'all application tables must have row-level security enabled';
  END IF;

  IF has_table_privilege('anon', '"Node"', 'SELECT')
    OR has_table_privilege('authenticated', '"Node"', 'SELECT') THEN
    RAISE EXCEPTION 'browser roles must not read application tables directly';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "RuntimeControl" WHERE "id" = 1) THEN
    RAISE EXCEPTION 'runtime control singleton seed is missing';
  END IF;
END
$foundation_structure$;

INSERT INTO "UserProfile" ("id", "email", "displayName", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001', 'foundation@example.test', 'Foundation', CURRENT_TIMESTAMP);

INSERT INTO "DataRoom" ("id", "ownerId", "name", "updatedAt")
VALUES (
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000001',
  'Foundation room',
  CURRENT_TIMESTAMP
);

INSERT INTO "Node" (
  "id", "dataRoomId", "parentId", "kind", "name", "normalizedName", "updatedAt"
)
VALUES (
  '00000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000010',
  NULL,
  'FOLDER',
  'Root',
  'root',
  CURRENT_TIMESTAMP
);

INSERT INTO "Node" (
  "id", "dataRoomId", "parentId", "kind", "name", "normalizedName", "updatedAt"
)
VALUES (
  '00000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000020',
  'FOLDER',
  'Documents',
  'documents',
  CURRENT_TIMESTAMP
);

DO $foundation_constraints$
DECLARE
  violation_blocked BOOLEAN;
BEGIN
  violation_blocked := false;
  BEGIN
    INSERT INTO "Node" (
      "id", "dataRoomId", "parentId", "kind", "name", "normalizedName", "updatedAt"
    )
    VALUES (
      '00000000-0000-4000-8000-000000000022',
      '00000000-0000-4000-8000-000000000010',
      NULL,
      'FOLDER',
      'Second root',
      'second root',
      CURRENT_TIMESTAMP
    );
  EXCEPTION WHEN unique_violation THEN
    violation_blocked := true;
  END;
  IF NOT violation_blocked THEN
    RAISE EXCEPTION 'one-root-per-room invariant is not enforced';
  END IF;

  violation_blocked := false;
  BEGIN
    INSERT INTO "Node" (
      "id", "dataRoomId", "parentId", "kind", "name", "normalizedName", "updatedAt"
    )
    VALUES (
      '00000000-0000-4000-8000-000000000023',
      '00000000-0000-4000-8000-000000000010',
      '00000000-0000-4000-8000-000000000020',
      'FOLDER',
      'documents',
      'documents',
      CURRENT_TIMESTAMP
    );
  EXCEPTION WHEN unique_violation THEN
    violation_blocked := true;
  END;
  IF NOT violation_blocked THEN
    RAISE EXCEPTION 'active sibling-name uniqueness is not enforced';
  END IF;

  violation_blocked := false;
  BEGIN
    INSERT INTO "Node" (
      "id", "dataRoomId", "parentId", "kind", "name", "normalizedName", "updatedAt"
    )
    VALUES (
      '00000000-0000-4000-8000-000000000024',
      '00000000-0000-4000-8000-000000000010',
      '00000000-0000-4000-8000-000000000020',
      'FILE',
      'invalid.pdf',
      'invalid.pdf',
      CURRENT_TIMESTAMP
    );
  EXCEPTION WHEN check_violation THEN
    violation_blocked := true;
  END;
  IF NOT violation_blocked THEN
    RAISE EXCEPTION 'file/folder field invariant is not enforced';
  END IF;

  violation_blocked := false;
  BEGIN
    INSERT INTO "Share" (
      "id", "targetNodeId", "grantedByUserId", "principalType", "tokenHash"
    )
    VALUES (
      '00000000-0000-4000-8000-000000000030',
      '00000000-0000-4000-8000-000000000020',
      '00000000-0000-4000-8000-000000000001',
      'PUBLIC_LINK',
      decode(repeat('00', 31), 'hex')
    );
  EXCEPTION WHEN check_violation THEN
    violation_blocked := true;
  END;
  IF NOT violation_blocked THEN
    RAISE EXCEPTION 'public-token digest length invariant is not enforced';
  END IF;

  violation_blocked := false;
  BEGIN
    INSERT INTO "RuntimeControl" ("id", "updatedAt") VALUES (2, CURRENT_TIMESTAMP);
  EXCEPTION WHEN check_violation THEN
    violation_blocked := true;
  END;
  IF NOT violation_blocked THEN
    RAISE EXCEPTION 'runtime-control singleton invariant is not enforced';
  END IF;
END
$foundation_constraints$;

ROLLBACK;

\echo Foundation migration invariants passed.
