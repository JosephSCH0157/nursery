import type { HammerStudioRackState } from "./hammerStudioRack";

export const HAMMER_AUDIO_DSP_SCHEMA_VERSION = "HammerAudioDspPlanV1" as const;
export const HAMMER_AUDIO_DSP_IMPLEMENTATION_VERSION = "hammer-audio-dsp.2" as const;
export const HAMMER_AUDIO_RENDERER_VERSION = "hammer-audio-ffmpeg.3" as const;

export type HammerAudioDspOperationId =
  | "input_gain" | "highpass_cleanup" | "noise_reduction" | "gate"
  | "corrective_eq" | "de_esser" | "compression_level" | "tonal_eq"
  | "tube_saturation" | "reverb" | "loudness_normalization" | "output_limiter";

export type HammerAudioDspOperationV1 = Readonly<{
  id: HammerAudioDspOperationId;
  order: number;
  enabled: boolean;
  bypassed: boolean;
  parameters: Readonly<Record<string, string | number | boolean>>;
  support: Readonly<{ live: "exact" | "approximate"; render: "exact" }>;
}>;

export type HammerAudioDspPlanV1 = Readonly<{
  schemaVersion: typeof HAMMER_AUDIO_DSP_SCHEMA_VERSION;
  implementationVersion: typeof HAMMER_AUDIO_DSP_IMPLEMENTATION_VERSION;
  operations: readonly HammerAudioDspOperationV1[];
  dspFingerprint: string;
}>;

export type HammerAudioRenderIdentityV1 = Readonly<{
  sourceIdentity: string;
  timelineIdentity: string;
  historyHead: string;
  dspFingerprint: string;
  rendererVersion: string;
  algorithmVersions: Readonly<Record<string, string>>;
  renderFingerprint: string;
}>;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function rounded(value: number, places = 6): number {
  const factor = 10 ** places;
  return Math.round(finite(value) * factor) / factor;
}

