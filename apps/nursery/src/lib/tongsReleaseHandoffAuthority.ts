import type {
  HammerReleasePrepPackage,
  HammerReleasePrepStatus,
} from "../../../hammer/src/lib/hammerReleasePrepPackage";
import type {
  HammerPersistenceSnapshot,
  HammerPersistenceTarget,
} from "../../../hammer/src/persistence/hammerPersistenceContract";

export type TongsReleaseHandoffAuthorityStatus =
  | "ready"
  | "blocked"
  | "unsafe"
  | "incompatible";

export type TongsReleaseHandoffAuthoritySeverity =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type TongsReleaseHandoffAuthorityAffectedDomain =
  | "transcript"
  | "subtitles"
  | "visuals"
  | "audio"
  | "metadata"
  | "compatibility"
  | "policy";

export type TongsReleaseHandoffAuthorityCheckId =
  | "transcript_output"
  | "subtitle_srt"
  | "subtitle_vtt"
  | "visuals"
  | "audio_polish";

export type TongsReleaseHandoffAuthorityObservedStatus =
  | Exclude<HammerReleasePrepStatus, "ready">
  | "unsafe"
  | "incompatible";

export interface TongsReleaseHandoffAuthorityCheck {
  id: TongsReleaseHandoffAuthorityCheckId;
  label: string;
  status: HammerReleasePrepStatus;
  affected_domain: TongsReleaseHandoffAuthorityAffectedDomain;
  detail: string;
}

export interface TongsReleaseHandoffAuthorityIssue {
  code: string;
  severity: TongsReleaseHandoffAuthoritySeverity;
  priority: number;
  affected_domain: TongsReleaseHandoffAuthorityAffectedDomain;
  message: string;
  remediation_code: string | null;
  check_id: TongsReleaseHandoffAuthorityCheckId | null;
  label: string | null;
  observed_status: TongsReleaseHandoffAuthorityObservedStatus;
}

export interface TongsReleaseHandoffAuthorityRemediation {
  code: string;
  priority: number;
  action: string;
}

export interface TongsReleaseHandoffAuthoritySourceArtifacts {
  state_updated_at: string | null;
  editor_session: {
    path: string | null;
    updated_at: string | null;
  };
  structured_transcript: {
    path: string | null;
    updated_at: string | null;
  };
  visual_placements: {
    path: string | null;
    updated_at: string | null;
  };
  audio_polish: {
    path: string | null;
    updated_at: string | null;
  };
}

export interface TongsReleaseHandoffAuthority {
  schema_version: 1;
  status: TongsReleaseHandoffAuthorityStatus;
  message: string;
  safe_for_downstream_handoff: boolean;
  allow_preview: boolean;
  do_not_publish: boolean;
  snapshot_id: string;
  snapshot_created_at: string | null;
  integrity_hash: string;
  provenance: {
    source: "tongs";
    release_prep_schema_version: number | null;
    source_updated_at: string | null;
    workspace_id: string | null;
    workpiece_id: string | null;
    editor_session_id: string | null;
    transcript_source_id: string | null;
    media_id: string | null;
  };
  compatible_consumers: string[];
  blockers: TongsReleaseHandoffAuthorityIssue[];
  warnings: TongsReleaseHandoffAuthorityIssue[];
  remediations: TongsReleaseHandoffAuthorityRemediation[];
  checks: TongsReleaseHandoffAuthorityCheck[];
}

const AUTHORITY_SCHEMA_VERSION = 1;
const QUENCH_RELEASE_PACKET_STUB_CONSUMER = "quench_release_packet_stub.v1";

interface CheckBlueprint {
  id: TongsReleaseHandoffAuthorityCheckId;
  label: string;
  affectedDomain: TongsReleaseHandoffAuthorityAffectedDomain;
  priorityBase: number;
  detail: (pkg: HammerReleasePrepPackage) => string;
  remediation: (status: Exclude<HammerReleasePrepStatus, "ready">) => string;
}

