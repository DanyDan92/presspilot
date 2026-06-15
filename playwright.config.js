// playwright.config.js — PressPilot V2 QA suite
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const AUTH_FILE = path.join(__dirname, 'tests', '.auth', 'user.json');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  // retries: 0 — a retry in serial mode replays beforeAll (≈25 static requests) + all
  // prior tests in the describe, which bursts the server rate limiter (120 req/min) and
  // makes subsequent tests fail with 429. Tests are deterministic (each goTo awaits its
  // data fetch), so retries are not needed and would only destabilize the run.
  retries: 0,
  // 1 worker = sequential tests → keeps request rate under the server limiter.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results/',

  use: {
    baseURL: 'http://localhost:3847',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3847/login',
    reuseExistingServer: true,
    timeout: 30_000,
    env: {
      SOMMAIRE_USERNAME: 'dckay',
      SOMMAIRE_PASSWORD: 'lFz8VPskio2b5D3Z',
      DB_PATH: './data/qa.db',
      PORT: '3847',
    },
  },

  projects: [
    // Setup project runs once, logs in and saves session
    {
      name: 'setup',
      testMatch: '**/auth.setup.js',
    },

    {
      name: 'desktop',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: AUTH_FILE,
      },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
        // Keep mobile viewport/UA/DPR for responsive (card) layout, but disable touch
        // emulation: touch-tap click semantics stall on small animated buttons in
        // Chromium, causing spurious 30s timeouts. The responsive CSS is driven by
        // viewport-width media queries, not by touch capability.
        hasTouch: false,
        isMobile: false,
        storageState: AUTH_FILE,
      },
    },
  ],
});
