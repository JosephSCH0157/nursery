const SPEAKER_OPEN_TOKENS = ["[s1]", "[s2]", "[g1]", "[g2]"] as const;
const SPEAKER_CLOSE_TOKENS = ["[/s1]", "[/s2]", "[/g1]", "[/g2]"] as const;
const NOTE_OPEN_TOKEN = "[note]";
const NOTE_CLOSE_TOKEN = "[/note]";
const CUE_TOKENS = ["[pause]", "[beat]", "[reflective pause]"] as const;

type SpeakerToken = (typeof SPEAKER_OPEN_TOKENS)[number] | (typeof SPEAKER_CLOSE_TOKENS)[number];
type BlockToken = SpeakerToken | typeof NOTE_OPEN_TOKEN | typeof NOTE_CLOSE_TOKEN;

export type AnvilTagAudit = {
  speakerBlocksClosed: boolean;
  speakerTagsStandaloneLines: boolean;
  noteBlocksStandaloneLines: boolean;
  noCrossTagging: boolean;
  noUnknownTags: boolean;
  noForbiddenMarkup: boolean;
};

export type AnvilTagValidation = {
  ok: boolean;
  problems: string[];
  report: string;
  audit: AnvilTagAudit;
};

function normalizeNewlines(input: string): string {
  return input.replace(/\r\n?/g, "\n");
}

function canonicalizeToken(raw: string): string {
  const inner = raw.slice(1, -1).trim().toLowerCase().replace(/\s+/g, " ");
  return `[${inner}]`;
}

function isBlockToken(token: string): token is BlockToken {
  return (
    token === NOTE_OPEN_TOKEN
    || token === NOTE_CLOSE_TOKEN
    || (SPEAKER_OPEN_TOKENS as readonly string[]).includes(token)
    || (SPEAKER_CLOSE_TOKENS as readonly string[]).includes(token)
  );
}

function isSpeakerOpenToken(token: string): token is (typeof SPEAKER_OPEN_TOKENS)[number] {
  return (SPEAKER_OPEN_TOKENS as readonly string[]).includes(token);
}

function isSpeakerCloseToken(token: string): token is (typeof SPEAKER_CLOSE_TOKENS)[number] {
  return (SPEAKER_CLOSE_TOKENS as readonly string[]).includes(token);
}

function expectedCloseFor(token: (typeof SPEAKER_OPEN_TOKENS)[number]): (typeof SPEAKER_CLOSE_TOKENS)[number] {
  if (token === "[s1]") return "[/s1]";
  if (token === "[s2]") return "[/s2]";
  if (token === "[g1]") return "[/g1]";
  return "[/g2]";
}

function buildAuditFromProblems(problems: string[]): AnvilTagAudit {
  const includes = (chunk: string) => problems.some((item) => item.includes(chunk));
  return {
    speakerBlocksClosed: !includes("Unclosed") && !includes("Unexpected closing") && !includes("Mismatched closing"),
    speakerTagsStandaloneLines: !includes("Speaker tags must be on their own line"),
    noteBlocksStandaloneLines: !includes("[note] tags must be on their own line"),
    noCrossTagging: !includes("Mismatched closing") && !includes("[note] cannot be nested"),
    noUnknownTags: !includes("Unknown tag"),
    noForbiddenMarkup: !includes("Forbidden markup"),
  };
}

