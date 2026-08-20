import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('local execution starts the API and Web on the canonical origins', async () => {
  const previous = snapshotEnvironment();
  try {
    process.env.E2E_MODE = 'local';
    process.env.E2E_START_LOCAL_SERVERS = '1';
    delete process.env.E2E_BASE_URL;
    delete process.env.E2E_API_URL;

    const { default: config } = await import(`./playwright.config.js?local=${Date.now()}`);

    assert.equal(config.use.baseURL, 'http://127.0.0.1:5173');
    assert.deepEqual(
      config.webServer.map(({ url }) => url),
      ['http://127.0.0.1:3000/v1/health/live', 'http://127.0.0.1:5173'],
    );
    assert.match(config.webServer[0].command, /apps\/api\/node_modules\/\.bin\/nest/u);
    assert.match(config.webServer[1].command, /--port 5173 --strictPort/u);
    assert.deepEqual(
      config.webServer.map(({ cwd }) => cwd),
      [repositoryRoot, repositoryRoot],
    );
  } finally {
    restoreEnvironment(previous);
  }
});

test('server-free discovery does not launch local services', async () => {
  const previous = snapshotEnvironment();
  try {
    process.env.E2E_MODE = 'local';
    delete process.env.E2E_START_LOCAL_SERVERS;

    const { default: config } = await import(`./playwright.config.js?list=${Date.now()}`);

    assert.equal(config.webServer, undefined);
  } finally {
    restoreEnvironment(previous);
  }
});

function snapshotEnvironment() {
  return {
    E2E_MODE: process.env.E2E_MODE,
    E2E_START_LOCAL_SERVERS: process.env.E2E_START_LOCAL_SERVERS,
    E2E_BASE_URL: process.env.E2E_BASE_URL,
    E2E_API_URL: process.env.E2E_API_URL,
  };
}

function restoreEnvironment(previous) {
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
