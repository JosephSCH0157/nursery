/** Discards are editorial intent, never executable transcript edits. */
export const CLEANUP_REVIEW_VERSION = "hammer-cleanup-review-v1";
export const CLEANUP_GENERATOR_VERSION = "hammer-cleanup-generator-v1";
export type CleanupKind = "fillers" | "retakes";
export type CleanupSegment = {
  segment_id: string;
  text: string;
  speaker: string;
  start_sec: number;
  end_sec: number;
  is_disabled?: boolean;
  gain_db?: number;
};
export type CleanupCandidate = {
  id: string;
  kind: CleanupKind;
  segmentIds: string[];
  beforeText: string;
  afterText: string | null;
  suggestedRemoval: Array<{
    segmentId: string;
    selectionStart: number;
    selectionEnd: number;
    text: string;
  }>;
  apply: {
    removeSegmentIds: string[];
    updateSegments: Array<{ segmentId: string; text: string }>;
  };
};
export type CleanupOptions = Record<string, string | boolean>;
export type CleanupGenerator = (
  kind: CleanupKind,
  segments: CleanupSegment[],
  options: CleanupOptions,
) => CleanupCandidate[];
export type CleanupIdentity = {
  workspace_id: string;
  workpiece_id: string;
  canonical_recording_id: string;
  recording_revision_id: string;
};
export type CleanupBasis = CleanupIdentity & {
  contract_version: string;
  generator_version: string;
  kind: CleanupKind;
  options: CleanupOptions;
  transcript_id: string;
  segments: CleanupSegment[];
  media: { media_id: string; sha256: string; bytes: number };
};
export function stableCleanupJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(stableCleanupJson).join(",")}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableCleanupJson(row[key])}`)
    .join(",")}}`;
}
export async function cleanupFingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableCleanupJson(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function normalizeCleanupOptions(
  kind: CleanupKind,
  value: unknown,
): CleanupOptions {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("cleanup_options_invalid");
  const o = value as Record<string, unknown>;
  const keys =
    kind === "fillers"
      ? ["aggressiveness", "protectIntentionalPhrasing"]
      : [
          "detection",
          "preferLaterCleanerTake",
          "honorExplicitRetakePhrases",
          "sameSpeakerOnly",
        ];
  if (Object.keys(o).sort().join() !== [...keys].sort().join())
    throw new Error("cleanup_options_invalid");
  const level = kind === "fillers" ? "aggressiveness" : "detection";
  if (
    !(
      kind === "fillers"
        ? ["light", "medium", "strong"]
        : ["conservative", "normal", "aggressive"]
    ).includes(String(o[level]))
  )
    throw new Error("cleanup_options_invalid");
  for (const key of keys.filter((k) => k !== level))
    if (typeof o[key] !== "boolean") throw new Error("cleanup_options_invalid");
  return Object.fromEntries(keys.map((key) => [key, o[key]])) as CleanupOptions;
}
export function canonicalCleanupSegments(value: unknown): CleanupSegment[] {
  if (!Array.isArray(value) || value.length > 10000)
    throw new Error("cleanup_transcript_invalid");
  const seen = new Set<string>();
  const segments = value.map((s: CleanupSegment) => {
    if (
      !s ||
      typeof s.segment_id !== "string" ||
      !s.segment_id ||
      seen.has(s.segment_id) ||
      typeof s.text !== "string" ||
      typeof s.speaker !== "string" ||
      !Number.isFinite(s.start_sec) ||
      !Number.isFinite(s.end_sec) ||
      s.start_sec < 0 ||
      s.end_sec < s.start_sec
    )
      throw new Error("cleanup_transcript_invalid");
    seen.add(s.segment_id);
    if (s.is_disabled !== undefined && typeof s.is_disabled !== "boolean")
      throw new Error("cleanup_transcript_invalid");
    if (s.gain_db !== undefined && !Number.isFinite(s.gain_db))
      throw new Error("cleanup_transcript_invalid");
    return {
      segment_id: s.segment_id,
      text: s.text,
      speaker: s.speaker,
      start_sec: s.start_sec,
      end_sec: s.end_sec,
      is_disabled: s.is_disabled ?? false,
      gain_db: s.gain_db ?? 0,
    };
  });
  if (
    new TextEncoder().encode(stableCleanupJson(segments)).byteLength > 1048576
  )
    throw new Error("cleanup_transcript_too_large");
  return segments;
}
export function cleanupCandidateDescriptor(
  card: CleanupCandidate,
  segments: CleanupSegment[],
) {
  const ids = new Set(card.segmentIds);
  const source = segments.filter((s) => ids.has(s.segment_id));
  if (source.length !== ids.size || !source.length)
    throw new Error("cleanup_candidate_invalid");
  // No suggestion ID, iteration index, confidence label or display order is authority.
  return {
    contract_version: CLEANUP_REVIEW_VERSION,
    kind: card.kind,
    operation: "delete_only",
    source,
    before_text: card.beforeText,
    after_text: card.afterText,
    removals: [...card.suggestedRemoval].sort(
      (a, b) =>
        (a.segmentId < b.segmentId ? -1 : a.segmentId > b.segmentId ? 1 : 0) ||
        a.selectionStart - b.selectionStart ||
        a.selectionEnd - b.selectionEnd,
    ),
    remove_segment_ids: [...card.apply.removeSegmentIds].sort(),
    updates: [...card.apply.updateSegments].sort((a, b) =>
      a.segmentId < b.segmentId ? -1 : a.segmentId > b.segmentId ? 1 : 0,
    ),
  };
}
export type CleanupReviewSnapshot = {
  basis: CleanupBasis;
  basis_fingerprint: string;
  acknowledged: string[];
  candidates: Array<{
    candidate_fingerprint: string;
    descriptor: ReturnType<typeof cleanupCandidateDescriptor>;
  }>;
};