const CHECK_BLUEPRINTS: CheckBlueprint[] = [
  {
    id: "transcript_output",
    label: "Transcript Output",
    affectedDomain: "transcript",
    priorityBase: 100,
    detail: (pkg) => pkg.text_outputs
      ? `${pkg.text_outputs.resolved_output.segment_count} segments from ${pkg.text_outputs.output_selection.source_kind} output selection.`
      : "No resolved transcript output is available from persisted Hammer state.",
    remediation: (status) => {
      switch (status) {
        case "missing":
          return "Persist a structured transcript output before downstream handoff.";
        case "stale":
          return "Refresh the transcript output so it matches the current selected text layer.";
        default:
          return "Repair transcript preparation before downstream handoff.";
      }
    },
  },
  {
    id: "subtitle_srt",
    label: "SRT Subtitle",
    affectedDomain: "subtitles",
    priorityBase: 200,
    detail: (pkg) => pkg.text_outputs?.subtitles.srt.artifact
      ? `${pkg.text_outputs.subtitles.srt.artifact.entry_count} cues from ${pkg.text_outputs.subtitles.srt.artifact.source_kind} transcript output.`
      : "No SRT artifact has been generated yet.",
    remediation: (status) => {
      switch (status) {
        case "missing":
          return "Generate an SRT subtitle artifact from the current transcript output.";
        case "stale":
          return "Regenerate the SRT subtitle artifact from the active transcript output.";
        default:
          return "Repair SRT subtitle preparation before downstream handoff.";
      }
    },
  },
  {
    id: "subtitle_vtt",
    label: "VTT Subtitle",
    affectedDomain: "subtitles",
    priorityBase: 210,
    detail: (pkg) => pkg.text_outputs?.subtitles.vtt.artifact
      ? `${pkg.text_outputs.subtitles.vtt.artifact.entry_count} cues from ${pkg.text_outputs.subtitles.vtt.artifact.source_kind} transcript output.`
      : "No VTT artifact has been generated yet.",
    remediation: (status) => {
      switch (status) {
        case "missing":
          return "Generate a VTT subtitle artifact from the current transcript output.";
        case "stale":
          return "Regenerate the VTT subtitle artifact from the active transcript output.";
        default:
          return "Repair VTT subtitle preparation before downstream handoff.";
      }
    },
  },
  {
    id: "visuals",
    label: "Visual Placements",
    affectedDomain: "visuals",
    priorityBase: 300,
    detail: (pkg) => `${pkg.media_prep_outputs.visuals.placement_count} placements with ${pkg.media_prep_outputs.visuals.uncertain_placement_count} uncertain.`,
    remediation: (status) => {
      switch (status) {
        case "missing":
          return "Prepare visual placements from the current transcript and script alignment.";
        case "stale":
          return "Refresh visual placements so they match the current prep artifacts.";
        default:
          return "Repair visual placement preparation before downstream handoff.";
      }
    },
  },
  {
    id: "audio_polish",
    label: "Audio Polish",
    affectedDomain: "audio",
    priorityBase: 400,
    detail: (pkg) => pkg.media_backbone.audio_polish_plan?.detail
      ?? `${pkg.media_prep_outputs.audio.polish.status} with preferred playback ${pkg.media_prep_outputs.audio.preferred_playback.kind}.`,
    remediation: (status) => {
      switch (status) {
        case "missing":
          return "Run audio polish or confirm a canonical raw playback path before downstream handoff.";
        case "stale":
          return "Rerun audio polish so the prepared audio matches the current source artifacts.";
        case "failed":
          return "Repair the audio polish failure and regenerate the prepared audio artifact.";
        case "unsupported":
          return "Provide a supported source media kind before downstream handoff.";
        case "requires_future_ffmpeg":
          return "Install or enable FFmpeg-backed working audio, then rerun audio polish.";
      }
    },
  },
];

function maxIsoTimestamp(values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!latest || value > latest) latest = value;
  }
  return latest;
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`).join(",")}}`;
}

function cyrb128Hex(value: string): string {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ charCode, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ charCode, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ charCode, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ charCode, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  const parts = [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];

  return parts
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
}

function formatStatusLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function remediationCode(checkId: TongsReleaseHandoffAuthorityCheckId, status: Exclude<HammerReleasePrepStatus, "ready">): string {
  return `${checkId}_${status}_remediation`.toUpperCase();
}

function issueCode(checkId: TongsReleaseHandoffAuthorityCheckId, status: Exclude<HammerReleasePrepStatus, "ready">): string {
  return `${checkId}_${status}`.toUpperCase();
}

