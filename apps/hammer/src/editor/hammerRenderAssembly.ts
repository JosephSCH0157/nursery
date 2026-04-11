import type {
  HammerEditInstruction,
  HammerLookPreset,
} from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type {
  HammerBackgroundEffectKind,
  HammerBackgroundEffectSettingsV1,
} from "../../../../packages/contracts/hammer/visual-effects-export.contract";
import type { HammerEditPlan } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type {
  HammerEditorialAuthorityGraph,
  HammerEditorialAuthorityOperation,
  HammerEditorialCapability,
  HammerEditorialDegradationReasonCode,
  HammerEditorialPreviewTruthPosture,
} from "../../../../packages/contracts/hammer/editorial-authority.contract";
import { remapPlacementForRippleDelete } from "./hammerWorkspaceTimeline";
import { resolveSegmentationProviderDescriptor } from "../features/visual-effects/providers/segmentationProviderRegistry";

export type HammerRenderAssemblyTruthPosture = HammerEditorialPreviewTruthPosture;
export type HammerRenderAssemblyPlanTarget = "preview" | "export" | "handoff";

export interface HammerRenderRuntimeCapabilities {
  preview_supported_operation_types: HammerEditInstruction["type"][];
  export_supported_operation_types: HammerEditInstruction["type"][];
  handoff_supported_operation_types: HammerEditInstruction["type"][];
  podcast_master?: {
    available: boolean;
    preview_supported: boolean;
    stages: {
      normalize: boolean;
      compress: boolean;
      limit: boolean;
      noise_cleanup_light: boolean;
    };
  };
}

export interface HammerRenderAssemblyOperationResolution {
  operation_id: string;
  instruction_id: string;
  type: HammerEditInstruction["type"];
  lifecycle: HammerEditorialAuthorityOperation["lifecycle"];
  preview_posture: HammerRenderAssemblyTruthPosture;
  export_posture: HammerRenderAssemblyTruthPosture;
  handoff_posture: HammerRenderAssemblyTruthPosture;
  capability: HammerEditorialCapability;
  reason_codes: HammerEditorialDegradationReasonCode[];
}

export interface HammerRenderAssemblyPlan {
  target: HammerRenderAssemblyPlanTarget;
  posture: HammerRenderAssemblyTruthPosture;
  operation_ids: string[];
  degraded_operation_ids: string[];
  unavailable_operation_ids: string[];
}

export interface HammerRenderAssemblyResult {
  schema_version: 1;
  graph_id: string;
  graph_version: number;
  operations: HammerRenderAssemblyOperationResolution[];
  preview: HammerRenderAssemblyPlan;
  export: HammerRenderAssemblyPlan;
  handoff: HammerRenderAssemblyPlan;
  export_timeline: HammerExportTimelineAssembly;
}

export interface HammerRenderAssemblyTranscriptSegmentInput {
  segment_id: string;
  start_sec: number;
  end_sec: number;
}

export interface HammerRenderAssemblyCaptionChunkInput {
  chunk_id: string;
  start_sec: number;
  end_sec: number;
  segment_ids: string[];
}

export interface HammerExportTimelineAudioLayer {
  kind: "primary_dialogue" | "duck_region" | "fade_audio" | "podcast_master_pass";
  operation_id: string | null;
  start_sec: number;
  end_sec: number;
  posture: HammerRenderAssemblyTruthPosture;
  capability: HammerEditorialCapability;
  reason_codes: HammerEditorialDegradationReasonCode[];
  meta?: {
    duck_gain_db?: number;
    linked_broll_operation_id?: string | null;
    fade_curve?: "linear" | "log";
    preset?: "podcast_master_v1";
    noise_cleanup?: "off" | "light";
    normalization_lufs?: number;
    compression_amount?: "light" | "medium";
    limiter_ceiling_dbtp?: number;
    applied_stages?: Array<"normalize" | "compress" | "limit" | "noise_cleanup_light">;
    skipped_stages?: Array<"normalize" | "compress" | "limit" | "noise_cleanup_light">;
    stage_posture?: HammerRenderAssemblyTruthPosture;
    preview_mode?: "previewable" | "export_only";
  };
}

export interface HammerExportTimelineVisualLayer {
  kind: "primary_video" | "broll" | "dip_to_black" | "look_treatment" | "exposure_adjustment" | "background_effect";
  operation_id: string | null;
  start_sec: number;
  end_sec: number;
  posture: HammerRenderAssemblyTruthPosture;
  capability: HammerEditorialCapability;
  reason_codes: HammerEditorialDegradationReasonCode[];
  meta?: {
    asset_ref?: string;
    intent_ref?: string | null;
    intent_description?: string | null;
    preset?: HammerLookPreset;
    exposure?: number;
    effect_kind?: HammerBackgroundEffectKind;
    provider_id?: string;
    settings_v1?: HammerBackgroundEffectSettingsV1;
    export_policy_ref?: string;
    preview_mode?: "previewable" | "export_only";
  };
}

