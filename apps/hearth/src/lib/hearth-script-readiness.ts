import type { ScriptCompletionBadge, ComposeSetup } from "../domain/compose";

export interface ScriptReadinessResult {
  ready: boolean;
  reasons: string[];
}

type ScriptReadinessInput = {
  hasScriptText: boolean;
  tagValidationOk: boolean;
  composeSetup: ComposeSetup | null;
  contentValidationOk: boolean;
  completionBadge: ScriptCompletionBadge | null;
};

function collectScriptReadinessReasons(
  input: ScriptReadinessInput,
  options?: { allowOutlineDraftHandoff?: boolean },
): string[] {
  const reasons: string[] = [];
  if (!input.hasScriptText) reasons.push("Script is empty.");
  if (!input.tagValidationOk) reasons.push("Script tags are invalid.");
  if (!input.contentValidationOk) reasons.push("Composition mode requirements are not met.");
  if (
    !options?.allowOutlineDraftHandoff
    && input.composeSetup?.mode === "outline_by_speaker"
    && input.completionBadge === "outline_draft"
  ) {
    reasons.push("Outline mode is not approval-ready.");
  }
  return reasons;
}

export function getScriptReadiness(input: ScriptReadinessInput): ScriptReadinessResult {
  const reasons = collectScriptReadinessReasons(input);
  return { ready: reasons.length === 0, reasons };
}

export function getScriptHandoffReadiness(input: ScriptReadinessInput): ScriptReadinessResult {
  const reasons = collectScriptReadinessReasons(input, { allowOutlineDraftHandoff: true });
  return { ready: reasons.length === 0, reasons };
}
