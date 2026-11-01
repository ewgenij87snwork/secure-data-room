import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./cloudflare-keepalive.mjs', import.meta.url), 'utf8');
const isDeals = source.includes('const IS_DEALS = true');
const goodBody = () => ({
  status: 'ok',
  database: 'reachable',
  service: 'deals-marketplace-prototype',
  sha: 'a'.repeat(40),
  commit: 'a'.repeat(40),
  time: new Date().toISOString(),
});
const response = (body = goodBody(), status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-vercel-cache': 'MISS',
      ...headers,
    },
  });
function harness(replies) {
  const calls = [];
  const logs = [];
  const delays = [];
  const context = {
    URL,
    Date,
    AbortSignal,
    Error,
    Number,
    Promise,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      const item = replies.shift();
      if (item instanceof Error) throw item;
      assert.ok(item, 'unexpected extra attempt');
      return item;
    },
    console: Object.fromEntries(
      ['log', 'warn', 'error'].map((level) => [
        level,
        (value) => logs.push({ level, ...JSON.parse(value) }),
      ]),
    ),
    setTimeout: (fn, ms) => {
      delays.push(ms);
      fn();
    },
  };
  runInNewContext(source.replace('export default', 'globalThis.handler ='), context);
  return {
    calls,
    logs,
    delays,
    run: () =>
      context.handler.scheduled({
        scheduledTime: Date.now(),
        cron: '*/15 * * * *',
      }),
  };
}
test('successful probe bypasses caches and records build identity', async () => {
  const h = harness([response()]);
  await h.run();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].init.cache, 'no-store');
  assert.equal(h.calls[0].init.redirect, 'manual');
  assert.ok(new URL(h.calls[0].url).searchParams.has('_keepalive'));
  assert.equal(h.logs[0].result, 'success');
  assert.equal(h.logs[0].build.length, 40);
});
test('Vercel network failure and paused DB response recover within bounded retries', async () => {
  const h = harness([new Error('synthetic network failure'), response({}, 503), response()]);
  await h.run();
  assert.equal(h.calls.length, 3);
  assert.deepEqual(h.delays, [1000, 4000]);
  assert.deepEqual(
    h.logs.map((x) => x.result),
    ['retry', 'retry', 'success'],
  );
  assert.deepEqual(
    h.logs.slice(0, 2).map((x) => x.errorCode),
    ['NETWORK_FAILURE', 'HTTP_503'],
  );
});
test('persistent outage rejects the invocation and next scheduled run recovers', async () => {
  const h = harness([response({}, 503), response({}, 503), response({}, 503), response()]);
  await assert.rejects(h.run(), /KEEPALIVE_UNAVAILABLE/);
  assert.equal(h.calls.length, 3);
  assert.equal(h.logs.at(-1).result, 'failure');
  await h.run();
  assert.equal(h.logs.at(-1).result, 'success');
});
test('HTTP 200 cannot hide invalid JSON, payload or cached data', async () => {
  for (const first of [
    new Response('not json', { headers: { 'content-type': 'application/json' } }),
    response({ status: 'degraded' }),
    response(goodBody(), 200, { 'x-vercel-cache': 'HIT' }),
    response(goodBody(), 200, { age: '10' }),
    new Response('html'),
  ]) {
    const h = harness([first, response()]);
    await h.run();
    assert.equal(h.logs[0].result, 'retry');
    assert.equal(h.logs.at(-1).result, 'success');
  }
});
test('logs never include upstream response bodies or arbitrary network messages', async () => {
  const marker = 'SYNTHETIC_PRIVATE_VALUE';
  const h = harness([
    new Error(marker),
    response({ status: 'degraded', detail: marker }),
    response(),
  ]);
  await h.run();
  assert.equal(JSON.stringify(h.logs).includes(marker), false);
});
test(
  'Deals validates database, service identity and response freshness',
  { skip: !isDeals },
  async () => {
    for (const bad of [
      { ...goodBody(), database: 'unreachable' },
      { ...goodBody(), service: 'other' },
      { ...goodBody(), time: '2000-01-01T00:00:00Z' },
    ]) {
      const h = harness([response(bad), response()]);
      await h.run();
      assert.equal(h.logs[0].result, 'retry');
    }
  },
);

test('redirects fail closed and never change the target origin', async () => {
  const h = harness([
    response({}, 302, { location: 'https://example.invalid/redirect' }),
    response(),
  ]);
  await h.run();
  assert.equal(h.calls[0].init.redirect, 'manual');
  assert.equal(h.logs[0].errorCode, 'HTTP_302');
  assert.equal(h.logs.at(-1).result, 'success');
});
