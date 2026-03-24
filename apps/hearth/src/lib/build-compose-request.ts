import type { ComposeScriptRequest, ComposeSetup } from "../domain/compose";

interface BuildComposeRequestInput {
  setup: ComposeSetup;
  sourceText: string;
  existingDraftText?: string;
}

export function buildComposeScriptRequest(input: BuildComposeRequestInput): ComposeScriptRequest {
  return {
    setup: input.setup,
    sourceText: input.sourceText,
    ...(typeof input.existingDraftText === "string" ? { existingDraftText: input.existingDraftText } : {}),
  };
}
