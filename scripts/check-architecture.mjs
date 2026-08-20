import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

const root = new URL('..', import.meta.url);
const failures = [];

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      ['node_modules', 'dist', 'coverage', '.git', '.worktrees', 'generated'].includes(entry.name)
    )
      continue;
    const full = join(path, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

const rootPath = new URL('.', root).pathname;
const packageFiles = (await walk(rootPath)).filter((file) => file.endsWith('package.json'));
for (const file of packageFiles) {
  const pkg = JSON.parse(await readFile(file, 'utf8'));
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const forbidden of [
    'next',
    '@supabase/ssr',
    'firebase',
    'redis',
    'ioredis',
    '@nestjs/cqrs',
    '@trpc/server',
  ]) {
    if (dependencies[forbidden])
      failures.push(`${relative(rootPath, file)} includes forbidden ${forbidden}`);
  }
}

const envExample = await readFile(join(rootPath, '.env.example'), 'utf8');
for (const line of envExample.split('\n')) {
  const key = line.split('=', 1)[0]?.trim();
  if (key?.startsWith('VITE_') && /(SECRET|SERVICE|DATABASE|DIRECT|ACCESS_TOKEN)/u.test(key)) {
    failures.push(`Browser-exposed environment key is secret-like: ${key}`);
  }
}

const schema = await readFile(join(rootPath, 'prisma/schema.prisma'), 'utf8');
if (/model DataRoom\s*\{[^}]*\brootNodeId\b/u.test(schema)) {
  failures.push('DataRoom duplicates root identity with a rootNodeId pointer.');
}
if (!/model RuntimeControl/u.test(schema)) failures.push('RuntimeControl model is missing.');
if (!/tokenHash\s+Bytes/u.test(schema)) failures.push('Public share token hash field is missing.');

const appFiles = (await walk(join(rootPath, 'apps'))).filter((file) =>
  ['.ts', '.tsx'].includes(extname(file)),
);
const browserRoot = `${join('apps', 'web')}${sep}`;
for (const file of appFiles) {
  const text = await readFile(file, 'utf8');
  const repositoryPath = relative(rootPath, file);
  if (/SUPABASE_SERVICE_ROLE_KEY/u.test(text) && repositoryPath.startsWith(browserRoot)) {
    failures.push(`${repositoryPath} references the service-role key in browser code.`);
  }
  if (/dangerouslySetInnerHTML/u.test(text)) {
    failures.push(`${repositoryPath} uses dangerouslySetInnerHTML.`);
  }
}

if (failures.length) {
  console.error('Architecture check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Architecture check passed.');
}
