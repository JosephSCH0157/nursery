import { HAMMER_PREVIEW_PERFORMANCE_RECEIPT_SCHEMA, type HammerPreviewPerformanceEvaluation, type HammerPreviewPerformanceSnapshot } from "./hammerPreviewPerformance";

export type HammerPreviewPerformanceReceiptV1 = Readonly<{
  schemaVersion: typeof HAMMER_PREVIEW_PERFORMANCE_RECEIPT_SCHEMA;
  candidateCommit: string;
  mode: "development" | "certification";
  capturedAt: string;
  browser: { name: "chrome" | "edge"; version: string; channel: "stable"; headed: true; hardwareAccelerated: true };
  system: { os: string; cpu: string; logicalCores: number; memoryGb: number | null; gpuRenderer: string; displayRefreshHz: number; devicePixelRatio: number; viewport: { width: number; height: number }; powerMode: "ac" | "unknown" };
  media: { classification: "deterministic_fixture" | "internal_episode"; sanitizedLabel: string; contentHash: string; durationSec: number; width: number; height: number; frameRate: number; generatorVersion: string | null };
  preview: { quality: "low" | "medium" | "high"; scheduler: string; provider: string; analysisResolution: { width: number; height: number }; backingResolution: { width: number; height: number }; effects: { segmentation: boolean; blur: boolean; replacement: boolean; wash: boolean; overlays: boolean } };
  sampling: { warmupMs: number; durationMs: number; windowMs: number; repetition: 1 | 2 | 3; certificationRun: 1 | 2; scenario: string };
  counters: Pick<HammerPreviewPerformanceSnapshot, "maximumPendingJobs" | "segmentationAttempted" | "segmentationCompleted" | "segmentationFailed" | "segmentationSuperseded" | "rawFrameFlashes" | "visibleSourceReloads" | "degradedDurationMs">;
  evaluation: HammerPreviewPerformanceEvaluation;
  receiptFingerprint: string;
}>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("preview_performance_receipt_non_finite");
    return typeof value === "number" ? Math.round(value * 1_000) / 1_000 : value;
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalize(entry)]));
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildHammerPreviewPerformanceReceipt(args: Omit<HammerPreviewPerformanceReceiptV1, "schemaVersion" | "receiptFingerprint">): Promise<HammerPreviewPerformanceReceiptV1> {
  if (!/^[0-9a-f]{40}$/i.test(args.candidateCommit)) throw new Error("preview_performance_candidate_commit_invalid");
  if (!/^[0-9a-f]{64}$/i.test(args.media.contentHash)) throw new Error("preview_performance_media_hash_invalid");
  if (args.mode === "certification" && (!args.browser.hardwareAccelerated || args.system.powerMode !== "ac")) throw new Error("preview_performance_certification_environment_invalid");
  if (args.mode === "certification" && (args.sampling.warmupMs !== 10_000 || args.sampling.durationMs !== 120_000 || args.sampling.windowMs !== 1_000)) throw new Error("preview_performance_certification_sampling_invalid");
  const unsigned = { schemaVersion: HAMMER_PREVIEW_PERFORMANCE_RECEIPT_SCHEMA, ...args };
  return Object.freeze({ ...unsigned, receiptFingerprint: await sha256(unsigned) });
}

export async function verifyHammerPreviewPerformanceReceipt(receipt: HammerPreviewPerformanceReceiptV1): Promise<boolean> {
  const { receiptFingerprint, ...unsigned } = receipt;
  return /^[0-9a-f]{64}$/.test(receiptFingerprint) && await sha256(unsigned) === receiptFingerprint;
}
