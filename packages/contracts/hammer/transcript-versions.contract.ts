/**
 * Transcript version / provenance contract.
 *
 * Every transcript version carries a `source` tag so Hammer always knows
 * where a transcript originated and never silently overwrites Anvil work.
 */

/** Where a transcript version came from. */
export type HammerTranscriptVersionSource = "anvil" | "hammer_ai" | "imported";

/**
 * Lightweight per-version metadata stored in the registry.
 * The full transcript content lives in its own artifact JSON at
 * `transcript_artifact_path`.
 */
export interface HammerTranscriptVersionEntry {
  /** Stable UUID for this version. */
  version_id: string;

  /** Human-readable label, e.g. "Anvil original" or "AI regeneration 2". */
  label: string;

  /** Provenance of the transcript. */
  source: HammerTranscriptVersionSource;

  /** ISO-8601 timestamp when this version was created. */
  created_at: string;

  /**
   * Path (relative to the workpiece storage root) to the
   * `HammerPersistedStructuredTranscript` artifact for this version.
   */
  transcript_artifact_path: string;

  /** Number of transcript segments in this version (denormalised for display). */
  segment_count: number;

  // ── AI-only fields ──────────────────────────────────────────────────────────

  /** AI model identifier, if `source === "hammer_ai"`. */
  model: string | null;

  /** AI provider, if `source === "hammer_ai"`. e.g. "openai". */
  provider: string | null;

  /** Provider-assigned request/job id, if available. */
  provider_request_id: string | null;

  /** Summary of low-confidence turns, if available. */
  confidence_summary: {
    total_turns: number;
    low_confidence_turns: number;
  } | null;
}

/**
 * Top-level registry stored as a Tongs artifact.
 * Path: `{workspace}/{workpiece}/hammer/transcript_versions.json`
 */
export interface HammerPersistedTranscriptVersionRegistry {
  schema_version: 1;

  /**
   * version_id of the currently active transcript.
   * The `transcript_artifact_path` column in `hammer_workpiece_state` always
   * mirrors the active version's path for backward compatibility.
   */
  active_version_id: string;

  /**
   * All transcript versions, oldest first.
   * Never emptied — old versions are kept for recovery and audit.
   */
  versions: HammerTranscriptVersionEntry[];
}
