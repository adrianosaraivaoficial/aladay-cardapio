import {defineConfig} from '@playwright/test';
import fs from 'node:fs';

const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || ['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(path=>fs.existsSync(path));
export default defineConfig({
  testDir:'./tests/e2e',testMatch:'**/*.spec.ts',fullyParallel:false,workers:1,
  timeout:60000,expect:{timeout:15000},reporter:'list',
  use:{baseURL:'http://127.0.0.1:32200',viewport:{width:1440,height:1100},headless:true,trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:{...(executablePath?{executablePath}:{}),args:['--no-sandbox','--disable-dev-shm-usage']}},
});
