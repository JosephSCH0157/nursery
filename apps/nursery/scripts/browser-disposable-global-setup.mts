import assert from "node:assert/strict";
import { chromium } from "playwright/test";
import { DISPOSABLE_PROXY, disposableRuntimeScript, readDisposableBrowserConfig, startDisposableProxy } from "./browser-disposable-isolation.mts";

export default async function setup() {
  const config = readDisposableBrowserConfig();
  assert(config, "Disposable browser setup requires its job-owned configuration");
  const proxy = await startDisposableProxy(config);
  try {
    // This is an exact loopback origin; redirects may not move the check remote.
    const response = await fetch(config.appOrigin + "/forge-config.js", { redirect: "error" });
    assert(response.ok);
    assert.equal(await response.text(), disposableRuntimeScript(config), "Served runtime configuration is not disposable");
    const browser = await chromium.launch({ proxy: { server: DISPOSABLE_PROXY, bypass: "<-loopback>" } });
    try {
      const page = await browser.newPage({ serviceWorkers: "block" });
      await page.goto(config.appOrigin + "/__forge-browser/config-check");
      const effective = await page.evaluate(() => {
        const runtime = window as unknown as { __forgeSupabaseUrl: string; __forgeSupabaseAnonKey: string };
        return { url: runtime.__forgeSupabaseUrl, key: runtime.__forgeSupabaseAnonKey };
      });
      assert.equal(effective.url, config.apiOrigin, "Browser effective API must be loopback");
      assert.equal(effective.key, config.anonKey, "Browser must use the disposable anonymous credential");
      console.log("[browser-isolation] served and browser-effective Supabase configuration verified on loopback; DOCX/CDN excluded");
    } finally { await browser.close(); }
    assert.equal(proxy.denied.length, 0, "Runtime verification attempted forbidden network access");
  } catch (error) { await proxy.close(); throw error; }
  return async () => {
    await proxy.close();
    console.log("[browser-isolation] proxy evidence " + JSON.stringify({ ...proxy.forwarded, denied: proxy.denied.length }));
    assert.deepEqual(proxy.denied, [], "Unauthorized network destinations were blocked; browser certification failed");
  };
}
