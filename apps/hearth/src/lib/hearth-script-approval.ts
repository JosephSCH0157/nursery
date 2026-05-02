import type { Draft } from "../domain/draft";
import type { ScriptValidationResult } from "@forge/shared/script-tags";
import { shapeHearthScriptForRecording } from "./hearth-recording-ready-script";

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
  const recordingReadyText = shapeHearthScriptForRecording(args.draft.body);
  const { normalizedText, validation } = args.evaluateScriptValidation(recordingReadyText);
  return {
    draft: {
      ...args.draft,
      body: normalizedText,
      scriptValidationMeta: args.buildPersistedValidationMeta(validation),
    },
    scriptText: normalizedText,
    validation,
  };
}
