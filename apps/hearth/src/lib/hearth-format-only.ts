import { shapeHearthScriptForRecording } from "./hearth-recording-ready-script";

export type HearthFormatOnlyChangeCategory =
  | "words"
  | "capitalization"
  | "punctuation"
  | "sentence_boundaries"
  | "speaker_identity"
  | "tags"
  | "notes"
  | "cues";

export type HearthFormatOnlyPreservationResult = {
  preserved: boolean;
  changes: HearthFormatOnlyChangeCategory[];
};

const SPEAKER_OPEN_RE = /^\[(s1|s2|g1|g2)\]$/i;
const SPEAKER_CLOSE_RE = /^\[\/(s1|s2|g1|g2)\]$/i;
const CUE_RE = /^\[(pause|beat|reflective pause)\]$/i;
const NOTE_OPEN_RE = /^\[note\]$/i;
const NOTE_CLOSE_RE = /^\[\/note\]$/i;
const TOKEN_RE = /\[[^\]\r\n]+\]|[\p{L}\p{N}_]+(?:[’'][\p{L}\p{N}_]+)*|[^\s\p{L}\p{N}_]/gu;

type SemanticToken = {
  value: string;
  kind: "word" | "punctuation" | "tag" | "cue";
  speaker: string | null;
  inNote: boolean;
  ordinal: number;
};

function tokenize(value: string): SemanticToken[] {
  const rawTokens = value.match(TOKEN_RE) ?? [];
  const result: SemanticToken[] = [];
  let speaker: string | null = null;
  let inNote = false;
  let ordinal = 0;
  for (const rawToken of rawTokens) {
    const open = rawToken.match(SPEAKER_OPEN_RE);
    if (open) {
      speaker = open[1].toLowerCase();
      continue;
    }
    const close = rawToken.match(SPEAKER_CLOSE_RE);
    if (close) {
      if (speaker === close[1].toLowerCase()) speaker = null;
      continue;
    }
    const isCue = CUE_RE.test(rawToken);
    const isTag = /^\[.*\]$/.test(rawToken);
    const kind: SemanticToken["kind"] = isCue
      ? "cue"
      : isTag
        ? "tag"
        : /^[\p{L}\p{N}_]/u.test(rawToken)
          ? "word"
          : "punctuation";
    result.push({ value: rawToken, kind, speaker, inNote, ordinal });
    ordinal += 1;
    if (NOTE_OPEN_RE.test(rawToken)) inNote = true;
    if (NOTE_CLOSE_RE.test(rawToken)) inNote = false;
  }
  return result;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function signature(tokens: SemanticToken[], predicate: (token: SemanticToken) => boolean) {
  return tokens.filter(predicate).map((token) => ({
    value: token.value,
    speaker: token.speaker,
    ordinal: token.ordinal,
  }));
}

export function evaluateHearthFormatOnlyPreservation(
  source: string,
  result: string,
): HearthFormatOnlyPreservationResult {
  const sourceTokens = tokenize(source);
  const resultTokens = tokenize(result);
  const changes: HearthFormatOnlyChangeCategory[] = [];

  const sourceWords = sourceTokens.filter((token) => token.kind === "word").map((token) => token.value);
  const resultWords = resultTokens.filter((token) => token.kind === "word").map((token) => token.value);
  if (!same(sourceWords.map((word) => word.toLocaleLowerCase()), resultWords.map((word) => word.toLocaleLowerCase()))) {
    changes.push("words");
  } else if (!same(sourceWords, resultWords)) {
    changes.push("capitalization");
  }

  const sourcePunctuation = sourceTokens.filter((token) => token.kind === "punctuation").map((token) => ({ value: token.value, ordinal: token.ordinal }));
  const resultPunctuation = resultTokens.filter((token) => token.kind === "punctuation").map((token) => ({ value: token.value, ordinal: token.ordinal }));
  if (!same(sourcePunctuation, resultPunctuation)) changes.push("punctuation");
  if (!same(
    sourcePunctuation.filter((token) => /[.!?]/.test(token.value)),
    resultPunctuation.filter((token) => /[.!?]/.test(token.value)),
  )) changes.push("sentence_boundaries");

  const content = (tokens: SemanticToken[]) => tokens
    .filter((token) => token.kind === "word" || token.kind === "punctuation" || token.kind === "cue" || token.kind === "tag")
    .map((token) => token.speaker);
  if (!same(content(sourceTokens), content(resultTokens))) changes.push("speaker_identity");

  if (!same(signature(sourceTokens, (token) => token.kind === "tag"), signature(resultTokens, (token) => token.kind === "tag"))) {
    changes.push("tags");
  }
  if (!same(signature(sourceTokens, (token) => token.kind === "cue"), signature(resultTokens, (token) => token.kind === "cue"))) {
    changes.push("cues");
  }
  if (!same(
    sourceTokens.filter((token) => token.inNote || NOTE_OPEN_RE.test(token.value) || NOTE_CLOSE_RE.test(token.value)).map((token) => token.value),
    resultTokens.filter((token) => token.inNote || NOTE_OPEN_RE.test(token.value) || NOTE_CLOSE_RE.test(token.value)).map((token) => token.value),
  )) changes.push("notes");

  return { preserved: changes.length === 0, changes };
}

export function buildHearthFormatOnlyPreview(source: string): {
  source: string;
  formatted: string;
  preservation: HearthFormatOnlyPreservationResult;
} {
  const formatted = shapeHearthScriptForRecording(source);
  return {
    source,
    formatted,
    preservation: evaluateHearthFormatOnlyPreservation(source, formatted),
  };
}

export function formatHearthPreservationChanges(changes: readonly HearthFormatOnlyChangeCategory[]): string {
  return changes.map((change) => change.replace(/_/g, " ")).join(", ");
}

export function confirmHearthUserEditorialTransition(args: {
  source: string;
  result: string;
  action: "apply" | "approve";
  confirm: (message: string) => boolean;
}): boolean {
  const preservation = evaluateHearthFormatOnlyPreservation(args.source, args.result);
  if (preservation.preserved) return true;
  const verb = args.action === "approve" ? "Approve and publish" : "Apply";
  return args.confirm(
    `This preview is no longer formatting-only. User editorial changes were detected in: ${formatHearthPreservationChanges(preservation.changes)}.\n\n${verb} these user-authored editorial changes?`,
  );
}
