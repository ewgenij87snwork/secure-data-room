import assert from 'node:assert/strict';
import test from 'node:test';
import { findGeneratedWebArtifacts } from './check-generated-artifacts.mjs';

test('flags TypeScript build output in the Web source tree', () => {
  assert.deepEqual(
    findGeneratedWebArtifacts([
      'apps/web/src/main.tsx',
      'apps/web/src/main.js',
      'apps/web/src/main.js.map',
      'apps/web/src/vite-env.d.ts',
      'apps/web/vite.config.d.ts',
      'apps/web/tsconfig.app.tsbuildinfo',
    ]),
    [
      'apps/web/src/main.js',
      'apps/web/src/main.js.map',
      'apps/web/vite.config.d.ts',
      'apps/web/tsconfig.app.tsbuildinfo',
    ],
  );
});
