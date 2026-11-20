import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'tests',testMatch:'*.e2e.ts',workers:1,
  use:{baseURL:'http://localhost:4173',ignoreHTTPSErrors:true,trace:'retain-on-failure'},
  projects:[{name:'mobile-webkit',use:{...devices['iPhone 13'],browserName:'webkit'}}],
  webServer:{command:'npm run preview -- --port 4173 --strictPort',url:'http://localhost:4173',reuseExistingServer:!process.env.CI}
});
