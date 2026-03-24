import type { HammerReleasePrepPackage } from "./hammerReleasePrepPackage";

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

function resolveDurationSeconds(pkg: HammerReleasePrepPackage): number | null {
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

  const manifest: HammerQuenchReleasePacketManifest = {
    version: 1,
    packet_kind: "quench_release_packet",
    generated_by: "Hammer",
    generated_at: args.preparedAt ?? new Date().toISOString(),
    workpiece_id: pkg.identity.workpiece_id ?? "",
    workspace_id: pkg.identity.workspace_id ?? null,
    episode_title: null,
    duration_seconds: resolveDurationSeconds(pkg),
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
  };

  return {
    manifest,
    transcriptText,
    srtText,
    vttText,
    visuals,
  };
}
