import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { chromium } from "playwright";

test("rendered Hammer Play transport advances real VP9/Opus media and its playhead", async () => {
  const server = await createServer({
    root: new URL("../../..", import.meta.url).pathname,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const failures: string[] = [];
  page.on("console", (message) => {
    failures.push(`${message.type()}: ${message.text()}`);
  });
  try {
    await page.goto(`http://127.0.0.1:${address.port}/apps/nursery/tests/fixtures/hammer-playback-harness.html`);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.querySelector('[data-testid="readiness"]')?.textContent === "playable", null, { timeout: 10_000 }).catch(async (error) => {
      throw new Error(`${String(error)}\nconsole=${failures.join("\n")}\nbody=${await page.locator("body").innerText()}`);
    });
    const play = page.getByRole("button", { name: "Play (Space)" });
    await play.click();
    await page.waitForFunction(() => {
      const media = document.querySelector("video");
      return media instanceof HTMLVideoElement && media.currentTime > 0.35;
    }, null, { timeout: 10_000 }).catch(async (error) => {
      const state = await page.evaluate(() => {
        const media = document.querySelector("video") as HTMLVideoElement | null;
        return media ? { currentTime: media.currentTime, paused: media.paused, readyState: media.readyState, networkState: media.networkState, error: media.error?.message ?? null } : null;
      });
      throw new Error(`${String(error)}\nconsole=${failures.join("\n")}\nstate=${JSON.stringify(state)}\nbody=${await page.locator("body").innerText()}`);
    });
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="playhead"]')?.textContent) > 0.2);
    const first = await page.evaluate(() => ({
      time: (document.querySelector("video") as HTMLVideoElement).currentTime,
      muted: (document.querySelector("video") as HTMLVideoElement).muted,
      volume: (document.querySelector("video") as HTMLVideoElement).volume,
      playhead: Number(document.querySelector('[data-testid="playhead"]')?.textContent),
      context: document.querySelector('[data-testid="audio-context"]')?.textContent,
    }));
    assert.ok(first.time > 0.35);
    assert.ok(first.playhead > 0.2);
    assert.equal(first.muted, false);
    assert.equal(first.volume, 1);
    assert.equal(first.context, "running");

    await page.getByRole("button", { name: "Pause (Space)" }).click();
    const pausedAt = await page.locator("video").evaluate((media: HTMLVideoElement) => media.currentTime);
    await page.waitForTimeout(250);
    const stillAt = await page.locator("video").evaluate((media: HTMLVideoElement) => media.currentTime);
    assert.ok(Math.abs(stillAt - pausedAt) < 0.05);

    await play.click();
    await page.waitForFunction((time) => (document.querySelector("video") as HTMLVideoElement).currentTime > Number(time) + 0.2, pausedAt);
    assert.equal(failures.some((message) => message.includes("AudioContext was not allowed to start")), false);
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
});
