import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  retries: 0,
  workers: 1, // Sequential — we're recording video of one session

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    viewport: { width: 1400, height: 900 },

    // Video recording — capture everything
    video: 'on',

    // Playwright tracing — full interactive replay
    trace: 'on',

    // Screenshots on failure (we also take manual screenshots)
    screenshot: 'on',

    // Browser settings
    headless: true,
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
  },

  outputDir: process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR
    ? `${process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR}`
    : './test-results',

  reporter: [
    ['line'],
    ['json', {
      outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || './test-results/results.json'
    }],
  ],

  projects: [
    {
      name: 'console-cleanroom',
      use: {
        browserName: 'chromium',
      },
    },
  ],
});
