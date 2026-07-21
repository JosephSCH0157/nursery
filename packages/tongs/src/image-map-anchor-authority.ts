export type CanonicalAnchorState = "current" | "stale" | "unresolved" | "provenance_unknown";
export type CanonicalAnchorReason = "exact_text_not_found" | "multiple_exact_matches" | "source_revision_unavailable" | "anchor_out_of_bounds" | "source_provenance_unknown" | null;

type ScriptAnchor = {
  section_id: string; paragraph_id: string; paragraph_order: number;
  sentence_start: number; sentence_end: number; char_start: number; char_end: number;
  span_text: string; speaker_block_id?: string | null;
};

type Sentence = { text: string; start: number; end: number; index: number };
type Paragraph = { sectionId: string; paragraphId: string; order: number; speaker: string | null; text: string; sentences: Sentence[] };

const TAG = /^\[(\/)?(s1|s2|g1|g2|note)\]$/i;
const END = new Set([".", "?", "!", ";"]);
const compact = (value: string) => value.replace(/\s+/g, " ").trim();

function sentences(text: string): Sentence[] {
  const result: Sentence[] = [];
  let start = 0;
  const push = (rawEnd: number) => {
    let left = start; let right = rawEnd;
    while (left < right && /\s/.test(text[left] ?? "")) left += 1;
    while (right > left && /\s/.test(text[right - 1] ?? "")) right -= 1;
    if (right > left) result.push({ text: text.slice(left, right), start: left, end: right, index: result.length + 1 });
    start = rawEnd;
  };
  for (let index = 0; index < text.length; index += 1) {
    if (!END.has(text[index] ?? "")) continue;
    let right = index + 1;
    while (right < text.length && /["')\]]/.test(text[right] ?? "")) right += 1;
    push(right);
    index = right - 1;
  }
  push(text.length);
  return result;
}

function paragraphs(scriptText: string): Paragraph[] {
  const result: Paragraph[] = [];
  const buffer: string[] = [];
  let section = 0; let sectionId = "s1"; let order = 0; let sectionOrder = 0;
  let speaker: string | null = null; let note = false;
  const flush = () => {
    const text = compact(buffer.join(" ")); buffer.length = 0;
    if (!text) return;
    if (!section) section = 1;
    order += 1; sectionOrder += 1;
    result.push({ sectionId, paragraphId: `${sectionId}:p${sectionOrder}`, order, speaker, text, sentences: sentences(text) });
  };
  for (const raw of scriptText.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (/^#{1,6}\s+/.test(line)) { flush(); section = section ? section + 1 : 1; sectionId = `s${section}`; sectionOrder = 0; continue; }
    const tag = line.match(TAG);
    if (tag?.[2]) {
      flush(); const id = tag[2].toLowerCase(); const closing = Boolean(tag[1]);
      if (id === "note") note = !closing;
      else if (closing) { if (speaker === id) speaker = null; }
      else speaker = id;
      continue;
    }
    if (!line) { flush(); continue; }
    if (!note) buffer.push(line);
  }
  flush();
  return result;
}

function anchorFor(paragraph: Paragraph, start: number, end: number): ScriptAnchor | null {
  const first = paragraph.sentences.find((item) => start >= item.start && start < item.end);
  const last = paragraph.sentences.find((item) => end > item.start && end <= item.end);
  if (!first || !last) return null;
  return {
    section_id: paragraph.sectionId, paragraph_id: paragraph.paragraphId, paragraph_order: paragraph.order,
    sentence_start: first.index, sentence_end: last.index, char_start: start, char_end: end,
    span_text: paragraph.text.slice(start, end), speaker_block_id: paragraph.speaker,
  };
}

export function repairEntriesAgainstApprovedScript(entries: Array<Record<string, unknown>>, scriptText: string) {
  const parsed = paragraphs(scriptText);
  return entries.map((entry) => {
    if (entry.anchor_scope === "global" || entry.beat_anchor) {
      return { ...entry, canonical_anchor_assessment: { state: "current", reason: null, exact_anchor: entry.script_anchor ?? null, evidence: { match_count: 1, assessed_contract_version: "forge.image-map-anchor.v1" } } };
    }
    const oldAnchor = entry.script_anchor && typeof entry.script_anchor === "object" ? entry.script_anchor as Record<string, unknown> : null;
    const span = typeof oldAnchor?.span_text === "string" ? oldAnchor.span_text.trim() : "";
    if (!span) return { ...entry, script_anchor: null, canonical_anchor_assessment: { state: "unresolved", reason: "source_provenance_unknown", exact_anchor: null, evidence: { match_count: 0, assessed_contract_version: "forge.image-map-anchor.v1" } } };
    const matches: ScriptAnchor[] = [];
    for (const paragraph of parsed) {
      let from = 0;
      while (from <= paragraph.text.length - span.length) {
        const index = paragraph.text.indexOf(span, from);
        if (index < 0) break;
        const anchor = anchorFor(paragraph, index, index + span.length);
        if (anchor) matches.push(anchor);
        from = index + Math.max(1, span.length);
      }
    }
    if (matches.length === 1) return { ...entry, anchor: matches[0]!.span_text, script_anchor: matches[0], anchor_scope: "attached", canonical_anchor_assessment: { state: "current", reason: null, exact_anchor: matches[0], evidence: { match_count: 1, assessed_contract_version: "forge.image-map-anchor.v1" } } };
    return { ...entry, canonical_anchor_assessment: { state: "unresolved", reason: matches.length > 1 ? "multiple_exact_matches" : "exact_text_not_found", exact_anchor: null, evidence: { match_count: matches.length, assessed_contract_version: "forge.image-map-anchor.v1" } } };
  });
}

export function markEntriesProvenanceUnknown(entries: Array<Record<string, unknown>>) {
  return entries.map((entry) => ({ ...entry, canonical_anchor_assessment: { state: "provenance_unknown", reason: "source_provenance_unknown", exact_anchor: null, evidence: { match_count: null, assessed_contract_version: "forge.image-map-anchor.v1" } } }));
}

export function validateExactAnchorAgainstApprovedScript(scriptText: string, value: Record<string, unknown>): ScriptAnchor | null {
  const paragraphId = typeof value.paragraph_id === "string" ? value.paragraph_id : "";
  const paragraph = paragraphs(scriptText).find((item) => item.paragraphId === paragraphId);
  if (!paragraph) return null;
  const start = typeof value.char_start === "number" && Number.isInteger(value.char_start) ? value.char_start : -1;
  const end = typeof value.char_end === "number" && Number.isInteger(value.char_end) ? value.char_end : -1;
  if (start < 0 || end <= start || end > paragraph.text.length) return null;
  const exact = anchorFor(paragraph, start, end);
  if (!exact) return null;
  if (typeof value.span_text !== "string" || value.span_text !== exact.span_text) return null;
  if (Number(value.sentence_start) !== exact.sentence_start || Number(value.sentence_end) !== exact.sentence_end) return null;
  return exact;
}
