import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const architectureCheckPath = fileURLToPath(new URL('./check-architecture.mjs', import.meta.url));

test('ignores server-only service-role references when the repository path contains web', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'architecture-check-'));
  const repositoryRoot = join(fixtureRoot, 'web', 'repository');

  try {
    const fixtureFiles = new Map([
      ['package.json', '{"name":"architecture-fixture","private":true,"type":"module"}\n'],
      ['.env.example', 'PUBLIC_URL=\n'],
      [
        'prisma/schema.prisma',
        'model RuntimeControl { id String @id }\nmodel PublicShare { id String @id\n tokenHash Bytes }\n',
      ],
      ['apps/api/src/env.ts', "export const keyName = 'SUPABASE_SERVICE_ROLE_KEY';\n"],
      ['apps/web/src/browser.ts', "export const surface = 'browser';\n"],
    ]);

    for (const [path, contents] of fixtureFiles) {
      const absolutePath = join(repositoryRoot, path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents, 'utf8');
    }

    const fixtureCheckPath = join(repositoryRoot, 'scripts', 'check-architecture.mjs');
    await mkdir(dirname(fixtureCheckPath), { recursive: true });
    await copyFile(architectureCheckPath, fixtureCheckPath);

    const result = spawnSync(process.execPath, ['scripts/check-architecture.mjs'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Architecture check passed/u);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
