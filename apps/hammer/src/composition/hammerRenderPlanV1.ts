import { hammerStableFingerprint, type HammerCompositionTrackKind, type HammerCompositionV2 } from "./hammerCompositionV2";
import { assertHammerCompositionV2 } from "./hammerCompositionTransactionV2";
import { resolveHammerMediaSource, type HammerDerivedArtifact, type HammerMediaProvenance, type HammerResolvedMediaSource } from "./hammerMediaProvenance";
import { compileHammerAudioGraphV1, type HammerAudioGraphV1 } from "./hammerAudioGraphV1";

export type HammerRenderOperationKind = "video" | "audio" | "caption" | "graphic" | "transition" | "audio_treatment" | "placement";

export type HammerRenderOperationV1 = Readonly<{
  operation_id: string;
  kind: HammerRenderOperationKind;
  track_id: string | null;
  track_role: string | null;
  layer_index: number;
  start_sec: number;
  end_sec: number;
  source_start_sec: number | null;
  source_end_sec: number | null;
  source_media_id: string | null;
  source_fingerprint: string | null;
  source_group_id: string | null;
  source_sync_offset_sec: number;
  package_role: "intro" | "program" | "outro" | null;
  payload: Readonly<Record<string, unknown>>;
}>;

export type HammerRenderPlanV1 = Readonly<{
  schema_version: 1;
  compiler_version: "hammer-render-plan.v1";
  composition_id: string;
  composition_revision: number;
  composition_fingerprint: string;
  source_fingerprints: Readonly<Record<string, string>>;
  packaging: Readonly<{ intro_operation_id: string | null; outro_operation_id: string | null; thumbnail_asset_id: string | null }>;
  duration_sec: number;
  operations: readonly HammerRenderOperationV1[];
  audio_graph: HammerAudioGraphV1;
  fingerprint: string;
}>;

function operationKind(trackKind: HammerCompositionTrackKind, clipKind: string): HammerRenderOperationKind {
  if (clipKind === "caption" || clipKind === "graphic" || clipKind === "transition") return clipKind;
  return trackKind === "audio" ? "audio" : trackKind === "caption" ? "caption" : trackKind === "graphic" ? "graphic" : "video";
}

function assertFiniteRange(start: number, end: number, code: string): void {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new Error(code);
}

function sortOperations(a: HammerRenderOperationV1, b: HammerRenderOperationV1): number {
  return a.start_sec - b.start_sec || a.layer_index - b.layer_index || a.operation_id.localeCompare(b.operation_id);
}

