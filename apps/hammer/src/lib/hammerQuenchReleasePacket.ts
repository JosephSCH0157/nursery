import type { HammerReleasePrepPackage } from "./hammerReleasePrepPackage";
import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import type { HammerRenderAssemblyResult } from "../editor/hammerRenderAssembly";

export const HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH = "hammer/release-packet/manifest.v1.json";
export const HAMMER_QUENCH_RELEASE_PACKET_TRANSCRIPT_PATH = "hammer/release-packet/transcript/transcript.txt";
export const HAMMER_QUENCH_RELEASE_PACKET_SRT_PATH = "hammer/release-packet/captions/episode.srt";
export const HAMMER_QUENCH_RELEASE_PACKET_VTT_PATH = "hammer/release-packet/captions/episode.vtt";
export const HAMMER_QUENCH_RELEASE_PACKET_VISUALS_PATH = "hammer/release-packet/visuals/placements.json";

export interface HammerQuenchReleasePacketAudioRef {
  kind: "polished" | "raw" | "none";
  media_id: string | null;
  local_relpath: string | null;
  workpiece_path: string | null;
  mime_type: string | null;
  source_label: string | null;
}

export interface HammerQuenchReleasePacketVisualPlacement {
  placement_id: string;
  anchor_segment_id: string;
  start_sec: number;
  end_sec: number;
  asset_path: string | null;
  status: string;
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
  audio: HammerQuenchReleasePacketAudioRef;
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
    overall_status: HammerReleasePrepPackage["readiness"]["blocking_statuses"][number] | "ready";
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
    export_timeline_snapshot: {
      final_duration_ms: number;
      export_posture: "authoritative" | "degraded" | "unavailable";
      audio_layers: Array<{
        kind: "primary_dialogue" | "duck_region" | "fade_audio" | "podcast_master_pass";
        operation_id: string | null;
        start_sec: number;
        end_sec: number;
        posture: "authoritative" | "degraded" | "unavailable";
        capability: "executable" | "degraded" | "unavailable";
        reason_codes: string[];
        applied_stages?: Array<"normalize" | "compress" | "limit" | "noise_cleanup_light">;
        skipped_stages?: Array<"normalize" | "compress" | "limit" | "noise_cleanup_light">;
        preview_mode?: "previewable" | "export_only";
      }>;
      visual_layers: Array<{
        kind: "primary_video" | "broll" | "dip_to_black";
        operation_id: string | null;
        start_sec: number;
        end_sec: number;
        posture: "authoritative" | "degraded" | "unavailable";
        capability: "executable" | "degraded" | "unavailable";
        reason_codes: string[];
      }>;
      transition_layers: Array<{
        kind: "hard_cut" | "crossfade" | "dip_to_black" | "fade_audio";
        operation_id: string;
        start_sec: number;
        end_sec: number;
        posture: "authoritative" | "degraded" | "unavailable";
        capability: "executable" | "degraded" | "unavailable";
        reason_codes: string[];
      }>;
      caption_timing_map: Array<{
        chunk_id: string;
        start_sec: number;
        end_sec: number;
        segment_ids: string[];
        posture: "authoritative" | "degraded" | "unavailable";
      }>;
      attention_reasons: string[];
      unsupported_or_degraded_ops: Array<{
        operation_id: string;
        type: string;
        posture: "authoritative" | "degraded" | "unavailable";
        capability: "executable" | "degraded" | "unavailable";
        reason_codes: string[];
      }>;
    };
    podcast_master_summary: {
      applied: boolean;
      operation_id: string | null;
      posture: "authoritative" | "degraded" | "unavailable";
      capability: "executable" | "degraded" | "unavailable" | null;
      preset: "podcast_master_v1" | null;
      noise_cleanup: "off" | "light" | null;
      normalization_lufs: number | null;
      compression_amount: "light" | "medium" | null;
      limiter_ceiling_dbtp: number | null;
      applied_stages: Array<"normalize" | "compress" | "limit" | "noise_cleanup_light">;
      skipped_stages: Array<"normalize" | "compress" | "limit" | "noise_cleanup_light">;
      reason_codes: string[];
      preview_mode: "previewable" | "export_only" | null;
    };
  };
}

