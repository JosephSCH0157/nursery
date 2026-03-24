export const HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH = "hammer/release-packet/manifest.v1.json";

export type HammerQuenchPacketReadinessStatus = "ready" | "missing" | "stale" | "failed" | "unsupported" | "requires_future_ffmpeg";

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
    ready_for_quench: boolean;
    overall_status: HammerQuenchPacketReadinessStatus;
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

export type QuenchPacketIngestState = "ready" | "attention" | "invalid";
export type QuenchPacketIssueSeverity = "error" | "warning";

export type QuenchPacketIssueCode =
  | "MANIFEST_NOT_FOUND"
  | "MANIFEST_INVALID"
  | "TRANSCRIPT_MISSING"
  | "AUDIO_REFERENCE_UNRESOLVED"
  | "CAPTIONS_MISSING"
  | "VISUALS_MISSING"
  | "VISUALS_INVALID";

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
  status_label:
    | "Ready for publish"
    | "Needs attention: packet invalid"
    | "Needs attention: audio reference unresolved"
    | "Needs attention: captions missing"
    | "Needs attention: transcript missing";
  manifest_path: string;
  manifest: HammerQuenchReleasePacketManifest | null;
  transcript_text: string | null;
  captions: {
    srt: string | null;
    vtt: string | null;
  };
  visuals: HammerQuenchVisualPlacement[] | null;
  audio: QuenchPacketAudioResolution;
  issues: QuenchPacketIssue[];
}
