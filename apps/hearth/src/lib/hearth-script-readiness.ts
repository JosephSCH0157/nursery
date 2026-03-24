import type { ScriptCompletionBadge, ComposeSetup } from "../domain/compose";

export interface ScriptReadinessResult {
  ready: boolean;
  reasons: string[];
}

export function getScriptReadiness(input: {
  hasScriptText: boolean;
  tagValidationOk: boolean;
  composeSetup: ComposeSetup | null;
  contentValidationOk: boolean;
  completionBadge: ScriptCompletionBadge | null;
}): ScriptReadinessResult {
  const reasons: string[] = [];
  if (!input.hasScriptText) reasons.push("Script is empty.");
  if (!input.tagValidationOk) reasons.push("Script tags are invalid.");
  if (!input.contentValidationOk) reasons.push("Composition mode requirements are not met.");
  if (input.composeSetup?.mode === "outline_by_speaker" && input.completionBadge === "outline_draft") {
    reasons.push("Outline mode is not approval-ready.");
  }
  return { ready: reasons.length === 0, reasons };
}
