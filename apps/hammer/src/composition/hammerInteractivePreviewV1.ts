import { hammerStableFingerprint } from "./hammerCompositionV2";
import {
  resolveHammerPreviewSource,
  hammerRenderPlanFingerprint,
  selectHammerPreviewOperations,
  type HammerRenderOperationV1,
  type HammerRenderPlanV1,
} from "./hammerRenderPlanV1";
import type { HammerDerivedArtifact, HammerMediaProvenance, HammerResolvedMediaSource } from "./hammerMediaProvenance";

export type HammerInteractivePreviewFrameV1 = Readonly<{
  schema_version: 1;
  plan_fingerprint: string;
  at_sec: number;
  visual_layers: readonly HammerRenderOperationV1[];
  audio_layers: readonly HammerRenderOperationV1[];
  captions: readonly HammerRenderOperationV1[];
  transitions: readonly HammerRenderOperationV1[];
  audio_treatments: readonly HammerRenderOperationV1[];
  placements: readonly HammerRenderOperationV1[];
  resolved_sources: Readonly<Record<string, HammerResolvedMediaSource>>;
  semantic_fingerprint: string;
}>;

function verifyPlanFingerprint(plan: HammerRenderPlanV1): void {
  const { fingerprint, ...draft } = plan;
  if (hammerRenderPlanFingerprint(draft) !== fingerprint) throw new Error("render_plan_fingerprint_mismatch");
}

export function buildHammerInteractivePreviewFrameV1(args: {
  plan: HammerRenderPlanV1;
  expectedCompositionFingerprint: string;
  atSec: number;
  provenance: readonly HammerMediaProvenance[];
  derivedArtifacts?: readonly HammerDerivedArtifact[];
  proxyGeneratorVersion?: string;
}): HammerInteractivePreviewFrameV1 {
  verifyPlanFingerprint(args.plan);
  if (args.plan.composition_fingerprint !== args.expectedCompositionFingerprint) throw new Error("preview_plan_stale");
  for (const [mediaId, fingerprint] of Object.entries(args.plan.source_fingerprints)) {
    const source = args.provenance.find((entry) => entry.media_id === mediaId);
    if (!source || source.content_fingerprint !== fingerprint) throw new Error("preview_source_set_stale");
  }
  const active = selectHammerPreviewOperations(args.plan, args.atSec);
  const resolvedSources = Object.fromEntries(active.flatMap((operation) => {
    const source = resolveHammerPreviewSource({ operation, provenance: args.provenance, derivedArtifacts: args.derivedArtifacts ?? [], proxyGeneratorVersion: args.proxyGeneratorVersion ?? "proxy.v1" });
    return source ? [[operation.operation_id, source] as const] : [];
  }));
  const draft = {
    schema_version: 1 as const,
    plan_fingerprint: args.plan.fingerprint,
    at_sec: args.atSec,
    visual_layers: active.filter((operation) => operation.kind === "video" || operation.kind === "graphic" || operation.kind === "background_effect"),
    audio_layers: active.filter((operation) => operation.kind === "audio"),
    captions: active.filter((operation) => operation.kind === "caption"),
    transitions: active.filter((operation) => operation.kind === "transition"),
    audio_treatments: active.filter((operation) => operation.kind === "audio_treatment"),
    placements: active.filter((operation) => operation.kind === "placement"),
    resolved_sources: Object.freeze(resolvedSources),
  };
  return Object.freeze({ ...draft, semantic_fingerprint: hammerStableFingerprint(draft) });
}