export interface HammerExportTimelineTransitionLayer {
  kind: "hard_cut" | "crossfade" | "dip_to_black" | "fade_audio";
  operation_id: string;
  start_sec: number;
  end_sec: number;
  posture: HammerRenderAssemblyTruthPosture;
  capability: HammerEditorialCapability;
  reason_codes: HammerEditorialDegradationReasonCode[];
}

export interface HammerExportTimelineCaptionMapEntry {
  chunk_id: string;
  start_sec: number;
  end_sec: number;
  segment_ids: string[];
  posture: HammerRenderAssemblyTruthPosture;
}

export interface HammerExportTimelineUnsupportedOperation {
  operation_id: string;
  type: HammerEditInstruction["type"];
  posture: HammerRenderAssemblyTruthPosture;
  capability: HammerEditorialCapability;
  reason_codes: HammerEditorialDegradationReasonCode[];
}

export interface HammerExportTimelineAssembly {
  final_duration_sec: number;
  final_duration_ms: number;
  export_posture: HammerRenderAssemblyTruthPosture;
  audio_layers: HammerExportTimelineAudioLayer[];
  visual_layers: HammerExportTimelineVisualLayer[];
  transition_layers: HammerExportTimelineTransitionLayer[];
  caption_timing_map: HammerExportTimelineCaptionMapEntry[];
  attention_reasons: string[];
  unsupported_or_degraded_ops: HammerExportTimelineUnsupportedOperation[];
}

function postureFromSupport(isSupported: boolean): HammerRenderAssemblyTruthPosture {
  return isSupported ? "authoritative" : "degraded";
}

function aggregatePosture(values: HammerRenderAssemblyTruthPosture[]): HammerRenderAssemblyTruthPosture {
  if (values.includes("unavailable")) return "unavailable";
  if (values.includes("degraded")) return "degraded";
  return "authoritative";
}

function mapLegacyInstructionCapability(
  instruction: HammerEditInstruction,
): HammerEditorialCapability {
  return instruction.execution?.capability ?? "executable";
}

function mapLegacyInstructionReasons(
  instruction: HammerEditInstruction,
): HammerEditorialDegradationReasonCode[] {
  const reasons = instruction.execution?.degradation_reasons ?? [];
  return reasons
    .map((reason) => {
      switch (reason) {
        case "runtime_missing_capability":
        case "runtime_partial_capability":
        case "preview_not_supported":
        case "export_not_supported":
        case "handoff_deferred":
        case "operation_not_implemented":
        case "operation_input_invalid":
        case "operation_conflict":
          return reason;
        default:
          return "operation_not_implemented";
      }
    });
}

function baseOperationPosture(args: {
  instruction: HammerEditInstruction;
  capabilities: HammerRenderRuntimeCapabilities;
}): Pick<HammerRenderAssemblyOperationResolution, "preview_posture" | "export_posture" | "handoff_posture"> {
  const previewSupported = args.capabilities.preview_supported_operation_types.includes(args.instruction.type);
  const exportSupported = args.capabilities.export_supported_operation_types.includes(args.instruction.type);
  const handoffSupported = args.capabilities.handoff_supported_operation_types.includes(args.instruction.type);
  return {
    preview_posture: postureFromSupport(previewSupported),
    export_posture: postureFromSupport(exportSupported),
    handoff_posture: postureFromSupport(handoffSupported),
  };
}

type PodcastMasterStage = "normalize" | "compress" | "limit" | "noise_cleanup_light";
type PodcastMasterSupportResult = {
  preview_posture: HammerRenderAssemblyTruthPosture;
  export_posture: HammerRenderAssemblyTruthPosture;
  handoff_posture: HammerRenderAssemblyTruthPosture;
  capability: HammerEditorialCapability;
  reason_codes: HammerEditorialDegradationReasonCode[];
  applied_stages: PodcastMasterStage[];
  skipped_stages: PodcastMasterStage[];
  preview_mode: "previewable" | "export_only";
};