export interface HammerQuenchReleasePacketArtifacts {
  manifest: HammerQuenchReleasePacketManifest;
  transcriptText: string | null;
  srtText: string | null;
  vttText: string | null;
  visuals: HammerQuenchReleasePacketVisualPlacement[];
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r\n/g, "\n").trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveDurationSeconds(
  pkg: HammerReleasePrepPackage,
  renderAssembly?: HammerRenderAssemblyResult | null,
): number | null {
  if (renderAssembly?.export_timeline?.final_duration_ms && renderAssembly.export_timeline.final_duration_ms > 0) {
    return Number((renderAssembly.export_timeline.final_duration_ms / 1000).toFixed(3));
  }
  const durationMs = pkg.media_prep_outputs.audio.polish.output_duration_ms
    ?? pkg.media_prep_outputs.audio.raw_source.duration_ms
    ?? null;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  return Number((durationMs / 1000).toFixed(3));
}

function resolveReadiness(pkg: HammerReleasePrepPackage): HammerQuenchReleasePacketManifest["readiness"] {
  const statuses = {
    transcript: pkg.readiness.transcript_output,
    srt: pkg.readiness.subtitles.srt,
    audio: pkg.readiness.audio_polish,
  } as const;
  const reasons: string[] = [];
  if (statuses.transcript !== "ready") {
    reasons.push(statuses.transcript === "stale"
      ? "Transcript output is stale."
      : "Transcript output is missing.");
  }
  if (statuses.srt !== "ready") {
    reasons.push(statuses.srt === "stale"
      ? "SRT captions are stale."
      : "SRT captions are missing.");
  }
  if (statuses.audio === "failed" || statuses.audio === "unsupported" || statuses.audio === "requires_future_ffmpeg") {
    reasons.push(statuses.audio === "failed"
      ? "Audio preparation failed."
      : statuses.audio === "unsupported"
      ? "Audio source is unsupported for prep."
      : "Audio preparation requires future FFmpeg-backed normalization.");
  }
  const ready = reasons.length === 0;
  return {
    ready_for_quench: ready,
    overall_status: ready ? "ready" : "missing",
    reasons,
  };
}

