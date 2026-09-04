import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "playwright/test";
import { evaluateHammerPreviewPerformance, type HammerPreviewPerformanceSnapshot } from "../../hammer/src/features/visual-effects/render/hammerPreviewPerformance";
import { buildHammerPreviewPerformanceReceipt } from "../../hammer/src/features/visual-effects/render/hammerPreviewPerformanceReceipt";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const FIXTURE_MANIFEST = path.resolve(import.meta.dirname, ".cache/hammer-preview-performance-fixture.v1.json");
const RECEIPT_DIR = path.resolve(import.meta.dirname, ".cache/hammer-preview-performance-receipts");
const INTERNAL_MANIFEST = process.env.HAMMER_PERFORMANCE_INTERNAL_MANIFEST
  ? path.resolve(process.env.HAMMER_PERFORMANCE_INTERNAL_MANIFEST)
  : path.resolve(import.meta.dirname, ".cache/hammer-preview-performance-internal.v1.json");
const WORKSPACE_ID = process.env.FORGE_TEST_HAMMER_WORKSPACE_ID ?? "";
const WORKPIECE_ID = process.env.FORGE_TEST_HAMMER_WORKPIECE_ID ?? "";
const FORMAL = process.env.HAMMER_PERFORMANCE_FORMAL === "1";
const WARMUP_MS = FORMAL ? 10_000 : Number(process.env.HAMMER_PERFORMANCE_WARMUP_MS ?? 10_000);
const SAMPLE_MS = FORMAL ? 120_000 : Number(process.env.HAMMER_PERFORMANCE_SAMPLE_MS ?? 120_000);
const CERTIFICATION_RUN = Number(process.env.HAMMER_PERFORMANCE_RUN ?? 1) as 1 | 2;
if (FORMAL && ![1, 2].includes(CERTIFICATION_RUN)) throw new Error("HAMMER_PERFORMANCE_RUN must be 1 or 2 in formal mode.");

type BridgeDiagnostics = { provider: string; scheduler: string; quality: "low" | "medium" | "high"; analysisResolution: { width: number; height: number } | null; backingResolution: { width: number; height: number } | null; degradedReason: string | null; warnings: string[]; effects: { segmentation: boolean; blur: boolean; replacement: boolean; wash: boolean } };
type PerformanceBridge = { candidateCommit: string | null; diagnostics(): BridgeDiagnostics; reset(): void; snapshot(): HammerPreviewPerformanceSnapshot };
declare global { interface Window { __hammerPreviewPerformance?: PerformanceBridge } }

const scenarios = ["continuous", "asset-heavy", "composite-controls", "matte-refinement", "seek-recovery"] as const;

type MediaAuthority = { classification: "deterministic_fixture" | "internal_episode"; sanitized_label: string; content_hash: string; duration_sec: number; width: number; height: number; frame_rate: number; public_path: string; generator_version?: string | null; evidence_role?: "presenter_edges" | "visual_heavy" | "transport_recovery" };

function fixture(): MediaAuthority {
  if (!fs.existsSync(FIXTURE_MANIFEST)) throw new Error("PERFORMANCE_FIXTURE_MISSING: run pnpm --filter nursery preview-performance:prepare");
  const value = JSON.parse(fs.readFileSync(FIXTURE_MANIFEST, "utf8")) as Omit<MediaAuthority, "classification" | "sanitized_label">;
  return { ...value, classification: "deterministic_fixture", sanitized_label: "hammer-long-form-1080p-v1" };
}

function mediaAuthorities(): MediaAuthority[] {
  const values = [fixture()];
  if (fs.existsSync(INTERNAL_MANIFEST)) {
    const manifest = JSON.parse(fs.readFileSync(INTERNAL_MANIFEST, "utf8")) as { episodes?: MediaAuthority[] };
    values.push(...(manifest.episodes ?? []));
  }
  if (FORMAL && values.filter((entry) => entry.classification === "internal_episode").length < 3) throw new Error("PERFORMANCE_INTERNAL_EPISODES_REQUIRED");
  return values;
}

async function gpuIdentity(page: Page): Promise<{ renderer: string; hardware: boolean }> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl") as WebGLRenderingContext | null;
    if (!gl) return { renderer: "webgl-unavailable", hardware: false };
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return { renderer, hardware: !/(swiftshader|llvmpipe|software|microsoft basic render)/i.test(renderer) };
  });
}

