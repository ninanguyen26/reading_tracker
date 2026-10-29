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
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
})
