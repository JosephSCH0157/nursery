import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createServer, type Plugin } from "vite";
import { chromium } from "playwright";
import { TongsCommitService } from "@forge/tongs/workpiece-commit-api";

const CANONICAL_IDS = {
  workspace: "cc5478ff-37be-403e-824c-467fa7da061e",
  workpiece: "21d16d6a-905b-491e-8761-028789612ae5",
  recording: "4cc846e3-187c-46d9-8733-e7402488236c",
  revision: "9c991aa7-f551-4f03-a4d6-41eb40ef81ec",
  completion: "bf67d649-1bc2-44ba-9a33-783b3ab523ea",
  capture: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  receipt: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};
const CANONICAL_SHA = "595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24";

function canonicalOpenFixtureService(signedUrl: () => string): TongsCommitService {
  const canonical = {
    id: CANONICAL_IDS.recording,
    workspace_id: CANONICAL_IDS.workspace,
    workpiece_id: CANONICAL_IDS.workpiece,
    status: "draft",
    media_id: `anvil-completion:${CANONICAL_IDS.completion}`,
    media_path: "recordings/brad.webm",
    media_signature: CANONICAL_SHA,
    media_bytes: 12_399,
    media_content_type: "video/webm;codecs=vp9,opus",
    media_duration_ms: null,
    source_kind: "anvil_capture",
    source_authority_id: CANONICAL_IDS.completion,
    source_capture_authority_id: CANONICAL_IDS.capture,
  };
  const rows: Record<string, unknown> = {
    episodes: { canonical_recording_id: CANONICAL_IDS.recording, active_revision_id: CANONICAL_IDS.revision },
    canonical_recordings: canonical,
    recording_revisions: {
      id: CANONICAL_IDS.revision,
      workspace_id: CANONICAL_IDS.workspace,
      workpiece_id: CANONICAL_IDS.workpiece,
      canonical_recording_id: CANONICAL_IDS.recording,
      status: "active",
    },
    anvil_recording_completion_requests: {
      id: CANONICAL_IDS.completion,
      workspace_id: CANONICAL_IDS.workspace,
      workpiece_id: CANONICAL_IDS.workpiece,
      capture_authority_id: CANONICAL_IDS.capture,
      media_path: "recordings/brad.webm",
      media_hash: CANONICAL_SHA,
      media_bytes: 12_399,
      media_content_type: "video/webm;codecs=vp9,opus",
      media_verification_receipt_id: CANONICAL_IDS.receipt,
    },
    recording_media_verification_receipts: {
      id: CANONICAL_IDS.receipt,
      workspace_id: CANONICAL_IDS.workspace,
      workpiece_id: CANONICAL_IDS.workpiece,
      recording_capture_authority_id: CANONICAL_IDS.capture,
      media_path: "recordings/brad.webm",
      media_hash: CANONICAL_SHA,
      media_bytes: 12_399,
      media_content_type: "video/webm;codecs=vp9,opus",
      duration_ms: 2_530,
    },
  };
  const schema = {
    from(table: string) {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        maybeSingle() { return Promise.resolve({ data: rows[table] ?? null, error: null }); },
      };
      return builder;
    },
    async rpc(name: string) {
      assert.equal(name, "open_hammer_authority");
      return {
        data: {
          outcome: "opened",
          canonical_recording: canonical,
          revision: rows.recording_revisions,
          preparation_attempt: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
        },
        error: null,
      };
    },
  };
  const service = new TongsCommitService({
    schema: () => schema,
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: signedUrl() }, error: null }) }) },
  } as never, "forge-workpieces", null, () => ({ schema: () => schema } as never));
  service.getWorkspaceOrThrow = async () => ({ id: CANONICAL_IDS.workspace } as never);
  service.assertWorkpieceInWorkspace = async () => undefined;
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: "fixture", role: "editor" } as never);
  return service;
}

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
  let origin = "";
  let mediaOrigin = "";
  let corsMode: "allowed" | "missing" | "rejected" = "allowed";
  const rangeRequests: string[] = [];
  const fixtureService = canonicalOpenFixtureService(
    () => `${mediaOrigin}/signed/hammer-unknown-duration.webm?cors=${corsMode}`,
  );
  const signedMediaPlugin: Plugin = {
    name: "hammer-unknown-duration-signed-media",
    configureServer(server) {
      server.middlewares.use("/test/hammer/session", async (_request, response) => {
        const opened = await fixtureService.openHammerAuthority(
          CANONICAL_IDS.workspace,
          CANONICAL_IDS.workpiece,
          { operation_key: "hammer-open:rendered-authority", transcript_policy: "reuse_only" },
          { userAccessToken: "fixture" },
        );
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ ok: true, data: opened }));
      });
      server.middlewares.use((request, response, next) => {
        if (!request.url?.endsWith("/hammer/playable-media")) return next();
        let body = "";
        request.on("data", (chunk) => { body += String(chunk); });
        request.on("end", async () => {
          try {
            const result = await fixtureService.readHammerPlayableMedia(
              CANONICAL_IDS.workspace,
              CANONICAL_IDS.workpiece,
              JSON.parse(body),
              { userAccessToken: "fixture" },
            );
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify({ ok: true, data: result }));
          } catch (error) {
            response.statusCode = Number((error as { status?: number }).status ?? 500);
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify({ ok: false, error: { code: (error as { code?: string }).code, message: String(error) } }));
          }
        });
      });
      server.middlewares.use("/signed/hammer-unknown-duration.webm", (request, response) => {
        if (corsMode !== "missing") response.setHeader("access-control-allow-origin", corsMode === "allowed" ? origin : "https://rejected.invalid");
        if (request.headers.range) rangeRequests.push(request.headers.range);
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
  origin = `http://127.0.0.1:${address.port}`;
  const mediaServer = await createServer({
    root: new URL("../../..", import.meta.url).pathname,
    configFile: false,
    logLevel: "error",
    plugins: [signedMediaPlugin],
    server: { host: "127.0.0.1", port: 0, cors: false },
  });
  await mediaServer.listen();
  const mediaAddress = mediaServer.httpServer?.address();
  assert.ok(mediaAddress && typeof mediaAddress !== "string");
  mediaOrigin = `http://127.0.0.1:${mediaAddress.port}`;
  assert.notEqual(mediaOrigin, origin);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const runtime = window as typeof window & { __audioPeak: number; __audioSamples: number };
    runtime.__audioPeak = 0;
    runtime.__audioSamples = 0;
    const connect = AudioNode.prototype.connect;
    // Observe the actual Studio Rack master output; never replace its source or graph.
    AudioNode.prototype.connect = function (...args: Parameters<AudioNode["connect"]>) {
      const destination = args[0];
      if (destination instanceof AudioDestinationNode) {
        const analyser = this.context.createAnalyser();
        connect.call(this, analyser);
        const samples = new Float32Array(analyser.fftSize);
        window.setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          runtime.__audioSamples += samples.length;
          for (const sample of samples) runtime.__audioPeak = Math.max(runtime.__audioPeak, Math.abs(sample));
        }, 10);
      }
      return Reflect.apply(connect, this, args);
    } as AudioNode["connect"];
  });
  const consoleMessages: string[] = [];
  const providerRequests: string[] = [];
  page.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
  page.on("request", (request) => {
    if (/assemblyai|transcription|openai|runway/i.test(request.url())) providerRequests.push(request.url());
  });

  const exerciseOpen = async () => {
    await page.goto(`http://127.0.0.1:${address.port}/apps/nursery/tests/fixtures/hammer-canonical-playback-harness.html`);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.querySelector('[data-testid="readiness"]')?.textContent === "playable", null, { timeout: 10_000 });
    assert.equal(await page.getByTestId("source-kind").textContent(), "canonical_signed");
    assert.equal(await page.locator("video").getAttribute("crossorigin"), "anonymous");
    assert.equal(await page.getByTestId("duration-source").textContent(), "verified_authority");
    assert.equal(await page.getByTestId("transport-duration").textContent(), "2.530");
    assert.equal(await page.getByTestId("native-duration").textContent(), "Infinity");
    assert.equal(await page.getByTestId("endpoint-calls").textContent(), "1");
    assert.equal(await page.getByTestId("binary-fallback-calls").textContent(), "0");
    assert.equal(await page.getByTestId("source-sha").textContent(), "595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24");
    assert.equal(await page.getByTestId("transcript-id").textContent(), "saved-transcript");
    assert.equal(await page.getByTestId("provider-attempt-count").textContent(), "1");

    await page.getByRole("button", { name: "Play" }).click();
    await page.waitForFunction(() => (document.querySelector("video") as HTMLVideoElement).currentTime > 0.25);
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="playhead"]')?.textContent) > 0.15);
    assert.ok(Number(await page.getByTestId("playhead").textContent()) > 0.15, "initial Play must advance the rendered playhead");
    assert.equal(await page.getByTestId("audio-context").textContent(), "running");
    await page.waitForFunction(() => (window as typeof window & { __audioPeak: number }).__audioPeak > 0.001);

    await page.getByRole("button", { name: "Pause" }).click();
    const pausedAt = await page.locator("video").evaluate((media: HTMLVideoElement) => media.currentTime);
    await page.waitForTimeout(180);
    assert.ok(Math.abs(await page.locator("video").evaluate((media: HTMLVideoElement) => media.currentTime) - pausedAt) < 0.05, "Pause must hold native media time");

    await page.getByRole("button", { name: "Seek transcript end" }).click();
    await page.waitForFunction(() => Math.abs((document.querySelector("video") as HTMLVideoElement).currentTime - 2) < 0.11);
    await page.getByRole("button", { name: "Play" }).click();
    await page.waitForFunction(() => (document.querySelector("video") as HTMLVideoElement).currentTime > 2.12);
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="playhead"]')?.textContent) > 2);
    assert.ok(Number(await page.getByTestId("playhead").textContent()) > 2, "Play at the transcript boundary must continue through the verified media tail");
    await page.getByRole("button", { name: "Pause" }).click();
    const boundaryPausedAt = await page.locator("video").evaluate((media: HTMLVideoElement) => media.currentTime);

    await page.getByTestId("shortcut-focus").click();
    await page.keyboard.press("Space");
    await page.waitForFunction((time) => (document.querySelector("video") as HTMLVideoElement).currentTime > Number(time) + 0.1, boundaryPausedAt);
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
    await page.waitForFunction(() => (window as typeof window & { __audioPeak: number }).__audioPeak > 0.001);
    console.log("Cross-origin Studio Rack measured output", await page.evaluate(() => ({
      peak: (window as typeof window & { __audioPeak: number }).__audioPeak,
      samples: (window as typeof window & { __audioSamples: number }).__audioSamples,
    })));
    assert.ok(rangeRequests.some((range) => range.startsWith("bytes=")), "signed media retains range delivery");
    for (const mode of ["missing", "rejected"] as const) {
      corsMode = mode;
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForFunction(() => document.querySelector('[data-testid="readiness"]')?.textContent === "failed");
      await page.waitForFunction(() => document.querySelector('[data-testid="hint"]')?.textContent?.includes("Storage CORS authorization"));
      assert.equal(await page.getByTestId("binary-fallback-calls").textContent(), "0");
      assert.equal(await page.evaluate(() => (window as typeof window & { __audioPeak: number }).__audioPeak), 0);
      assert.equal(await page.locator("video").evaluate((media: HTMLVideoElement) => media.paused), true);
    }
    assert.ok(consoleMessages.some((message) => message.includes("cross_origin_media_load_failed")));
    assert.deepEqual(providerRequests, []);
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
    await mediaServer.close();
    await server.close();
  }
});