function resolvePodcastMasterSupport(args: {
  instruction: Extract<HammerEditInstruction, { type: "podcast_master_pass" }>;
  capabilities: HammerRenderRuntimeCapabilities;
}): PodcastMasterSupportResult {
  const profile = args.capabilities.podcast_master;
  const allStages: PodcastMasterStage[] = ["normalize", "compress", "limit", "noise_cleanup_light"];
  if (!profile?.available) {
    return {
      preview_posture: "unavailable",
      export_posture: "unavailable",
      handoff_posture: "degraded",
      capability: "unavailable",
      reason_codes: ["runtime_missing_capability", "handoff_deferred"],
      applied_stages: [],
      skipped_stages: allStages,
      preview_mode: "export_only",
    };
  }
  const applied_stages: PodcastMasterStage[] = [];
  const skipped_stages: PodcastMasterStage[] = [];
  if (profile.stages.normalize) applied_stages.push("normalize"); else skipped_stages.push("normalize");
  if (profile.stages.compress) applied_stages.push("compress"); else skipped_stages.push("compress");
  if (profile.stages.limit) applied_stages.push("limit"); else skipped_stages.push("limit");
  if (args.instruction.noise_cleanup === "light") {
    if (profile.stages.noise_cleanup_light) applied_stages.push("noise_cleanup_light");
    else skipped_stages.push("noise_cleanup_light");
  }
  const hasCoreStages = profile.stages.normalize || profile.stages.compress || profile.stages.limit;
  const allCoreStages = profile.stages.normalize && profile.stages.compress && profile.stages.limit;
  const reasons: HammerEditorialDegradationReasonCode[] = [];
  let export_posture: HammerRenderAssemblyTruthPosture = "authoritative";
  let capability: HammerEditorialCapability = "executable";
  if (!hasCoreStages) {
    export_posture = "unavailable";
    capability = "unavailable";
    reasons.push("runtime_missing_capability");
  } else if (!allCoreStages || (args.instruction.noise_cleanup === "light" && !profile.stages.noise_cleanup_light)) {
    export_posture = "degraded";
    capability = "degraded";
    reasons.push("runtime_partial_capability");
  }
  const preview_supported = profile.preview_supported && args.capabilities.preview_supported_operation_types.includes("podcast_master_pass");
  const preview_posture = preview_supported ? export_posture : export_posture === "unavailable" ? "unavailable" : "degraded";
  if (!preview_supported) reasons.push("preview_not_supported");
  const handoff_posture = export_posture === "unavailable"
    ? "degraded"
    : args.capabilities.handoff_supported_operation_types.includes("podcast_master_pass")
    ? export_posture
    : "degraded";
  if (handoff_posture !== export_posture) reasons.push("handoff_deferred");
  return {
    preview_posture,
    export_posture,
    handoff_posture,
    capability,
    reason_codes: Array.from(new Set(reasons)),
    applied_stages,
    skipped_stages,
    preview_mode: preview_supported ? "previewable" : "export_only",
  };
}

