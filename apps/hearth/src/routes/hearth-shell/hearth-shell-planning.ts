import type {
  HearthPlanningSession,
  HearthSessionOrigin,
} from "../../domain/hearth-session";
import { HEARTH_SESSION_SCHEMA } from "../../domain/hearth-session";
import type { BarStockSpark } from "../../lib/barstock-sparks";
import type { HearthOp } from "../../lib/hearth-ai-ops";
import { detectHearthScriptMutationIntent } from "../../lib/hearth-script-mutation";
import {
  isExplicitHearthFullScriptRequest,
  isExplicitHearthOutlineRequest,
} from "../../lib/hearth-writing-format";
import {
  evaluateHearthFormatOnlyPreservation,
} from "../../lib/hearth-format-only";
import type { ScriptValidationResult } from "@forge/shared/script-tags";
import { evaluateHearthScriptValidation } from "../../lib/hearth-script-tag-policy";
import {
  LEGACY_DRAFT_SCRIPT_PLACEHOLDER,
  SCRIPT_TAG_VALIDATOR_VERSION,
  type AiAutosaveReasonCode,
  type PendingAiProposal,
  type ProposalAutosaveReason,
  type ProposalSaveReasonCode,
} from "./hearth-shell-contracts";
import {
  buildSparkPreview,
  deriveSparkTitle,
  splitLines,
} from "./hearth-shell-formatting";
import { readTrimmedString } from "./hearth-shell-route";

export type ChatIntentSignals = {
  requestedOutline: boolean;
  requestedScript: boolean;
  explicitDraftNow: boolean;
  hasDeliverable: boolean;
  scriptMutationIntent: ReturnType<typeof detectHearthScriptMutationIntent>;
};

export function detectChatIntentSignals(text: string): ChatIntentSignals {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  const requestedOutline = isExplicitHearthOutlineRequest(normalized);
  const requestedScript = isExplicitHearthFullScriptRequest(normalized);
  const scriptMutationIntent = detectHearthScriptMutationIntent(normalized);
  const explicitDraftNow = /\bdraft now\b/.test(normalized)
    || /\bskip questions\b/.test(normalized)
    || /\bno questions\b/.test(normalized);
  const hasDeliverable = requestedOutline
    || requestedScript
    || scriptMutationIntent.targetsScriptBody
    || /\bbullet points?\b/.test(normalized)
    || /\bthumbnail\b/.test(normalized)
    || /\bseo\b/.test(normalized)
    || /\btags?\b/.test(normalized);
  return {
    requestedOutline,
    requestedScript,
    explicitDraftNow,
    hasDeliverable,
    scriptMutationIntent,
  };
}

export function detectAiAutosaveReasonCode(text: string): AiAutosaveReasonCode {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return "ai_rewrite";
  if (/\b(correct|repair|fix|tag audit|cleanup)\b/.test(normalized)) return "ai_repair";
  if (/\b(rewrite|improve|shorten|punch up|edit|revise|polish|tighten)\b/.test(normalized)) return "ai_rewrite";
  if (isExplicitHearthOutlineRequest(normalized)) return "ai_outline";
  if (isExplicitHearthFullScriptRequest(normalized)) return "ai_script";
  return "ai_rewrite";
}

export function readLatestOutlineFromOps(ops: HearthOp[]): string | null {
  for (let idx = ops.length - 1; idx >= 0; idx -= 1) {
    const op = ops[idx];
    if (op?.op !== "set_outline") continue;
    const outline = op.value.trim();
    return outline.length ? outline : null;
  }
  return null;
}

export function buildAssistantMessageContent(args: {
  assistantText: string;
  ops: HearthOp[];
  autosaveReasonCode: AiAutosaveReasonCode | null;
  scriptMutationRequested: boolean;
  scriptMutationReady: boolean;
}): string {
  const assistantText = args.assistantText.trim();
  const outlineFromOps = readLatestOutlineFromOps(args.ops);

  if (args.scriptMutationRequested && !args.scriptMutationReady) {
    if (assistantText) return assistantText;
    if (outlineFromOps) {
      return `No script changes made.\n\n${outlineFromOps}`;
    }
    return "No script changes made.";
  }

  if (args.autosaveReasonCode === "ai_outline") {
    if (outlineFromOps) {
      if (!assistantText) {
        return `I took a first pass at a bullet outline:\n${outlineFromOps}`;
      }
      if (assistantText.includes(outlineFromOps)) {
        return assistantText;
      }
      return `${assistantText}\n\n${outlineFromOps}`;
    }
  }

  if (assistantText) return assistantText;
  if (args.ops.length > 0) return "I took a first pass. Have a look and we can tighten it from there.";
  return "I’m ready when you are.";
}

export function toProposalAutosaveReason(
  reasonCode: ProposalSaveReasonCode,
): ProposalAutosaveReason {
  return `autosave:${reasonCode}`;
}

export function countProducerQuestions(text: string): number {
  const lines = splitLines(text);
  let count = 0;
  for (const line of lines) {
    if (/^\s*\d+[).]\s+/.test(line)) {
      count += 1;
    }
  }
  if (count > 0) return count;
  const fallback = text.match(/\?/g)?.length ?? 0;
  if (fallback <= 0) return 0;
  return Math.min(3, fallback);
}