function priorityOffset(status: TongsReleaseHandoffAuthorityObservedStatus): number {
  switch (status) {
    case "incompatible":
      return 0;
    case "unsafe":
      return 1;
    case "failed":
      return 2;
    case "unsupported":
      return 3;
    case "requires_future_ffmpeg":
      return 4;
    case "missing":
      return 5;
    case "stale":
      return 6;
  }
}

function severityForStatus(status: TongsReleaseHandoffAuthorityObservedStatus): TongsReleaseHandoffAuthoritySeverity {
  switch (status) {
    case "incompatible":
    case "unsafe":
    case "failed":
    case "unsupported":
      return "critical";
    case "requires_future_ffmpeg":
      return "high";
    case "missing":
      return "medium";
    case "stale":
      return "low";
  }
}

function buildChecks(pkg: HammerReleasePrepPackage): TongsReleaseHandoffAuthorityCheck[] {
  return CHECK_BLUEPRINTS.map((blueprint) => {
    const status = (() => {
      switch (blueprint.id) {
        case "transcript_output":
          return pkg.readiness.transcript_output;
        case "subtitle_srt":
          return pkg.readiness.subtitles.srt;
        case "subtitle_vtt":
          return pkg.readiness.subtitles.vtt;
        case "visuals":
          return pkg.readiness.visuals;
        case "audio_polish":
          return pkg.readiness.audio_polish;
      }
    })();

    return {
      id: blueprint.id,
      label: blueprint.label,
      status,
      affected_domain: blueprint.affectedDomain,
      detail: blueprint.detail(pkg),
    };
  });
}

function buildCheckIssues(
  checks: TongsReleaseHandoffAuthorityCheck[],
): {
  blockers: TongsReleaseHandoffAuthorityIssue[];
  warnings: TongsReleaseHandoffAuthorityIssue[];
  remediations: TongsReleaseHandoffAuthorityRemediation[];
} {
  const blockers: TongsReleaseHandoffAuthorityIssue[] = [];
  const warnings: TongsReleaseHandoffAuthorityIssue[] = [];
  const remediations = new Map<string, TongsReleaseHandoffAuthorityRemediation>();

  for (const check of checks) {
    if (check.status === "ready") continue;
    const blueprint = CHECK_BLUEPRINTS.find((entry) => entry.id === check.id);
    if (!blueprint) continue;

    const remediation_code = remediationCode(check.id, check.status);
    const issue: TongsReleaseHandoffAuthorityIssue = {
      code: issueCode(check.id, check.status),
      severity: severityForStatus(check.status),
      priority: blueprint.priorityBase + priorityOffset(check.status),
      affected_domain: check.affected_domain,
      message: `${check.label} is ${formatStatusLabel(check.status)}. ${check.detail}`,
      remediation_code,
      check_id: check.id,
      label: check.label,
      observed_status: check.status,
    };

    if (check.status === "missing" || check.status === "stale") {
      warnings.push(issue);
    } else {
      blockers.push(issue);
    }

    if (!remediations.has(remediation_code)) {
      remediations.set(remediation_code, {
        code: remediation_code,
        priority: blueprint.priorityBase + priorityOffset(check.status),
        action: blueprint.remediation(check.status),
      });
    }
  }

  return {
    blockers: blockers.sort((left, right) => left.priority - right.priority),
    warnings: warnings.sort((left, right) => left.priority - right.priority),
    remediations: [...remediations.values()].sort((left, right) => left.priority - right.priority),
  };
}

function buildCompatibilityIssues(args: {
  snapshot: HammerPersistenceSnapshot;
  releasePrep: HammerReleasePrepPackage;
}): TongsReleaseHandoffAuthorityIssue[] {
  const issues: TongsReleaseHandoffAuthorityIssue[] = [];

  if (args.snapshot.schema_version !== 1) {
    issues.push({
      code: "HAMMER_PERSISTENCE_SCHEMA_INCOMPATIBLE",
      severity: "critical",
      priority: 10,
      affected_domain: "compatibility",
      message: `Hammer persistence snapshot schema ${String(args.snapshot.schema_version)} is incompatible with authority schema ${AUTHORITY_SCHEMA_VERSION}.`,
      remediation_code: "UPGRADE_RELEASE_HANDOFF_CONSUMER",
      check_id: null,
      label: null,
      observed_status: "incompatible",
    });
  }

  if (args.releasePrep.schema_version !== 1) {
    issues.push({
      code: "HAMMER_RELEASE_PREP_SCHEMA_INCOMPATIBLE",
      severity: "critical",
      priority: 11,
      affected_domain: "compatibility",
      message: `Hammer release prep schema ${String(args.releasePrep.schema_version)} is incompatible with authority schema ${AUTHORITY_SCHEMA_VERSION}.`,
      remediation_code: "UPGRADE_RELEASE_HANDOFF_CONSUMER",
      check_id: null,
      label: null,
      observed_status: "incompatible",
    });
  }

  return issues;
}

