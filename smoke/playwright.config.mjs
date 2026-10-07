import { defineConfig, devices } from '@playwright/test';

const origin = process.env.SMOKE_ORIGIN;
if (!origin) throw new Error('Set SMOKE_ORIGIN to the deployed HTTP(S) website URL');
const base = new URL(origin);
if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) {
  throw new Error('SMOKE_ORIGIN must be an HTTP(S) origin without credentials');
}

export default defineConfig({
  testDir: '.',
  testMatch: 'browser.smoke.mjs',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: '../scratch/browser-smoke',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: base.origin,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
