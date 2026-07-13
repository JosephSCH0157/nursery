import type {
  HammerQuenchCanonicalReadinessReasonCode as HammerQuenchCanonicalReadinessReasonCodeBase,
  HammerQuenchCanonicalReadinessReasonSeverity as HammerQuenchCanonicalReadinessReasonSeverityBase,
  HammerQuenchCanonicalReadinessReasonSource as HammerQuenchCanonicalReadinessReasonSourceBase,
  HammerQuenchCanonicalReadinessStatus as HammerQuenchCanonicalReadinessStatusBase,
} from "@forge/contracts/hammer/quench-readiness-taxonomy.contract";

export const HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH = "hammer/release-packet/manifest.v1.json";

export type HammerQuenchPacketReadinessStatus = "ready" | "missing" | "stale" | "failed" | "unsupported" | "requires_future_ffmpeg";
export type HammerQuenchCanonicalReadinessStatus = HammerQuenchCanonicalReadinessStatusBase;
export type HammerQuenchCanonicalReadinessReasonSeverity = HammerQuenchCanonicalReadinessReasonSeverityBase;
export type HammerQuenchCanonicalReadinessReasonSource = HammerQuenchCanonicalReadinessReasonSourceBase;
export type QuenchSupplementalReadinessReasonCode = Extract<
  HammerQuenchCanonicalReadinessReasonCodeBase,
  | "quench_audio_reference_unresolved"
  | "quench_transcript_missing"
  | "quench_captions_missing"
  | "quench_visuals_missing"
  | "quench_visuals_invalid"
>;
export type HammerQuenchCanonicalReadinessReasonCode = HammerQuenchCanonicalReadinessReasonCodeBase;

export interface HammerQuenchCanonicalReadinessReason {
  code: HammerQuenchCanonicalReadinessReasonCode;
  label: string;
  severity: HammerQuenchCanonicalReadinessReasonSeverity;
  source: HammerQuenchCanonicalReadinessReasonSource;
  operationId: string | null;
  operation_id?: string | null;
}

export interface HammerQuenchReleasePacketManifest {
  version: 1;
  packet_kind: "quench_release_packet";
  generated_by: "Hammer";
  generated_at: string;
  workpiece_id: string;
  workspace_id: string | null;
  episode_title: string | null;
  duration_seconds: number | null;
  audio: {
    kind: "polished" | "raw" | "none";
    media_id: string | null;
    local_relpath: string | null;
    workpiece_path: string | null;
    mime_type: string | null;
    source_label: string | null;
  };
  captions: {
    srt_path: string | null;
    vtt_path: string | null;
  };
  transcript: {
    text_path: string | null;
    source_layer_id: string | null;
    source_recipe_ref: string | null;
    source_kind: "raw" | "derived";
  };
  visuals: {
    placements_path: string;
    count: number;
  };
  readiness: {
    status: HammerQuenchCanonicalReadinessStatus;
    ready_for_quench: boolean;
    overall_status: HammerQuenchPacketReadinessStatus;
    handoff_status?: HammerQuenchCanonicalReadinessStatus;
    reason_codes?: HammerQuenchCanonicalReadinessReasonCode[];
    reasons_detail?: HammerQuenchCanonicalReadinessReason[];
    blocking_reason_codes?: HammerQuenchCanonicalReadinessReasonCode[];
    blocking_reasons_detail?: HammerQuenchCanonicalReadinessReason[];
    review_reason_codes?: HammerQuenchCanonicalReadinessReasonCode[];
    review_reasons_detail?: HammerQuenchCanonicalReadinessReason[];
    artifact_reason_codes?: HammerQuenchCanonicalReadinessReasonCode[];
    artifact_reasons_detail?: HammerQuenchCanonicalReadinessReason[];
    artifact_reasons?: string[];
    review_reasons?: string[];
    reasons: string[];
  };
  editorial_truth?: {
    schema_version: 1;
    authority_graph_id: string | null;
    authority_graph_version: number | null;
    active_operations: Array<{
      operation_id: string;
      instruction_id: string;
      type: string;
      capability: "executable" | "degraded" | "unavailable";
      preview_posture: "authoritative" | "degraded" | "unavailable";
      export_posture: "authoritative" | "degraded" | "unavailable";
      handoff_posture: "authoritative" | "degraded" | "unavailable";
      reason_codes: string[];
    }>;
    posture_summary: {
      preview: "authoritative" | "degraded" | "unavailable";
      export: "authoritative" | "degraded" | "unavailable";
      handoff: "authoritative" | "degraded" | "unavailable";
    };
    deferred_or_unsupported_operation_ids: string[];
    artifact_operation_links: {
      transcript_text_path: string | null;
      captions_srt_path: string | null;
      captions_vtt_path: string | null;
      visuals_path: string;
      operation_ids: string[];
    };
    broll_resolution_summary: {
      unresolved_intents: Array<{
        operation_id: string;
        intent_ref: string | null;
        intent_description: string | null;
      }>;
      resolved_bindings: Array<{
        operation_id: string;
        asset_ref: string;
      }>;
    };
    broll_timeline_remap_summary: {
      adjusted_bindings: Array<{
        operation_id: string;
        start_sec: number;
        end_sec: number;
      }>;
      removed_binding_operation_ids: string[];
      attention_binding_operation_ids: string[];
    };
    duck_linkage_summary: {
      linked_duck_bindings: Array<{
        operation_id: string;
        linked_broll_operation_id: string;
        start_sec: number;
        end_sec: number;
      }>;
      orphaned_duck_operation_ids: string[];
      superseded_duck_operation_ids: string[];
    };
  };
}

export interface HammerQuenchVisualPlacement {
  placement_id: string;
  anchor_segment_id: string;
  start_sec: number;
  end_sec: number;
  asset_path: string | null;
  status: string;
}

export type QuenchPacketIngestState = HammerQuenchCanonicalReadinessStatus | "invalid";
export type QuenchPacketIssueSeverity = "error" | "warning";

export type QuenchPacketIssueCode =
  | "MANIFEST_NOT_FOUND"
  | "MANIFEST_INVALID"
  | QuenchSupplementalReadinessReasonCode;

export interface QuenchPacketIssue {
  code: QuenchPacketIssueCode;
  severity: QuenchPacketIssueSeverity;
  message: string;
}

export interface QuenchPacketAudioResolution {
  resolved: boolean;
  uri: string | null;
  reason: string | null;
}

export interface QuenchPacketIngestResult {
  state: QuenchPacketIngestState;
  status_label: "Ready for publish" | "Needs review before publish" | "Blocked for publish" | "Needs attention: packet invalid";
  manifest_path: string;
  manifest: HammerQuenchReleasePacketManifest | null;
  verdict: {
    status: HammerQuenchCanonicalReadinessStatus;
    ready_for_quench: boolean;
    reason_codes: HammerQuenchCanonicalReadinessReasonCode[];
    reasons_detail: HammerQuenchCanonicalReadinessReason[];
    blocking_reason_codes: HammerQuenchCanonicalReadinessReasonCode[];
    blocking_reasons_detail: HammerQuenchCanonicalReadinessReason[];
    review_reason_codes: HammerQuenchCanonicalReadinessReasonCode[];
    review_reasons_detail: HammerQuenchCanonicalReadinessReason[];
  } | null;
  transcript_text: string | null;
  captions: {
    srt: string | null;
    vtt: string | null;
  };
  visuals: HammerQuenchVisualPlacement[] | null;
  audio: QuenchPacketAudioResolution;
  issues: QuenchPacketIssue[];
}
