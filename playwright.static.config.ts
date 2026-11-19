import { defineConfig } from '@playwright/test';

// Tests the GitHub Pages build (`npm run build:pages`) from `vite preview`.
// No Express server runs, so any request to /api fails the tests.
export default defineConfig({
  testDir: './e2e-static',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run build:pages && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  outputDir: 'e2e-static/test-results',
});
