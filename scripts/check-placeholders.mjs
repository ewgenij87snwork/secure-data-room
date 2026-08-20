import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const scanRoots = ['apps', 'packages', 'prisma', 'scripts'];
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.sql', '.prisma']);
const forbidden = /\b(?:TODO|TBD|FIXME|HACK)\b/u;
const failures = [];

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    if (['node_modules', 'dist', 'generated'].includes(entry.name)) continue;
    const full = join(path, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.name !== 'check-placeholders.mjs' && extensions.has(extname(entry.name))) {
      const text = await readFile(full, 'utf8');
      if (forbidden.test(text)) failures.push(relative(root, full));
    }
  }
}

for (const scanRoot of scanRoots) await walk(join(root, scanRoot));

const readme = await readFile(join(root, 'README.md'), 'utf8');
if (/\{\{[A-Z0-9_]+\}\}|REPLACE_WITH|example\.com|changeme/u.test(readme)) {
  failures.push('README.md');
}

if (failures.length) {
  console.error(
    `Placeholder markers found in production paths:\n${failures.map((f) => `- ${f}`).join('\n')}`,
  );
  process.exitCode = 1;
} else {
  console.log('Placeholder check passed.');
}
