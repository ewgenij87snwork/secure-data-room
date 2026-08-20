import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const failures = [];
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.yaml', '.yml', '.sql', '.prisma', '.md']);
const skippedDirectories = new Set(['node_modules', 'dist', 'coverage', '.git', '.worktrees', 'generated', 'visuals']);

async function walk(path) {
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const full = join(path, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (extensions.has(extname(entry.name)) || entry.name === '.env.example') files.push(full);
  }
  return files;
}

const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/u],
  ['Supabase personal access token', /\bsbp_[A-Za-z0-9_-]{20,}\b/u],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/u],
  ['JWT-looking secret', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/u],
  ['non-local PostgreSQL password URL', /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@(?!127\.0\.0\.1|localhost)[^\s/]+/u],
];

for (const file of await walk(root)) {
  if (file.endsWith('security-scan.mjs')) continue;
  const text = await readFile(file, 'utf8');
  for (const [label, pattern] of patterns) {
    if (pattern.test(text)) failures.push(`${relative(root, file)}: ${label}`);
  }
  if (file.includes('/apps/web/') && /SUPABASE_SERVICE_ROLE_KEY|DIRECT_URL|DATABASE_URL|SUPABASE_ACCESS_TOKEN/u.test(text)) {
    failures.push(`${relative(root, file)}: server/operations secret referenced in browser source`);
  }
  if (file.includes('/apps/') && /dangerouslySetInnerHTML/u.test(text)) {
    failures.push(`${relative(root, file)}: dangerouslySetInnerHTML is prohibited`);
  }
}

if (failures.length) {
  console.error('Security scan failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Security scan passed (static secret and browser-boundary checks).');
}
