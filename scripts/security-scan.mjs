import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const credentialExtensions = new Set(['.jks', '.key', '.p12', '.pfx', '.pem', '.secrets']);
const scannedExtensions = new Set([
  '.bash',
  '.cjs',
  '.conf',
  '.css',
  '.cts',
  '.graphql',
  '.html',
  '.ini',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.mts',
  '.prisma',
  '.sh',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
  '.zsh',
]);
const scannedNames = new Set(['Dockerfile', 'Makefile', 'Procfile']);
const credentialFileNames =
  /^(?:credentials?|secrets?|service-account|id_(?:rsa|dsa)|private-key)(?:[._-].*)?$/iu;
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/u],
  ['Supabase personal access token', /\bsbp_[A-Za-z0-9_-]{20,}\b/u],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/u],
  ['GitHub access token', /\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}\b/u],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}\b/u],
  ['JWT-looking secret', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/u],
  [
    'non-local PostgreSQL password URL',
    /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@(?!127\.0\.0\.1|localhost)[^\s/]+/u,
  ],
];

function normalizePath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//u, '');
}

export function classifyTrackedPath(path) {
  const normalizedPath = normalizePath(path);
  const fileName = basename(normalizedPath);
  const extension = extname(fileName).toLowerCase();

  if (fileName.startsWith('.env')) {
    return fileName.endsWith('.example') ? 'scan' : 'reject';
  }
  if (credentialExtensions.has(extension)) return 'reject';
  if (credentialFileNames.test(fileName)) return 'reject';
  if (scannedNames.has(fileName) || scannedExtensions.has(extension)) return 'scan';
  return 'ignore';
}

async function listRepositoryFiles() {
  const { stdout } = await execFileAsync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  return stdout.split('\0').filter(Boolean).map(normalizePath);
}

export function scanText(path, text) {
  const failures = [];
  for (const [label, pattern] of patterns) {
    if (pattern.test(text)) failures.push(`${path}: ${label}`);
  }
  if (
    path.startsWith('apps/web/') &&
    /SUPABASE_SERVICE_ROLE_KEY|DIRECT_URL|DATABASE_URL|SUPABASE_ACCESS_TOKEN/u.test(text)
  ) {
    failures.push(`${path}: server/operations secret referenced in browser source`);
  }
  if (path.startsWith('apps/') && /dangerouslySetInnerHTML/u.test(text)) {
    failures.push(`${path}: dangerouslySetInnerHTML is prohibited`);
  }
  return failures;
}

async function main() {
  const failures = [];
  for (const path of await listRepositoryFiles()) {
    const classification = classifyTrackedPath(path);
    if (classification === 'reject') {
      failures.push(`${path}: credential container must not be committed`);
      continue;
    }
    if (classification !== 'scan' || path === 'scripts/security-scan.mjs') continue;
    failures.push(...scanText(path, await readFile(join(root, path), 'utf8')));
  }

  if (failures.length > 0) {
    console.error('Targeted security scan failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    'Targeted security scan passed (source/config, credential-path, and browser-boundary checks).',
  );
}

const executedPath = process.argv[1];
if (executedPath && import.meta.url === pathToFileURL(executedPath).href) await main();