function buildUnsafeIssues(args: {
  target: HammerPersistenceTarget;
  releasePrep: HammerReleasePrepPackage;
  snapshot: HammerPersistenceSnapshot;
}): TongsReleaseHandoffAuthorityIssue[] {
  const issues: TongsReleaseHandoffAuthorityIssue[] = [];

  if (!args.target.workspaceId.trim()) {
    issues.push({
      code: "TARGET_WORKSPACE_ID_MISSING",
      severity: "critical",
      priority: 20,
      affected_domain: "policy",
      message: "The release handoff target is missing a workspace id.",
      remediation_code: "RESTORE_TARGET_WORKSPACE_ID",
      check_id: null,
      label: null,
      observed_status: "unsafe",
    });
  }

  if (!args.target.workpieceId.trim()) {
    issues.push({
      code: "TARGET_WORKPIECE_ID_MISSING",
      severity: "critical",
      priority: 21,
      affected_domain: "policy",
      message: "The release handoff target is missing a workpiece id.",
      remediation_code: "RESTORE_TARGET_WORKPIECE_ID",
      check_id: null,
      label: null,
      observed_status: "unsafe",
    });
  }

  const releaseWorkspaceId = args.releasePrep.identity.workspace_id ?? args.snapshot.state?.workspace_id ?? null;
  const releaseWorkpieceId = args.releasePrep.identity.workpiece_id ?? args.snapshot.state?.workpiece_id ?? null;

  if (!releaseWorkspaceId) {
    issues.push({
      code: "RELEASE_PREP_WORKSPACE_ID_MISSING",
      severity: "critical",
      priority: 22,
      affected_domain: "metadata",
      message: "Persisted Hammer state does not expose a canonical workspace id for downstream release handoff.",
      remediation_code: "REBUILD_CANONICAL_WORKSPACE_IDENTITY",
      check_id: null,
      label: null,
      observed_status: "unsafe",
    });
  } else if (releaseWorkspaceId !== args.target.workspaceId) {
    issues.push({
      code: "RELEASE_PREP_WORKSPACE_ID_MISMATCH",
      severity: "critical",
      priority: 23,
      affected_domain: "policy",
      message: `Target workspace ${args.target.workspaceId} does not match persisted Hammer workspace ${releaseWorkspaceId}.`,
      remediation_code: "ALIGN_WORKSPACE_IDENTITY",
      check_id: null,
      label: null,
      observed_status: "unsafe",
    });
  }

  if (!releaseWorkpieceId) {
    issues.push({
      code: "RELEASE_PREP_WORKPIECE_ID_MISSING",
      severity: "critical",
      priority: 24,
      affected_domain: "metadata",
      message: "Persisted Hammer state does not expose a canonical workpiece id for downstream release handoff.",
      remediation_code: "REBUILD_CANONICAL_WORKPIECE_IDENTITY",
      check_id: null,
      label: null,
      observed_status: "unsafe",
    });
  } else if (releaseWorkpieceId !== args.target.workpieceId) {
    issues.push({
      code: "RELEASE_PREP_WORKPIECE_ID_MISMATCH",
      severity: "critical",
      priority: 25,
      affected_domain: "policy",
      message: `Target workpiece ${args.target.workpieceId} does not match persisted Hammer workpiece ${releaseWorkpieceId}.`,
      remediation_code: "ALIGN_WORKPIECE_IDENTITY",
      check_id: null,
      label: null,
      observed_status: "unsafe",
    });
  }

  return issues.sort((left, right) => left.priority - right.priority);
}