export function validateAnvilTagContract(input: string): AnvilTagValidation {
  const text = normalizeNewlines(String(input ?? ""));
  const problems: string[] = [];

  if (!text.trim()) {
    return {
      ok: true,
      problems: [],
      report: "No issues.",
      audit: {
        speakerBlocksClosed: true,
        speakerTagsStandaloneLines: true,
        noteBlocksStandaloneLines: true,
        noCrossTagging: true,
        noUnknownTags: true,
        noForbiddenMarkup: true,
      },
    };
  }

  const unknownTags = new Set<string>();
  const tagMatches = text.match(/\[[^\]]+\]/g) ?? [];
  for (const raw of tagMatches) {
    const token = canonicalizeToken(raw);
    const allowedCue = (CUE_TOKENS as readonly string[]).includes(token);
    if (!allowedCue && !isBlockToken(token)) {
      unknownTags.add(raw);
    }
  }
  for (const tag of unknownTags) {
    problems.push(`Unknown tag: ${tag}`);
  }

  if (/(^|\n)\s*#{1,6}\s+\S/.test(text)) {
    problems.push("Forbidden markup: Markdown headings are not allowed.");
  }
  if (/(^|\n)\s*\*\*[^*\n]{1,80}:\*\*/i.test(text)) {
    problems.push("Forbidden markup: Markdown speaker labels like **Brad:** are not allowed.");
  }
  if (/(^|\n)\s*(?:joe|brad|s1|s2|g1|g2)\s*:/i.test(text)) {
    problems.push("Forbidden markup: plain speaker labels like Joe: are not allowed.");
  }
  if (/(^|\n)\s*\((?:joe|brad|s1|s2|g1|g2)\s*:\)/i.test(text)) {
    problems.push("Forbidden markup: parenthesized speaker labels like (Joe:) are not allowed.");
  }
  if (/<\s*\/?\s*[a-z][^>]*>/i.test(text)) {
    problems.push("Forbidden markup: angle-bracket markup is not allowed.");
  }

  const lines = text.split("\n");
  const stack: BlockToken[] = [];

  for (let idx = 0; idx < lines.length; idx += 1) {
    const lineNo = idx + 1;
    const line = lines[idx] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;

    const rawTokens = line.match(/\[[^\]]+\]/g) ?? [];
    const normalizedTokens = rawTokens.map(canonicalizeToken);
    const blockTokensOnLine = normalizedTokens.filter(isBlockToken);

    if (blockTokensOnLine.length > 0) {
      if (
        blockTokensOnLine.length !== 1
        || normalizedTokens.length !== 1
        || trimmed.toLowerCase().replace(/\s+/g, " ") !== blockTokensOnLine[0]
      ) {
        const includesNote = blockTokensOnLine.includes(NOTE_OPEN_TOKEN) || blockTokensOnLine.includes(NOTE_CLOSE_TOKEN);
        if (includesNote) {
          problems.push(`[line ${lineNo}] [note] tags must be on their own line.`);
        } else {
          problems.push(`[line ${lineNo}] Speaker tags must be on their own line.`);
        }
        continue;
      }

      const token = blockTokensOnLine[0];
      if (token === NOTE_OPEN_TOKEN) {
        if (stack.length > 0) {
          problems.push(`[line ${lineNo}] [note] cannot be nested inside speaker blocks.`);
        }
        stack.push(token);
        continue;
      }

      if (token === NOTE_CLOSE_TOKEN) {
        const top = stack.pop();
        if (top !== NOTE_OPEN_TOKEN) {
          problems.push(`[line ${lineNo}] Unexpected closing [/note].`);
          if (top) stack.push(top);
        }
        continue;
      }

      if (isSpeakerOpenToken(token)) {
        if (stack.length > 0) {
          problems.push(`[line ${lineNo}] Speaker block cannot start while another block is open.`);
        }
        stack.push(token);
        continue;
      }

      if (isSpeakerCloseToken(token)) {
        const top = stack.pop();
        if (!top) {
          problems.push(`[line ${lineNo}] Unexpected closing ${token}.`);
          continue;
        }
        if (!isSpeakerOpenToken(top)) {
          problems.push(`[line ${lineNo}] Mismatched closing ${token} (expected ${NOTE_CLOSE_TOKEN}).`);
          continue;
        }
        const expected = expectedCloseFor(top);
        if (expected !== token) {
          problems.push(`[line ${lineNo}] Mismatched closing ${token} (expected ${expected}).`);
        }
        continue;
      }
    }

    const isCueOnly = (CUE_TOKENS as readonly string[]).includes(trimmed.toLowerCase().replace(/\s+/g, " "));
    if (stack.length === 0 && !isCueOnly) {
      problems.push(`[line ${lineNo}] Text must be inside [s1]/[s2]/[g1]/[g2] or [note] blocks.`);
    }
  }

  if (stack.length > 0) {
    const unclosed = stack.join(", ");
    problems.push(`Unclosed tag(s): ${unclosed}`);
  }

  const deduped = Array.from(new Set(problems));
  const audit = buildAuditFromProblems(deduped);
  return {
    ok: deduped.length === 0,
    problems: deduped,
    report: deduped.length ? deduped.join("\n") : "No issues.",
    audit,
  };
}

function normalizeSpeakerLabel(label: string): "[s1]" | "[s2]" | "[g1]" | "[g2]" {
  const normalized = label.trim().toLowerCase();
  if (normalized === "joe" || normalized === "s1") return "[s1]";
  if (normalized === "brad" || normalized === "s2") return "[s2]";
  if (normalized === "g1") return "[g1]";
  return "[g2]";
}

export function formatScriptToAnvilTagsNoAi(input: string): string {
  let text = normalizeNewlines(String(input ?? ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[’]/g, "'");

  text = text
    .replace(/\[\s*(s1|s2|g1|g2|note)\s*\]/gi, (_m, tag: string) => `[${tag.toLowerCase()}]`)
    .replace(/\[\s*\/\s*(s1|s2|g1|g2|note)\s*\]/gi, (_m, tag: string) => `[/${tag.toLowerCase()}]`)
    .replace(/\[\s*reflective\s+pause\s*\]/gi, "[reflective pause]");

  text = text
    .replace(/^(\s*)#{1,6}\s+/gm, "$1")
    .replace(/<\s*\/?\s*[a-z][^>]*>/gi, "");

  const lines = text.split("\n");
  const output: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      output.push("");
      continue;
    }

    const oneLineNote = trimmed.match(/^\[note\]\s*(.*?)\s*\[\/note\]$/i);
    if (oneLineNote) {
      output.push("[note]");
      if (oneLineNote[1]) output.push(oneLineNote[1]);
      output.push("[/note]");
      continue;
    }

    const markdownLabel = trimmed.match(/^\*\*(joe|brad|s1|s2|g1|g2)\s*:\*\*\s*(.*)$/i);
    const plainLabel = trimmed.match(/^(joe|brad|s1|s2|g1|g2)\s*:\s*(.*)$/i);
    const parenLabel = trimmed.match(/^\((joe|brad|s1|s2|g1|g2)\s*:\)\s*(.*)$/i);
    const labelMatch = markdownLabel ?? plainLabel ?? parenLabel;
    if (labelMatch) {
      const open = normalizeSpeakerLabel(labelMatch[1]);
      const close = expectedCloseFor(open);
      output.push(open);
      if (labelMatch[2]?.trim()) output.push(labelMatch[2].trim());
      output.push(close);
      continue;
    }

    const openAndText = trimmed.match(/^\[(s1|s2|g1|g2|note)\]\s*(.+)$/i);
    if (openAndText) {
      output.push(`[${openAndText[1].toLowerCase()}]`);
      output.push(openAndText[2]);
      continue;
    }

    const textAndClose = trimmed.match(/^(.+?)\s*\[\/(s1|s2|g1|g2|note)\]$/i);
    if (textAndClose) {
      output.push(textAndClose[1]);
      output.push(`[/${textAndClose[2].toLowerCase()}]`);
      continue;
    }

    output.push(trimmed);
  }

  const cleaned = output.join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned ? `${cleaned}\n` : "";
}

