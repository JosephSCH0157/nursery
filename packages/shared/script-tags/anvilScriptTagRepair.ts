import { normalizeScriptTags } from "./anvilScriptTagNormalizer.js";
import { validateScriptTags } from "./anvilScriptTagValidator.js";
import type { ScriptRepairResult, ScriptValidationCode } from "./anvilScriptTagTypes.js";

const INVISIBLE_CHARS_RE = /[\u200B-\u200D\uFEFF]/g;

function dedupeCodes(codes: ScriptValidationCode[]): ScriptValidationCode[] {
  return Array.from(new Set(codes));
}

function applySafeLineRepairs(text: string): string {
  let next = text;

  // [s1] text [/s1]  -> own-line speaker tags with body preserved
  next = next.replace(
    /^\s*\[(s1|s2|g1|g2)\]\s*([\s\S]*?)\s*\[\/\1\]\s*$/gim,
    (_m, speaker: string, body: string) => {
      const middle = String(body ?? "").trim();
      if (!middle) return `[${speaker.toLowerCase()}]\n[/${speaker.toLowerCase()}]`;
      return `[${speaker.toLowerCase()}]\n${middle}\n[/${speaker.toLowerCase()}]`;
    },
  );

  // [note] text [/note] -> own-line note tags if balanced on the same line
  next = next.replace(
    /^\s*\[note\]\s*([\s\S]*?)\s*\[\/note\]\s*$/gim,
    (_m, body: string) => {
      const middle = String(body ?? "").trim();
      if (!middle) return "[note]\n[/note]";
      return `[note]\n${middle}\n[/note]`;
    },
  );

  // Split obvious "tag + text" lines for speaker open tags
  next = next.replace(/^\s*(\[(?:s1|s2|g1|g2)\])\s+(.+)$/gim, (_m, open: string, body: string) => {
    return `${open.toLowerCase()}\n${String(body).trim()}`;
  });

  // Split obvious "text + close tag" lines for speaker close tags
  next = next.replace(/^(.+?)\s+(\[\/(?:s1|s2|g1|g2)\])\s*$/gim, (_m, body: string, close: string) => {
    return `${String(body).trim()}\n${close.toLowerCase()}`;
  });

  // Tighten spacing around structural tag boundaries
  next = next
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n+\[(\/?(?:s1|s2|g1|g2|note))\]\n+/gi, (_m, tag: string) => `\n[${String(tag).toLowerCase()}]\n`);

  return next;
}

export function repairScriptTags(input: string): ScriptRepairResult {
  const before = validateScriptTags(input);
  let text = normalizeScriptTags(input);
  text = text.replace(INVISIBLE_CHARS_RE, "");
  text = applySafeLineRepairs(text);
  text = normalizeScriptTags(text);

  const after = validateScriptTags(text);
  const beforeErrorCodes = before.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code);
  const afterErrorCodes = new Set(after.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code));
  const repairedIssues = dedupeCodes(beforeErrorCodes.filter((code) => !afterErrorCodes.has(code)));

  return {
    text,
    changed: text !== String(input ?? ""),
    repairedIssues,
    remainingIssues: after.issues,
  };
}
