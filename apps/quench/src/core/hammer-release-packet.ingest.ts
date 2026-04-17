import {
  HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH,
  type HammerQuenchCanonicalReadinessReason,
  type HammerQuenchCanonicalReadinessReasonCode,
  type HammerQuenchCanonicalReadinessStatus,
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
  if (readiness.status !== "ready" && readiness.status !== "needs_review" && readiness.status !== "blocked") return null;
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
    verdict: null,
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

function normalizeReason(reason: HammerQuenchCanonicalReadinessReason): HammerQuenchCanonicalReadinessReason {
  return {
    ...reason,
    operationId: reason.operationId ?? reason.operation_id ?? null,
    operation_id: reason.operation_id ?? reason.operationId ?? null,
  };
}

function makeQuenchReason(args: {
  code: Extract<HammerQuenchCanonicalReadinessReasonCode,
    | "quench_audio_reference_unresolved"
    | "quench_transcript_missing"
    | "quench_captions_missing"
    | "quench_visuals_missing"
    | "quench_visuals_invalid">;
  label: string;
  severity: "blocking" | "review";
}): HammerQuenchCanonicalReadinessReason {
  return {
    code: args.code,
    label: args.label,
    severity: args.severity,
    source: "quench",
    operationId: null,
    operation_id: null,
  };
}

function chooseStatusLabel(status: HammerQuenchCanonicalReadinessStatus): QuenchPacketIngestResult["status_label"] {
  switch (status) {
    case "ready":
      return "Ready for publish";
    case "needs_review":
      return "Needs review before publish";
    case "blocked":
      return "Blocked for publish";
  }
}

function buildVerdictFromManifest(manifest: HammerQuenchReleasePacketManifest): NonNullable<QuenchPacketIngestResult["verdict"]> {
  const reasons = (manifest.readiness.reasons_detail ?? []).map(normalizeReason);
  const blockingReasonsFromManifest = (manifest.readiness.blocking_reasons_detail ?? [])
    .map(normalizeReason)
    .filter((reason) => reason.severity === "blocking");
  const reviewReasonsFromManifest = (manifest.readiness.review_reasons_detail ?? [])
    .map(normalizeReason)
    .filter((reason) => reason.severity === "review");
  const blockingReasons = blockingReasonsFromManifest.length > 0
    ? blockingReasonsFromManifest
    : reasons.filter((reason) => reason.severity === "blocking");
  const reviewReasons = reviewReasonsFromManifest.length > 0
    ? reviewReasonsFromManifest
    : reasons.filter((reason) => reason.severity === "review");
  return {
    status: manifest.readiness.status,
    ready_for_quench: manifest.readiness.ready_for_quench,
    reason_codes: manifest.readiness.reason_codes && manifest.readiness.reason_codes.length > 0
      ? [...manifest.readiness.reason_codes]
      : reasons.map((reason) => reason.code),
    reasons_detail: reasons,
    blocking_reason_codes: manifest.readiness.blocking_reason_codes && manifest.readiness.blocking_reason_codes.length > 0
      ? [...manifest.readiness.blocking_reason_codes]
      : blockingReasons.map((reason) => reason.code),
    blocking_reasons_detail: blockingReasons,
    review_reason_codes: manifest.readiness.review_reason_codes && manifest.readiness.review_reason_codes.length > 0
      ? [...manifest.readiness.review_reason_codes]
      : reviewReasons.map((reason) => reason.code),
    review_reasons_detail: reviewReasons,
  };
}

function buildIssuesFromReasons(reasons: HammerQuenchCanonicalReadinessReason[]): QuenchPacketIssue[] {
  return reasons
    .filter((reason) => reason.source === "quench")
    .map((reason) => ({
      code: reason.code as QuenchPacketIssue["code"],
      severity: reason.severity === "blocking" ? "error" : "warning",
      message: reason.label,
    }));
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
  const appendedReasons: HammerQuenchCanonicalReadinessReason[] = [];
  if (!audio.resolved) {
    appendedReasons.push(makeQuenchReason({
      code: "quench_audio_reference_unresolved",
      label: audio.reason ?? "Audio reference could not be resolved.",
      severity: "blocking",
    }));
  }

  const transcriptText = manifest.transcript.text_path
    ? await args.reader.readText(manifest.transcript.text_path)
    : null;
  if (!transcriptText || !transcriptText.trim()) {
    appendedReasons.push(makeQuenchReason({
      code: "quench_transcript_missing",
      label: "Output-selected transcript is missing.",
      severity: "blocking",
    }));
  }

  const srt = manifest.captions.srt_path ? await args.reader.readText(manifest.captions.srt_path) : null;
  const vtt = manifest.captions.vtt_path ? await args.reader.readText(manifest.captions.vtt_path) : null;
  if ((!srt || !srt.trim()) && (!vtt || !vtt.trim())) {
    appendedReasons.push(makeQuenchReason({
      code: "quench_captions_missing",
      label: "Caption artifacts are missing.",
      severity: "review",
    }));
  }

  let visuals: HammerQuenchVisualPlacement[] | null = null;
  const rawVisuals = await args.reader.readJson(manifest.visuals.placements_path);
  if (rawVisuals == null) {
    appendedReasons.push(makeQuenchReason({
      code: "quench_visuals_missing",
      label: "Visual placements are not present in this packet.",
      severity: "review",
    }));
  } else {
    visuals = parseVisualPlacements(rawVisuals);
    if (visuals == null) {
      appendedReasons.push(makeQuenchReason({
        code: "quench_visuals_invalid",
        label: "Visual placements are present but invalid.",
        severity: "review",
      }));
    }
  }

  const verdict = buildVerdictFromManifest(manifest);
  issues.push(...buildIssuesFromReasons(appendedReasons));

  return {
    state: verdict.status,
    status_label: chooseStatusLabel(verdict.status),
    manifest_path: manifestPath,
    manifest,
    verdict,
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

