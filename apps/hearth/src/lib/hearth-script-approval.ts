import type { Draft } from "../domain/draft";
import type { ScriptValidationResult } from "@forge/shared/script-tags";

// The existing Tongs review/commit wire representation, not recording layout.
// Preserve tags, internal/trailing whitespace, and the presence of a final LF.
export function canonicalHearthApprovalText(value: string): string {
  return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").normalize("NFC");
}

export type HearthApprovedScriptReplacement = {
  draft: Draft;
  scriptText: string;
  validation: ScriptValidationResult;
};

export function buildHearthApprovedScriptReplacement(args: {
  draft: Draft;
  evaluateScriptValidation: (rawText: string) => {
    normalizedText: string;
    validation: ScriptValidationResult;
  };
  buildPersistedValidationMeta: (validation: ScriptValidationResult) => Draft["scriptValidationMeta"];
}): HearthApprovedScriptReplacement {
  const scriptText = canonicalHearthApprovalText(args.draft.body);
  // Validation may return a normalized preview. It must never replace the
  // reviewed bytes. Deliberate formatting belongs before a fresh review.
  const { validation } = args.evaluateScriptValidation(scriptText);
  return {
    draft: {
      ...args.draft,
      body: scriptText,
      scriptValidationMeta: args.buildPersistedValidationMeta(validation),
    },
    scriptText,
    validation,
  };
}
