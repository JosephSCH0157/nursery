import type { ScriptValidationResult } from "@forge/shared/script-tags";

export interface ScriptReadinessResult {
  ready: boolean;
  reasons: string[];
}

export function getScriptReadiness(input: {
  validation: ScriptValidationResult;
  hasScriptText: boolean;
}): ScriptReadinessResult {
  const reasons: string[] = [];
  if (!input.hasScriptText) reasons.push("Script is empty.");
  if (!input.validation.ok) reasons.push("Script tags are invalid.");
  return { ready: reasons.length === 0, reasons };
}
