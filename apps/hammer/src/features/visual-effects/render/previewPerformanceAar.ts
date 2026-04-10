import type { BackgroundBlurSettings } from "../types";
import type { HammerBackgroundBlurRuntimeStatus } from "./backgroundBlurPreviewLayer";

export type BackgroundEffectMode = "blur" | "wash" | "replacement" | "disabled";

export type BackgroundEffectAarSample = {
  capturedAtMs: number;
  mode: BackgroundEffectMode;
  qualityMode: BackgroundBlurSettings["qualityMode"];
  debugMasksEnabled: boolean;
  providerReadiness: HammerBackgroundBlurRuntimeStatus["provider"]["readiness"]["status"];
  degradedReason: string | null;
  lastSegmentationMs: number | null;
  lastCompositeMs: number | null;
  droppedFrames: number;
};

export type BackgroundEffectAarSummary = {
  mode: BackgroundEffectMode;
  qualityMode: BackgroundBlurSettings["qualityMode"];
  debugMasksEnabled: boolean;
  durationSec: number;
  sampleCount: number;
  avgSegmentationMs: number | null;
  avgCompositeMs: number | null;
  degradedRate: number; // 0..1
  degradedHistogram: Record<string, number>;
  droppedFramesDelta: number;
  providerReadinessHistogram: Record<string, number>;
};

function nowMs(): number {
  return (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : Date.now();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function mean(values: Array<number | null>): number | null {
  const filtered = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (filtered.length === 0) return null;
  const sum = filtered.reduce((acc, v) => acc + v, 0);
  return roundToTenth(sum / filtered.length);
}

export function resolveBackgroundEffectMode(settings: BackgroundBlurSettings): BackgroundEffectMode {
  if (settings.washEnabled) return "wash";
  if (settings.replacementEnabled) return "replacement";
  if (settings.enabled) return "blur";
  return "disabled";
}

export function sampleBackgroundEffectAar(args: {
  settings: BackgroundBlurSettings;
  runtimeStatus: HammerBackgroundBlurRuntimeStatus;
  debugMasksEnabled: boolean;
  capturedAtMs?: number;
}): BackgroundEffectAarSample {
  return {
    capturedAtMs: args.capturedAtMs ?? nowMs(),
    mode: resolveBackgroundEffectMode(args.settings),
    qualityMode: args.settings.qualityMode,
    debugMasksEnabled: args.debugMasksEnabled,
    providerReadiness: args.runtimeStatus.provider.readiness.status,
    degradedReason: args.runtimeStatus.degradedReason,
    lastSegmentationMs: args.runtimeStatus.lastSegmentationMs,
    lastCompositeMs: args.runtimeStatus.lastCompositeMs,
    droppedFrames: args.runtimeStatus.droppedFrames,
  };
}

function histogram(values: Array<string | null>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) {
    if (!value) continue;
    out[value] = (out[value] ?? 0) + 1;
  }
  return out;
}

function histogramStrings(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) {
    out[value] = (out[value] ?? 0) + 1;
  }
  return out;
}

export function summarizeBackgroundEffectAar(samples: BackgroundEffectAarSample[]): BackgroundEffectAarSummary | null {
  if (samples.length === 0) return null;
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const durationSec = Math.max(0, (last.capturedAtMs - first.capturedAtMs) / 1000);

  const degradedCount = samples.filter((s) => Boolean(s.degradedReason)).length;
  const degradedRate = clamp(degradedCount / Math.max(1, samples.length), 0, 1);

  const droppedMin = Math.min(...samples.map((s) => s.droppedFrames));
  const droppedMax = Math.max(...samples.map((s) => s.droppedFrames));

  return {
    mode: first.mode,
    qualityMode: first.qualityMode,
    debugMasksEnabled: first.debugMasksEnabled,
    durationSec: roundToTenth(durationSec),
    sampleCount: samples.length,
    avgSegmentationMs: mean(samples.map((s) => s.lastSegmentationMs)),
    avgCompositeMs: mean(samples.map((s) => s.lastCompositeMs)),
    degradedRate: roundToTenth(degradedRate),
    degradedHistogram: histogram(samples.map((s) => s.degradedReason)),
    droppedFramesDelta: Math.max(0, droppedMax - droppedMin),
    providerReadinessHistogram: histogramStrings(samples.map((s) => s.providerReadiness)),
  };
}

