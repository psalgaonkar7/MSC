// Playwright configuration for the Rail Europe MSC automation.
// Three "projects":
//   setup -> one-time (headed) manual login that saves the B2B session to storageState.json
//   b2b   -> the B2B sanity check (connectivity, SNCF POS search test, build cart, capture booking ref). Reuses the saved session.
//   b2c   -> the B2C searchability checks (no login needed).
//
// IMPORTANT: This suite NEVER pays, never confirms a booking. The B2B flow stops at the
// "Traveler details" page (where the booking reference is created) by design.

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // A whole MSC run is generous; individual actions have their own shorter timeouts.
  timeout: 5 * 60 * 1000,
  expect: { timeout: 15000 },
  fullyParallel: false,         // B2B must be sequential (one shared cart). B2C parallelizes within its own file.
  retries: 0,
  reporter: [
    ['list'],
    // HTML report lives in its own subfolder — the HTML reporter CLEANS its outputFolder on
    // start, so keeping it out of report/ stops it wiping our JSON data files (msc-b2b.json etc).
    ['html', { outputFolder: 'report/html', open: 'never' }],
    ['json', { outputFile: 'report/results.json' }],
  ],
  use: {
    // Default: headless (good for scheduled/CI runs). To WATCH it live, set HEADED=1.
    headless: process.env.HEADED !== '1',
    actionTimeout: 20000,
    navigationTimeout: 45000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1366, height: 900 },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
      use: { baseURL: 'https://customercare.raileurope.com' },
    },
    {
      name: 'b2b',
      testMatch: /b2b-(msc|passes)\.spec\.js/,
      use: {
        baseURL: 'https://customercare.raileurope.com',
        storageState: 'storageState.json', // created by the `setup` project (run `npm run auth` first)
      },
    },
    {
      name: 'b2c',
      testMatch: /b2c-searchability\.spec\.js/,
      use: { baseURL: 'https://www.raileurope.com' },
    },
  ],
});