export function projectEditorialAuthorityGraphFromEditPlan(args: {
  editPlan: HammerEditPlan;
  workspaceId?: string | null;
  workpieceId?: string | null;
  sessionId?: string | null;
  nowIso?: string;
}): HammerEditorialAuthorityGraph {
  const nowIso = args.nowIso
    ?? args.editPlan.updated_at
    ?? args.editPlan.created_at
    ?? new Date().toISOString();
  const operations: HammerEditorialAuthorityOperation[] = args.editPlan.instructions.map((instruction, index) => {
    const operationId = `op:${instruction.instruction_id}`;
    const baseCapability = mapLegacyInstructionCapability(instruction);
    const baseReasons = mapLegacyInstructionReasons(instruction);

    let capability_state: HammerEditorialCapability = baseCapability;
    let capability_state_reasons: HammerEditorialDegradationReasonCode[] = [...baseReasons];

    let preview_posture: HammerEditorialPreviewTruthPosture = "authoritative";
    let preview_capability: HammerEditorialCapability = baseCapability;
    let preview_reasons: HammerEditorialDegradationReasonCode[] = [...baseReasons];

    let export_posture: HammerEditorialPreviewTruthPosture = "authoritative";
    let export_capability: HammerEditorialCapability = baseCapability;
    let export_reasons: HammerEditorialDegradationReasonCode[] = [...baseReasons];

    let handoff_posture: HammerEditorialPreviewTruthPosture = "authoritative";
    let handoff_capability: HammerEditorialCapability = baseCapability;
    let handoff_reasons: HammerEditorialDegradationReasonCode[] = [...baseReasons];

    if (instruction.type === "apply_background_effect") {
      const descriptor = resolveSegmentationProviderDescriptor(instruction.provider_id);
      if (!descriptor) {
        capability_state = "degraded";
        capability_state_reasons = Array.from(new Set([...capability_state_reasons, "operation_input_invalid"]));
        preview_posture = "degraded";
        export_posture = "degraded";
        handoff_posture = "degraded";
        preview_capability = "degraded";
        export_capability = "degraded";
        handoff_capability = "degraded";
        preview_reasons = Array.from(new Set([...preview_reasons, "operation_input_invalid"]));
        export_reasons = Array.from(new Set([...export_reasons, "operation_input_invalid"]));
        handoff_reasons = Array.from(new Set([...handoff_reasons, "operation_input_invalid"]));
      } else if (!descriptor.capabilities.export_safe) {
        capability_state = "degraded";
        capability_state_reasons = Array.from(new Set([...capability_state_reasons, "export_not_supported", "handoff_deferred"]));
        export_posture = "degraded";
        export_capability = "degraded";
        export_reasons = Array.from(new Set([...export_reasons, "export_not_supported"]));
        handoff_posture = "degraded";
        handoff_capability = "degraded";
        handoff_reasons = Array.from(new Set([...handoff_reasons, "handoff_deferred"]));
        // Preview remains authoritative in browser for Phase 1.
        preview_posture = "authoritative";
        preview_capability = baseCapability;
        preview_reasons = [...baseReasons];
      }
    }
    return {
      operation_id: operationId,
      sequence: index,
      lifecycle: "active",
      instruction: { ...instruction },
      capability_state: {
        capability: capability_state,
        reason_codes: capability_state_reasons,
      },
      truth_posture: {
        preview: {
          target: "preview",
          posture: preview_posture,
          capability: preview_capability,
          reason_codes: preview_reasons,
        },
        export: {
          target: "export",
          posture: export_posture,
          capability: export_capability,
          reason_codes: export_reasons,
        },
        handoff: {
          target: "handoff",
          posture: handoff_posture,
          capability: handoff_capability,
          reason_codes: handoff_reasons,
        },
      },
      provenance: {
        source: "projection",
        source_ref: args.editPlan.edit_plan_id,
        authored_at: instruction.created_at,
      },
      created_at: instruction.created_at,
      updated_at: nowIso,
    };
  });

  return {
    schema_version: 1,
    graph_id: `${args.editPlan.edit_plan_id}:authority`,
    graph_version: 1,
    workspace_id: args.workspaceId ?? args.editPlan.workspace_id ?? null,
    workpiece_id: args.workpieceId ?? args.editPlan.workpiece_id ?? null,
    session_id: args.sessionId ?? args.editPlan.session_id ?? null,
    source_transcript_id: args.editPlan.source_transcript_id,
    operation_order: operations.map((operation) => operation.operation_id),
    operations,
    created_at: args.editPlan.created_at,
    updated_at: nowIso,
  };
}

export function projectEditPlanFromEditorialAuthorityGraph(args: {
  graph: HammerEditorialAuthorityGraph;
  fallback: HammerEditPlan;
  nowIso?: string;
}): HammerEditPlan {
  const nowIso = args.nowIso
    ?? args.fallback.updated_at
    ?? args.fallback.created_at
    ?? new Date().toISOString();
  const activeOperations = args.graph.operations
    .filter((operation) => operation.lifecycle === "active")
    .sort((left, right) => left.sequence - right.sequence);
  return {
    ...args.fallback,
    updated_at: nowIso,
    source_transcript_id: args.graph.source_transcript_id ?? args.fallback.source_transcript_id,
    workspace_id: args.graph.workspace_id ?? args.fallback.workspace_id,
    workpiece_id: args.graph.workpiece_id ?? args.fallback.workpiece_id,
    session_id: args.graph.session_id ?? args.fallback.session_id,
    instructions: activeOperations.map((operation) => ({ ...operation.instruction })),
  };
}

