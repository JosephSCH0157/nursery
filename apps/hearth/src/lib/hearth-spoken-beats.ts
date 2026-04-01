import {
  buildBulletBeatAnchorLabel,
  type EpisodeBulletBeatAnchor,
  type EpisodeImageMapEntry,
  type EpisodeSpokenBeat,
  type EpisodeSpokenBeatSpeaker,
} from "./episode-package-v2";
import { DEFAULT_HEARTH_VISUAL_STYLE } from "./hearth-visual-styles";
import { classifyVisualBeatPurpose } from "./hearth-visual-purpose";

const SPEAKER_TAG_RE = /^\[(\/)?(s1|s2|g1|g2|note)\]$/i;
const BULLET_LINE_RE = /^[-*]\s+(.+)$/;

type ParsedBulletBeat = {
  speaker: EpisodeSpokenBeatSpeaker;
  speaker_turn: number;
  speaker_order: number;
  order: number;
  text: string;
};

function normalizeBeatLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function humanizeBeatLabel(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "Bullet beat";
  const firstClause = compact.split(/[:;,.!?]/, 1)[0]?.trim() ?? compact;
  const words = firstClause.split(/\s+/).slice(0, 7);
  return words.join(" ");
}

function extractCuePhrase(text: string): string | null {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  const firstClause = compact.split(/[:;,.!?]/, 1)[0]?.trim() ?? compact;
  const words = firstClause.split(/\s+/).slice(0, 10);
  const cue = words.join(" ").trim();
  return cue || null;
}

function buildStableBeatSlug(text: string): string {
  const slug = normalizeBeatLabel(text)
    .split(" ")
    .slice(0, 6)
    .join("-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "beat";
}

function countTokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  return shared / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
}

function areBeatLabelsSimilar(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.startsWith(right) || right.startsWith(left)) return true;
  return countTokenOverlap(left, right) >= 0.6;
}

function resolveSpokenBeatId(
  beat: ParsedBulletBeat,
  normalizedLabel: string,
  existingBeats: readonly EpisodeSpokenBeat[],
  usedIds: Set<string>,
): string {
  const reusable = existingBeats.filter((candidate) => (
    !usedIds.has(candidate.id)
    && candidate.speaker === beat.speaker
  ));

  const orderedMatch = reusable.find((candidate) => (
    candidate.order === beat.order
    && candidate.speaker_order === beat.speaker_order
    && candidate.speaker_turn === beat.speaker_turn
    && areBeatLabelsSimilar(candidate.normalized_label, normalizedLabel)
  ));
  if (orderedMatch) return orderedMatch.id;

  const turnMatch = reusable.find((candidate) => (
    candidate.speaker_turn === beat.speaker_turn
    && candidate.speaker_order === beat.speaker_order
    && areBeatLabelsSimilar(candidate.normalized_label, normalizedLabel)
  ));
  if (turnMatch) return turnMatch.id;

  const exactLabelMatch = reusable.find((candidate) => candidate.normalized_label === normalizedLabel);
  if (exactLabelMatch) return exactLabelMatch.id;

  return `beat_${beat.speaker}_${String(beat.order).padStart(2, "0")}_${buildStableBeatSlug(beat.text)}`;
}

function parseBulletBeats(scriptText: string): ParsedBulletBeat[] {
  const lines = scriptText.replace(/\r\n?/g, "\n").split("\n");
  const beats: ParsedBulletBeat[] = [];
  let activeSpeaker: EpisodeSpokenBeatSpeaker | null = null;
  let activeTurn = 0;
  let speakerOrder = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const tagMatch = line.match(SPEAKER_TAG_RE);
    if (tagMatch?.[2]) {
      const blockId = tagMatch[2].toLowerCase();
      if (blockId === "note") {
        if (!tagMatch[1]) activeSpeaker = null;
        continue;
      }
      if (tagMatch[1]) {
        activeSpeaker = activeSpeaker === blockId ? null : activeSpeaker;
        continue;
      }
      activeSpeaker = blockId as EpisodeSpokenBeatSpeaker;
      activeTurn += 1;
      speakerOrder = 0;
      continue;
    }
    if (!activeSpeaker || !line) continue;
    const bulletMatch = line.match(BULLET_LINE_RE);
    if (!bulletMatch?.[1]) continue;
    speakerOrder += 1;
    beats.push({
      speaker: activeSpeaker,
      speaker_turn: activeTurn,
      speaker_order: speakerOrder,
      order: beats.length + 1,
      text: bulletMatch[1].trim(),
    });
  }

  return beats;
}

