import {
  DEFAULT_HEARTH_VISUAL_STYLE,
} from "./hearth-visual-styles";
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

export type ImageMapAnchorStatus = "anchored" | "needs_reanchor" | "missing_anchor";

export type ImageMapAnchorAssessment = {
  status: ImageMapAnchorStatus;
  exactAnchor: EpisodeImageMapScriptAnchor | null;
  message: string;
};

export type ImageMapScriptSelection = {
  paragraphId: string;
  sentenceStart: number;
  sentenceEnd: number;
};

export type ImageMapAnchorPickerOption = {
  key: string;
  label: string;
  text: string;
  selection: ImageMapScriptSelection;
  anchor: EpisodeImageMapScriptAnchor;
};

export type ImageMapAnchorPickerParagraph = {
  key: string;
  label: string;
  text: string;
  paragraphOption: ImageMapAnchorPickerOption;
  sentenceOptions: ImageMapAnchorPickerOption[];
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

function buildParagraphAnchor(paragraph: ScriptParagraphSpan): EpisodeImageMapScriptAnchor | null {
  const firstSentence = paragraph.sentences[0] ?? null;
  const lastSentence = paragraph.sentences.at(-1) ?? null;
  if (!firstSentence || !lastSentence) return null;
  return buildSentenceRangeAnchor(paragraph, firstSentence.sentenceIndex, lastSentence.sentenceIndex);
}

function buildSentenceRangeAnchor(
  paragraph: ScriptParagraphSpan,
  sentenceStart: number,
  sentenceEnd: number,
): EpisodeImageMapScriptAnchor | null {
  const startSentence = paragraph.sentences.find((sentence) => sentence.sentenceIndex === sentenceStart) ?? null;
  const endSentence = paragraph.sentences.find((sentence) => sentence.sentenceIndex === sentenceEnd) ?? null;
  if (!startSentence || !endSentence || sentenceEnd < sentenceStart) return null;

  const charStart = startSentence.charStart;
  const charEnd = endSentence.charEnd;
  const spanText = paragraph.text.slice(charStart, charEnd).trim();
  if (!spanText) return null;

  return buildAnchor({
    paragraph,
    sentenceStart,
    sentenceEnd,
    charStart,
    charEnd,
    spanText,
  });
}

function normalizeAnchorLookupText(rawText: string | null | undefined): string {
  return (rawText ?? "")
    .replace(/^[“”"'`]+|[“”"'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveAnchorMatchOrdinal(matchHint: string | null | undefined): number | null {
  const normalized = normalizeAnchorLookupText(matchHint).toLowerCase();
  if (!normalized) return null;
  if (/\b(last|final)\b/.test(normalized)) {
    return -1;
  }
  if (/\bfirst\b/.test(normalized)) return 1;
  if (/\bsecond\b/.test(normalized)) return 2;
  if (/\bthird\b/.test(normalized)) return 3;
  if (/\bfourth\b/.test(normalized)) return 4;
  if (/\bfifth\b/.test(normalized)) return 5;

  const numericMatch = normalized.match(/\b(\d+)(?:st|nd|rd|th)?\b/);
  if (!numericMatch?.[1]) return null;
  const parsed = Number.parseInt(numericMatch[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function pickAnchorMatch(
  matches: EpisodeImageMapScriptAnchor[],
  matchHint?: string | null,
): EpisodeImageMapScriptAnchor | null {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0] ?? null;

  const ordinal = resolveAnchorMatchOrdinal(matchHint);
  if (ordinal == null) return null;
  if (ordinal === -1) {
    return matches.at(-1) ?? null;
  }
  return matches[ordinal - 1] ?? null;
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
    style_preset: DEFAULT_HEARTH_VISUAL_STYLE,
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

export function resolveImageMapScriptAnchorFromText(
  scriptText: string,
  anchorText: string | null | undefined,
  matchHint?: string | null,
): EpisodeImageMapScriptAnchor | null {
  const target = normalizeAnchorLookupText(anchorText);
  if (!target) return null;

  const paragraphs = extractParagraphs(scriptText);
  const textMatches: EpisodeImageMapScriptAnchor[] = [];
  const labelMatches: EpisodeImageMapScriptAnchor[] = [];

  for (const paragraph of paragraphs) {
    for (let startIndex = 0; startIndex < paragraph.sentences.length; startIndex += 1) {
      const startSentence = paragraph.sentences[startIndex];
      if (!startSentence) continue;

      for (let endIndex = startIndex; endIndex < paragraph.sentences.length; endIndex += 1) {
        const endSentence = paragraph.sentences[endIndex];
        if (!endSentence) continue;

        const rangeAnchor = buildSentenceRangeAnchor(
          paragraph,
          startSentence.sentenceIndex,
          endSentence.sentenceIndex,
        );
        if (!rangeAnchor) continue;

        if (normalizeAnchorLookupText(rangeAnchor.span_text) === target) {
          textMatches.push(rangeAnchor);
        }
        if (buildImageMapAnchorLabel(rangeAnchor) === target) {
          labelMatches.push(rangeAnchor);
        }
      }
    }
  }

  return pickAnchorMatch(textMatches, matchHint) ?? pickAnchorMatch(labelMatches, matchHint);
}

function normalizeSpanTextForComparison(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function resolveExactImageMapScriptAnchor(
  scriptText: string,
  anchor: EpisodeImageMapScriptAnchor | null | undefined,
): EpisodeImageMapScriptAnchor | null {
  if (!anchor) return null;

  const paragraphs = extractParagraphs(scriptText);
  const paragraph = paragraphs.find((candidate) => candidate.paragraphId === anchor.paragraph_id) ?? null;
  if (!paragraph) return null;
  if (paragraph.sectionId !== anchor.section_id || paragraph.paragraphOrder !== anchor.paragraph_order) {
    return null;
  }

  const startSentence = paragraph.sentences.find((sentence) => sentence.sentenceIndex === anchor.sentence_start) ?? null;
  const endSentence = paragraph.sentences.find((sentence) => sentence.sentenceIndex === anchor.sentence_end) ?? null;
  if (!startSentence || !endSentence || anchor.sentence_end < anchor.sentence_start) {
    return null;
  }
  if (anchor.char_start < startSentence.charStart || anchor.char_end > endSentence.charEnd || anchor.char_end <= anchor.char_start) {
    return null;
  }

  const spanText = paragraph.text.slice(anchor.char_start, anchor.char_end).trim();
  if (!spanText) return null;
  if (normalizeSpanTextForComparison(spanText) !== normalizeSpanTextForComparison(anchor.span_text)) {
    return null;
  }

  return {
    ...anchor,
    span_text: spanText,
  };
}

export function assessImageMapScriptAnchor(
  scriptText: string,
  anchor: EpisodeImageMapScriptAnchor | null | undefined,
): ImageMapAnchorAssessment {
  if (!anchor) {
    return {
      status: "missing_anchor",
      exactAnchor: null,
      message: "This visual beat does not have a structured exact anchor yet.",
    };
  }

  const exactAnchor = resolveExactImageMapScriptAnchor(scriptText, anchor);
  if (exactAnchor) {
    return {
      status: "anchored",
      exactAnchor,
      message: "This visual beat is anchored to an exact span in the current canonical script.",
    };
  }

  return {
    status: "needs_reanchor",
    exactAnchor: null,
    message: "This structured anchor no longer matches the current canonical script.",
  };
}

export function buildExactScriptAnchorFromSelection(
  scriptText: string,
  selection: ImageMapScriptSelection,
): EpisodeImageMapScriptAnchor | null {
  const paragraphs = extractParagraphs(scriptText);
  const paragraph = paragraphs.find((candidate) => candidate.paragraphId === selection.paragraphId) ?? null;
  if (!paragraph) return null;
  return buildSentenceRangeAnchor(paragraph, selection.sentenceStart, selection.sentenceEnd);
}

export function buildImageMapAnchorPickerParagraphs(scriptText: string): ImageMapAnchorPickerParagraph[] {
  const paragraphs = extractParagraphs(scriptText);
  return paragraphs.flatMap((paragraph) => {
    const paragraphAnchor = buildParagraphAnchor(paragraph);
    if (!paragraphAnchor) return [];

    const sentenceOptions = paragraph.sentences
      .map((sentence) => {
        const anchor = buildSentenceRangeAnchor(paragraph, sentence.sentenceIndex, sentence.sentenceIndex);
        if (!anchor) return null;
        return {
          key: `${paragraph.paragraphId}:sentence:${sentence.sentenceIndex}`,
          label: `Sentence ${sentence.sentenceIndex}`,
          text: sentence.text,
          selection: {
            paragraphId: paragraph.paragraphId,
            sentenceStart: sentence.sentenceIndex,
            sentenceEnd: sentence.sentenceIndex,
          },
          anchor,
        } satisfies ImageMapAnchorPickerOption;
      })
      .filter((entry): entry is ImageMapAnchorPickerOption => Boolean(entry));

    return [{
      key: paragraph.paragraphId,
      label: paragraph.paragraphId,
      text: paragraph.text,
      paragraphOption: {
        key: `${paragraph.paragraphId}:paragraph`,
        label: `Paragraph ${paragraph.paragraphId}`,
        text: paragraph.text,
        selection: {
          paragraphId: paragraph.paragraphId,
          sentenceStart: paragraphAnchor.sentence_start,
          sentenceEnd: paragraphAnchor.sentence_end,
        },
        anchor: paragraphAnchor,
      },
      sentenceOptions,
    } satisfies ImageMapAnchorPickerParagraph];
  });
}

export function reanchorImageMapEntry(
  entry: EpisodeImageMapEntry,
  scriptText: string,
  selection: ImageMapScriptSelection,
): EpisodeImageMapEntry | null {
  const anchor = buildExactScriptAnchorFromSelection(scriptText, selection);
  if (!anchor) return null;

  return {
    ...entry,
    anchor: buildImageMapAnchorLabel(anchor),
    script_anchor: anchor,
    status: entry.status === "draft" ? "mapped" : entry.status,
  };
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
