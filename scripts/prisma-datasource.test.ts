import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePrismaDatasourceUrl } from './prisma-datasource.js';

void test('uses the supplied direct database URL unchanged', () => {
  const directUrl = 'postgresql://database.example.test/application';
  assert.equal(resolvePrismaDatasourceUrl({ directUrl, argv: ['prisma', 'migrate'] }), directUrl);
});

void test('allows secret-free Prisma client generation with a local non-credential placeholder', () => {
  assert.equal(
    resolvePrismaDatasourceUrl({ directUrl: undefined, argv: ['prisma', 'generate'] }),
    'postgresql://postgres@127.0.0.1:5432/postgres',
  );
});

void test('fails closed when a database command has no direct URL', () => {
  assert.throws(
    () => resolvePrismaDatasourceUrl({ directUrl: undefined, argv: ['prisma', 'migrate'] }),
    /DIRECT_URL is required for Prisma database commands/u,
  );
});
