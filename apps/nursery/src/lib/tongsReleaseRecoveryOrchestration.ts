import type { HammerReleasePrepPackage } from "../../../hammer/src/lib/hammerReleasePrepPackage";
import type {
  TongsReleaseHandoffAuthority,
  TongsReleaseHandoffAuthorityIssue,
} from "./tongsReleaseHandoffAuthority";

export type TongsReleaseRecoveryClassification =
  | "recoverable"
  | "recoverable_with_regeneration"
  | "requires_upstream_action"
  | "incompatible";

export type TongsReleaseRecoveryStatus =
  | "not_needed"
  | TongsReleaseRecoveryClassification;

export type TongsReleaseRecoveryDomain =
  | "transcript"
  | "subtitles"
  | "visuals"
  | "audio"
  | "metadata"
  | "compatibility"
  | "policy";

export type TongsReleaseRecoveryArtifactCode =
  | "target_identity"
  | "release_identity"
  | "authority_schema"
  | "structured_transcript"
  | "transcript_output"
  | "subtitle_srt"
  | "subtitle_vtt"
  | "visual_placements"
  | "audio_source"
  | "audio_polish";

export interface TongsReleaseRecoveryArtifactDependency {
  code: TongsReleaseRecoveryArtifactCode;
  domain: TongsReleaseRecoveryDomain;
  reason: string;
  required_by: string[];
}

export interface TongsReleaseRecoveryPlanStep {
  code: string;
  domain: TongsReleaseRecoveryDomain;
  classification: TongsReleaseRecoveryClassification;
  action: string;
  reason: string;
  priority: number;
  automatic: boolean;
  issue_codes: string[];
  depends_on: string[];
  artifact_dependencies: TongsReleaseRecoveryArtifactCode[];
}

export interface TongsReleaseRecoveryBlocker {
  code: string;
  classification: TongsReleaseRecoveryClassification;
  reason: string;
  issue_codes: string[];
}

export interface TongsReleaseRecoveryOrchestration {
  schema_version: 1;
  recovery_status: TongsReleaseRecoveryStatus;
  preview_allowed_during_recovery: boolean;
  publish_blocked_during_recovery: boolean;
  requires_upstream_prep: boolean;
  can_auto_recover: boolean;
  recovery_plan: TongsReleaseRecoveryPlanStep[];
  recovery_blockers: TongsReleaseRecoveryBlocker[];
  artifact_dependencies: TongsReleaseRecoveryArtifactDependency[];
}

interface RecoveryStepSeed {
  code: string;
  domain: TongsReleaseRecoveryDomain;
  classification: TongsReleaseRecoveryClassification;
  action: string;
  reason: string;
  priority: number;
  automatic: boolean;
  issue_codes: string[];
  artifact_dependencies: TongsReleaseRecoveryArtifactCode[];
}

const RECOVERY_SCHEMA_VERSION = 1;

function classificationRank(classification: TongsReleaseRecoveryClassification): number {
  switch (classification) {
    case "incompatible":
      return 0;
    case "requires_upstream_action":
      return 1;
    case "recoverable":
      return 2;
    case "recoverable_with_regeneration":
      return 3;
  }
}

