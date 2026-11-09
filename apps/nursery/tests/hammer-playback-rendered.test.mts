import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createServer, type Plugin } from "vite";
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

test("normal canonical open plays real WebM whose container duration is unknown", async () => {
  const encoded = await readFile(new URL("./fixtures/hammer-playback-spoken.webm.base64", import.meta.url), "utf8");
  const fixture = Buffer.from(encoded.trim(), "base64");
  const durationElementOffset = fixture.indexOf(Buffer.from([0x44, 0x89, 0x88]));
  assert.ok(durationElementOffset >= 0, "fixture must contain an eight-byte WebM Duration element");
  const unknownDurationFixture = Buffer.from(fixture);
  unknownDurationFixture[durationElementOffset + 1] = 0x88;
  const signedMediaPlugin: Plugin = {
    name: "hammer-unknown-duration-signed-media",
    configureServer(server) {
      server.middlewares.use("/signed/hammer-unknown-duration.webm", (request, response) => {
        response.setHeader("content-type", "video/webm;codecs=vp9,opus");
        response.setHeader("cache-control", "no-store");
        response.setHeader("accept-ranges", "bytes");
        const requestedRange = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        if (requestedRange) {
          const start = Number(requestedRange[1]);
          const requestedEnd = requestedRange[2] ? Number(requestedRange[2]) : unknownDurationFixture.length - 1;
          const end = Math.min(requestedEnd, unknownDurationFixture.length - 1);
          const chunk = unknownDurationFixture.subarray(start, end + 1);
          response.statusCode = 206;
          response.setHeader("content-range", `bytes ${start}-${end}/${unknownDurationFixture.length}`);
          response.setHeader("content-length", String(chunk.length));
          response.end(chunk);
          return;
        }
        response.statusCode = 200;
        response.setHeader("content-length", String(unknownDurationFixture.length));
        const midpoint = Math.floor(unknownDurationFixture.length / 2);
        response.write(unknownDurationFixture.subarray(0, midpoint));
        setTimeout(() => response.end(unknownDurationFixture.subarray(midpoint)), 20);
      });
    },
  };
  const server = await createServer({
    root: new URL("../../..", import.meta.url).pathname,
    logLevel: "error",
    plugins: [signedMediaPlugin],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleMessages: string[] = [];
  page.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));

  const exerciseOpen = async () => {
    await page.goto(`http://127.0.0.1:${address.port}/apps/nursery/tests/fixtures/hammer-canonical-playback-harness.html`);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.querySelector('[data-testid="readiness"]')?.textContent === "playable", null, { timeout: 10_000 });
    assert.equal(await page.getByTestId("source-kind").textContent(), "canonical_signed");
    assert.equal(await page.getByTestId("duration-source").textContent(), "verified_authority");
    assert.equal(await page.getByTestId("native-duration").textContent(), "Infinity");
    assert.equal(await page.getByTestId("endpoint-calls").textContent(), "1");
    assert.equal(await page.getByTestId("binary-fallback-calls").textContent(), "0");
    assert.equal(await page.getByTestId("source-sha").textContent(), "595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24");

    await page.getByRole("button", { name: "Play" }).click();
    await page.waitForFunction(() => (document.querySelector("video") as HTMLVideoElement).currentTime > 0.25);
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="playhead"]')?.textContent) > 0.15);
    assert.ok(Number(await page.getByTestId("playhead").textContent()) > 0.15, "initial Play must advance the rendered playhead");
    assert.equal(await page.getByTestId("audio-context").textContent(), "running");

    await page.getByRole("button", { name: "Pause" }).click();
    const pausedAt = await page.locator("video").evaluate((media: HTMLVideoElement) => media.currentTime);
    await page.waitForTimeout(180);
    assert.ok(Math.abs(await page.locator("video").evaluate((media: HTMLVideoElement) => media.currentTime) - pausedAt) < 0.05, "Pause must hold native media time");

    await page.getByTestId("shortcut-focus").click();
    await page.keyboard.press("Space");
    await page.waitForFunction((time) => (document.querySelector("video") as HTMLVideoElement).currentTime > Number(time) + 0.1, pausedAt);
    await page.keyboard.press("Space");
    await page.waitForFunction(() => {
      const media = document.querySelector("video") as HTMLVideoElement;
      return media.paused && document.querySelector("button")?.textContent === "Play";
    });

    await page.getByRole("button", { name: "Seek early" }).click();
    await page.waitForFunction((target) => Math.abs((document.querySelector("video") as HTMLVideoElement).currentTime - Number(target)) < 0.11, 0.35);
    assert.ok(Math.abs(Number(await page.getByTestId("playhead").textContent()) - 0.35) < 0.11, "early seek must preserve the requested playhead");
    assert.ok(Math.abs(await page.locator("video").evaluate((media: HTMLVideoElement) => media.currentTime) - 0.35) < 0.11, "early seek must update native media time");
    await page.getByRole("button", { name: "Seek late" }).click();
    await page.waitForFunction((target) => Math.abs((document.querySelector("video") as HTMLVideoElement).currentTime - Number(target)) < 0.11, 2.35);
    assert.ok(Math.abs(Number(await page.getByTestId("playhead").textContent()) - 2.35) < 0.11, "late seek must preserve the requested playhead");
    assert.ok(Math.abs(await page.locator("video").evaluate((media: HTMLVideoElement) => media.currentTime) - 2.35) < 0.11, "late seek must update native media time");

    await page.getByTestId("shortcut-focus").click();
    await page.keyboard.press("Space");
    await page.waitForFunction(() => (document.querySelector("video") as HTMLVideoElement).currentTime > 2.4);
  };

  try {
    await exerciseOpen();
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelector('[data-testid="readiness"]')?.textContent === "playable", null, { timeout: 10_000 });
    assert.equal(await page.getByTestId("binary-fallback-calls").textContent(), "0");
    await page.evaluate(() => {
      const testWindow = window as typeof window & { __hammerReloadAdvanced?: boolean };
      const media = document.querySelector("video") as HTMLVideoElement;
      testWindow.__hammerReloadAdvanced = false;
      media.addEventListener("timeupdate", () => {
        if (media.currentTime > 0.03) testWindow.__hammerReloadAdvanced = true;
      });
    });
    await page.getByRole("button", { name: "Play" }).click();
    await page.waitForFunction(() => (window as typeof window & { __hammerReloadAdvanced?: boolean }).__hammerReloadAdvanced === true);
  } catch (error) {
    const mediaState = await page.locator("video").evaluate((media: HTMLVideoElement) => ({
      currentTime: media.currentTime,
      duration: media.duration,
      paused: media.paused,
      ended: media.ended,
      seeking: media.seeking,
      readyState: media.readyState,
    }));
    throw new Error(`${String(error)}\nconsole=${consoleMessages.join("\n")}\nmedia=${JSON.stringify(mediaState)}\nbody=${await page.locator("body").innerText()}`);
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
});
