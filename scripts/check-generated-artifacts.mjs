import { readdir } from 'node:fs/promises';
import { relative, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const allowedGeneratedPaths = new Set(['apps/web/src/vite-env.d.ts']);
const generatedArtifactPattern = /(?:\.js(?:\.map)?|\.d\.ts(?:\.map)?|\.tsbuildinfo)$/u;
const skippedDirectories = new Set(['.vite', 'dist', 'node_modules']);

function normalizePath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//u, '');
}

export function findGeneratedWebArtifacts(paths) {
  return paths
    .map(normalizePath)
    .filter(
      (path) =>
        path.startsWith('apps/web/') &&
        !allowedGeneratedPaths.has(path) &&
        generatedArtifactPattern.test(path),
    );
}

async function collectFiles(directory, files = []) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;

    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) await collectFiles(fullPath, files);
    else files.push(normalizePath(relative(repositoryRoot, fullPath)));
  }

  return files;
}

async function main() {
  const files = await collectFiles(join(repositoryRoot, 'apps', 'web'));
  const failures = findGeneratedWebArtifacts(files);

  if (failures.length > 0) {
    console.error(
      `Generated artifacts found in the Web source tree:\n${failures.map((path) => `- ${path}`).join('\n')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('Generated artifact check passed.');
}

const executedPath = process.argv[1];
if (executedPath && import.meta.url === pathToFileURL(executedPath).href) await main();
