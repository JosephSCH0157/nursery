import type { HammerReleasePrepPackage } from "../../../hammer/src/lib/hammerReleasePrepPackage";
import type {
  HammerPersistenceSnapshot,
  HammerPersistenceTarget,
} from "../../../hammer/src/persistence/hammerPersistenceContract";
import type { TongsReleaseHandoffAuthority } from "./tongsReleaseHandoffAuthority";
import type {
  TongsReleaseRecoveryArtifactCode,
  TongsReleaseRecoveryDomain,
  TongsReleaseRecoveryOrchestration,
  TongsReleaseRecoveryPlanStep,
} from "./tongsReleaseRecoveryOrchestration";

export type TongsReleaseOperatorExecutionStatus =
  | "not_needed"
  | "auto_recoverable"
  | "operator_triggerable"
  | "requires_upstream_action"
  | "incompatible";

export type TongsReleaseOperatorExecutionKind =
  | Exclude<TongsReleaseOperatorExecutionStatus, "not_needed">;

export type TongsReleaseOperatorActionEligibility =
  | "eligible"
  | "blocked"
  | "not_executable";

export type TongsReleaseOperatorMachineActionType =
  | "refresh_transcript_output"
  | "regenerate_subtitle_srt"
  | "regenerate_subtitle_vtt"
  | "regenerate_visual_placements"
  | "regenerate_audio_polish"
  | "inspect_audio_failure"
  | "enable_ffmpeg_working_audio"
  | "align_release_target"
  | "restore_canonical_release_identity"
  | "switch_to_supported_source_media"
  | "upgrade_release_handoff_schema"
  | "manual_recovery";

export type TongsReleaseOperatorAttemptResult =
  | "succeeded"
  | "failed"
  | "blocked";

export interface TongsReleaseOperatorExecutionPrerequisite {
  kind: "step" | "artifact" | "runtime";
  code: string;
  satisfied: boolean;
  detail: string;
}

export interface TongsReleaseOperatorActionBlocker {
  code: string;
  detail: string;
  dependency_code: string | null;
}

export interface TongsReleaseOperatorActionStep {
  action_id: string;
  step_code: string;
  domain: TongsReleaseRecoveryDomain;
  human_label: string;
  machine_action_type: TongsReleaseOperatorMachineActionType;
  execution_kind: TongsReleaseOperatorExecutionKind;
  eligibility: TongsReleaseOperatorActionEligibility;
  action: string;
  reason: string;
  priority: number;
  automatic: boolean;
  preview_safe: boolean;
  requires_upstream_prep: boolean;
  issue_codes: string[];
  depends_on: string[];
  artifact_dependencies: TongsReleaseRecoveryArtifactCode[];
  prerequisites: TongsReleaseOperatorExecutionPrerequisite[];
  blocked_by: TongsReleaseOperatorActionBlocker[];
}

export interface TongsReleaseOperatorExecutionAttempt {
  attempt_id: string;
  action_id: string;
  step_code: string;
  attempted_at: string;
  actor_id: string | null;
  actor_label: string | null;
  result: TongsReleaseOperatorAttemptResult;
  detail: string;
}

export interface TongsReleaseOperatorBlockedReason {
  code: string;
  detail: string;
  step_codes: string[];
}

export interface TongsReleaseOperatorExecution {
  schema_version: 1;
  execution_status: TongsReleaseOperatorExecutionStatus;
  actionable_steps: TongsReleaseOperatorActionStep[];
  attempted_steps: TongsReleaseOperatorExecutionAttempt[];
  last_attempt_at: string | null;
  last_attempt_result: TongsReleaseOperatorAttemptResult | null;
  last_attempt_detail: string | null;
  can_execute_recovery: boolean;
  operator_actions_blocked_by: TongsReleaseOperatorBlockedReason[];
}

const EXECUTION_SCHEMA_VERSION = 1;

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

  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ]
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
}

