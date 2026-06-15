// tests/auth.setup.js — shared login state for all tests
const { test: setup, expect } = require('@playwright/test');
const path = require('path');

const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#username', 'dckay');
  await page.fill('#password', 'lFz8VPskio2b5D3Z');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/');
  await page.waitForSelector('#sidebar', { timeout: 10_000 });

  // Save the cookie / localStorage into a JSON file
  await page.context().storageState({ path: AUTH_FILE });
});