async function estimateRefreshRate(page: Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((resolve) => {
    const samples: number[] = []; let previous = performance.now();
    const next = (now: number) => { samples.push(now - previous); previous = now; if (samples.length < 30) requestAnimationFrame(next); else resolve(Math.round(1000 / (samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)] ?? 16.67))); };
    requestAnimationFrame(next);
  }));
}

async function openHarness(page: Page, media: MediaAuthority): Promise<void> {
  await page.goto(`/app/hammer/editor?workspace_id=${encodeURIComponent(WORKSPACE_ID)}&workpiece_id=${encodeURIComponent(WORKPIECE_ID)}&tp_dev_mode=1&hammer_segmentation_debug=1&hammer_preview_performance_media=${encodeURIComponent(media.public_path)}`);
  await expect(page.locator("section.hammer-preview-bay")).toBeVisible();
  await page.evaluate(async () => {
    const videos = [...document.querySelectorAll<HTMLVideoElement>(".hammer-preview-surface video:not(.hammer-preview-media--audio)")];
    for (const video of videos) { if (video.readyState < 2) await new Promise<void>((resolve, reject) => { video.addEventListener("loadeddata", () => resolve(), { once: true }); video.addEventListener("error", () => reject(new Error("fixture video failed to load")), { once: true }); }); video.currentTime = 0; }
  });
  const visuals = page.getByRole("button", { name: "Visuals", exact: true });
  if (await visuals.isVisible()) await visuals.click();
  const blur = page.getByText("Background Blur", { exact: true }).locator("xpath=ancestor::label").locator("input");
  await expect(blur).toBeVisible();
  if (!await blur.isChecked()) await blur.check();
  const advancedBlurControls = page.getByText("Advanced Blur Controls", { exact: true });
  await expect(advancedBlurControls).toBeVisible();
  await advancedBlurControls.click();
  const quality = page.locator("label.hammer-tool-field:visible").filter({ hasText: "Quality" }).locator("select");
  await expect(quality).toBeVisible();
  await quality.selectOption("medium");
  await expect.poll(() => page.evaluate(() => Boolean(window.__hammerPreviewPerformance))).toBe(true);
  await page.evaluate(async () => { for (const video of document.querySelectorAll<HTMLVideoElement>(".hammer-preview-surface video")) await video.play().catch(() => undefined); });
  try {
    await expect.poll(() => page.evaluate(() => window.__hammerPreviewPerformance?.snapshot().segmentationCompleted ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
  } catch (error) {
    const evidence = await page.evaluate(() => ({ bridge: window.__hammerPreviewPerformance ? { diagnostics: window.__hammerPreviewPerformance.diagnostics(), snapshot: window.__hammerPreviewPerformance.snapshot() } : null, videos: [...document.querySelectorAll<HTMLVideoElement>(".hammer-preview-surface video")].map((video) => ({ currentTime: video.currentTime, duration: video.duration, paused: video.paused, readyState: video.readyState, error: video.error?.message ?? null })), status: document.querySelector(".hammer-preview-health-chip")?.textContent ?? null }));
    throw new Error(`PERFORMANCE_SEGMENTATION_NOT_ACTIVE:${JSON.stringify(evidence)}`, { cause: error });
  }
}

async function exercise(page: Page, scenario: typeof scenarios[number]): Promise<void> {
  if (scenario === "composite-controls") {
    const slider = page.getByText(/Blur strength/).locator("xpath=ancestor::label").locator("input[type=range]");
    if (await slider.isVisible()) for (const value of [8, 14, 10]) await slider.fill(String(value));
  } else if (scenario === "matte-refinement") {
    const slider = page.getByText(/Edge feather/).first().locator("xpath=ancestor::label").locator("input[type=range]");
    if (await slider.isVisible()) for (const value of [2, 5, 3]) await slider.fill(String(value));
  } else if (scenario === "seek-recovery") {
    await page.evaluate(async () => { const video = document.querySelector<HTMLVideoElement>(".hammer-preview-media"); if (!video) return; video.pause(); video.currentTime = Math.min(video.duration - 1, video.currentTime + 45); await new Promise<void>((resolve) => video.addEventListener("seeked", () => resolve(), { once: true })); await video.play(); });
  }
}

test.beforeAll(() => {
  if (!WORKSPACE_ID || !WORKPIECE_ID) throw new Error("Authenticated Hammer fixture authority is missing.");
  fixture();
});

for (const mediaAuthority of mediaAuthorities()) for (const scenario of scenarios) for (const repetition of [1, 2, 3] as const) {
  test(`${mediaAuthority.sanitized_label} ${scenario} repetition ${repetition}`, async ({ page, browser }, testInfo) => {
    await openHarness(page, mediaAuthority);
    const candidateCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
    if (FORMAL) expect(await page.evaluate(() => window.__hammerPreviewPerformance?.candidateCommit)).toBe(candidateCommit);
    const gpu = await gpuIdentity(page);
    expect(gpu.hardware, `Hardware rendering required; observed ${gpu.renderer}`).toBe(true);
    await page.waitForTimeout(WARMUP_MS);
    await page.evaluate(() => window.__hammerPreviewPerformance!.reset());
    const sampleStartMs = await page.evaluate(() => performance.now());
    await exercise(page, scenario);
    await page.waitForTimeout(SAMPLE_MS);
    const snapshot = await page.evaluate(() => window.__hammerPreviewPerformance!.snapshot());
    const authority = await page.evaluate(() => window.__hammerPreviewPerformance!.diagnostics());
    expect(authority.effects.segmentation).toBe(true);
    expect(authority.effects.blur).toBe(true);
    expect(authority.analysisResolution).not.toBeNull();
    const evaluation = evaluateHammerPreviewPerformance({ snapshot, sampleStartMs, sampleDurationMs: SAMPLE_MS, allowDegraded: scenario === "seek-recovery" });
    const media = mediaAuthority;
    const browserKind = testInfo.project.name.startsWith("edge") ? "edge" : "chrome";
    const details = await page.evaluate(() => ({ os: navigator.userAgent, cores: navigator.hardwareConcurrency, memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null, dpr: devicePixelRatio, viewport: { width: innerWidth, height: innerHeight }, canvas: { width: document.querySelector<HTMLCanvasElement>(".hammer-preview-surface canvas")?.width ?? 0, height: document.querySelector<HTMLCanvasElement>(".hammer-preview-surface canvas")?.height ?? 0 } }));
    const receipt = await buildHammerPreviewPerformanceReceipt({
      candidateCommit, mode: FORMAL ? "certification" : "development", capturedAt: new Date().toISOString(),
      browser: { name: browserKind, version: browser.version(), channel: "stable", headed: true, hardwareAccelerated: true },
      system: { os: details.os, cpu: `logical-cores-${details.cores}`, logicalCores: details.cores, memoryGb: details.memory, gpuRenderer: gpu.renderer, displayRefreshHz: await estimateRefreshRate(page), devicePixelRatio: details.dpr, viewport: details.viewport, powerMode: FORMAL ? "ac" : "unknown" },
      media: { classification: media.classification, sanitizedLabel: media.sanitized_label, contentHash: media.content_hash, durationSec: media.duration_sec, width: media.width, height: media.height, frameRate: media.frame_rate, generatorVersion: media.generator_version ?? (media.classification === "deterministic_fixture" ? "hammer-preview-performance-fixture.v1" : null) },
      preview: { quality: authority.quality, scheduler: authority.scheduler, provider: authority.provider, analysisResolution: authority.analysisResolution!, backingResolution: authority.backingResolution ?? details.canvas, effects: { ...authority.effects, overlays: scenario === "asset-heavy" } },
      sampling: { warmupMs: WARMUP_MS, durationMs: SAMPLE_MS, windowMs: 1_000, repetition, certificationRun: CERTIFICATION_RUN, scenario }, counters: snapshot, evaluation,
    });
    fs.mkdirSync(RECEIPT_DIR, { recursive: true });
    fs.writeFileSync(path.join(RECEIPT_DIR, `${receipt.candidateCommit}-run${CERTIFICATION_RUN}-${browserKind}-${media.sanitized_label}-${scenario}-${repetition}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
    if (evaluation.blockingReasons.length) throw new Error(`PERFORMANCE_THRESHOLDS_FAILED:${JSON.stringify({ authority, evaluation })}`);
  });
}