function unique<T>(values: T[]): T[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function buildActionId(snapshotId: string, stepCode: string): string {
  return `rxe1_${cyrb128Hex(`${snapshotId}:${stepCode}`).slice(0, 24)}`;
}

function getExecutionKind(
  step: TongsReleaseRecoveryPlanStep,
): TongsReleaseOperatorExecutionKind {
  switch (step.code) {
    case "REGENERATE_SUBTITLE_SRT":
    case "REGENERATE_SUBTITLE_VTT":
    case "REGENERATE_VISUAL_PLACEMENTS":
    case "REGENERATE_AUDIO_POLISH":
      return "operator_triggerable";
    case "REGENERATE_TRANSCRIPT_OUTPUT":
      return "auto_recoverable";
    case "REPAIR_AUDIO_POLISH_FAILURE":
    case "ENABLE_FFMPEG_WORKING_AUDIO":
    case "ALIGN_RELEASE_TARGET":
    case "RESTORE_CANONICAL_RELEASE_IDENTITY":
      return "requires_upstream_action";
    case "SWITCH_TO_SUPPORTED_SOURCE_MEDIA":
    case "UPGRADE_RELEASE_HANDOFF_SCHEMA":
      return "incompatible";
    default:
      switch (step.classification) {
        case "incompatible":
          return "incompatible";
        case "requires_upstream_action":
          return "requires_upstream_action";
        default:
          return step.automatic ? "auto_recoverable" : "requires_upstream_action";
      }
  }
}

function getMachineActionType(
  step: TongsReleaseRecoveryPlanStep,
): TongsReleaseOperatorMachineActionType {
  switch (step.code) {
    case "REGENERATE_TRANSCRIPT_OUTPUT":
      return "refresh_transcript_output";
    case "REGENERATE_SUBTITLE_SRT":
      return "regenerate_subtitle_srt";
    case "REGENERATE_SUBTITLE_VTT":
      return "regenerate_subtitle_vtt";
    case "REGENERATE_VISUAL_PLACEMENTS":
      return "regenerate_visual_placements";
    case "REGENERATE_AUDIO_POLISH":
      return "regenerate_audio_polish";
    case "REPAIR_AUDIO_POLISH_FAILURE":
      return "inspect_audio_failure";
    case "ENABLE_FFMPEG_WORKING_AUDIO":
      return "enable_ffmpeg_working_audio";
    case "ALIGN_RELEASE_TARGET":
      return "align_release_target";
    case "RESTORE_CANONICAL_RELEASE_IDENTITY":
      return "restore_canonical_release_identity";
    case "SWITCH_TO_SUPPORTED_SOURCE_MEDIA":
      return "switch_to_supported_source_media";
    case "UPGRADE_RELEASE_HANDOFF_SCHEMA":
      return "upgrade_release_handoff_schema";
    default:
      return "manual_recovery";
  }
}

function getHumanLabel(step: TongsReleaseRecoveryPlanStep): string {
  switch (step.code) {
    case "REGENERATE_TRANSCRIPT_OUTPUT":
      return "Refresh transcript output";
    case "REGENERATE_SUBTITLE_SRT":
      return "Regenerate SRT subtitles";
    case "REGENERATE_SUBTITLE_VTT":
      return "Regenerate VTT subtitles";
    case "REGENERATE_VISUAL_PLACEMENTS":
      return "Regenerate visual placements";
    case "REGENERATE_AUDIO_POLISH":
      return "Regenerate audio polish";
    case "REPAIR_AUDIO_POLISH_FAILURE":
      return "Inspect audio polish failure";
    case "ENABLE_FFMPEG_WORKING_AUDIO":
      return "Enable FFmpeg working audio";
    case "ALIGN_RELEASE_TARGET":
      return "Align release target";
    case "RESTORE_CANONICAL_RELEASE_IDENTITY":
      return "Restore canonical release identity";
    case "SWITCH_TO_SUPPORTED_SOURCE_MEDIA":
      return "Switch to supported source media";
    case "UPGRADE_RELEASE_HANDOFF_SCHEMA":
      return "Upgrade release handoff schema";
    default:
      return step.action;
  }
}

function getRequiredInputArtifacts(
  step: TongsReleaseRecoveryPlanStep,
): TongsReleaseRecoveryArtifactCode[] {
  switch (step.code) {
    case "REGENERATE_TRANSCRIPT_OUTPUT":
      return ["structured_transcript"];
    case "REGENERATE_SUBTITLE_SRT":
    case "REGENERATE_SUBTITLE_VTT":
    case "REGENERATE_VISUAL_PLACEMENTS":
      return ["transcript_output"];
    case "REGENERATE_AUDIO_POLISH":
    case "REPAIR_AUDIO_POLISH_FAILURE":
    case "ENABLE_FFMPEG_WORKING_AUDIO":
      return ["audio_source"];
    case "ALIGN_RELEASE_TARGET":
      return ["target_identity", "release_identity"];
    default:
      return [];
  }
}

function artifactIsAvailable(
  code: TongsReleaseRecoveryArtifactCode,
  args: {
    target: HammerPersistenceTarget;
    snapshot: HammerPersistenceSnapshot;
    authority: TongsReleaseHandoffAuthority;
    releasePrep: HammerReleasePrepPackage;
  },
): boolean {
  switch (code) {
    case "target_identity":
      return Boolean(args.target.workspaceId.trim() && args.target.workpieceId.trim());
    case "release_identity":
      return Boolean(
        (args.releasePrep.identity.workspace_id ?? args.snapshot.state?.workspace_id)?.trim()
        && (args.releasePrep.identity.workpiece_id ?? args.snapshot.state?.workpiece_id)?.trim(),
      );
    case "authority_schema":
      return args.snapshot.schema_version === 1
        && args.releasePrep.schema_version === 1
        && args.authority.schema_version === 1;
    case "structured_transcript":
      return Boolean(args.snapshot.structured_transcript.data?.segments.length);
    case "transcript_output":
      return Boolean(
        args.releasePrep.text_outputs
        && args.releasePrep.text_outputs.resolved_output.segment_count > 0
        && args.releasePrep.text_outputs.resolved_output.full_text.trim(),
      );
    case "subtitle_srt":
      return args.releasePrep.readiness.subtitles.srt === "ready";
    case "subtitle_vtt":
      return args.releasePrep.readiness.subtitles.vtt === "ready";
    case "visual_placements":
      return args.releasePrep.readiness.visuals === "ready";
    case "audio_source":
      return Boolean(
        args.snapshot.editor_session.data?.workspace_mapping?.local_root_abs?.trim()
        && args.snapshot.editor_session.data?.media_ref?.local_relpath?.trim(),
      );
    case "audio_polish":
      return args.releasePrep.readiness.audio_polish === "ready";
  }
}

function buildRuntimePrerequisites(
  step: TongsReleaseRecoveryPlanStep,
  releasePrep: HammerReleasePrepPackage,
): TongsReleaseOperatorExecutionPrerequisite[] {
  if (step.code !== "REGENERATE_AUDIO_POLISH") {
    return [];
  }

  const audioPlan = releasePrep.media_backbone.audio_polish_plan;
  const executable = audioPlan?.executable ?? false;
  return [{
    kind: "runtime",
    code: "audio_polish_runtime",
    satisfied: executable,
    detail: executable
      ? "Audio polish runtime is available for direct operator execution."
      : audioPlan?.detail ?? "Audio polish runtime is not available for direct operator execution.",
  }];
}

function buildPrerequisites(
  step: TongsReleaseRecoveryPlanStep,
  args: {
    target: HammerPersistenceTarget;
    snapshot: HammerPersistenceSnapshot;
    authority: TongsReleaseHandoffAuthority;
    releasePrep: HammerReleasePrepPackage;
  },
): TongsReleaseOperatorExecutionPrerequisite[] {
  const stepPrerequisites = step.depends_on.map((dependency) => ({
    kind: "step" as const,
    code: dependency,
    satisfied: false,
    detail: `Complete ${dependency} before ${step.code} can execute.`,
  }));

  const artifactPrerequisites = getRequiredInputArtifacts(step).map((code) => ({
    kind: "artifact" as const,
    code,
    satisfied: artifactIsAvailable(code, args),
    detail: artifactIsAvailable(code, args)
      ? `${code} is available for ${step.code}.`
      : `${code} is missing or stale, so ${step.code} cannot execute yet.`,
  }));

  return [
    ...stepPrerequisites,
    ...artifactPrerequisites,
    ...buildRuntimePrerequisites(step, args.releasePrep),
  ];
}

function buildBlockedBy(
  step: TongsReleaseRecoveryPlanStep,
  executionKind: TongsReleaseOperatorExecutionKind,
  prerequisites: TongsReleaseOperatorExecutionPrerequisite[],
): TongsReleaseOperatorActionBlocker[] {
  const blockers: TongsReleaseOperatorActionBlocker[] = [];

  if (executionKind === "auto_recoverable") {
    blockers.push({
      code: "AUTO_RECOVERY_ONLY",
      detail: "This recovery step is derived from existing prep state and is not triggered directly from Tongs.",
      dependency_code: null,
    });
  }

  if (executionKind === "requires_upstream_action") {
    blockers.push({
      code: "UPSTREAM_ACTION_REQUIRED",
      detail: "This recovery step requires upstream Hammer work or operator intervention outside direct Tongs execution.",
      dependency_code: null,
    });
  }

  if (executionKind === "incompatible") {
    blockers.push({
      code: "INCOMPATIBLE_RECOVERY_STEP",
      detail: "This recovery step is incompatible and cannot be executed until the handoff contract changes.",
      dependency_code: null,
    });
  }

  for (const prerequisite of prerequisites) {
    if (prerequisite.satisfied) continue;
    blockers.push({
      code: prerequisite.kind === "step"
        ? "STEP_DEPENDENCY_PENDING"
        : prerequisite.kind === "artifact"
          ? "ARTIFACT_DEPENDENCY_MISSING"
          : "RUNTIME_PREREQUISITE_MISSING",
      detail: prerequisite.detail,
      dependency_code: prerequisite.code,
    });
  }

  return blockers;
}

function buildExecutionStatus(
  recovery: TongsReleaseRecoveryOrchestration,
  steps: TongsReleaseOperatorActionStep[],
): TongsReleaseOperatorExecutionStatus {
  if (recovery.recovery_status === "not_needed") return "not_needed";
  if (recovery.recovery_status === "incompatible") return "incompatible";
  if (steps.some((step) => step.execution_kind === "requires_upstream_action")) {
    return "requires_upstream_action";
  }
  if (steps.some((step) => step.execution_kind === "operator_triggerable")) {
    return "operator_triggerable";
  }
  return "auto_recoverable";
}

function compareAttempts(
  left: TongsReleaseOperatorExecutionAttempt,
  right: TongsReleaseOperatorExecutionAttempt,
): number {
  if (left.attempted_at !== right.attempted_at) {
    return left.attempted_at.localeCompare(right.attempted_at);
  }
  if (left.action_id !== right.action_id) {
    return left.action_id.localeCompare(right.action_id);
  }
  return left.attempt_id.localeCompare(right.attempt_id);
}

export function buildTongsReleaseOperatorExecution(args: {
  target: HammerPersistenceTarget;
  snapshot: HammerPersistenceSnapshot;
  authority: TongsReleaseHandoffAuthority;
  releasePrep: HammerReleasePrepPackage;
  recovery: TongsReleaseRecoveryOrchestration;
  attempts?: TongsReleaseOperatorExecutionAttempt[] | null;
}): TongsReleaseOperatorExecution {
  const attemptedSteps = [...(args.attempts ?? [])].sort(compareAttempts);
  const lastAttempt = attemptedSteps.at(-1) ?? null;

  if (args.recovery.recovery_status === "not_needed") {
    return {
      schema_version: EXECUTION_SCHEMA_VERSION,
      execution_status: "not_needed",
      actionable_steps: [],
      attempted_steps: attemptedSteps,
      last_attempt_at: lastAttempt?.attempted_at ?? null,
      last_attempt_result: lastAttempt?.result ?? null,
      last_attempt_detail: lastAttempt?.detail ?? null,
      can_execute_recovery: false,
      operator_actions_blocked_by: [],
    };
  }

  const actionableSteps = args.recovery.recovery_plan.map((step) => {
    const executionKind = getExecutionKind(step);
    const prerequisites = buildPrerequisites(step, args);
    const blockedBy = buildBlockedBy(step, executionKind, prerequisites);
    const eligibility: TongsReleaseOperatorActionEligibility = executionKind !== "operator_triggerable"
      ? "not_executable"
      : blockedBy.length > 0
        ? "blocked"
        : "eligible";

    return {
      action_id: buildActionId(args.authority.snapshot_id, step.code),
      step_code: step.code,
      domain: step.domain,
      human_label: getHumanLabel(step),
      machine_action_type: getMachineActionType(step),
      execution_kind: executionKind,
      eligibility,
      action: step.action,
      reason: step.reason,
      priority: step.priority,
      automatic: step.automatic,
      preview_safe: args.recovery.preview_allowed_during_recovery,
      requires_upstream_prep: executionKind !== "operator_triggerable",
      issue_codes: [...step.issue_codes],
      depends_on: [...step.depends_on],
      artifact_dependencies: [...step.artifact_dependencies],
      prerequisites,
      blocked_by: blockedBy,
    };
  });

  const blockedReasonMap = new Map<string, TongsReleaseOperatorBlockedReason>();

  for (const step of actionableSteps) {
    for (const blocker of step.blocked_by) {
      const key = `${blocker.code}:${blocker.detail}`;
      const existing = blockedReasonMap.get(key);
      if (existing) {
        existing.step_codes = unique([...existing.step_codes, step.step_code]).sort();
        continue;
      }
      blockedReasonMap.set(key, {
        code: blocker.code,
        detail: blocker.detail,
        step_codes: [step.step_code],
      });
    }
  }

  return {
    schema_version: EXECUTION_SCHEMA_VERSION,
    execution_status: buildExecutionStatus(args.recovery, actionableSteps),
    actionable_steps: actionableSteps,
    attempted_steps: attemptedSteps,
    last_attempt_at: lastAttempt?.attempted_at ?? null,
    last_attempt_result: lastAttempt?.result ?? null,
    last_attempt_detail: lastAttempt?.detail ?? null,
    can_execute_recovery: actionableSteps.length > 0
      && actionableSteps.every((step) => (
        step.execution_kind === "operator_triggerable" && step.eligibility === "eligible"
      )),
    operator_actions_blocked_by: [...blockedReasonMap.values()].sort((left, right) => {
      if (left.code !== right.code) return left.code.localeCompare(right.code);
      return left.detail.localeCompare(right.detail);
    }),
  };
}