export function buildHammerRenderAssembly(args: {
  canonicalGraph: HammerEditorialAuthorityGraph;
  runtimeCapabilities: HammerRenderRuntimeCapabilities;
  transcriptSegments?: HammerRenderAssemblyTranscriptSegmentInput[] | null;
  captionChunks?: HammerRenderAssemblyCaptionChunkInput[] | null;
}): HammerRenderAssemblyResult {
  const activeOperationIds = new Set(
    args.canonicalGraph.operations
      .filter((operation) => operation.lifecycle === "active")
      .map((operation) => operation.operation_id),
  );
  const operations = args.canonicalGraph.operations
    .filter((operation) => operation.lifecycle === "active")
    .sort((left, right) => left.sequence - right.sequence)
    .map((operation) => {
      const baseline = baseOperationPosture({
        instruction: operation.instruction,
        capabilities: args.runtimeCapabilities,
      });
      const explicitPreview = operation.truth_posture.preview.posture;
      const explicitExport = operation.truth_posture.export.posture;
      const explicitHandoff = operation.truth_posture.handoff.posture;
      const previewPosture = aggregatePosture([baseline.preview_posture, explicitPreview]);
      const exportPosture = aggregatePosture([baseline.export_posture, explicitExport]);
      const handoffPosture = aggregatePosture([baseline.handoff_posture, explicitHandoff]);
      const podcastMasterSupport = operation.instruction.type === "podcast_master_pass"
        ? resolvePodcastMasterSupport({
          instruction: operation.instruction,
          capabilities: args.runtimeCapabilities,
        })
        : null;
      const unresolvedBroll = operation.instruction.type === "insert_broll"
        && operation.instruction.asset_binding_state === "unresolved";
      const orphanedLinkedDuck = operation.instruction.type === "audio_duck"
        && Boolean(operation.instruction.linked_broll_operation_id)
        && !activeOperationIds.has(operation.instruction.linked_broll_operation_id ?? "");
      const unresolvedReasonCodes: HammerEditorialDegradationReasonCode[] = unresolvedBroll
        ? ["preview_not_supported", "handoff_deferred"]
        : [];
      const orphanedDuckReasonCodes: HammerEditorialDegradationReasonCode[] = orphanedLinkedDuck
        ? ["operation_conflict"]
        : [];
      const reasonCodes = [
        ...operation.capability_state.reason_codes,
        ...operation.truth_posture.preview.reason_codes,
        ...operation.truth_posture.export.reason_codes,
        ...operation.truth_posture.handoff.reason_codes,
        ...unresolvedReasonCodes,
        ...orphanedDuckReasonCodes,
        ...(podcastMasterSupport?.reason_codes ?? []),
      ];
      return {
        operation_id: operation.operation_id,
        instruction_id: operation.instruction.instruction_id,
        type: operation.instruction.type,
        lifecycle: operation.lifecycle,
        preview_posture: unresolvedBroll
          ? "unavailable"
          : orphanedLinkedDuck
          ? "degraded"
          : podcastMasterSupport
          ? aggregatePosture([podcastMasterSupport.preview_posture, explicitPreview])
          : previewPosture,
        export_posture: unresolvedBroll
          ? "degraded"
          : orphanedLinkedDuck
          ? "degraded"
          : podcastMasterSupport
          ? aggregatePosture([podcastMasterSupport.export_posture, explicitExport])
          : exportPosture,
        handoff_posture: unresolvedBroll
          ? "degraded"
          : orphanedLinkedDuck
          ? "degraded"
          : podcastMasterSupport
          ? aggregatePosture([podcastMasterSupport.handoff_posture, explicitHandoff])
          : handoffPosture,
        capability: unresolvedBroll || orphanedLinkedDuck
          ? "degraded"
          : podcastMasterSupport
          ? podcastMasterSupport.capability
          : operation.capability_state.capability,
        reason_codes: Array.from(new Set(reasonCodes)),
      } satisfies HammerRenderAssemblyOperationResolution;
    });

  const buildPlan = (target: HammerRenderAssemblyPlanTarget): HammerRenderAssemblyPlan => {
    const operationIds = operations.map((operation) => operation.operation_id);
    const postureValues = operations.map((operation) => {
      if (target === "preview") return operation.preview_posture;
      if (target === "export") return operation.export_posture;
      return operation.handoff_posture;
    });
    const degradedOperationIds = operations
      .filter((operation) => (
        (target === "preview" && operation.preview_posture === "degraded")
        || (target === "export" && operation.export_posture === "degraded")
        || (target === "handoff" && operation.handoff_posture === "degraded")
      ))
      .map((operation) => operation.operation_id);
    const unavailableOperationIds = operations
      .filter((operation) => (
        (target === "preview" && operation.preview_posture === "unavailable")
        || (target === "export" && operation.export_posture === "unavailable")
        || (target === "handoff" && operation.handoff_posture === "unavailable")
      ))
      .map((operation) => operation.operation_id);
    return {
      target,
      posture: aggregatePosture(postureValues),
      operation_ids: operationIds,
      degraded_operation_ids: degradedOperationIds,
      unavailable_operation_ids: unavailableOperationIds,
    };
  };

  const previewPlan = buildPlan("preview");
  const exportPlan = buildPlan("export");
  const handoffPlan = buildPlan("handoff");

  return {
    schema_version: 1,
    graph_id: args.canonicalGraph.graph_id,
    graph_version: args.canonicalGraph.graph_version,
    operations,
    preview: previewPlan,
    export: exportPlan,
    handoff: handoffPlan,
    export_timeline: buildHammerExportTimelineAssembly({
      graph: args.canonicalGraph,
      operations,
      transcriptSegments: args.transcriptSegments ?? null,
      captionChunks: args.captionChunks ?? null,
      exportPosture: exportPlan.posture,
      runtimeCapabilities: args.runtimeCapabilities,
    }),
  };
}

