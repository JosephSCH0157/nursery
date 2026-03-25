import {
  normalizeScriptTags,
  repairScriptTags,
  validateScriptTags,
  type ScriptValidationResult,
} from "@forge/shared/script-tags";

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
  result: ScriptValidationResult;
};

function mapValidationToProblems(result: ScriptValidationResult): string[] {
  return result.issues.map((issue) => `[line ${issue.line}, col ${issue.column}] ${issue.message}`);
}

function detectForbiddenMarkupProblems(input: string): string[] {
  const lines = input.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^\*\*[^*]+:\*\*/.test(trimmed)) {
      out.push(`[line ${i + 1}, col 1] Forbidden markup: markdown speaker label.`);
      continue;
    }
    if (/^\([^)]*:\)/.test(trimmed)) {
      out.push(`[line ${i + 1}, col 1] Forbidden markup: parenthetical speaker label.`);
      continue;
    }
    if (/^#{1,6}\s+/.test(trimmed)) {
      out.push(`[line ${i + 1}, col 1] Forbidden markup: markdown heading token.`);
    }
  }
  return out;
}

function stripInlineStyleTags(input: string): string {
  return input
    .replace(/\[\/?(?:b|i|u)\]/gi, "")
    .replace(/\[\/?note\]/gi, "")
    .replace(/\[color=[^\]]+\]/gi, "")
    .replace(/\[\/color\]/gi, "")
    .replace(/\[bg=[^\]]+\]/gi, "")
    .replace(/\[\/bg\]/gi, "");
}

function buildAudit(result: ScriptValidationResult): AnvilTagAudit {
  const has = (code: ScriptValidationResult["issues"][number]["code"]) => {
    return result.issues.some((issue) => issue.code === code && issue.severity === "error");
  };
  return {
    speakerBlocksClosed: !has("UNCLOSED_TAG") && !has("UNOPENED_CLOSING_TAG"),
    speakerTagsStandaloneLines: !has("SPEAKER_TAG_NOT_OWN_LINE"),
    noteBlocksStandaloneLines: !has("NOTE_TAG_NOT_OWN_LINE"),
    noCrossTagging: !has("CROSSED_TAGS"),
    noUnknownTags: !has("UNSUPPORTED_TAG") && !has("INVALID_SPEAKER_TAG"),
    noForbiddenMarkup: true,
  };
}

function resolveLegacySpeakerTag(rawLabel: string): "[s1]" | "[s2]" | null {
  const normalized = rawLabel.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "joe" || normalized === "host 1" || normalized === "host1" || normalized === "s1") {
    return "[s1]";
  }
  if (normalized === "brad" || normalized === "host 2" || normalized === "host2" || normalized === "s2") {
    return "[s2]";
  }
  return null;
}

function preprocessLegacyScript(input: string): string {
  const lines = input.split(/\r?\n/);
  const out: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      out.push("");
      continue;
    }

    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch?.[1]) {
      out.push(headingMatch[1].trim());
      continue;
    }

    const pacingMatch = line.match(/^\((pause|beat|reflective pause)\)$/i);
    if (pacingMatch?.[1]) {
      const pacing = pacingMatch[1].toLowerCase();
      out.push(`[${pacing}]`);
      continue;
    }

    const inlineCanonicalSpeaker = line.match(/^\[(s1|s2|g1|g2)\]\s+(.+)$/i);
    if (inlineCanonicalSpeaker?.[1] && inlineCanonicalSpeaker[2]) {
      const tag = `[${inlineCanonicalSpeaker[1].toLowerCase()}]` as "[s1]" | "[s2]" | "[g1]" | "[g2]";
      const closeTag = `[/${inlineCanonicalSpeaker[1].toLowerCase()}]`;
      out.push(tag);
      out.push(inlineCanonicalSpeaker[2].trim());
      out.push(closeTag);
      continue;
    }

    const markdownSpeaker = line.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
    const parenSpeaker = line.match(/^\(([^)]+):\)\s*(.*)$/);
    const plainSpeaker = line.match(/^([A-Za-z][A-Za-z0-9 _-]{0,40}):\s*(.*)$/);
    const speakerMatch = markdownSpeaker ?? parenSpeaker ?? plainSpeaker;
    if (speakerMatch?.[1]) {
      const speakerTag = resolveLegacySpeakerTag(speakerMatch[1]);
      if (speakerTag) {
        const text = (speakerMatch[2] ?? "").trim();
        out.push(speakerTag);
        if (text) out.push(text);
        out.push(speakerTag === "[s1]" ? "[/s1]" : "[/s2]");
        continue;
      }
    }

    out.push(rawLine);
  }
  return out.join("\n");
}

function healSpeakerStructure(input: string): string {
  const lines = input.split(/\r?\n/);
  const out: string[] = [];
  let openSpeaker: "s1" | "s2" | "g1" | "g2" | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const openMatch = line.match(/^\[(s1|s2|g1|g2)\]$/i);
    if (openMatch?.[1]) {
      const next = openMatch[1].toLowerCase() as "s1" | "s2" | "g1" | "g2";
      if (openSpeaker && openSpeaker !== next) {
        out.push(`[/${openSpeaker}]`);
      }
      openSpeaker = next;
      out.push(`[${next}]`);
      continue;
    }

    const closeMatch = line.match(/^\[\/(s1|s2|g1|g2)\]$/i);
    if (closeMatch?.[1]) {
      const closing = closeMatch[1].toLowerCase() as "s1" | "s2" | "g1" | "g2";
      if (openSpeaker === closing) {
        out.push(`[/${closing}]`);
        openSpeaker = null;
      } else if (openSpeaker) {
        out.push(`[/${openSpeaker}]`);
        openSpeaker = null;
      }
      continue;
    }

    out.push(rawLine);
  }
  if (openSpeaker) {
    out.push(`[/${openSpeaker}]`);
  }
  return out.join("\n");
}

export function validateAnvilTagContract(input: string): AnvilTagValidation {
  const normalized = normalizeScriptTags(stripInlineStyleTags(input));
  const result = validateScriptTags(normalized);
  const forbiddenProblems = detectForbiddenMarkupProblems(input);
  const problems = [
    ...mapValidationToProblems(result),
    ...forbiddenProblems,
  ];
  const audit = buildAudit(result);
  audit.noForbiddenMarkup = forbiddenProblems.length === 0;
  return {
    ok: result.ok && problems.length === 0,
    problems,
    report: problems.length ? problems.join("\n") : "No issues.",
    audit,
    result,
  };
}

export function formatScriptToAnvilTagsNoAi(input: string): string {
  const normalized = normalizeScriptTags(preprocessLegacyScript(input));
  const healed = healSpeakerStructure(normalized);
  const repaired = repairScriptTags(healed);
  return repaired.text;
}