export function compileHammerRenderPlan(composition: HammerCompositionV2): HammerRenderPlanV1 {
  assertHammerCompositionV2(composition);
  if (composition.captions.stale && composition.tracks.some((track) => track.kind === "caption" && track.clips.some((clip) => clip.enabled))) throw new Error("caption_artifact_stale");
  const sourceById = new Map(composition.source_media.map((source) => [source.media_id, source]));
  const hasSolo = composition.tracks.some((track) => track.solo);
  const clipOperations: HammerRenderOperationV1[] = [];
  composition.tracks.forEach((track, layerIndex) => {
    if (!track.visible || track.muted || (hasSolo && !track.solo)) return;
    for (const clip of track.clips) {
      if (!clip.enabled) continue;
      assertFiniteRange(clip.timeline_start_sec, clip.timeline_end_sec, "timeline_range_invalid");
      if (clip.source_media_id) assertFiniteRange(clip.source_start_sec, clip.source_end_sec, "source_range_invalid");
      const source = clip.source_media_id ? sourceById.get(clip.source_media_id) : null;
      if (clip.source_media_id && !source) throw new Error("media_identity_unresolved");
      const sourceFingerprint = source ? resolveHammerMediaSource({ source, consumer: "render" }).canonical_fingerprint : null;
      const sourceGroup = clip.source_media_id ? composition.source_groups.find((group) => group.members.some((member) => member.source_media_id === clip.source_media_id)) : null;
      const sourceGroupMember = sourceGroup?.members.find((member) => member.source_media_id === clip.source_media_id) ?? null;
      const packageRole = clip.clip_id === composition.packaging.intro_clip_id ? "intro" as const
        : clip.clip_id === composition.packaging.outro_clip_id ? "outro" as const : "program" as const;
      const base = Object.freeze({
        operation_id: `clip:${clip.clip_id}`,
        kind: operationKind(track.kind, clip.kind),
        track_id: track.track_id,
        track_role: track.role,
        layer_index: layerIndex,
        start_sec: clip.timeline_start_sec,
        end_sec: clip.timeline_end_sec,
        source_start_sec: clip.source_media_id ? clip.source_start_sec : null,
        source_end_sec: clip.source_media_id ? clip.source_end_sec : null,
        source_media_id: clip.source_media_id,
        source_fingerprint: sourceFingerprint,
        source_group_id: sourceGroup?.source_group_id ?? null,
        source_sync_offset_sec: sourceGroupMember?.offset_sec ?? 0,
        package_role: packageRole,
        payload: clip.payload,
      });
      clipOperations.push(base);
      const transition = clip.payload.transition ?? clip.payload.transition_in ?? clip.payload.transition_out;
      if (transition) clipOperations.push(Object.freeze({ ...base, operation_id: `transition:${clip.clip_id}`, kind: "transition", source_media_id: null, source_fingerprint: null, source_group_id: null, source_sync_offset_sec: 0, source_start_sec: null, source_end_sec: null, payload: Object.freeze({ transition }) }));
    }
  });
  const duration = Math.max(0, ...clipOperations.map((row) => row.end_sec));
  const audioGraph = compileHammerAudioGraphV1(composition);
  const audioOperations: HammerRenderOperationV1[] = composition.audio_treatments.map((payload, index) => Object.freeze({
    operation_id: `audio-treatment:${index}`,
    kind: "audio_treatment",
    track_id: null,
    track_role: "program_mix",
    layer_index: composition.tracks.length + index,
    start_sec: 0,
    end_sec: duration,
    source_start_sec: null,
    source_end_sec: null,
    source_media_id: null,
    source_fingerprint: null,
    source_group_id: null,
    source_sync_offset_sec: 0,
    package_role: "program",
    payload,
  }));
  const placementOperations: HammerRenderOperationV1[] = composition.automated_placements.map((placement, index) => Object.freeze({
    operation_id: `placement:${placement.placement_id}`,
    kind: "placement",
    track_id: null,
    track_role: "automatic_placement",
    layer_index: composition.tracks.length + audioOperations.length + index,
    start_sec: typeof placement.payload.start_sec === "number" ? placement.payload.start_sec : 0,
    end_sec: typeof placement.payload.end_sec === "number" ? placement.payload.end_sec : duration,
    source_start_sec: null,
    source_end_sec: null,
    source_media_id: null,
    source_fingerprint: null,
    source_group_id: null,
    source_sync_offset_sec: 0,
    package_role: "program",
    payload: placement.payload,
  }));
  const operations = [...clipOperations, ...audioOperations, ...placementOperations].sort(sortOperations);
  const findPackageOperation = (clipId: string | null) => clipId ? operations.find((operation) => operation.operation_id === `clip:${clipId}`)?.operation_id ?? null : null;
  if (composition.packaging.intro_clip_id && !findPackageOperation(composition.packaging.intro_clip_id)) throw new Error("package_intro_unresolved");
  if (composition.packaging.outro_clip_id && !findPackageOperation(composition.packaging.outro_clip_id)) throw new Error("package_outro_unresolved");
  const draft = {
    schema_version: 1 as const,
    compiler_version: "hammer-render-plan.v1" as const,
    composition_id: composition.composition_id,
    composition_revision: composition.revision,
    composition_fingerprint: composition.fingerprint,
    source_fingerprints: Object.freeze(Object.fromEntries(composition.source_media.map((source) => [source.media_id, source.content_fingerprint]))),
    packaging: Object.freeze({ intro_operation_id: findPackageOperation(composition.packaging.intro_clip_id), outro_operation_id: findPackageOperation(composition.packaging.outro_clip_id), thumbnail_asset_id: composition.packaging.thumbnail_asset_id }),
    duration_sec: Math.max(0, ...operations.map((row) => row.end_sec)),
    operations,
    audio_graph: audioGraph,
  };
  return Object.freeze({ ...draft, fingerprint: hammerStableFingerprint(draft) });
}

export function selectHammerPreviewOperations(plan: HammerRenderPlanV1, atSec: number): readonly HammerRenderOperationV1[] {
  if (!Number.isFinite(atSec) || atSec < 0) throw new Error("preview_time_invalid");
  return plan.operations.filter((operation) => operation.start_sec <= atSec && operation.end_sec > atSec).sort(sortOperations);
}

export function resolveHammerPreviewSource(args: {
  operation: HammerRenderOperationV1;
  provenance: readonly HammerMediaProvenance[];
  derivedArtifacts: readonly HammerDerivedArtifact[];
  proxyGeneratorVersion: string;
}): HammerResolvedMediaSource | null {
  if (!args.operation.source_media_id) return null;
  const source = args.provenance.find((entry) => entry.media_id === args.operation.source_media_id);
  if (!source) throw new Error("media_identity_unresolved");
  const resolved = resolveHammerMediaSource({ source, consumer: "preview", derivedArtifacts: args.derivedArtifacts, proxyGeneratorVersion: args.proxyGeneratorVersion });
  if (resolved.canonical_fingerprint !== args.operation.source_fingerprint) throw new Error("preview_source_fingerprint_mismatch");
  return resolved;
}