function roundToMillisecondSec(value: number): number {
  return Number(Math.max(0, value).toFixed(3));
}

function resolveInstructionWindow(instruction: HammerEditInstruction): { start_sec: number; end_sec: number } | null {
  switch (instruction.type) {
    case "insert_broll":
    case "audio_duck":
    case "dip_to_black":
    case "fade_audio":
    case "hard_cut":
      return {
        start_sec: instruction.start_sec,
        end_sec: instruction.end_sec,
      };
    case "crossfade":
      if (typeof instruction.start_sec === "number" && typeof instruction.end_sec === "number") {
        return {
          start_sec: instruction.start_sec,
          end_sec: instruction.end_sec,
        };
      }
      return null;
    default:
      return null;
  }
}

function applyRippleDeletesToWindow(args: {
  start_sec: number;
  end_sec: number;
  rippleDeletes: Array<{ start_sec: number; end_sec: number }>;
}): { start_sec: number; end_sec: number; removed: boolean; degraded: boolean } {
  let start_sec = args.start_sec;
  let end_sec = args.end_sec;
  let degraded = false;
  for (const rippleDelete of args.rippleDeletes) {
    const remap = remapPlacementForRippleDelete({
      startSec: start_sec,
      endSec: end_sec,
      removedStartSec: rippleDelete.start_sec,
      removedEndSec: rippleDelete.end_sec,
    });
    if (remap.kind === "removed") {
      return { start_sec, end_sec, removed: true, degraded };
    }
    start_sec = remap.startSec;
    end_sec = remap.endSec;
    if (remap.needsAttention) degraded = true;
  }
  return { start_sec, end_sec, removed: false, degraded };
}

function computeFinalDurationFromStructuralDeletes(args: {
  base_duration_sec: number;
  rippleDeletes: Array<{ start_sec: number; end_sec: number }>;
}): number {
  let duration = args.base_duration_sec;
  for (const rippleDelete of args.rippleDeletes) {
    const start_sec = Math.max(0, Math.min(duration, rippleDelete.start_sec));
    const end_sec = Math.max(start_sec, Math.min(duration, rippleDelete.end_sec));
    duration = Math.max(0, duration - Math.max(0, end_sec - start_sec));
  }
  return roundToMillisecondSec(duration);
}

