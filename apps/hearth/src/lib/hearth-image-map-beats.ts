import {
  buildImageMapAnchorLabel,
  type EpisodeImageMapEntry,
  type EpisodeImageMapScriptAnchor,
} from "./episode-package-v2";

type ScriptSentenceSpan = {
  text: string;
  charStart: number;
  charEnd: number;
  sentenceIndex: number;
};

type ScriptParagraphSpan = {
  sectionId: string;
  paragraphId: string;
  paragraphOrder: number;
  text: string;
  sentences: ScriptSentenceSpan[];
};

const SENTENCE_BOUNDARY_SET = new Set([".", "?", "!", ";"]);
const VISUAL_SIGNAL_RE =
  /\b(\d[\d,]*|vs\.?|versus|compare(?:d|s|ison)?|more|less|before|after|during|strategic|route|river|port|city|country|state|battle|army|troops?|deployed?|redeploy(?:ed|ment)?|captured?|launched?|built|map|market|election)\b/i;

function countWords(text: string): number {
  const matches = text.trim().match(/\b[\p{L}\p{N}'-]+\b/gu);
  return matches ? matches.length : 0;
}

function normalizeParagraphText(rawText: string): string {
  return rawText.replace(/\s+/g, " ").trim();
}

function hasInternalProperNoun(text: string): boolean {
  const tokens = text.match(/\b[\p{L}][\p{L}'-]*\b/gu) ?? [];
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (/^[A-Z][a-z]/.test(token)) {
      return true;
    }
  }
  return false;
}

function pushSentenceSpan(
  spans: ScriptSentenceSpan[],
  sourceText: string,
  rawStart: number,
  rawEnd: number,
): void {
  let start = rawStart;
  let end = rawEnd;
  while (start < end && /\s/.test(sourceText[start] ?? "")) start += 1;
  while (end > start && /\s/.test(sourceText[end - 1] ?? "")) end -= 1;
  if (end <= start) return;

  const text = sourceText.slice(start, end).trim();
  if (!text) return;

  spans.push({
    text,
    charStart: start,
    charEnd: end,
    sentenceIndex: spans.length + 1,
  });
}

function splitSentenceSpans(paragraphText: string): ScriptSentenceSpan[] {
  const spans: ScriptSentenceSpan[] = [];
  let start = 0;

  for (let index = 0; index < paragraphText.length; index += 1) {
    const char = paragraphText[index] ?? "";
    if (!SENTENCE_BOUNDARY_SET.has(char)) continue;

    let end = index + 1;
    while (end < paragraphText.length && /["')\]]/.test(paragraphText[end] ?? "")) {
      end += 1;
    }
    pushSentenceSpan(spans, paragraphText, start, end);
    start = end;
  }

  pushSentenceSpan(spans, paragraphText, start, paragraphText.length);
  return spans;
}

function extractParagraphs(scriptText: string): ScriptParagraphSpan[] {
  const normalized = scriptText.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const paragraphs: ScriptParagraphSpan[] = [];
  const buffer: string[] = [];
  let sectionIndex = 0;
  let sectionId = "s1";
  let paragraphOrder = 0;
  let sectionParagraphOrder = 0;

  const flushParagraph = () => {
    const text = normalizeParagraphText(buffer.join(" "));
    buffer.length = 0;
    if (!text) return;
    if (sectionIndex === 0) {
      sectionIndex = 1;
      sectionId = "s1";
    }
    paragraphOrder += 1;
    sectionParagraphOrder += 1;
    paragraphs.push({
      sectionId,
      paragraphId: `${sectionId}:p${sectionParagraphOrder}`,
      paragraphOrder,
      text,
      sentences: splitSentenceSpans(text),
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      sectionIndex = sectionIndex === 0 ? 1 : sectionIndex + 1;
      sectionId = `s${sectionIndex}`;
      sectionParagraphOrder = 0;
      continue;
    }
    if (!line) {
      flushParagraph();
      continue;
    }
    buffer.push(line);
  }

  flushParagraph();
  return paragraphs;
}

function isVisualBeatCandidate(sentenceText: string): boolean {
  const wordCount = countWords(sentenceText);
  if (wordCount < 5) return false;
  return /\d/.test(sentenceText) || VISUAL_SIGNAL_RE.test(sentenceText) || hasInternalProperNoun(sentenceText);
}

function buildAnchor(args: {
  paragraph: ScriptParagraphSpan;
  sentenceStart: number;
  sentenceEnd: number;
  charStart: number;
  charEnd: number;
  spanText: string;
}): EpisodeImageMapScriptAnchor {
  return {
    section_id: args.paragraph.sectionId,
    paragraph_id: args.paragraph.paragraphId,
    paragraph_order: args.paragraph.paragraphOrder,
    sentence_start: args.sentenceStart,
    sentence_end: args.sentenceEnd,
    char_start: args.charStart,
    char_end: args.charEnd,
    span_text: args.spanText,
    speaker_block_id: null,
  };
}

function buildEntry(args: {
  id: string;
  paragraphBeatOrder: number;
  beatOrder: number;
  anchor: EpisodeImageMapScriptAnchor;
}): EpisodeImageMapEntry {
  const anchorLabel = buildImageMapAnchorLabel(args.anchor);
  return {
    id: args.id,
    anchor: anchorLabel,
    script_anchor: args.anchor,
    description: args.anchor.span_text,
    visual_intent: args.anchor.span_text,
    prompt_basis: args.anchor.span_text,
    intent: "cutaway",
    source_type: "stock",
    beat_order: args.beatOrder,
    paragraph_beat_order: args.paragraphBeatOrder,
    candidate_assets: [],
    selected_asset_id: null,
    status: "mapped",
    placement_hint: null,
  };
}

export function generateImageMapEntriesFromScript(scriptText: string): EpisodeImageMapEntry[] {
  const paragraphs = extractParagraphs(scriptText);
  const entries: EpisodeImageMapEntry[] = [];
  let beatOrder = 0;

  for (const paragraph of paragraphs) {
    const candidateSentences = paragraph.sentences.filter((sentence) => isVisualBeatCandidate(sentence.text));
    const selectedSentences = candidateSentences.length > 0
      ? candidateSentences
      : paragraph.sentences.length > 0 && countWords(paragraph.text) >= 10
        ? [{
            text: paragraph.text,
            charStart: 0,
            charEnd: paragraph.text.length,
            sentenceIndex: paragraph.sentences[0]?.sentenceIndex ?? 1,
          }]
        : [];

    if (selectedSentences.length === 0) continue;

    selectedSentences.forEach((sentence, index) => {
      beatOrder += 1;
      const sentenceStart = sentence.sentenceIndex;
      const sentenceEnd = sentence.text === paragraph.text
        ? (paragraph.sentences.at(-1)?.sentenceIndex ?? sentence.sentenceIndex)
        : sentence.sentenceIndex;
      const anchor = buildAnchor({
        paragraph,
        sentenceStart,
        sentenceEnd,
        charStart: sentence.charStart,
        charEnd: sentence.charEnd,
        spanText: sentence.text,
      });
      entries.push(buildEntry({
        id: `image-map-${String(beatOrder).padStart(2, "0")}`,
        paragraphBeatOrder: index + 1,
        beatOrder,
        anchor,
      }));
    });
  }

  return entries;
}

export function resolveImageMapAnchorContext(
  scriptText: string,
  anchor: EpisodeImageMapScriptAnchor | null,
): { before: string | null; after: string | null } {
  if (!anchor) {
    return { before: null, after: null };
  }
  const paragraphs = extractParagraphs(scriptText);
  const paragraph = paragraphs.find((candidate) => candidate.paragraphId === anchor.paragraph_id) ?? null;
  if (!paragraph) {
    return { before: null, after: null };
  }

  const beforeSentence = paragraph.sentences.find((sentence) => sentence.sentenceIndex === anchor.sentence_start - 1) ?? null;
  const afterSentence = paragraph.sentences.find((sentence) => sentence.sentenceIndex === anchor.sentence_end + 1) ?? null;
  return {
    before: beforeSentence?.text ?? null,
    after: afterSentence?.text ?? null,
  };
}
