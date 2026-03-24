import { normalizeScriptTags } from "@forge/shared/script-tags";

export function normalizeToStandardText(input = "") {
  return normalizeScriptTags(input);
}

export function fallbackNormalizeText(input = "") {
  return String(input ?? "")
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}
