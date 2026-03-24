import { validateScriptTags } from "@forge/shared/script-tags";

export function validateTags(text: string) {
  const result = validateScriptTags(text);
  return result.issues.map((issue) => ({
    line: issue.line,
    msg: issue.message,
  }));
}
