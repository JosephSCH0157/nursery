import {
  NOTE_CLOSE_TAG,
  NOTE_OPEN_TAG,
  PACING_TAGS,
  SPEAKER_CLOSE_TAGS,
  SPEAKER_OPEN_TAGS,
  type ScriptValidationIssue,
  type ScriptValidationResult,
} from "./anvilScriptTagTypes";
import { normalizeScriptTags } from "./anvilScriptTagNormalizer";

function canonicalizeToken(raw: string): string {
  const inner = raw.slice(1, -1).trim().toLowerCase().replace(/\s+/g, " ");
  return `[${inner}]`;
}

function indexToLineColumn(lines: readonly string[], lineIndex: number, token: string): { line: number; column: number } {
  const line = lines[lineIndex] ?? "";
  const idx = Math.max(0, line.toLowerCase().indexOf(token.toLowerCase()));
  return { line: lineIndex + 1, column: idx + 1 };
}

function pushIssue(
  issues: ScriptValidationIssue[],
  issue: ScriptValidationIssue,
): void {
  issues.push(issue);
}

function expectedClose(openTag: string): string {
  if (openTag === "[s1]") return "[/s1]";
  if (openTag === "[s2]") return "[/s2]";
  if (openTag === "[g1]") return "[/g1]";
  return "[/g2]";
}

