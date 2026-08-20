import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareBuildShas,
  extractApiBuildSha,
  extractWebBuildSha,
  verifyDeploymentSha,
} from './check-deployment-sha.mjs';

const buildSha = '0123456789abcdef0123456789abcdef01234567';
const otherBuildSha = '89abcdef0123456789abcdef0123456789abcdef';

test('extracts the Web build SHA from the required marker', () => {
  assert.equal(
    extractWebBuildSha(`<meta name="data-room-build-sha" content="${buildSha}">`),
    buildSha,
  );
});

test('extracts the API commit SHA from health/version', () => {
  assert.equal(extractApiBuildSha({ status: 'ok', commit: buildSha }), buildSha);
});

test('fails closed for missing state and mismatches', () => {
  assert.throws(() => extractWebBuildSha('<html></html>'), /Web build SHA is missing/u);
  assert.throws(() => extractApiBuildSha({ status: 'ok' }), /API build SHA is missing/u);
  assert.throws(() => compareBuildShas(buildSha, otherBuildSha), /do not match/u);
  assert.throws(() => compareBuildShas('local', 'local'), /not a full Git commit SHA/u);
  assert.throws(
    () => extractWebBuildSha('<meta name="data-room-build-sha" content="%VITE_BUILD_SHA%">'),
    /not a full Git commit SHA/u,
  );
  assert.equal(compareBuildShas(buildSha.toUpperCase(), buildSha), buildSha);
});

test('compares the deployed Web and API responses without weakening the value', async () => {
  const responses = [
    new Response(`<meta content="${buildSha}" name="data-room-build-sha">`),
    Response.json({ status: 'ok', commit: buildSha }),
  ];
  const fetchCalls = [];

  const result = await verifyDeploymentSha(
    'https://web.example.test',
    'https://api.example.test',
    async (url) => {
      fetchCalls.push(String(url));
      return responses.shift();
    },
  );

  assert.equal(result, buildSha);
  assert.deepEqual(fetchCalls, [
    'https://web.example.test/',
    'https://api.example.test/v1/health/version',
  ]);
});

test('fails closed when either deployment probe is unavailable', async () => {
  await assert.rejects(
    verifyDeploymentSha(
      'https://web.example.test',
      'https://api.example.test',
      async () => new Response('unavailable', { status: 503 }),
    ),
    /Web deployment probe failed/u,
  );
});
