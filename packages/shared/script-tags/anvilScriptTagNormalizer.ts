import { ALL_CANONICAL_TAGS } from "./anvilScriptTagTypes.js";

const PACE_ALIAS_TO_CANONICAL: Record<string, string> = {
  "[reflective-pause]": "[reflective pause]",
  "[reflective_pause]": "[reflective pause]",
};

function canonicalizeBracketToken(raw: string): string {
  const inner = raw.slice(1, -1).trim().toLowerCase().replace(/\s+/g, " ");
  return `[${inner}]`;
}

function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n?/g, "\n");
}

function normalizeKnownTags(text: string): string {
  return text.replace(/\[[^\]]+\]/g, (raw) => {
    const canonical = canonicalizeBracketToken(raw);
    if ((ALL_CANONICAL_TAGS as readonly string[]).includes(canonical)) {
      return canonical;
    }
    const mappedPace = PACE_ALIAS_TO_CANONICAL[canonical];
    if (mappedPace) return mappedPace;
    return raw;
  });
}

export function normalizeScriptTags(input: string): string {
  let text = normalizeLineEndings(String(input ?? ""));
  text = normalizeKnownTags(text);
  text = text.replace(/[ \t]+$/gm, "");
  if (text.length > 0 && !text.endsWith("\n")) {
    text += "\n";
  }
  return text;
}
