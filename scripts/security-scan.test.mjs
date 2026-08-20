import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTrackedPath } from './security-scan.mjs';

test('scans tracked configuration formats that commonly carry credentials', () => {
  for (const path of ['config.toml', 'service.ini', 'runtime.conf', 'scripts/deploy.sh']) {
    assert.equal(classifyTrackedPath(path), 'scan');
  }
});

test('rejects tracked credential containers without reading their contents', () => {
  for (const path of ['private.pem', 'signing.key', 'identity.p12', '.env.local']) {
    assert.equal(classifyTrackedPath(path), 'reject');
  }
});

test('keeps the canonical environment template scannable', () => {
  assert.equal(classifyTrackedPath('.env.example'), 'scan');
  assert.equal(classifyTrackedPath('docs/diagram.png'), 'ignore');
});