function buildHammerExportTimelineAssembly(args: {
  graph: HammerEditorialAuthorityGraph;
  operations: HammerRenderAssemblyOperationResolution[];
  transcriptSegments: HammerRenderAssemblyTranscriptSegmentInput[] | null;
  captionChunks: HammerRenderAssemblyCaptionChunkInput[] | null;
  exportPosture: HammerRenderAssemblyTruthPosture;
  runtimeCapabilities: HammerRenderRuntimeCapabilities;
}): HammerExportTimelineAssembly {
  const operationResolutionById = new Map(args.operations.map((operation) => [operation.operation_id, operation] as const));
  const activeOperations = args.graph.operations
    .filter((operation) => operation.lifecycle === "active")
    .sort((left, right) => left.sequence - right.sequence);
  const rippleDeletes = activeOperations
    .flatMap((operation) => (
      operation.instruction.type === "ripple_delete"
        ? [{ start_sec: operation.instruction.start_sec, end_sec: operation.instruction.end_sec }]
        : []
    ));
  const transcriptDurationSec = Math.max(
    0,
    ...(args.transcriptSegments ?? []).map((segment) => segment.end_sec),
  );
  const structuralDurationSec = computeFinalDurationFromStructuralDeletes({
    base_duration_sec: transcriptDurationSec,
    rippleDeletes,
  });

  const unsupportedOrDegradedOps = args.operations
    .flatMap((operation) => (
      operation.export_posture === "authoritative"
        ? []
        : [{
          operation_id: operation.operation_id,
          type: operation.type,
          posture: operation.export_posture,
          capability: operation.capability,
          reason_codes: operation.reason_codes,
        }]
    ));

  const audioLayers: HammerExportTimelineAudioLayer[] = [{
    kind: "primary_dialogue",
    operation_id: null,
    start_sec: 0,
    end_sec: structuralDurationSec,
    posture: "authoritative",
    capability: "executable",
    reason_codes: [],
  }];
  const visualLayers: HammerExportTimelineVisualLayer[] = [{
    kind: "primary_video",
    operation_id: null,
    start_sec: 0,
    end_sec: structuralDurationSec,
    posture: "authoritative",
    capability: "executable",
    reason_codes: [],
  }];
  const transitionLayers: HammerExportTimelineTransitionLayer[] = [];

  for (const operation of activeOperations) {
    const resolution = operationResolutionById.get(operation.operation_id);
    if (!resolution) continue;
    switch (operation.instruction.type) {
      case "insert_broll": {
        if (operation.instruction.asset_binding_state === "unresolved") break;
        visualLayers.push({
          kind: "broll",
          operation_id: operation.operation_id,
          start_sec: roundToMillisecondSec(operation.instruction.start_sec),
          end_sec: roundToMillisecondSec(operation.instruction.end_sec),
          posture: resolution.export_posture,
          capability: resolution.capability,
          reason_codes: resolution.reason_codes,
          meta: {
            asset_ref: operation.instruction.asset_ref,
            intent_ref: operation.instruction.intent_ref ?? null,
            intent_description: operation.instruction.intent_description ?? null,
          },
        });
        break;
      }
      case "audio_duck": {
        audioLayers.push({
          kind: "duck_region",
          operation_id: operation.operation_id,
          start_sec: roundToMillisecondSec(operation.instruction.start_sec),
          end_sec: roundToMillisecondSec(operation.instruction.end_sec),
          posture: resolution.export_posture,
          capability: resolution.capability,
          reason_codes: resolution.reason_codes,
          meta: {
            duck_gain_db: operation.instruction.duck_gain_db,
            linked_broll_operation_id: operation.instruction.linked_broll_operation_id ?? null,
          },
        });
        break;
      }
      case "fade_audio": {
        const window = resolveInstructionWindow(operation.instruction);
        audioLayers.push({
          kind: "fade_audio",
          operation_id: operation.operation_id,
          start_sec: roundToMillisecondSec(operation.instruction.start_sec),
          end_sec: roundToMillisecondSec(operation.instruction.end_sec),
          posture: resolution.export_posture,
          capability: resolution.capability,
          reason_codes: resolution.reason_codes,
          meta: {
            fade_curve: operation.instruction.fade_curve ?? "linear",
          },
        });
        if (window) {
          transitionLayers.push({
            kind: "fade_audio",
            operation_id: operation.operation_id,
            start_sec: roundToMillisecondSec(window.start_sec),
            end_sec: roundToMillisecondSec(window.end_sec),
            posture: resolution.export_posture,
            capability: resolution.capability,
            reason_codes: resolution.reason_codes,
          });
        }
        break;
      }
      case "podcast_master_pass": {
        const support = resolvePodcastMasterSupport({
          instruction: operation.instruction,
          capabilities: args.runtimeCapabilities,
        });
        audioLayers.push({
          kind: "podcast_master_pass",
          operation_id: operation.operation_id,
          start_sec: 0,
          end_sec: structuralDurationSec,
          posture: resolution.export_posture,
          capability: resolution.capability,
          reason_codes: resolution.reason_codes,
          meta: {
            preset: operation.instruction.preset,
            noise_cleanup: operation.instruction.noise_cleanup,
            normalization_lufs: operation.instruction.normalization_lufs,
            compression_amount: operation.instruction.compression_amount,
            limiter_ceiling_dbtp: operation.instruction.limiter_ceiling_dbtp,
            applied_stages: support.applied_stages,
            skipped_stages: support.skipped_stages,
            stage_posture: support.export_posture,
            preview_mode: support.preview_mode,
          },
        });
        break;
      }
      case "apply_look": {
        visualLayers.push({
          kind: "look_treatment",
          operation_id: operation.operation_id,
          start_sec: 0,
          end_sec: structuralDurationSec,
          posture: resolution.export_posture,
          capability: resolution.capability,
          reason_codes: resolution.reason_codes,
          meta: {
            preset: operation.instruction.preset,
            preview_mode: resolution.preview_posture === "authoritative" ? "previewable" : "export_only",
          },
        });
        break;
      }
      case "apply_exposure": {
        visualLayers.push({
          kind: "exposure_adjustment",
          operation_id: operation.operation_id,
          start_sec: 0,
          end_sec: structuralDurationSec,
          posture: resolution.export_posture,
          capability: resolution.capability,
          reason_codes: resolution.reason_codes,
          meta: {
            exposure: operation.instruction.exposure,
            preview_mode: resolution.preview_posture === "authoritative" ? "previewable" : "export_only",
          },
        });
        break;
      }
      case "apply_background_effect": {
        visualLayers.push({
          kind: "background_effect",
          operation_id: operation.operation_id,
          start_sec: 0,
          end_sec: structuralDurationSec,
          posture: resolution.export_posture,
          capability: resolution.capability,
          reason_codes: resolution.reason_codes,
          meta: {
            effect_kind: operation.instruction.effect_kind,
            provider_id: operation.instruction.provider_id,
            settings_v1: operation.instruction.settings_v1,
            preview_mode: resolution.preview_posture === "authoritative" ? "previewable" : "export_only",
          },
        });
        break;
      }
      case "dip_to_black": {
        const window = resolveInstructionWindow(operation.instruction);
        visualLayers.push({
          kind: "dip_to_black",
          operation_id: operation.operation_id,
          start_sec: roundToMillisecondSec(operation.instruction.start_sec),
          end_sec: roundToMillisecondSec(operation.instruction.end_sec),
          posture: resolution.export_posture,
          capability: resolution.capability,
          reason_codes: resolution.reason_codes,
        });
        if (window) {
          transitionLayers.push({
            kind: "dip_to_black",
            operation_id: operation.operation_id,
            start_sec: roundToMillisecondSec(window.start_sec),
            end_sec: roundToMillisecondSec(window.end_sec),
            posture: resolution.export_posture,
            capability: resolution.capability,
            reason_codes: resolution.reason_codes,
          });
        }
        break;
      }
      case "hard_cut":
      case "crossfade": {
        const window = resolveInstructionWindow(operation.instruction);
        if (!window) break;
        transitionLayers.push({
          kind: operation.instruction.type,
          operation_id: operation.operation_id,
          start_sec: roundToMillisecondSec(window.start_sec),
          end_sec: roundToMillisecondSec(window.end_sec),
          posture: resolution.export_posture,
          capability: resolution.capability,
          reason_codes: resolution.reason_codes,
        });
        break;
      }
      default:
        break;
    }
  }

  const attentionReasons = new Set<string>();
  for (const operation of unsupportedOrDegradedOps) {
    for (const reasonCode of operation.reason_codes) {
      attentionReasons.add(`${operation.operation_id}:${reasonCode}`);
    }
  }

  const captionTimingMap: HammerExportTimelineCaptionMapEntry[] = [];
  let captionPosture: HammerRenderAssemblyTruthPosture = "authoritative";
  if ((args.captionChunks?.length ?? 0) === 0 && (args.transcriptSegments?.length ?? 0) > 0) {
    captionPosture = "degraded";
    attentionReasons.add("captions:missing_timing_input");
  } else {
    for (const chunk of args.captionChunks ?? []) {
      const remapped = applyRippleDeletesToWindow({
        start_sec: chunk.start_sec,
        end_sec: chunk.end_sec,
        rippleDeletes,
      });
      if (remapped.removed) continue;
      if (remapped.degraded) {
        captionPosture = captionPosture === "unavailable" ? "unavailable" : "degraded";
        attentionReasons.add(`captions:remap_attention:${chunk.chunk_id}`);
      }
      captionTimingMap.push({
        chunk_id: chunk.chunk_id,
        start_sec: roundToMillisecondSec(remapped.start_sec),
        end_sec: roundToMillisecondSec(remapped.end_sec),
        segment_ids: [...chunk.segment_ids],
        posture: remapped.degraded ? "degraded" : "authoritative",
      });
    }
  }

  const maxLayerEndSec = Math.max(
    structuralDurationSec,
    ...audioLayers.map((layer) => layer.end_sec),
    ...visualLayers.map((layer) => layer.end_sec),
    ...transitionLayers.map((layer) => layer.end_sec),
    ...captionTimingMap.map((entry) => entry.end_sec),
  );
  const finalDurationSec = roundToMillisecondSec(maxLayerEndSec);
  const finalDurationMs = Math.round(finalDurationSec * 1000);
  const exportPosture = aggregatePosture([args.exportPosture, captionPosture]);
  if (exportPosture !== "authoritative") {
    attentionReasons.add(`export_posture:${exportPosture}`);
  }

  return {
    final_duration_sec: finalDurationSec,
    final_duration_ms: finalDurationMs,
    export_posture: exportPosture,
    audio_layers: audioLayers,
    visual_layers: visualLayers,
    transition_layers: transitionLayers,
    caption_timing_map: captionTimingMap,
    attention_reasons: Array.from(attentionReasons).sort(),
    unsupported_or_degraded_ops: unsupportedOrDegradedOps,
  };
}