export function buildHammerQuenchReleasePacket(args: {
  releasePrepPackage: HammerReleasePrepPackage;
  preparedAt?: string;
  canonicalGraph?: HammerEditorialAuthorityGraph | null;
  renderAssembly?: HammerRenderAssemblyResult | null;
}): HammerQuenchReleasePacketArtifacts {
  const pkg = args.releasePrepPackage;
  const transcriptText = normalizeText(pkg.text_outputs?.resolved_output.full_text ?? null);
  const srtText = normalizeText(pkg.text_outputs?.subtitles.srt.artifact?.content ?? null);
  const vttText = normalizeText(pkg.text_outputs?.subtitles.vtt.artifact?.content ?? null);
  const visuals: HammerQuenchReleasePacketVisualPlacement[] = (pkg.media_prep_outputs.visuals.placements ?? []).map((placement) => ({
    placement_id: placement.placement_id,
    anchor_segment_id: placement.anchor_segment_id,
    start_sec: placement.start_sec,
    end_sec: placement.end_sec,
    asset_path: placement.asset_path,
    status: placement.status,
  }));
  const activeBrollOperationIds = new Set((args.canonicalGraph?.operations ?? []).flatMap((operation) => {
    if (operation.lifecycle !== "active") return [];
    if (operation.instruction.type !== "insert_broll") return [];
    if (operation.instruction.asset_binding_state === "unresolved") return [];
    return [operation.operation_id];
  }));
  const podcastMasterLayer = args.renderAssembly?.export_timeline.audio_layers.find((layer) => layer.kind === "podcast_master_pass") ?? null;

  const manifest: HammerQuenchReleasePacketManifest = {
    version: 1,
    packet_kind: "quench_release_packet",
    generated_by: "Hammer",
    generated_at: args.preparedAt ?? new Date().toISOString(),
    workpiece_id: pkg.identity.workpiece_id ?? "",
    workspace_id: pkg.identity.workspace_id ?? null,
    episode_title: null,
    duration_seconds: resolveDurationSeconds(pkg, args.renderAssembly),
    audio: {
      kind: pkg.media_prep_outputs.audio.preferred_playback.kind,
      media_id: pkg.media_prep_outputs.audio.preferred_playback.media_id,
      local_relpath: pkg.media_prep_outputs.audio.preferred_playback.local_relpath,
      workpiece_path: pkg.media_prep_outputs.audio.preferred_playback.workpiece_path,
      mime_type: pkg.media_prep_outputs.audio.preferred_playback.mime_type,
      source_label: pkg.media_prep_outputs.audio.preferred_playback.source_label,
    },
    captions: {
      srt_path: srtText ? HAMMER_QUENCH_RELEASE_PACKET_SRT_PATH : null,
      vtt_path: vttText ? HAMMER_QUENCH_RELEASE_PACKET_VTT_PATH : null,
    },
    transcript: {
      text_path: transcriptText ? HAMMER_QUENCH_RELEASE_PACKET_TRANSCRIPT_PATH : null,
      source_layer_id: pkg.text_outputs?.output_selection.layer_id ?? null,
      source_recipe_ref: pkg.text_outputs?.output_selection.recipe_ref ?? null,
      source_kind: pkg.text_outputs?.output_selection.layer_id ? "derived" : "raw",
    },
    visuals: {
      placements_path: HAMMER_QUENCH_RELEASE_PACKET_VISUALS_PATH,
      count: visuals.length,
    },
    readiness: resolveReadiness(pkg),
    ...(args.renderAssembly
      ? {
        editorial_truth: {
          schema_version: 1 as const,
          authority_graph_id: args.canonicalGraph?.graph_id ?? args.renderAssembly.graph_id ?? null,
          authority_graph_version: args.canonicalGraph?.graph_version ?? args.renderAssembly.graph_version ?? null,
          active_operations: args.renderAssembly.operations.map((operation) => ({
            operation_id: operation.operation_id,
            instruction_id: operation.instruction_id,
            type: operation.type,
            capability: operation.capability,
            preview_posture: operation.preview_posture,
            export_posture: operation.export_posture,
            handoff_posture: operation.handoff_posture,
            reason_codes: operation.reason_codes,
          })),
          posture_summary: {
            preview: args.renderAssembly.preview.posture,
            export: args.renderAssembly.export.posture,
            handoff: args.renderAssembly.handoff.posture,
          },
          deferred_or_unsupported_operation_ids: args.renderAssembly.operations
            .filter((operation) => operation.capability !== "executable")
            .map((operation) => operation.operation_id),
          artifact_operation_links: {
            transcript_text_path: transcriptText ? HAMMER_QUENCH_RELEASE_PACKET_TRANSCRIPT_PATH : null,
            captions_srt_path: srtText ? HAMMER_QUENCH_RELEASE_PACKET_SRT_PATH : null,
            captions_vtt_path: vttText ? HAMMER_QUENCH_RELEASE_PACKET_VTT_PATH : null,
            visuals_path: HAMMER_QUENCH_RELEASE_PACKET_VISUALS_PATH,
            operation_ids: args.renderAssembly.operations.map((operation) => operation.operation_id),
          },
          broll_resolution_summary: {
            unresolved_intents: (args.canonicalGraph?.operations ?? []).flatMap((operation) => {
              if (operation.lifecycle !== "active") return [];
              if (operation.instruction.type !== "insert_broll") return [];
              if (operation.instruction.asset_binding_state !== "unresolved") return [];
              return [{
                operation_id: operation.operation_id,
                intent_ref: operation.instruction.intent_ref ?? null,
                intent_description: operation.instruction.intent_description ?? null,
              }];
            }),
            resolved_bindings: (args.canonicalGraph?.operations ?? []).flatMap((operation) => {
              if (operation.lifecycle !== "active") return [];
              if (operation.instruction.type !== "insert_broll") return [];
              if (operation.instruction.asset_binding_state === "unresolved") return [];
              return [{
                operation_id: operation.operation_id,
                asset_ref: operation.instruction.asset_ref,
              }];
            }),
          },
          broll_timeline_remap_summary: {
            adjusted_bindings: (args.canonicalGraph?.operations ?? []).flatMap((operation) => {
              if (operation.lifecycle !== "active") return [];
              if (operation.instruction.type !== "insert_broll") return [];
              if (operation.instruction.asset_binding_state === "unresolved") return [];
              return [{
                operation_id: operation.operation_id,
                start_sec: operation.instruction.start_sec,
                end_sec: operation.instruction.end_sec,
              }];
            }),
            removed_binding_operation_ids: (args.canonicalGraph?.operations ?? []).flatMap((operation) => {
              if (operation.lifecycle !== "superseded") return [];
              if (operation.instruction.type !== "insert_broll") return [];
              return [operation.operation_id];
            }),
            attention_binding_operation_ids: (args.canonicalGraph?.operations ?? []).flatMap((operation) => {
              if (operation.lifecycle !== "active") return [];
              if (operation.instruction.type !== "insert_broll") return [];
              if (!operation.capability_state.reason_codes.includes("operation_conflict")) return [];
              return [operation.operation_id];
            }),
          },
          duck_linkage_summary: {
            linked_duck_bindings: (args.canonicalGraph?.operations ?? []).flatMap((operation) => {
              if (operation.lifecycle !== "active") return [];
              if (operation.instruction.type !== "audio_duck") return [];
              if (!operation.instruction.linked_broll_operation_id) return [];
              return [{
                operation_id: operation.operation_id,
                linked_broll_operation_id: operation.instruction.linked_broll_operation_id,
                start_sec: operation.instruction.start_sec,
                end_sec: operation.instruction.end_sec,
              }];
            }),
            orphaned_duck_operation_ids: (args.canonicalGraph?.operations ?? []).flatMap((operation) => {
              if (operation.instruction.type !== "audio_duck") return [];
              const linkedBrollOperationId = operation.instruction.linked_broll_operation_id ?? null;
              if (!linkedBrollOperationId) return [];
              if (activeBrollOperationIds.has(linkedBrollOperationId)) return [];
              return [operation.operation_id];
            }),
            superseded_duck_operation_ids: (args.canonicalGraph?.operations ?? []).flatMap((operation) => {
              if (operation.lifecycle !== "superseded") return [];
              if (operation.instruction.type !== "audio_duck") return [];
              return [operation.operation_id];
            }),
          },
          export_timeline_snapshot: {
            final_duration_ms: args.renderAssembly.export_timeline.final_duration_ms,
            export_posture: args.renderAssembly.export_timeline.export_posture,
            audio_layers: args.renderAssembly.export_timeline.audio_layers.map((layer) => ({
              kind: layer.kind,
              operation_id: layer.operation_id,
              start_sec: layer.start_sec,
              end_sec: layer.end_sec,
              posture: layer.posture,
              capability: layer.capability,
              reason_codes: layer.reason_codes,
              ...(layer.kind === "podcast_master_pass"
                ? {
                  applied_stages: layer.meta?.applied_stages ?? [],
                  skipped_stages: layer.meta?.skipped_stages ?? [],
                  preview_mode: layer.meta?.preview_mode ?? "export_only",
                }
                : {}),
            })),
            visual_layers: args.renderAssembly.export_timeline.visual_layers.map((layer) => ({
              kind: layer.kind,
              operation_id: layer.operation_id,
              start_sec: layer.start_sec,
              end_sec: layer.end_sec,
              posture: layer.posture,
              capability: layer.capability,
              reason_codes: layer.reason_codes,
            })),
            transition_layers: args.renderAssembly.export_timeline.transition_layers.map((layer) => ({
              kind: layer.kind,
              operation_id: layer.operation_id,
              start_sec: layer.start_sec,
              end_sec: layer.end_sec,
              posture: layer.posture,
              capability: layer.capability,
              reason_codes: layer.reason_codes,
            })),
            caption_timing_map: args.renderAssembly.export_timeline.caption_timing_map.map((entry) => ({
              chunk_id: entry.chunk_id,
              start_sec: entry.start_sec,
              end_sec: entry.end_sec,
              segment_ids: [...entry.segment_ids],
              posture: entry.posture,
            })),
            attention_reasons: [...args.renderAssembly.export_timeline.attention_reasons],
            unsupported_or_degraded_ops: args.renderAssembly.export_timeline.unsupported_or_degraded_ops.map((operation) => ({
              operation_id: operation.operation_id,
              type: operation.type,
              posture: operation.posture,
              capability: operation.capability,
              reason_codes: operation.reason_codes,
            })),
          },
          podcast_master_summary: podcastMasterLayer
            ? {
              applied: true,
              operation_id: podcastMasterLayer.operation_id,
              posture: podcastMasterLayer.posture,
              capability: podcastMasterLayer.capability,
              preset: podcastMasterLayer.meta?.preset ?? null,
              noise_cleanup: podcastMasterLayer.meta?.noise_cleanup ?? null,
              normalization_lufs: podcastMasterLayer.meta?.normalization_lufs ?? null,
              compression_amount: podcastMasterLayer.meta?.compression_amount ?? null,
              limiter_ceiling_dbtp: podcastMasterLayer.meta?.limiter_ceiling_dbtp ?? null,
              applied_stages: podcastMasterLayer.meta?.applied_stages ?? [],
              skipped_stages: podcastMasterLayer.meta?.skipped_stages ?? [],
              reason_codes: [...podcastMasterLayer.reason_codes],
              preview_mode: podcastMasterLayer.meta?.preview_mode ?? "export_only",
            }
            : {
              applied: false,
              operation_id: null,
              posture: "unavailable" as const,
              capability: null,
              preset: null,
              noise_cleanup: null,
              normalization_lufs: null,
              compression_amount: null,
              limiter_ceiling_dbtp: null,
              applied_stages: [],
              skipped_stages: [],
              reason_codes: [],
              preview_mode: null,
            },
        },
      }
      : {}),
  };

  return {
    manifest,
    transcriptText,
    srtText,
    vttText,
    visuals,
  };
}
