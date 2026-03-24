import type { ScriptValidationCode } from "./anvilScriptTagTypes.js";

export const SCRIPT_TAG_ERROR_GUIDE: Record<ScriptValidationCode, string> = {
  UNSUPPORTED_TAG: "Replace unsupported tags with canonical Anvil tags.",
  UNCLOSED_TAG: "Close every opened tag in the correct order.",
  UNOPENED_CLOSING_TAG: "Remove or move closing tags that do not have an opener.",
  CROSSED_TAGS: "Tag blocks must not cross; close the current block before opening another.",
  SPEAKER_TAG_NOT_OWN_LINE: "Speaker tags must be on dedicated lines.",
  NOTE_TAG_NOT_OWN_LINE: "Note tags must be on dedicated lines.",
  INVALID_SPEAKER_TAG: "Use only [s1], [s2], [g1], [g2] and matching closing tags.",
  INVALID_PACING_TOKEN: "Use only [pause], [beat], or [reflective pause] inside speaker blocks.",
  TEXT_OUTSIDE_SPEAKER_BLOCK: "All spoken text must live inside a speaker block.",
  EMPTY_SPEAKER_BLOCK: "Each speaker block must contain at least one text line or pacing cue.",
};

export function getScriptTagErrorGuide(code: ScriptValidationCode): string {
  return SCRIPT_TAG_ERROR_GUIDE[code];
}
