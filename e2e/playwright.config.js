// Playwright config. The tests need the whole stack running:
//   MongoDB  +  node server (port 5000)  +  React site (port 3000)
// Locally: start them yourself (see e2e/README.md). In CI (E2E_START_SERVERS=1) this file starts the
// API and serves the production build of the React app.
const { defineConfig, devices } = require('@playwright/test');

const WEB_URL = process.env.E2E_WEB_URL || 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL || 'http://localhost:5000/api';

const servers = process.env.E2E_START_SERVERS
  ? [
      {
        command: 'node server.js',
        cwd: '../server',
        url: `${API_URL}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        env: {
          PORT: '5000',
          MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/agribid_e2e',
          JWT_SECRET: process.env.JWT_SECRET || 'e2e-only-secret-not-for-production',
          AUTH_RATE_LIMIT_MAX: '1000',
          RATE_LIMIT_MAX: '100000',
          CROP_PHOTO_WIKIPEDIA: 'false',
        },
      },
      {
        // the React app must be built first: cd agribid && npm run build
        command: 'npx --yes serve -s ../agribid/build -l 3000',
        url: WEB_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
    ]
  : undefined;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,          // the tests share one database; keep them in order
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: servers,
  metadata: { apiUrl: API_URL },
});