export function validateScriptTags(input: string): ScriptValidationResult {
  const normalizedText = normalizeScriptTags(input);
  const issues: ScriptValidationIssue[] = [];
  const lines = normalizedText.split("\n");

  const speakerStack: Array<{ tag: string; line: number; hasContent: boolean }> = [];
  const noteStack: Array<{ line: number }> = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;

    const rawTokens = line.match(/\[[^\]]+\]/g) ?? [];
    const tokens = rawTokens.map((raw) => canonicalizeToken(raw));

    for (let j = 0; j < rawTokens.length; j += 1) {
      const raw = rawTokens[j]!;
      const token = tokens[j]!;
      const position = indexToLineColumn(lines, i, raw);

      const isSpeakerOpen = (SPEAKER_OPEN_TAGS as readonly string[]).includes(token);
      const isSpeakerClose = (SPEAKER_CLOSE_TAGS as readonly string[]).includes(token);
      const isNote = token === NOTE_OPEN_TAG || token === NOTE_CLOSE_TAG;
      const isPacing = (PACING_TAGS as readonly string[]).includes(token);

      if (isSpeakerOpen || isSpeakerClose) {
        const normalizedLine = trimmed.toLowerCase().replace(/\s+/g, " ");
        if (normalizedLine !== token || rawTokens.length !== 1) {
          pushIssue(issues, {
            code: "SPEAKER_TAG_NOT_OWN_LINE",
            severity: "error",
            message: "Speaker tags must be on their own line.",
            line: position.line,
            column: position.column,
            tag: raw,
          });
        }
      }

      if (isNote) {
        const normalizedLine = trimmed.toLowerCase().replace(/\s+/g, " ");
        if (normalizedLine !== token || rawTokens.length !== 1) {
          pushIssue(issues, {
            code: "NOTE_TAG_NOT_OWN_LINE",
            severity: "error",
            message: "Note tags must be on their own line.",
            line: position.line,
            column: position.column,
            tag: raw,
          });
        }
      }

      if (!isSpeakerOpen && !isSpeakerClose && !isNote && !isPacing) {
        if (/^\[\/?(s\d+|g\d+|speaker\d*|guest\d*)\]$/i.test(token)) {
          pushIssue(issues, {
            code: "INVALID_SPEAKER_TAG",
            severity: "error",
            message: `Invalid speaker tag ${raw}.`,
            line: position.line,
            column: position.column,
            tag: raw,
          });
        } else if (/\bpause\b|\bbeat\b|\breflective\b/i.test(token)) {
          pushIssue(issues, {
            code: "INVALID_PACING_TOKEN",
            severity: "error",
            message: `Invalid pacing token ${raw}.`,
            line: position.line,
            column: position.column,
            tag: raw,
          });
        } else {
          pushIssue(issues, {
            code: "UNSUPPORTED_TAG",
            severity: "error",
            message: `Unsupported tag ${raw}.`,
            line: position.line,
            column: position.column,
            tag: raw,
          });
        }
        continue;
      }

      if (isPacing && speakerStack.length === 0) {
        pushIssue(issues, {
          code: "INVALID_PACING_TOKEN",
          severity: "error",
          message: `${raw} must appear inside a speaker block.`,
          line: position.line,
          column: position.column,
          tag: raw,
        });
      }

      if (isSpeakerOpen) {
        if (speakerStack.length > 0) {
          pushIssue(issues, {
            code: "CROSSED_TAGS",
            severity: "error",
            message: `Cannot open ${raw} before closing ${speakerStack[speakerStack.length - 1]!.tag}.`,
            line: position.line,
            column: position.column,
            tag: raw,
          });
        }
        speakerStack.push({ tag: token, line: i + 1, hasContent: false });
        continue;
      }

      if (isSpeakerClose) {
        const top = speakerStack[speakerStack.length - 1];
        if (!top) {
          pushIssue(issues, {
            code: "UNOPENED_CLOSING_TAG",
            severity: "error",
            message: `Closing tag ${raw} has no opener.`,
            line: position.line,
            column: position.column,
            tag: raw,
          });
          continue;
        }
        const expected = expectedClose(top.tag);
        if (token !== expected) {
          pushIssue(issues, {
            code: "CROSSED_TAGS",
            severity: "error",
            message: `Closing ${raw} crossed tags (expected ${expected}).`,
            line: position.line,
            column: position.column,
            tag: raw,
          });
          speakerStack.pop();
          continue;
        }
        if (!top.hasContent) {
          pushIssue(issues, {
            code: "EMPTY_SPEAKER_BLOCK",
            severity: "error",
            message: `Speaker block ${top.tag} is empty.`,
            line: top.line,
            column: 1,
            tag: top.tag,
          });
        }
        speakerStack.pop();
        continue;
      }

      if (token === NOTE_OPEN_TAG) {
        noteStack.push({ line: i + 1 });
        continue;
      }

      if (token === NOTE_CLOSE_TAG) {
        const top = noteStack[noteStack.length - 1];
        if (!top) {
          pushIssue(issues, {
            code: "UNOPENED_CLOSING_TAG",
            severity: "error",
            message: `Closing tag ${raw} has no opener.`,
            line: position.line,
            column: position.column,
            tag: raw,
          });
          continue;
        }
        noteStack.pop();
      }
    }

    const plainText = line.replace(/\[[^\]]+\]/g, "").trim();
    if (plainText.length > 0 && speakerStack.length === 0 && noteStack.length === 0) {
      pushIssue(issues, {
        code: "TEXT_OUTSIDE_SPEAKER_BLOCK",
        severity: "error",
        message: "Text must be inside a speaker block.",
        line: i + 1,
        column: Math.max(1, line.search(/\S/) + 1),
      });
    }
    if (plainText.length > 0 && speakerStack.length > 0) {
      speakerStack[speakerStack.length - 1]!.hasContent = true;
    }
    if (tokens.some((token) => (PACING_TAGS as readonly string[]).includes(token)) && speakerStack.length > 0) {
      speakerStack[speakerStack.length - 1]!.hasContent = true;
    }
  }

  for (const openSpeaker of speakerStack) {
    pushIssue(issues, {
      code: "UNCLOSED_TAG",
      severity: "error",
      message: `Unclosed tag ${openSpeaker.tag}.`,
      line: openSpeaker.line,
      column: 1,
      tag: openSpeaker.tag,
    });
  }
  for (const openNote of noteStack) {
    pushIssue(issues, {
      code: "UNCLOSED_TAG",
      severity: "error",
      message: `Unclosed tag ${NOTE_OPEN_TAG}.`,
      line: openNote.line,
      column: 1,
      tag: NOTE_OPEN_TAG,
    });
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
    normalizedText,
  };
}