function canonicalize(value: unknown): unknown {
  if (typeof value === "number") return rounded(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}

export function canonicalHammerAudioJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

// Stable non-cryptographic content identity. Artifact authorization remains on
// the canonical Tongs identities; this fingerprint only detects semantic drift.
export function fingerprintHammerAudio(value: unknown): string {
  const bytes = new TextEncoder().encode(canonicalHammerAudioJson(value));
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function buildHammerAudioDspPlan(rack: HammerStudioRackState, exact?: { podcastMaster?: { normalization_lufs: number; limiter_ceiling_dbtp: number; noise_cleanup?: "off" | "light"; compression_amount?: "light" | "medium" } | null }): HammerAudioDspPlanV1 {
  const active = rack.is_enabled && !rack.is_bypassed;
  const voice = rack.voice_polish;
  const cleanup = active && voice?.voice_cleanup_enabled === true;
  const fixes = voice?.fixes;
  const preset = voice?.preset_id ?? null;
  const op = (id: HammerAudioDspOperationId, order: number, enabled: boolean, parameters: Record<string, string | number | boolean>, live: "exact" | "approximate" = "exact"): HammerAudioDspOperationV1 => Object.freeze({
    id, order, enabled: active && enabled, bypassed: !active, parameters: Object.freeze(canonicalize(parameters) as Record<string, string | number | boolean>), support: Object.freeze({ live, render: "exact" as const }),
  });
  const operations: HammerAudioDspOperationV1[] = [
    op("input_gain", 10, false, { gain_db: 0 }),
    op("highpass_cleanup", 20, cleanup, { frequency_hz: 80 }),
    op("noise_reduction", 30, cleanup || exact?.podcastMaster?.noise_cleanup === "light", { amount: exact?.podcastMaster?.noise_cleanup === "light" ? 0.25 : 0.18 }, "approximate"),
    op("gate", 40, rack.modules.gate.is_enabled && !rack.modules.gate.is_bypassed, { threshold_db: rack.modules.gate.threshold_db, range_db: rack.modules.gate.range_db, attack_ms: rack.modules.gate.attack_ms, release_ms: rack.modules.gate.release_ms }, "approximate"),
    op("corrective_eq", 50, cleanup || fixes?.reduce_room_boxiness === true, { frequency_hz: cleanup ? 3500 : 320, q: cleanup ? 1.2 : 1.1, gain_db: cleanup ? -2 : preset === "broadcast_ready" ? -3.2 : preset === "warm_full" ? -2.4 : -2.7 }),
    op("de_esser", 60, !cleanup && fixes?.remove_harsh_sibilance === true, { strength: voice?.advanced.de_esser_strength ?? "medium", frequency_hz: 6500 }, "approximate"),
    op("compression_level", 70, Boolean(exact?.podcastMaster) || cleanup || fixes?.level_volume === true || (rack.modules.compressor.is_enabled && !rack.modules.compressor.is_bypassed), { threshold_db: exact?.podcastMaster ? (exact.podcastMaster.compression_amount === "medium" ? -21 : -18) : cleanup ? -18 : rack.modules.compressor.threshold_db, ratio: exact?.podcastMaster ? (exact.podcastMaster.compression_amount === "medium" ? 3 : 2) : cleanup ? 2.2 : rack.modules.compressor.ratio, attack_ms: exact?.podcastMaster ? 20 : cleanup ? 12 : rack.modules.compressor.attack_ms, release_ms: exact?.podcastMaster ? 250 : cleanup ? 120 : rack.modules.compressor.release_ms, makeup_gain_db: cleanup ? 2 : rack.modules.compressor.makeup_gain_db }, "approximate"),
    op("tonal_eq", 80, fixes?.enhance_voice_clarity === true || (rack.modules.eq.is_enabled && !rack.modules.eq.is_bypassed), { low_hz: rack.modules.eq.low_shelf_hz, low_gain_db: rack.modules.eq.low_shelf_gain_db, mid_hz: fixes?.enhance_voice_clarity ? 3000 : rack.modules.eq.mid_hz, mid_gain_db: fixes?.enhance_voice_clarity ? (preset === "clean_bright" ? 2.9 : preset === "broadcast_ready" ? 2.6 : 2.2) : rack.modules.eq.mid_gain_db, mid_q: fixes?.enhance_voice_clarity ? 1 : rack.modules.eq.mid_q, high_hz: rack.modules.eq.high_shelf_hz, high_gain_db: voice?.advanced.eq_profile === "bright" ? 4 : rack.modules.eq.high_shelf_gain_db }),
    op("tube_saturation", 90, rack.modules.tubeMicCharacter.is_enabled && !rack.modules.tubeMicCharacter.is_bypassed, { amount: rack.modules.tubeMicCharacter.amount, air: rack.modules.tubeMicCharacter.air, warmth: rack.modules.tubeMicCharacter.warmth }, "approximate"),
    op("reverb", 100, rack.modules.reverb.is_enabled && !rack.modules.reverb.is_bypassed, { mix: rack.modules.reverb.mix, decay_sec: rack.modules.reverb.decay_sec, predelay_ms: rack.modules.reverb.predelay_ms, seed: fingerprintHammerAudio({ decay: rack.modules.reverb.decay_sec, predelay: rack.modules.reverb.predelay_ms, version: HAMMER_AUDIO_DSP_IMPLEMENTATION_VERSION }) }, "approximate"),
    op("loudness_normalization", 110, Boolean(exact?.podcastMaster) || cleanup || fixes?.level_volume === true, { target_lufs: exact?.podcastMaster?.normalization_lufs ?? (cleanup || preset === "broadcast_ready" ? -16 : -18), lra: exact?.podcastMaster ? 11 : cleanup ? 11 : 7, true_peak_dbtp: exact?.podcastMaster?.limiter_ceiling_dbtp ?? -1.5 }, "approximate"),
    op("output_limiter", 120, Boolean(exact?.podcastMaster) || cleanup || fixes?.level_volume === true || rack.modules.tubeMicCharacter.is_enabled, { ceiling_dbfs: exact?.podcastMaster?.limiter_ceiling_dbtp ?? -1.5 }, "approximate"),
  ];
  const seed = { schemaVersion: HAMMER_AUDIO_DSP_SCHEMA_VERSION, implementationVersion: HAMMER_AUDIO_DSP_IMPLEMENTATION_VERSION, operations };
  return Object.freeze({ ...seed, operations: Object.freeze(operations), dspFingerprint: fingerprintHammerAudio(seed) });
}

export function buildHammerAudioRenderIdentity(args: { sourceIdentity: string; timelineIdentity: string; historyHead: string; dspFingerprint: string; rendererVersion?: string; algorithmVersions?: Record<string, string> }): HammerAudioRenderIdentityV1 {
  const seed = { sourceIdentity: args.sourceIdentity, timelineIdentity: args.timelineIdentity, historyHead: args.historyHead, dspFingerprint: args.dspFingerprint, rendererVersion: args.rendererVersion ?? HAMMER_AUDIO_RENDERER_VERSION, algorithmVersions: args.algorithmVersions ?? { dsp: HAMMER_AUDIO_DSP_IMPLEMENTATION_VERSION, ffmpeg_filter_plan: "ffmpeg-filter-plan.3", loudness: "ffmpeg-loudnorm-two-pass.1", sample_limiter: "ffmpeg-alimiter.1" } };
  return Object.freeze({ ...seed, algorithmVersions: Object.freeze(seed.algorithmVersions), renderFingerprint: fingerprintHammerAudio(seed) });
}
