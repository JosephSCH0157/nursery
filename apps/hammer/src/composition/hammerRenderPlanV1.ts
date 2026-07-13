import { hammerStableFingerprint, type HammerCompositionV2 } from "./hammerCompositionV2";
import { assertHammerCompositionV2 } from "./hammerCompositionTransactionV2";
import { resolveHammerMediaSource, type HammerDerivedArtifact, type HammerMediaProvenance, type HammerResolvedMediaSource } from "./hammerMediaProvenance";

export type HammerRenderOperationV1 = Readonly<{
  operation_id: string;
  kind: "video" | "audio" | "caption" | "graphic" | "transition" | "audio_treatment";
  start_sec: number;
  end_sec: number;
  source_media_id: string | null;
  source_fingerprint: string | null;
  payload: Readonly<Record<string, unknown>>;
}>;

export type HammerRenderPlanV1 = Readonly<{
  schema_version: 1;
  compiler_version: "hammer-render-plan.v1";
  composition_id: string;
  composition_revision: number;
  composition_fingerprint: string;
  source_fingerprints: Readonly<Record<string, string>>;
  duration_sec: number;
  operations: readonly HammerRenderOperationV1[];
  fingerprint: string;
}>;

export function compileHammerRenderPlan(composition: HammerCompositionV2): HammerRenderPlanV1 {
  assertHammerCompositionV2(composition);
  const sourceById = new Map(composition.source_media.map((source) => [source.media_id, source]));
  const clipOperations = composition.tracks.flatMap((track) => track.clips.filter((clip) => clip.enabled && track.visible && !track.muted).map((clip) => Object.freeze({
    operation_id: `clip:${clip.clip_id}`,
    kind: clip.kind === "media" ? track.kind === "audio" ? "audio" as const : "video" as const : clip.kind,
    start_sec: clip.timeline_start_sec,
    end_sec: clip.timeline_end_sec,
    source_media_id: clip.source_media_id,
    source_fingerprint: clip.source_media_id
      ? resolveHammerMediaSource({ source: sourceById.get(clip.source_media_id) ?? (() => { throw new Error("media_identity_unresolved"); })(), consumer: "render" }).canonical_fingerprint
      : null,
    payload: clip.payload,
  })));
  const audioOperations = composition.audio_treatments.map((payload, index) => Object.freeze({
    operation_id: `audio-treatment:${index}`,
    kind: "audio_treatment" as const,
    start_sec: 0,
    end_sec: Math.max(0, ...clipOperations.map((row) => row.end_sec)),
    source_media_id: null,
    source_fingerprint: null,
    payload,
  }));
  const operations = [...clipOperations, ...audioOperations].sort((a, b) => a.start_sec - b.start_sec || a.operation_id.localeCompare(b.operation_id));
  const draft = {
    schema_version: 1 as const,
    compiler_version: "hammer-render-plan.v1" as const,
    composition_id: composition.composition_id,
    composition_revision: composition.revision,
    composition_fingerprint: composition.fingerprint,
    source_fingerprints: Object.freeze(Object.fromEntries(composition.source_media.map((source) => [source.media_id, source.content_fingerprint]))),
    duration_sec: Math.max(0, ...operations.map((row) => row.end_sec)),
    operations,
  };
  return Object.freeze({ ...draft, fingerprint: hammerStableFingerprint(draft) });
}

export function selectHammerPreviewOperations(plan: HammerRenderPlanV1, atSec: number): readonly HammerRenderOperationV1[] {
  return plan.operations.filter((operation) => operation.start_sec <= atSec && operation.end_sec > atSec);
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
