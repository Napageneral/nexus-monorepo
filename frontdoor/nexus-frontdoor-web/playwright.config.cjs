"use strict";

const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4310",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node test/e2e-server.js",
    port: 4310,
    timeout: 120000,
    reuseExistingServer: false,
  },
});
