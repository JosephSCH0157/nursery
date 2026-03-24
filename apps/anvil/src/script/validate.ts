import { validateScriptTags } from "@forge/shared/script-tags";

export function validateStandardTagsText(input = "") {
  const result = validateScriptTags(input);
  const problems = result.issues.map((issue) => `[line ${issue.line}, col ${issue.column}] ${issue.message}`);
  return {
    ok: result.ok,
    report: problems.join("\n"),
    problems,
    issues: result.issues,
    normalizedText: result.normalizedText,
  };
}
