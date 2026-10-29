import { defineConfig, devices } from '@playwright/test'

const PORT = 5175

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Requests from the page must reach page.route() mocks, not the app's service worker.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'desktop',
      // Locally this uses the installed Chrome; CI uses Playwright's bundled Chromium.
      use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome', viewport: { width: 1200, height: 800 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], channel: process.env.CI ? undefined : 'chrome' },
    },
  ],
  // Test the production build, as deployed.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
})
