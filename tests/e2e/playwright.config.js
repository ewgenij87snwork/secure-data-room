import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const deployed = process.env.E2E_MODE === 'deployed';
const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const baseURL = deployed
  ? (process.env.E2E_DEPLOYED_URL ?? 'https://missing-deployed-url.invalid')
  : (process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173');

export default defineConfig({
  testDir: configDirectory,
  testMatch: '**/*.spec.js',
  testIgnore: ['**/*.test.js', '**/*.vitest.js'],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  globalSetup: path.join(configDirectory, 'global-setup.js'),
  use: {
    baseURL,
    browserName: 'chromium',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    ignoreHTTPSErrors: false,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
