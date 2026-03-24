import {
  HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH,
  type HammerQuenchReleasePacketManifest,
  type HammerQuenchVisualPlacement,
  type QuenchPacketAudioResolution,
  type QuenchPacketIngestResult,
  type QuenchPacketIssue,
} from "./hammer-release-packet.types";

interface HammerPacketReader {
  readJson(path: string): Promise<unknown | null>;
  readText(path: string): Promise<string | null>;
}

interface HammerAudioResolver {
  resolveAudioReference(input: HammerQuenchReleasePacketManifest["audio"]): Promise<QuenchPacketAudioResolution>;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateManifestShape(value: unknown): HammerQuenchReleasePacketManifest | null {
  const row = asObject(value);
  if (!row) return null;
  if (row.packet_kind !== "quench_release_packet") return null;
  if (row.generated_by !== "Hammer") return null;
  if (row.version !== 1) return null;
  if (!asString(row.workpiece_id)) return null;
  const transcript = asObject(row.transcript);
  const audio = asObject(row.audio);
  const captions = asObject(row.captions);
  const visuals = asObject(row.visuals);
  const readiness = asObject(row.readiness);
  if (!transcript || !audio || !captions || !visuals || !readiness) return null;
  if (transcript.source_kind !== "raw" && transcript.source_kind !== "derived") return null;
  return row as unknown as HammerQuenchReleasePacketManifest;
}

function buildInvalidResult(args: {
  manifestPath: string;
  issues: QuenchPacketIssue[];
  manifest?: HammerQuenchReleasePacketManifest | null;
}): QuenchPacketIngestResult {
  return {
    state: "invalid",
    status_label: "Needs attention: packet invalid",
    manifest_path: args.manifestPath,
    manifest: args.manifest ?? null,
    transcript_text: null,
    captions: {
      srt: null,
      vtt: null,
    },
    visuals: null,
    audio: {
      resolved: false,
      uri: null,
      reason: "packet invalid",
    },
    issues: args.issues,
  };
}

class DefaultAudioResolver implements HammerAudioResolver {
  async resolveAudioReference(input: HammerQuenchReleasePacketManifest["audio"]): Promise<QuenchPacketAudioResolution> {
    if (input.kind === "none") {
      return {
        resolved: false,
        uri: null,
        reason: "Manifest reports no audio reference.",
      };
    }
    const uri = input.workpiece_path ?? input.local_relpath ?? input.media_id ?? null;
    if (!uri) {
      return {
        resolved: false,
        uri: null,
        reason: "Audio reference fields are empty.",
      };
    }
    return {
      resolved: true,
      uri,
      reason: null,
    };
  }
}

function chooseStatusLabel(issues: QuenchPacketIssue[]): QuenchPacketIngestResult["status_label"] {
  if (issues.some((issue) => issue.code === "AUDIO_REFERENCE_UNRESOLVED")) {
    return "Needs attention: audio reference unresolved";
  }
  if (issues.some((issue) => issue.code === "TRANSCRIPT_MISSING")) {
    return "Needs attention: transcript missing";
  }
  if (issues.some((issue) => issue.code === "CAPTIONS_MISSING")) {
    return "Needs attention: captions missing";
  }
  return "Ready for publish";
}

function parseVisualPlacements(value: unknown): HammerQuenchVisualPlacement[] | null {
  if (!Array.isArray(value)) return null;
  const placements: HammerQuenchVisualPlacement[] = [];
  for (const entry of value) {
    const row = asObject(entry);
    if (!row) return null;
    placements.push({
      placement_id: asString(row.placement_id) ?? "",
      anchor_segment_id: asString(row.anchor_segment_id) ?? "",
      start_sec: typeof row.start_sec === "number" ? row.start_sec : 0,
      end_sec: typeof row.end_sec === "number" ? row.end_sec : 0,
      asset_path: asString(row.asset_path),
      status: asString(row.status) ?? "unknown",
    });
  }
  return placements;
}

export async function ingestHammerReleasePacket(args: {
  reader: HammerPacketReader;
  manifestPath?: string;
  audioResolver?: HammerAudioResolver;
}): Promise<QuenchPacketIngestResult> {
  const manifestPath = args.manifestPath ?? HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH;
  const issues: QuenchPacketIssue[] = [];
  const rawManifest = await args.reader.readJson(manifestPath);
  if (!rawManifest) {
    return buildInvalidResult({
      manifestPath,
      issues: [{
        code: "MANIFEST_NOT_FOUND",
        severity: "error",
        message: "Release packet manifest was not found.",
      }],
    });
  }

  const manifest = validateManifestShape(rawManifest);
  if (!manifest) {
    return buildInvalidResult({
      manifestPath,
      issues: [{
        code: "MANIFEST_INVALID",
        severity: "error",
        message: "Release packet manifest is invalid.",
      }],
    });
  }

  const audioResolver = args.audioResolver ?? new DefaultAudioResolver();
  const audio = await audioResolver.resolveAudioReference(manifest.audio);
  if (!audio.resolved) {
    issues.push({
      code: "AUDIO_REFERENCE_UNRESOLVED",
      severity: "error",
      message: audio.reason ?? "Audio reference could not be resolved.",
    });
  }

  const transcriptText = manifest.transcript.text_path
    ? await args.reader.readText(manifest.transcript.text_path)
    : null;
  if (!transcriptText || !transcriptText.trim()) {
    issues.push({
      code: "TRANSCRIPT_MISSING",
      severity: "error",
      message: "Output-selected transcript is missing.",
    });
  }

  const srt = manifest.captions.srt_path ? await args.reader.readText(manifest.captions.srt_path) : null;
  const vtt = manifest.captions.vtt_path ? await args.reader.readText(manifest.captions.vtt_path) : null;
  if ((!srt || !srt.trim()) && (!vtt || !vtt.trim())) {
    issues.push({
      code: "CAPTIONS_MISSING",
      severity: "warning",
      message: "Caption artifacts are missing.",
    });
  }

  let visuals: HammerQuenchVisualPlacement[] | null = null;
  const rawVisuals = await args.reader.readJson(manifest.visuals.placements_path);
  if (rawVisuals == null) {
    issues.push({
      code: "VISUALS_MISSING",
      severity: "warning",
      message: "Visual placements are not present in this packet.",
    });
  } else {
    visuals = parseVisualPlacements(rawVisuals);
    if (visuals == null) {
      issues.push({
        code: "VISUALS_INVALID",
        severity: "warning",
        message: "Visual placements are present but invalid.",
      });
    }
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  const hasAttention = hasError || issues.some((issue) => issue.code === "CAPTIONS_MISSING");

  return {
    state: hasAttention ? "attention" : "ready",
    status_label: chooseStatusLabel(issues),
    manifest_path: manifestPath,
    manifest,
    transcript_text: transcriptText && transcriptText.trim() ? transcriptText : null,
    captions: {
      srt: srt && srt.trim() ? srt : null,
      vtt: vtt && vtt.trim() ? vtt : null,
    },
    visuals,
    audio,
    issues,
  };
}