function dedupe<T>(values: T[]): T[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function upsertStep(
  map: Map<string, RecoveryStepSeed>,
  seed: RecoveryStepSeed,
): void {
  const existing = map.get(seed.code);
  if (!existing) {
    map.set(seed.code, {
      ...seed,
      issue_codes: [...seed.issue_codes],
      artifact_dependencies: [...seed.artifact_dependencies],
    });
    return;
  }

  existing.priority = Math.min(existing.priority, seed.priority);
  existing.issue_codes = dedupe([...existing.issue_codes, ...seed.issue_codes]);
  existing.artifact_dependencies = dedupe([
    ...existing.artifact_dependencies,
    ...seed.artifact_dependencies,
  ]);
  if (existing.reason.length < seed.reason.length) {
    existing.reason = seed.reason;
  }
}

function mapIssueToRecoveryStep(
  issue: TongsReleaseHandoffAuthorityIssue,
  releasePrep: HammerReleasePrepPackage,
): RecoveryStepSeed {
  switch (issue.code) {
    case "HAMMER_PERSISTENCE_SCHEMA_INCOMPATIBLE":
    case "HAMMER_RELEASE_PREP_SCHEMA_INCOMPATIBLE":
      return {
        code: "UPGRADE_RELEASE_HANDOFF_SCHEMA",
        domain: "compatibility",
        classification: "incompatible",
        action: "Upgrade the release handoff consumer and producer to a compatible schema family before retrying recovery.",
        reason: issue.message,
        priority: 10,
        automatic: false,
        issue_codes: [issue.code],
        artifact_dependencies: ["authority_schema"],
      };
    case "TARGET_WORKSPACE_ID_MISSING":
    case "TARGET_WORKPIECE_ID_MISSING":
    case "RELEASE_PREP_WORKSPACE_ID_MISMATCH":
    case "RELEASE_PREP_WORKPIECE_ID_MISMATCH":
      return {
        code: "ALIGN_RELEASE_TARGET",
        domain: "policy",
        classification: "recoverable",
        action: "Align the requested release target with the canonical persisted Hammer workspace and workpiece identity.",
        reason: issue.message,
        priority: 50,
        automatic: false,
        issue_codes: [issue.code],
        artifact_dependencies: ["target_identity", "release_identity"],
      };
    case "RELEASE_PREP_WORKSPACE_ID_MISSING":
    case "RELEASE_PREP_WORKPIECE_ID_MISSING":
      return {
        code: "RESTORE_CANONICAL_RELEASE_IDENTITY",
        domain: "metadata",
        classification: "requires_upstream_action",
        action: "Repair persisted Hammer state so canonical workspace and workpiece identity are present before recovery proceeds.",
        reason: issue.message,
        priority: 60,
        automatic: false,
        issue_codes: [issue.code],
        artifact_dependencies: ["release_identity"],
      };
  }

  switch (issue.check_id) {
    case "transcript_output":
      return {
        code: "REGENERATE_TRANSCRIPT_OUTPUT",
        domain: "transcript",
        classification: "recoverable_with_regeneration",
        action: "Regenerate the downstream transcript output from the current structured transcript selection.",
        reason: issue.message,
        priority: 100,
        automatic: true,
        issue_codes: [issue.code],
        artifact_dependencies: ["structured_transcript", "transcript_output"],
      };
    case "subtitle_srt":
      return {
        code: "REGENERATE_SUBTITLE_SRT",
        domain: "subtitles",
        classification: "recoverable_with_regeneration",
        action: "Regenerate the SRT subtitle artifact from the current transcript output.",
        reason: issue.message,
        priority: 200,
        automatic: true,
        issue_codes: [issue.code],
        artifact_dependencies: ["transcript_output", "subtitle_srt"],
      };
    case "subtitle_vtt":
      return {
        code: "REGENERATE_SUBTITLE_VTT",
        domain: "subtitles",
        classification: "recoverable_with_regeneration",
        action: "Regenerate the VTT subtitle artifact from the current transcript output.",
        reason: issue.message,
        priority: 210,
        automatic: true,
        issue_codes: [issue.code],
        artifact_dependencies: ["transcript_output", "subtitle_vtt"],
      };
    case "visuals":
      return {
        code: "REGENERATE_VISUAL_PLACEMENTS",
        domain: "visuals",
        classification: "recoverable_with_regeneration",
        action: "Regenerate visual placements from the current transcript output and upstream script alignment.",
        reason: issue.message,
        priority: 300,
        automatic: true,
        issue_codes: [issue.code],
        artifact_dependencies: ["transcript_output", "visual_placements"],
      };
    case "audio_polish":
      switch (issue.observed_status) {
        case "missing":
        case "stale":
          return {
            code: "REGENERATE_AUDIO_POLISH",
            domain: "audio",
            classification: "recoverable_with_regeneration",
            action: "Regenerate audio polish from the current source media and preferred playback settings.",
            reason: issue.message,
            priority: 400,
            automatic: true,
            issue_codes: [issue.code],
            artifact_dependencies: ["audio_source", "audio_polish"],
          };
        case "failed":
          return {
            code: "REPAIR_AUDIO_POLISH_FAILURE",
            domain: "audio",
            classification: "requires_upstream_action",
            action: "Inspect the failed audio polish run, repair the source or runtime condition, then regenerate the prepared audio artifact.",
            reason: issue.message,
            priority: 410,
            automatic: false,
            issue_codes: [issue.code],
            artifact_dependencies: ["audio_source", "audio_polish"],
          };
        case "requires_future_ffmpeg":
          return {
            code: "ENABLE_FFMPEG_WORKING_AUDIO",
            domain: "audio",
            classification: "requires_upstream_action",
            action: "Enable FFmpeg-backed working audio for the current media, then rerun audio polish.",
            reason: issue.message,
            priority: 420,
            automatic: false,
            issue_codes: [issue.code],
            artifact_dependencies: ["audio_source", "audio_polish"],
          };
        case "unsupported":
          return {
            code: "SWITCH_TO_SUPPORTED_SOURCE_MEDIA",
            domain: "audio",
            classification: "incompatible",
            action: `Provide a supported source media kind instead of ${releasePrep.media_prep_outputs.audio.raw_source.kind ?? "unknown"} before rerunning prep.`,
            reason: issue.message,
            priority: 430,
            automatic: false,
            issue_codes: [issue.code],
            artifact_dependencies: ["audio_source"],
          };
      }
  }

  return {
    code: `RECOVER_${issue.code}`,
    domain: issue.affected_domain,
    classification: issue.observed_status === "incompatible"
      ? "incompatible"
      : issue.observed_status === "unsafe"
        ? "recoverable"
        : issue.observed_status === "failed" || issue.observed_status === "requires_future_ffmpeg"
          ? "requires_upstream_action"
          : "recoverable_with_regeneration",
    action: issue.remediation_code
      ? `Apply remediation ${issue.remediation_code} and re-evaluate the handoff authority.`
      : "Repair the declared issue and re-evaluate the handoff authority.",
    reason: issue.message,
    priority: issue.priority,
    automatic: false,
    issue_codes: [issue.code],
    artifact_dependencies: [],
  };
}

function buildDependsOnCodes(
  code: string,
  stepCodes: Set<string>,
): string[] {
  const dependsOn: string[] = [];

  if (
    (code === "REGENERATE_SUBTITLE_SRT"
      || code === "REGENERATE_SUBTITLE_VTT"
      || code === "REGENERATE_VISUAL_PLACEMENTS")
    && stepCodes.has("REGENERATE_TRANSCRIPT_OUTPUT")
  ) {
    dependsOn.push("REGENERATE_TRANSCRIPT_OUTPUT");
  }

  if (
    (code === "REGENERATE_TRANSCRIPT_OUTPUT"
      || code === "REGENERATE_SUBTITLE_SRT"
      || code === "REGENERATE_SUBTITLE_VTT"
      || code === "REGENERATE_VISUAL_PLACEMENTS"
      || code === "REGENERATE_AUDIO_POLISH"
      || code === "REPAIR_AUDIO_POLISH_FAILURE"
      || code === "ENABLE_FFMPEG_WORKING_AUDIO")
    && stepCodes.has("RESTORE_CANONICAL_RELEASE_IDENTITY")
  ) {
    dependsOn.push("RESTORE_CANONICAL_RELEASE_IDENTITY");
  }

  return dependsOn;
}

function buildArtifactDependencyReason(code: TongsReleaseRecoveryArtifactCode): {
  domain: TongsReleaseRecoveryDomain;
  reason: string;
} {
  switch (code) {
    case "target_identity":
      return { domain: "policy", reason: "Recovery needs a valid downstream target identity before any projection is trustworthy." };
    case "release_identity":
      return { domain: "metadata", reason: "Recovery depends on canonical persisted Hammer identity." };
    case "authority_schema":
      return { domain: "compatibility", reason: "Recovery cannot proceed until producer and consumer schema families are compatible." };
    case "structured_transcript":
      return { domain: "transcript", reason: "Transcript output regeneration depends on the persisted structured transcript artifact." };
    case "transcript_output":
      return { domain: "transcript", reason: "Subtitle and visual regeneration depend on the current downstream transcript output." };
    case "subtitle_srt":
      return { domain: "subtitles", reason: "SRT recovery depends on a regenerable SRT subtitle artifact." };
    case "subtitle_vtt":
      return { domain: "subtitles", reason: "VTT recovery depends on a regenerable VTT subtitle artifact." };
    case "visual_placements":
      return { domain: "visuals", reason: "Visual recovery depends on the visual placements artifact." };
    case "audio_source":
      return { domain: "audio", reason: "Audio recovery depends on the canonical source media." };
    case "audio_polish":
      return { domain: "audio", reason: "Audio recovery depends on the prepared audio polish artifact." };
  }
}

export function buildTongsReleaseRecoveryOrchestration(args: {
  authority: TongsReleaseHandoffAuthority;
  releasePrep: HammerReleasePrepPackage;
}): TongsReleaseRecoveryOrchestration {
  if (args.authority.status === "ready") {
    return {
      schema_version: RECOVERY_SCHEMA_VERSION,
      recovery_status: "not_needed",
      preview_allowed_during_recovery: true,
      publish_blocked_during_recovery: false,
      requires_upstream_prep: false,
      can_auto_recover: false,
      recovery_plan: [],
      recovery_blockers: [],
      artifact_dependencies: [],
    };
  }

  const issues = [...args.authority.blockers, ...args.authority.warnings]
    .sort((left, right) => left.priority - right.priority);
  const stepSeeds = new Map<string, RecoveryStepSeed>();

  for (const issue of issues) {
    const seed = mapIssueToRecoveryStep(issue, args.releasePrep);
    upsertStep(stepSeeds, seed);
  }

  let plan = [...stepSeeds.values()];
  const hasIncompatibleStep = plan.some((step) => step.classification === "incompatible");
  if (hasIncompatibleStep) {
    plan = plan.filter((step) => step.classification === "incompatible");
  } else if (args.authority.status === "unsafe") {
    plan = plan.filter((step) => step.classification !== "recoverable_with_regeneration");
  }

  const stepCodes = new Set(plan.map((step) => step.code));
  const recoveryPlan: TongsReleaseRecoveryPlanStep[] = plan
    .map((step) => ({
      code: step.code,
      domain: step.domain,
      classification: step.classification,
      action: step.action,
      reason: step.reason,
      priority: step.priority,
      automatic: step.automatic,
      issue_codes: [...step.issue_codes].sort(),
      depends_on: buildDependsOnCodes(step.code, stepCodes),
      artifact_dependencies: [...step.artifact_dependencies],
    }))
    .sort((left, right) => {
      const classificationDelta = classificationRank(left.classification) - classificationRank(right.classification);
      if (classificationDelta !== 0) return classificationDelta;
      if (left.priority !== right.priority) return left.priority - right.priority;
      return left.code.localeCompare(right.code);
    });

  const artifactDependencyMap = new Map<TongsReleaseRecoveryArtifactCode, TongsReleaseRecoveryArtifactDependency>();
  for (const step of recoveryPlan) {
    for (const code of step.artifact_dependencies) {
      const existing = artifactDependencyMap.get(code);
      if (existing) {
        existing.required_by = dedupe([...existing.required_by, step.code]).sort();
        continue;
      }
      const descriptor = buildArtifactDependencyReason(code);
      artifactDependencyMap.set(code, {
        code,
        domain: descriptor.domain,
        reason: descriptor.reason,
        required_by: [step.code],
      });
    }
  }

  const recoveryStatus: TongsReleaseRecoveryStatus = recoveryPlan.some((step) => step.classification === "incompatible")
    ? "incompatible"
    : recoveryPlan.some((step) => step.classification === "requires_upstream_action")
      ? "requires_upstream_action"
      : recoveryPlan.some((step) => step.classification === "recoverable_with_regeneration")
        ? "recoverable_with_regeneration"
        : recoveryPlan.length > 0
          ? "recoverable"
          : "not_needed";

  const recoveryBlockers = recoveryPlan
    .filter((step) => step.classification === "requires_upstream_action" || step.classification === "incompatible")
    .map((step) => ({
      code: step.code,
      classification: step.classification,
      reason: step.reason,
      issue_codes: [...step.issue_codes],
    }));

  const requiresUpstreamPrep = recoveryPlan.some((step) => (
    step.code === "REGENERATE_TRANSCRIPT_OUTPUT"
    || step.code === "REGENERATE_SUBTITLE_SRT"
    || step.code === "REGENERATE_SUBTITLE_VTT"
    || step.code === "REGENERATE_VISUAL_PLACEMENTS"
    || step.code === "REGENERATE_AUDIO_POLISH"
    || step.code === "REPAIR_AUDIO_POLISH_FAILURE"
    || step.code === "ENABLE_FFMPEG_WORKING_AUDIO"
    || step.code === "RESTORE_CANONICAL_RELEASE_IDENTITY"
    || step.code === "SWITCH_TO_SUPPORTED_SOURCE_MEDIA"
  ));
  const canAutoRecover = recoveryPlan.length > 0
    && recoveryPlan.every((step) => step.automatic)
    && recoveryStatus !== "incompatible";

  return {
    schema_version: RECOVERY_SCHEMA_VERSION,
    recovery_status: recoveryStatus,
    preview_allowed_during_recovery: args.authority.allow_preview,
    publish_blocked_during_recovery: args.authority.do_not_publish,
    requires_upstream_prep: requiresUpstreamPrep,
    can_auto_recover: canAutoRecover,
    recovery_plan: recoveryPlan,
    recovery_blockers: recoveryBlockers,
    artifact_dependencies: [...artifactDependencyMap.values()].sort((left, right) => left.code.localeCompare(right.code)),
  };
}
