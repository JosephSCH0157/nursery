import {
  normalizeScriptTags,
  repairScriptTags,
  validateScriptTags,
} from "@forge/shared/script-tags";

const SPEAKER_OPEN_RE = /^\[(s1|s2|g1|g2)\]$/i;
const SPEAKER_CLOSE_RE = /^\[\/(s1|s2|g1|g2)\]$/i;
const NOTE_OPEN_RE = /^\[note\]$/i;
const NOTE_CLOSE_RE = /^\[\/note\]$/i;
const PACING_RE = /^\[(pause|beat|reflective pause)\]$/i;
const PAREN_PACING_RE = /^\((pause|beat|reflective pause)\)$/i;
const TAG_TOKEN_RE = /^\[[^\]\n]+\]$/;
const TARGET_LINE_LENGTH = 76;
const MAX_SPEAKER_CONTENT_LINES = 3;

export const HEARTH_RECORDING_READY_SCRIPT_INSTRUCTION = [
  "Recording-ready script rules:",
  "Write scripts as performance scores for Anvil, not essays.",
  "Use short readable spoken lines, intentional blank lines, and visible pacing cues.",
  "After each landed point, add [pause], [beat], or [reflective pause] on its own line.",
  "Keep speaker blocks short: maximum 3 content lines per [s1]/[s2]/[g1]/[g2] block, then close and reopen the speaker.",
  "Keep [s1], [s2], [g1], [g2] and their closing tags on their own lines.",
  "Use [s1] for Joe and [s2] for Brad.",
  "Keep [note]...[/note] hidden notes valid; pacing cues remain visible inside speaker blocks.",
].join(" ");

function canonicalizeTagLine(line: string): string {
  const trimmed = line.trim();
  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (SPEAKER_OPEN_RE.test(normalized)) return normalized;
  if (SPEAKER_CLOSE_RE.test(normalized)) return normalized;
  if (NOTE_OPEN_RE.test(normalized)) return "[note]";
  if (NOTE_CLOSE_RE.test(normalized)) return "[/note]";
  if (PACING_RE.test(normalized)) return normalized;
  const pacing = trimmed.match(PAREN_PACING_RE)?.[1]?.toLowerCase().replace(/\s+/g, " ");
  return pacing ? `[${pacing}]` : trimmed;
}

function hasSpeakerTags(text: string): boolean {
  return /^\[(?:s1|s2|g1|g2)\]$/im.test(text);
}

function wrapPlainScriptForJoe(text: string): string {
  const body = text.trim();
  if (!body || hasSpeakerTags(body)) return text;
  return `[s1]\n${body}\n[/s1]`;
}

function splitLongClause(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= TARGET_LINE_LENGTH) return [trimmed];

  const chunks: string[] = [];
  let remaining = trimmed;
  while (remaining.length > TARGET_LINE_LENGTH) {
    const windowText = remaining.slice(0, TARGET_LINE_LENGTH + 1);
    const cutAt = Math.max(
      windowText.lastIndexOf(", "),
      windowText.lastIndexOf("; "),
      windowText.lastIndexOf(": "),
      windowText.lastIndexOf(" - "),
      windowText.lastIndexOf(" "),
    );
    if (cutAt <= 24) break;
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks.length ? chunks : [trimmed];
}

function splitSpokenLine(line: string): string[] {
  const normalized = line
    .replace(/^\s*[-*]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?]+[.!?]+(?:["']+)?|[^.!?]+$/g) ?? [normalized];
  return sentences.flatMap((sentence) => splitLongClause(sentence.trim())).filter(Boolean);
}

function isLandedPoint(line: string): boolean {
  return /[.!?]["']?$/.test(line.trim());
}

function choosePacingCue(line: string): "[pause]" | "[beat]" | "[reflective pause]" {
  const normalized = line.toLowerCase();
  if (/\b(reflect|remember|imagine|sit with|what if|why this matters)\b/.test(normalized)) {
    return "[reflective pause]";
  }
  if (/[?]$/.test(line.trim())) return "[beat]";
  if (line.length > 88 || /\b(the point|what matters|because|but|so)\b/.test(normalized)) {
    return "[pause]";
  }
  return "[beat]";
}

function pushIntentionalBlank(out: string[]): void {
  if (out[out.length - 1] !== "") out.push("");
}

function compactRecordingReadyLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      pushIntentionalBlank(out);
      continue;
    }
    out.push(line);
  }
  while (out[0] === "") out.shift();
  while (out[out.length - 1] === "") out.pop();
  return out;
}

