import { defineConfig } from 'playwright/test';
export default defineConfig({testDir:'./playwright',testMatch:'hearth-script-publication.spec.ts',timeout:30000,retries:0,workers:1,use:{baseURL:process.env.FORGE_SCRIPT_TEST_URL ?? 'http://127.0.0.1:5173',headless:true,storageState:{cookies:[],origins:[]},serviceWorkers:'block'},reporter:'list'});
