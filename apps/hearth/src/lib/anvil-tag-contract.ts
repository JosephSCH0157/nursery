import {
  normalizeScriptTags,
  repairScriptTags,
  validateScriptTags,
  type ScriptValidationResult,
} from "@forge/shared/script-tags";

export type AnvilTagAudit = {
  speakerBlocksClosed: boolean;
  speakerTagsStandaloneLines: boolean;
  noteBlocksStandaloneLines: boolean;
  noCrossTagging: boolean;
  noUnknownTags: boolean;
  noForbiddenMarkup: boolean;
};

export type AnvilTagValidation = {
  ok: boolean;
  problems: string[];
  report: string;
  audit: AnvilTagAudit;
  result: ScriptValidationResult;
};

function mapValidationToProblems(result: ScriptValidationResult): string[] {
  return result.issues.map((issue) => `[line ${issue.line}, col ${issue.column}] ${issue.message}`);
}

function buildAudit(result: ScriptValidationResult): AnvilTagAudit {
  const has = (code: ScriptValidationResult["issues"][number]["code"]) => {
    return result.issues.some((issue) => issue.code === code && issue.severity === "error");
  };
  return {
    speakerBlocksClosed: !has("UNCLOSED_TAG") && !has("UNOPENED_CLOSING_TAG"),
    speakerTagsStandaloneLines: !has("SPEAKER_TAG_NOT_OWN_LINE"),
    noteBlocksStandaloneLines: !has("NOTE_TAG_NOT_OWN_LINE"),
    noCrossTagging: !has("CROSSED_TAGS"),
    noUnknownTags: !has("UNSUPPORTED_TAG") && !has("INVALID_SPEAKER_TAG"),
    noForbiddenMarkup: true,
  };
}

export function validateAnvilTagContract(input: string): AnvilTagValidation {
  const normalized = normalizeScriptTags(input);
  const result = validateScriptTags(normalized);
  const problems = mapValidationToProblems(result);
  return {
    ok: result.ok,
    problems,
    report: problems.length ? problems.join("\n") : "No issues.",
    audit: buildAudit(result),
    result,
  };
}

export function formatScriptToAnvilTagsNoAi(input: string): string {
  const normalized = normalizeScriptTags(input);
  const repaired = repairScriptTags(normalized);
  return repaired.text;
}
