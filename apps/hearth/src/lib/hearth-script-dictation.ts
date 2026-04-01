export function normalizeVoiceTranscript(transcript: string): string {
  return transcript.replace(/\s+/g, " ").trim();
}

function clampCursor(cursorPosition: number | null | undefined, length: number): number {
  if (typeof cursorPosition !== "number" || Number.isNaN(cursorPosition)) {
    return length;
  }
  return Math.max(0, Math.min(length, cursorPosition));
}

function resolvePrefix(before: string, after: string): string {
  if (!before) return "";
  if (/\s$/.test(before)) return "";
  if (!after) return "\n\n";
  return " ";
}

function resolveSuffix(after: string): string {
  if (!after) return "";
  if (/^\s/.test(after)) return "";
  return " ";
}

export function insertVoiceTranscriptIntoScript(args: {
  body: string;
  transcript: string;
  cursorPosition?: number | null;
}): {
  body: string;
  cursorPosition: number;
} {
  const transcript = normalizeVoiceTranscript(args.transcript);
  const body = args.body ?? "";
  const insertAt = clampCursor(args.cursorPosition, body.length);
  if (!transcript) {
    return {
      body,
      cursorPosition: insertAt,
    };
  }

  const before = body.slice(0, insertAt);
  const after = body.slice(insertAt);
  const prefix = resolvePrefix(before, after);
  const suffix = resolveSuffix(after);
  const nextBody = `${before}${prefix}${transcript}${suffix}${after}`;

  return {
    body: nextBody,
    cursorPosition: (before + prefix + transcript).length,
  };
}
