import { hammerStableFingerprint, type HammerCompositionV2 } from "./hammerCompositionV2";

export type HammerAudioScopeV1 = Readonly<
  | { kind: "program" }
  | { kind: "track"; track_id: string }
  | { kind: "clip"; clip_id: string }
  | { kind: "speaker"; speaker_id: string }
>;

type TreatmentCore<K extends string> = Readonly<{ treatment_id: string; kind: K; scope: HammerAudioScopeV1; bypassed: boolean }>;
export type HammerAudioTreatmentV1 =
  | (TreatmentCore<"gain"> & Readonly<{ gain_db: number }>)
  | (TreatmentCore<"loudness"> & Readonly<{ target_lufs: number; true_peak_ceiling_dbtp: number }>)
  | (TreatmentCore<"eq"> & Readonly<{ bands: readonly Readonly<{ frequency_hz: number; gain_db: number; q: number }>[] }>)
  | (TreatmentCore<"compressor"> & Readonly<{ threshold_db: number; ratio: number; attack_ms: number; release_ms: number; makeup_gain_db: number }>)
  | (TreatmentCore<"gate"> & Readonly<{ threshold_db: number; attack_ms: number; release_ms: number }>)
  | (TreatmentCore<"limiter"> & Readonly<{ ceiling_dbtp: number; release_ms: number }>)
  | (TreatmentCore<"deesser"> & Readonly<{ frequency_hz: number; threshold_db: number; reduction_db: number }>)
  | (TreatmentCore<"noise_reduction"> & Readonly<{ amount: number }>)
  | (TreatmentCore<"room_tone"> & Readonly<{ source_media_id: string; gain_db: number }>)
  | (TreatmentCore<"crossfade"> & Readonly<{ from_clip_id: string; to_clip_id: string; start_sec: number; end_sec: number; curve: "equal_power" | "linear" }>)
  | (TreatmentCore<"sidechain_duck"> & Readonly<{ key_track_id: string; target_track_id: string; reduction_db: number; attack_ms: number; release_ms: number }>);

export type HammerAudioGraphV1 = Readonly<{
  schema_version: 1;
  compiler_version: "hammer-audio-graph.v1";
  composition_id: string;
  composition_revision: number;
  source_fingerprints: Readonly<Record<string, string>>;
  source_nodes: readonly Readonly<{ operation_id: string; track_id: string; track_role: string; clip_id: string; source_media_id: string; source_fingerprint: string; start_sec: number; end_sec: number }>[];
  treatments: readonly HammerAudioTreatmentV1[];
  master_intents: readonly ["creative_video", "creative_audio", "neutral_finished"];
  fingerprint: string;
}>;

function finite(value: number, code: string): void {
  if (!Number.isFinite(value)) throw new Error(code);
}

export function assertHammerAudioTreatmentV1(value: HammerAudioTreatmentV1): void {
  if (!value.treatment_id || !value.kind || !value.scope || typeof value.bypassed !== "boolean") throw new Error("audio_treatment_invalid");
  if (value.kind === "gain") { finite(value.gain_db, "audio_gain_invalid"); if (value.gain_db < -96 || value.gain_db > 24) throw new Error("audio_gain_invalid"); }
  if (value.kind === "loudness") { finite(value.target_lufs, "audio_loudness_invalid"); finite(value.true_peak_ceiling_dbtp, "audio_loudness_invalid"); if (value.target_lufs < -36 || value.target_lufs > -5 || value.true_peak_ceiling_dbtp > 0) throw new Error("audio_loudness_invalid"); }
  if (value.kind === "limiter" && (value.ceiling_dbtp > 0 || value.ceiling_dbtp < -12 || value.release_ms <= 0)) throw new Error("audio_limiter_invalid");
  if (value.kind === "crossfade" && (!Number.isFinite(value.start_sec) || !Number.isFinite(value.end_sec) || value.start_sec < 0 || value.end_sec <= value.start_sec)) throw new Error("audio_crossfade_invalid");
  if (value.kind === "sidechain_duck" && (value.reduction_db >= 0 || value.attack_ms < 0 || value.release_ms <= 0)) throw new Error("audio_duck_invalid");
  if (value.kind === "noise_reduction" && (value.amount < 0 || value.amount > 1)) throw new Error("audio_noise_reduction_invalid");
}

export function compileHammerAudioGraphV1(composition: HammerCompositionV2): HammerAudioGraphV1 {
  composition.audio_treatments.forEach(assertHammerAudioTreatmentV1);
  const sourceById = new Map(composition.source_media.map((source) => [source.media_id, source]));
  const solo = composition.tracks.some((track) => track.kind === "audio" && track.solo);
  const sourceNodes = composition.tracks.flatMap((track) => {
    if (track.kind !== "audio" || track.muted || !track.visible || (solo && !track.solo)) return [];
    return track.clips.flatMap((clip) => {
      if (!clip.enabled || !clip.source_media_id) return [];
      const source = sourceById.get(clip.source_media_id);
      if (!source || source.availability !== "available") throw new Error("audio_source_unavailable");
      return [Object.freeze({ operation_id: `audio:${clip.clip_id}`, track_id: track.track_id, track_role: track.role, clip_id: clip.clip_id, source_media_id: source.media_id, source_fingerprint: source.content_fingerprint, start_sec: clip.timeline_start_sec, end_sec: clip.timeline_end_sec })];
    });
  });
  const ids = new Set<string>();
  for (const treatment of composition.audio_treatments) {
    if (ids.has(treatment.treatment_id)) throw new Error("audio_treatment_id_duplicate");
    ids.add(treatment.treatment_id);
  }
  const draft = { schema_version: 1 as const, compiler_version: "hammer-audio-graph.v1" as const, composition_id: composition.composition_id, composition_revision: composition.revision, source_fingerprints: Object.freeze(Object.fromEntries(sourceNodes.map((node) => [node.source_media_id, node.source_fingerprint]))), source_nodes: sourceNodes, treatments: composition.audio_treatments, master_intents: ["creative_video", "creative_audio", "neutral_finished"] as const };
  return Object.freeze({ ...draft, fingerprint: hammerStableFingerprint(draft) });
}

export function selectHammerAudioGraphExecution(graph: HammerAudioGraphV1, mode: "processed" | "bypass"): Readonly<{ graph_fingerprint: string; source_nodes: HammerAudioGraphV1["source_nodes"]; treatments: readonly HammerAudioTreatmentV1[] }> {
  return Object.freeze({ graph_fingerprint: graph.fingerprint, source_nodes: graph.source_nodes, treatments: mode === "bypass" ? [] : graph.treatments.filter((treatment) => !treatment.bypassed) });
}

export function diagnoseHammerAudioMaster(args: { measured_lufs: number; true_peak_dbtp: number; target_lufs: number; ceiling_dbtp: number }): Readonly<{ loudness_delta_lu: number; clipping: boolean; within_target: boolean }> {
  return Object.freeze({ loudness_delta_lu: args.measured_lufs - args.target_lufs, clipping: args.true_peak_dbtp > args.ceiling_dbtp, within_target: Math.abs(args.measured_lufs - args.target_lufs) <= 1 && args.true_peak_dbtp <= args.ceiling_dbtp });
}