export function shapeHearthScriptForRecording(input: string): string {
  const normalized = normalizeScriptTags(wrapPlainScriptForJoe(input));
  const lines = normalized.split(/\r?\n/);
  const out: string[] = [];
  let insideSpeaker = false;
  let insideNote = false;
  let activeSpeaker: "s1" | "s2" | "g1" | "g2" | null = null;
  let speakerContentLineCount = 0;

  function closeActiveSpeakerBlock(): void {
    if (!activeSpeaker || !insideSpeaker) return;
    pushIntentionalBlank(out);
    out.push(`[/${activeSpeaker}]`);
    insideSpeaker = false;
    speakerContentLineCount = 0;
  }

  function reopenActiveSpeakerBlock(): void {
    if (!activeSpeaker) return;
    pushIntentionalBlank(out);
    out.push(`[${activeSpeaker}]`);
    insideSpeaker = true;
    speakerContentLineCount = 0;
  }

  function rotateSpeakerBlockIfNeeded(requiredContentLines: number): void {
    if (!insideSpeaker || !activeSpeaker || speakerContentLineCount === 0) return;
    if (speakerContentLineCount + requiredContentLines <= MAX_SPEAKER_CONTENT_LINES) return;
    closeActiveSpeakerBlock();
    reopenActiveSpeakerBlock();
  }

  function pushSpeakerContentLine(line: string, requiredContentLines = 1): void {
    rotateSpeakerBlockIfNeeded(requiredContentLines);
    out.push(line);
    if (insideSpeaker && activeSpeaker && !insideNote) {
      speakerContentLineCount += 1;
    }
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      pushIntentionalBlank(out);
      continue;
    }

    const tagLine = canonicalizeTagLine(trimmed);
    if (SPEAKER_OPEN_RE.test(tagLine)) {
      if (activeSpeaker && insideSpeaker) {
        closeActiveSpeakerBlock();
      }
      pushIntentionalBlank(out);
      const speaker = tagLine.slice(1, -1).toLowerCase() as "s1" | "s2" | "g1" | "g2";
      out.push(`[${speaker}]`);
      insideSpeaker = true;
      activeSpeaker = speaker;
      speakerContentLineCount = 0;
      continue;
    }
    if (SPEAKER_CLOSE_RE.test(tagLine)) {
      pushIntentionalBlank(out);
      out.push(tagLine.toLowerCase());
      insideSpeaker = false;
      activeSpeaker = null;
      speakerContentLineCount = 0;
      continue;
    }
    if (NOTE_OPEN_RE.test(tagLine)) {
      rotateSpeakerBlockIfNeeded(1);
      pushIntentionalBlank(out);
      out.push("[note]");
      insideNote = true;
      if (insideSpeaker && activeSpeaker) speakerContentLineCount += 1;
      continue;
    }
    if (NOTE_CLOSE_RE.test(tagLine)) {
      out.push("[/note]");
      insideNote = false;
      if (insideSpeaker && activeSpeaker) speakerContentLineCount += 1;
      pushIntentionalBlank(out);
      continue;
    }
    if (PACING_RE.test(tagLine)) {
      if (insideSpeaker) {
        pushSpeakerContentLine(tagLine.toLowerCase());
        pushIntentionalBlank(out);
      }
      continue;
    }
    if (TAG_TOKEN_RE.test(tagLine)) {
      out.push(tagLine);
      continue;
    }
    if (insideNote) {
      out.push(rawLine.trimEnd());
      continue;
    }

    for (const spokenLine of splitSpokenLine(trimmed)) {
      const shouldAddPacingCue = insideSpeaker && isLandedPoint(spokenLine);
      pushSpeakerContentLine(spokenLine, shouldAddPacingCue ? 2 : 1);
      if (shouldAddPacingCue) {
        pushSpeakerContentLine(choosePacingCue(spokenLine));
        pushIntentionalBlank(out);
      }
    }
  }

  const shaped = normalizeScriptTags(compactRecordingReadyLines(out).join("\n"));
  const shapedValidation = validateScriptTags(shaped);
  if (shapedValidation.ok) return shapedValidation.normalizedText.trim();

  const repaired = repairScriptTags(shaped);
  const repairedValidation = validateScriptTags(repaired.text);
  return repairedValidation.ok ? repairedValidation.normalizedText.trim() : repaired.text.trim();
}
