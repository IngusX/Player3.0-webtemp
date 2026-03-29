const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:5501',
    headless: true,
  },
  webServer: {
    command: 'python3 -m http.server 5501',
    port: 5501,
    reuseExistingServer: true,
    timeout: 15000,
  },
});