export function reclassifyHearthFormatProposal(
  proposal: PendingAiProposal,
  body: string,
): PendingAiProposal {
  if (proposal.formatSourceBody === null) return proposal;
  const preservation = evaluateHearthFormatOnlyPreservation(proposal.formatSourceBody, body);
  return {
    ...proposal,
    proposalOrigin: preservation.preserved ? "format_only" : "user_editorial",
    autosaveReasonCode: preservation.preserved ? "format_only" : "user_editorial",
    formatChanges: preservation.changes,
  };
}

export function buildProjectDraftSeed(projectTitle: string, sparks: BarStockSpark[]): string {
  const normalizedTitle = projectTitle.trim() || "Untitled Project";
  const introLine = sparks[0] ? buildSparkPreview(sparks[0].body) : "";
  const pointBlocks = sparks.map((spark, index) => {
    const heading = deriveSparkTitle(spark);
    const body = spark.body.trim() || "(empty spark)";
    return `### Point ${index + 1}: ${heading}\n${body}`;
  });

  return [
    `# ${normalizedTitle}`,
    "",
    "## Intro",
    introLine ? `- ${introLine}` : "- Hook and frame the episode.",
    "",
    "## Key Points",
    ...(pointBlocks.length ? pointBlocks : ["- No project sparks were found yet."]),
    "",
    "## Close",
    "- Recap the main takeaway.",
    "- Give the listener one next step.",
    "",
  ].join("\n");
}

export function parsePlanningLines(text: string): string[] {
  return splitLines(text)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function deriveIntentFromOrigin(
  origin: HearthSessionOrigin | null | undefined,
): HearthPlanningSession["intent"] {
  if (!origin?.created_from) return undefined;
  return origin.created_from === "bar-stock" ? "from_spark" : "new_idea";
}

export function isLegacyDraftScriptPlaceholder(value: string | null | undefined): boolean {
  return readTrimmedString(value) === LEGACY_DRAFT_SCRIPT_PLACEHOLDER;
}

export function buildValidationReport(result: ScriptValidationResult): string {
  if (result.issues.length === 0) return "No issues.";
  return result.issues
    .map((issue) => `[line ${issue.line}, col ${issue.column}] ${issue.message}`)
    .join("\n");
}

export function buildPersistedValidationMeta(result: ScriptValidationResult) {
  return {
    ok: result.ok,
    issueCount: result.issues.length,
    issues: result.issues,
    validatorVersion: SCRIPT_TAG_VALIDATOR_VERSION,
    validatedAt: new Date().toISOString(),
  };
}

export function evaluateScriptValidation(rawText: string): {
  normalizedText: string;
  validation: ScriptValidationResult;
  tagMode: "absent" | "present";
} {
  return evaluateHearthScriptValidation(rawText);
}

export function isPlanningSessionEmpty(session: HearthPlanningSession | null): boolean {
  if (!session) return true;
  const hasTitle = Boolean(session.title && session.title.trim());
  const hasTitleVariants = Boolean(
    session.title_variants?.A?.trim()
    || session.title_variants?.B?.trim()
    || session.title_variants?.C?.trim(),
  );
  const hasGoals = (session.goals ?? []).length > 0;
  const hasOutline = (session.outline ?? []).length > 0;
  const hasDecisions = (session.decisions ?? []).length > 0;
  const hasAudience = Boolean(session.audience && session.audience.trim());
  const hasTone = Boolean(session.tone_preset && session.tone_preset.trim());
  const hasVisualProviderOverride = Boolean(session.visual_provider_override);
  return !(hasTitle || hasTitleVariants || hasGoals || hasOutline || hasDecisions || hasAudience || hasTone || hasVisualProviderOverride);
}

export function buildSessionFingerprint(session: HearthPlanningSession): string {
  return JSON.stringify({
    workpiece_id: session.workpiece_id ?? null,
    workspace_id: session.workspace_id ?? null,
    origin: session.origin ?? null,
    intent: session.intent ?? null,
    title: session.title ?? "",
    title_variants: session.title_variants ?? null,
    goals: session.goals ?? [],
    outline: session.outline ?? [],
    audience: session.audience ?? "",
    tone_preset: session.tone_preset ?? "",
    visual_provider_override: session.visual_provider_override ?? null,
    links: session.links ?? null,
    decisions: session.decisions ?? [],
  });
}

export function createPlanningSessionForEpisode(
  workpieceId: string,
  workspaceId: string | null,
): HearthPlanningSession {
  const nowIso = new Date().toISOString();
  return {
    schema: HEARTH_SESSION_SCHEMA,
    workpiece_id: workpieceId,
    workspace_id: workspaceId,
    created_at: nowIso,
    updated_at: nowIso,
    origin: null,
    intent: null,
    title: null,
    title_variants: null,
    goals: [],
    outline: [],
    audience: null,
    tone_preset: null,
    visual_provider_override: null,
    links: null,
    decisions: [],
  };
}
