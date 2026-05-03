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
const MAX_SPEAKER_SPOKEN_LINES = 3;
const DOT_PLACEHOLDER = "__HEARTH_DOT__";
const VALIDATION_LEAK_RE = /^(?:validation check:|all speaker tags\b|no block exceeds\b|no mixed speakers\b|pacing tokens used\b|no markdown\b|tag contract\b|self-check\b)/i;

export const HEARTH_RECORDING_READY_SCRIPT_INSTRUCTION = [
  "Recording-ready script rules:",
  "Write scripts as performance scores for Anvil, not essays.",
  "Use short readable spoken lines, intentional blank lines, and visible pacing cues.",
  "After each landed point, add [pause], [beat], or [reflective pause] on its own line.",
  "Keep speaker blocks stable for Anvil/ASR: up to 3 spoken lines plus one optional pacing cue per [s1]/[s2]/[g1]/[g2] block, then close and reopen the speaker.",
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
  const trimmed = protectSentenceDots(text.trim());
  if (trimmed.length <= TARGET_LINE_LENGTH) return [restoreSentenceDots(trimmed)];

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
  return (chunks.length ? chunks : [trimmed]).map(restoreSentenceDots);
}

function splitSpokenLine(line: string): string[] {
  const normalized = line
    .replace(/^\s*[-*]\s+/, "")
    .replace(/([.!?])\s+(["'”’])/g, "$1$2")
    .replace(/(["'“‘])\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];

  const protectedText = protectSentenceDots(normalized);
  const sentences = protectedText.match(/[^.!?]+[.!?]+(?:["'”’]+)?|[^.!?]+$/g) ?? [protectedText];
  return sentences
    .flatMap((sentence) => splitLongClause(restoreSentenceDots(sentence.trim())))
    .filter(Boolean);
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

function mergePacingCue(
  current: "[pause]" | "[beat]" | "[reflective pause]" | null,
  next: "[pause]" | "[beat]" | "[reflective pause]",
): "[pause]" | "[beat]" | "[reflective pause]" {
  if (!current) return next;
  const rank = {
    "[beat]": 1,
    "[pause]": 2,
    "[reflective pause]": 3,
  } as const;
  return rank[next] > rank[current] ? next : current;
}

function protectSentenceDots(text: string): string {
  return restoreSentenceDots(text)
    .replace(/\bU\.S\./g, `U${DOT_PLACEHOLDER}S${DOT_PLACEHOLDER}`)
    .replace(/\b([A-Z])\.([A-Z])\./g, (_match, a: string, b: string) => `${a}${DOT_PLACEHOLDER}${b}${DOT_PLACEHOLDER}`)
    .replace(/\b(vs?|mr|mrs|ms|dr|prof|sen|rep|gov|st|jr|sr)\./gi, (_match, abbr: string) => `${abbr}${DOT_PLACEHOLDER}`)
    .replace(/(\d)\.(\d)/g, `$1${DOT_PLACEHOLDER}$2`);
}

function restoreSentenceDots(text: string): string {
  return text.replaceAll(DOT_PLACEHOLDER, ".");
}

function isPacingLine(line: string): boolean {
  return PACING_RE.test(line.trim());
}

function shouldDropSpokenLine(line: string): boolean {
  return VALIDATION_LEAK_RE.test(line.trim());
}

function previousSignificantLine(lines: string[]): string | null {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (line) return line;
  }
  return null;
}

function compactRecordingReadyLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      pushIntentionalBlank(out);
      continue;
    }
    if (isPacingLine(line) && isPacingLine(previousSignificantLine(out) ?? "")) {
      continue;
    }
    out.push(line);
  }
  while (out[0] === "") out.shift();
  while (out[out.length - 1] === "") out.pop();
  return out;
}

function pruneCueOnlySpeakerBlocks(lines: string[]): string[] {
  const out: string[] = [];
  let block: string[] | null = null;

  function blockHasSpokenContent(candidate: string[]): boolean {
    return candidate.some((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (SPEAKER_OPEN_RE.test(trimmed) || SPEAKER_CLOSE_RE.test(trimmed)) return false;
      if (PACING_RE.test(trimmed)) return false;
      return true;
    });
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (SPEAKER_OPEN_RE.test(trimmed) && block == null) {
      block = [line];
      continue;
    }
    if (block) {
      block.push(line);
      if (SPEAKER_CLOSE_RE.test(trimmed)) {
        if (blockHasSpokenContent(block)) {
          out.push(...block);
        } else {
          pushIntentionalBlank(out);
        }
        block = null;
      }
      continue;
    }
    out.push(line);
  }

  if (block && blockHasSpokenContent(block)) out.push(...block);
  return compactRecordingReadyLines(out);
}

export function shapeHearthScriptForRecording(input: string): string {
  const normalized = normalizeScriptTags(wrapPlainScriptForJoe(input));
  const lines = normalized.split(/\r?\n/);
  const out: string[] = [];
  let insideSpeaker = false;
  let insideNote = false;
  let activeSpeaker: "s1" | "s2" | "g1" | "g2" | null = null;
  let speakerSpokenLineCount = 0;
  let pendingPacingCue: "[pause]" | "[beat]" | "[reflective pause]" | null = null;

  function flushPendingPacingCue(addBlank = true): void {
    if (!insideSpeaker || !activeSpeaker || speakerSpokenLineCount === 0 || !pendingPacingCue) {
      pendingPacingCue = null;
      return;
    }
    if (!isPacingLine(previousSignificantLine(out) ?? "")) {
      out.push(pendingPacingCue);
    }
    pendingPacingCue = null;
    if (addBlank) pushIntentionalBlank(out);
  }

  function closeActiveSpeakerBlock(): void {
    if (!activeSpeaker || !insideSpeaker) return;
    flushPendingPacingCue();
    pushIntentionalBlank(out);
    out.push(`[/${activeSpeaker}]`);
    insideSpeaker = false;
    speakerSpokenLineCount = 0;
    pendingPacingCue = null;
  }

  function reopenActiveSpeakerBlock(): void {
    if (!activeSpeaker) return;
    pushIntentionalBlank(out);
    out.push(`[${activeSpeaker}]`);
    insideSpeaker = true;
    speakerSpokenLineCount = 0;
    pendingPacingCue = null;
  }

  function rotateSpeakerBlockIfNeeded(requiredSpokenLines = 1): void {
    if (!insideSpeaker || !activeSpeaker || speakerSpokenLineCount === 0) return;
    if (speakerSpokenLineCount + requiredSpokenLines <= MAX_SPEAKER_SPOKEN_LINES) return;
    closeActiveSpeakerBlock();
    reopenActiveSpeakerBlock();
  }

  function pushSpeakerContentLine(line: string): boolean {
    if (shouldDropSpokenLine(line)) return false;
    if (isPacingLine(line) && (speakerSpokenLineCount === 0 || isPacingLine(previousSignificantLine(out) ?? ""))) {
      return false;
    }
    if (isPacingLine(line)) {
      pendingPacingCue = mergePacingCue(pendingPacingCue, line.toLowerCase() as "[pause]" | "[beat]" | "[reflective pause]");
      return true;
    }
    rotateSpeakerBlockIfNeeded(1);
    out.push(line);
    if (insideSpeaker && activeSpeaker && !insideNote) {
      speakerSpokenLineCount += 1;
    }
    return true;
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushPendingPacingCue();
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
      speakerSpokenLineCount = 0;
      pendingPacingCue = null;
      continue;
    }
    if (SPEAKER_CLOSE_RE.test(tagLine)) {
      flushPendingPacingCue();
      pushIntentionalBlank(out);
      out.push(tagLine.toLowerCase());
      insideSpeaker = false;
      activeSpeaker = null;
      speakerSpokenLineCount = 0;
      pendingPacingCue = null;
      continue;
    }
    if (NOTE_OPEN_RE.test(tagLine)) {
      flushPendingPacingCue();
      pushIntentionalBlank(out);
      out.push("[note]");
      insideNote = true;
      if (insideSpeaker && activeSpeaker) speakerSpokenLineCount += 1;
      continue;
    }
    if (NOTE_CLOSE_RE.test(tagLine)) {
      out.push("[/note]");
      insideNote = false;
      if (insideSpeaker && activeSpeaker) {
        speakerSpokenLineCount += 1;
      }
      pushIntentionalBlank(out);
      continue;
    }
    if (PACING_RE.test(tagLine)) {
      if (insideSpeaker) {
        pushSpeakerContentLine(tagLine.toLowerCase());
        flushPendingPacingCue();
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
    if (shouldDropSpokenLine(trimmed)) {
      continue;
    }

    for (const spokenLine of splitSpokenLine(trimmed)) {
      const shouldAddPacingCue = insideSpeaker && isLandedPoint(spokenLine);
      const pushedSpoken = pushSpeakerContentLine(spokenLine);
      if (pushedSpoken && shouldAddPacingCue) {
        pushSpeakerContentLine(choosePacingCue(spokenLine));
      }
    }
  }

  flushPendingPacingCue();

  const shaped = normalizeScriptTags(pruneCueOnlySpeakerBlocks(compactRecordingReadyLines(out)).join("\n"));
  const shapedValidation = validateScriptTags(shaped);
  if (shapedValidation.ok) return shapedValidation.normalizedText.trim();

  const repaired = repairScriptTags(shaped);
  const repairedValidation = validateScriptTags(repaired.text);
  return repairedValidation.ok ? repairedValidation.normalizedText.trim() : repaired.text.trim();
}
