import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTrackedPath, scanText } from './security-scan.mjs';

test('scans tracked configuration formats that commonly carry credentials', () => {
  for (const path of ['config.toml', 'service.ini', 'runtime.conf', 'scripts/deploy.sh']) {
    assert.equal(classifyTrackedPath(path), 'scan');
  }
});

test('rejects tracked credential containers without reading their contents', () => {
  for (const path of [
    'private.pem',
    'signing.key',
    'identity.p12',
    '.env.local',
    'config/credentials.json',
    'deploy/service-account.json',
    'keys/id_rsa',
  ]) {
    assert.equal(classifyTrackedPath(path), 'reject');
  }
});

test('keeps the canonical environment template scannable', () => {
  assert.equal(classifyTrackedPath('.env.example'), 'scan');
  assert.equal(classifyTrackedPath('docs/diagram.png'), 'ignore');
});

test('reports secret classifications without echoing matched values', () => {
  const awsPrefix = ['AK', 'IA'].join('');
  const value = `${awsPrefix}${'0'.repeat(16)}`;
  const failures = scanText('config/example.json', `ACCESS_KEY=${value}`);

  assert.deepEqual(failures, ['config/example.json: AWS access key']);
  assert.equal(
    failures.some((failure) => failure.includes(value)),
    false,
  );
});

test('rejects server-only environment names in browser source', () => {
  const failures = scanText('apps/web/src/runtime.ts', 'SUPABASE_SERVICE_ROLE_KEY');

  assert.deepEqual(failures, [
    'apps/web/src/runtime.ts: server/operations secret referenced in browser source',
  ]);
});
