export type ScriptValidationSeverity = "error" | "warning";

export type ScriptValidationCode =
  | "UNSUPPORTED_TAG"
  | "UNCLOSED_TAG"
  | "UNOPENED_CLOSING_TAG"
  | "CROSSED_TAGS"
  | "SPEAKER_TAG_NOT_OWN_LINE"
  | "NOTE_TAG_NOT_OWN_LINE"
  | "INVALID_SPEAKER_TAG"
  | "INVALID_PACING_TOKEN"
  | "TEXT_OUTSIDE_SPEAKER_BLOCK"
  | "EMPTY_SPEAKER_BLOCK";

export interface ScriptValidationIssue {
  code: ScriptValidationCode;
  severity: ScriptValidationSeverity;
  message: string;
  line: number;
  column: number;
  tag?: string;
}

export interface ScriptValidationResult {
  ok: boolean;
  issues: ScriptValidationIssue[];
  normalizedText: string;
}

export interface ScriptRepairResult {
  text: string;
  changed: boolean;
  repairedIssues: ScriptValidationCode[];
  remainingIssues: ScriptValidationIssue[];
}

export const SPEAKER_OPEN_TAGS = ["[s1]", "[s2]", "[g1]", "[g2]"] as const;
export const SPEAKER_CLOSE_TAGS = ["[/s1]", "[/s2]", "[/g1]", "[/g2]"] as const;
export const NOTE_OPEN_TAG = "[note]";
export const NOTE_CLOSE_TAG = "[/note]";
export const PACING_TAGS = ["[pause]", "[beat]", "[reflective pause]"] as const;

export const ALL_CANONICAL_TAGS = [
  ...SPEAKER_OPEN_TAGS,
  ...SPEAKER_CLOSE_TAGS,
  NOTE_OPEN_TAG,
  NOTE_CLOSE_TAG,
  ...PACING_TAGS,
] as const;