function buildSystemRemediations(
  issues: TongsReleaseHandoffAuthorityIssue[],
): TongsReleaseHandoffAuthorityRemediation[] {
  const actions: Record<string, string> = {
    UPGRADE_RELEASE_HANDOFF_CONSUMER: "Upgrade the authority consumer to a compatible schema family before downstream handoff.",
    RESTORE_TARGET_WORKSPACE_ID: "Resolve the downstream target so it includes a canonical workspace id.",
    RESTORE_TARGET_WORKPIECE_ID: "Resolve the downstream target so it includes a canonical workpiece id.",
    REBUILD_CANONICAL_WORKSPACE_IDENTITY: "Repair persisted Hammer state so the canonical workspace identity is present.",
    REBUILD_CANONICAL_WORKPIECE_IDENTITY: "Repair persisted Hammer state so the canonical workpiece identity is present.",
    ALIGN_WORKSPACE_IDENTITY: "Align the requested workspace id with persisted Hammer state before downstream handoff.",
    ALIGN_WORKPIECE_IDENTITY: "Align the requested workpiece id with persisted Hammer state before downstream handoff.",
  };

  const remediations = new Map<string, TongsReleaseHandoffAuthorityRemediation>();

  for (const issue of issues) {
    if (!issue.remediation_code || remediations.has(issue.remediation_code)) continue;
    remediations.set(issue.remediation_code, {
      code: issue.remediation_code,
      priority: issue.priority,
      action: actions[issue.remediation_code] ?? "Repair the declared authority issue before downstream handoff.",
    });
  }

  return [...remediations.values()].sort((left, right) => left.priority - right.priority);
}

function buildAuthorityMessage(args: {
  status: TongsReleaseHandoffAuthorityStatus;
  blockers: TongsReleaseHandoffAuthorityIssue[];
  warnings: TongsReleaseHandoffAuthorityIssue[];
}): string {
  switch (args.status) {
    case "ready":
      return "Release handoff authority verified current persisted Hammer state for downstream use.";
    case "incompatible":
      return `Release handoff is incompatible: ${args.blockers.map((issue) => issue.code.toLowerCase()).join(", ")}.`;
    case "unsafe":
      return `Release handoff is unsafe: ${args.blockers.map((issue) => issue.code.toLowerCase()).join(", ")}.`;
    case "blocked":
      if (args.blockers.length > 0) {
        return `Release handoff is blocked until ${args.blockers.map((issue) => issue.code.toLowerCase()).join(", ")} is remediated.`;
      }
      return `Release handoff is blocked pending ${args.warnings.map((issue) => issue.code.toLowerCase()).join(", ")}.`;
  }
}