export function isBulletOutlineScript(scriptText: string): boolean {
  const beats = parseBulletBeats(scriptText);
  if (beats.length === 0) return false;
  const nonEmptyLines = scriptText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletLikeLines = nonEmptyLines.filter((line) => (
    SPEAKER_TAG_RE.test(line) || BULLET_LINE_RE.test(line)
  ));
  return bulletLikeLines.length >= Math.max(4, Math.floor(nonEmptyLines.length * 0.8));
}

export function deriveSpokenBeatsFromBulletScript(
  scriptText: string,
  existingBeats: readonly EpisodeSpokenBeat[] = [],
): EpisodeSpokenBeat[] {
  const parsed = parseBulletBeats(scriptText);
  const usedIds = new Set<string>();

  return parsed.map((beat) => {
    const normalizedLabel = normalizeBeatLabel(beat.text);
    const id = resolveSpokenBeatId(beat, normalizedLabel, existingBeats, usedIds);
    usedIds.add(id);
    return {
      id,
      speaker: beat.speaker,
      format: "bullet_outline",
      order: beat.order,
      speaker_order: beat.speaker_order,
      speaker_turn: beat.speaker_turn,
      text: beat.text,
      normalized_label: normalizedLabel,
      cue_phrase: extractCuePhrase(beat.text),
    };
  });
}

export function generateImageMapEntriesFromBulletScript(args: {
  scriptText: string;
  existingBeats?: readonly EpisodeSpokenBeat[];
}): {
  spokenBeats: EpisodeSpokenBeat[];
  entries: EpisodeImageMapEntry[];
} {
  const spokenBeats = deriveSpokenBeatsFromBulletScript(args.scriptText, args.existingBeats ?? []);
  const entries = spokenBeats.map((beat) => {
    const purpose = classifyVisualBeatPurpose(beat.text);
    const visualPriority: EpisodeImageMapEntry["visual_priority"] = purpose === "emphasis" ? "primary" : "supporting";
    const visualType: EpisodeImageMapEntry["visual_type"] = purpose === "explanation" ? "diagram" : "still_image";
    const status: EpisodeImageMapEntry["status"] = "mapped";
    const beatAnchor: EpisodeBulletBeatAnchor = {
      mode: "bullet_beat",
      beat_id: beat.id,
      speaker: beat.speaker,
      beat_index: beat.order,
      speaker_order: beat.speaker_order,
      speaker_turn: beat.speaker_turn,
      beat_label: humanizeBeatLabel(beat.text),
      cue_phrase: beat.cue_phrase,
      purpose,
    };
    return {
      id: `image-map-${String(beat.order).padStart(2, "0")}`,
      anchor: buildBulletBeatAnchorLabel(beatAnchor),
      script_anchor: null,
      beat_anchor: beatAnchor,
      anchor_scope: "beat" as const,
      purpose,
      description: beat.text,
      visual_intent: beat.text,
      prompt_basis: beat.text,
      style_preset: DEFAULT_HEARTH_VISUAL_STYLE,
      intent: purpose === "explanation" ? "graphic" : "cutaway",
      source_type: "stock",
      visual_priority: visualPriority,
      visual_type: visualType,
      section_intent_note: null,
      beat_order: beat.order,
      paragraph_beat_order: beat.speaker_order,
      candidate_assets: [],
      selected_asset_id: null,
      status,
      placement_hint: null,
    };
  });

  return {
    spokenBeats,
    entries,
  };
}

export function resolveBulletBeatContext(args: {
  spokenBeats: readonly EpisodeSpokenBeat[];
  beatAnchor: EpisodeBulletBeatAnchor | null | undefined;
}): {
  before: string | null;
  focus: string | null;
  after: string | null;
} {
  if (!args.beatAnchor) {
    return { before: null, focus: null, after: null };
  }
  const beats = args.spokenBeats
    .slice()
    .sort((left, right) => left.order - right.order);
  const index = beats.findIndex((beat) => beat.id === args.beatAnchor?.beat_id);
  const fallbackFocus = args.beatAnchor.beat_label ?? args.beatAnchor.cue_phrase ?? null;
  if (index < 0) {
    return {
      before: null,
      focus: fallbackFocus,
      after: null,
    };
  }

  return {
    before: index > 0 ? beats[index - 1]?.text ?? null : null,
    focus: beats[index]?.text ?? fallbackFocus,
    after: index < beats.length - 1 ? beats[index + 1]?.text ?? null : null,
  };
}