export function buildTongsReleaseHandoffAuthority(args: {
  target: HammerPersistenceTarget;
  snapshot: HammerPersistenceSnapshot;
  sourceArtifacts: TongsReleaseHandoffAuthoritySourceArtifacts;
  releasePrep: HammerReleasePrepPackage;
}): TongsReleaseHandoffAuthority {
  const checks = buildChecks(args.releasePrep);
  const checkIssues = buildCheckIssues(checks);
  const compatibilityIssues = buildCompatibilityIssues({
    snapshot: args.snapshot,
    releasePrep: args.releasePrep,
  });
  const unsafeIssues = compatibilityIssues.length === 0
    ? buildUnsafeIssues({
      target: args.target,
      releasePrep: args.releasePrep,
      snapshot: args.snapshot,
    })
    : [];

  const sourceUpdatedAt = maxIsoTimestamp([
    args.sourceArtifacts.state_updated_at,
    args.sourceArtifacts.editor_session.updated_at,
    args.sourceArtifacts.structured_transcript.updated_at,
    args.sourceArtifacts.visual_placements.updated_at,
    args.sourceArtifacts.audio_polish.updated_at,
  ]);
  const preferredPlaybackCloudUri = args.releasePrep.media_prep_outputs.audio.preferred_playback.kind === "raw"
    ? args.releasePrep.media_prep_outputs.audio.raw_source.cloud_uri
    : null;
  const hasOutputText = Boolean(args.releasePrep.text_outputs?.resolved_output.full_text.trim())
    && (args.releasePrep.text_outputs?.resolved_output.segment_count ?? 0) > 0;
  const hasPreferredAudioPath = Boolean(
    args.releasePrep.media_prep_outputs.audio.preferred_playback.local_relpath
    || preferredPlaybackCloudUri,
  );

  const status: TongsReleaseHandoffAuthorityStatus = compatibilityIssues.length > 0
    ? "incompatible"
    : unsafeIssues.length > 0
      ? "unsafe"
      : checks.every((check) => check.status === "ready")
        ? "ready"
        : "blocked";

  const blockers = [
    ...compatibilityIssues,
    ...unsafeIssues,
    ...checkIssues.blockers,
  ].sort((left, right) => left.priority - right.priority);
  const warnings = [...checkIssues.warnings];
  const remediations = [
    ...buildSystemRemediations([...compatibilityIssues, ...unsafeIssues]),
    ...checkIssues.remediations,
  ].sort((left, right) => left.priority - right.priority);

  const compatibleConsumers = compatibilityIssues.length === 0
    ? [QUENCH_RELEASE_PACKET_STUB_CONSUMER]
    : [];
  const safeForDownstreamHandoff = status !== "unsafe" && status !== "incompatible";
  const allowPreview = safeForDownstreamHandoff
    && checkIssues.blockers.length === 0
    && hasOutputText
    && hasPreferredAudioPath;
  const message = buildAuthorityMessage({
    status,
    blockers,
    warnings,
  });
  const integrityPayload = {
    schema_version: AUTHORITY_SCHEMA_VERSION,
    status,
    message,
    safe_for_downstream_handoff: safeForDownstreamHandoff,
    allow_preview: allowPreview,
    do_not_publish: status !== "ready",
    snapshot_created_at: sourceUpdatedAt,
    provenance: {
      source: "tongs" as const,
      release_prep_schema_version: args.releasePrep.schema_version ?? null,
      source_updated_at: sourceUpdatedAt,
      workspace_id: args.releasePrep.identity.workspace_id ?? args.target.workspaceId,
      workpiece_id: args.releasePrep.identity.workpiece_id ?? args.target.workpieceId,
      editor_session_id: args.releasePrep.identity.editor_session_id,
      transcript_source_id: args.releasePrep.identity.transcript_source_id,
      media_id: args.releasePrep.identity.media_id,
    },
    compatible_consumers: compatibleConsumers,
    blockers,
    warnings,
    remediations,
    checks,
  };
  const integrityHash = `cyrb128:${cyrb128Hex(stableStringify(integrityPayload))}`;
  const snapshotId = `rha1_${integrityHash.slice("cyrb128:".length, "cyrb128:".length + 24)}`;

  return {
    schema_version: AUTHORITY_SCHEMA_VERSION,
    status,
    message,
    safe_for_downstream_handoff: safeForDownstreamHandoff,
    allow_preview: allowPreview,
    do_not_publish: status !== "ready",
    snapshot_id: snapshotId,
    snapshot_created_at: sourceUpdatedAt,
    integrity_hash: integrityHash,
    provenance: integrityPayload.provenance,
    compatible_consumers: compatibleConsumers,
    blockers,
    warnings,
    remediations,
    checks,
  };
}

export function mapAuthorityToReleaseAssemblySummaryStatus(
  authority: TongsReleaseHandoffAuthority,
): "ready" | "attention" | "blocked" {
  if (authority.status === "ready") return "ready";
  return authority.allow_preview ? "attention" : "blocked";
}

export function buildSourceArtifactsFromSnapshot(
  snapshot: HammerPersistenceSnapshot,
): TongsReleaseHandoffAuthoritySourceArtifacts {
  return {
    state_updated_at: snapshot.state?.updated_at ?? null,
    editor_session: {
      path: snapshot.editor_session.path ?? null,
      updated_at: snapshot.editor_session.updated_at ?? null,
    },
    structured_transcript: {
      path: snapshot.structured_transcript.path ?? null,
      updated_at: snapshot.structured_transcript.updated_at ?? null,
    },
    visual_placements: {
      path: snapshot.visual_placements.path ?? null,
      updated_at: snapshot.visual_placements.updated_at ?? null,
    },
    audio_polish: {
      path: snapshot.audio_polish.path ?? null,
      updated_at: snapshot.audio_polish.updated_at ?? null,
    },
  };
}
