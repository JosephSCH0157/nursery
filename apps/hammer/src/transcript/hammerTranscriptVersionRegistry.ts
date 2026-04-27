import type {
  HammerPersistedTranscriptVersionRegistry,
  HammerTranscriptVersionEntry,
  HammerTranscriptVersionSource,
} from "../../../../packages/contracts/hammer/transcript-versions.contract";
import type { HammerPersistedStructuredTranscript } from "../persistence/hammerPersistenceContract";
import type { HammerTranscriptPrepResponse } from "../prep/hammerPrepApi";

/** Canonical path for the version registry within a workpiece. */
export const HAMMER_TRANSCRIPT_VERSIONS_ARTIFACT_PATH = "hammer/transcript-versions.json";

/**
 * Storage path for a specific transcript version.
 * Segregated from the legacy path so old single-file reads still work.
 */
export function buildTranscriptVersionArtifactPath(versionId: string): string {
  return `hammer/transcripts/${versionId}.json`;
}

/**
 * Build a fresh registry that wraps the existing "Anvil original" transcript.
 * Called the first time a workpiece that pre-dates versioning is opened.
 */
export function bootstrapTranscriptVersionRegistry(args: {
  existingTranscriptArtifactPath: string;
  transcript: HammerPersistedStructuredTranscript;
}): HammerPersistedTranscriptVersionRegistry {
  const versionId = args.transcript.transcript_id;
  const entry: HammerTranscriptVersionEntry = {
    version_id: versionId,
    label: "Anvil original",
    source: "anvil",
    created_at: args.transcript.prepared_at,
    transcript_artifact_path: args.existingTranscriptArtifactPath,
    segment_count: args.transcript.segments.length,
    model: args.transcript.diarization?.model ?? null,
    provider: args.transcript.diarization?.provider ?? null,
    provider_request_id: args.transcript.diarization?.provider_request_id ?? null,
    confidence_summary: buildConfidenceSummary(args.transcript),
  };
  return { schema_version: 1, active_version_id: versionId, versions: [entry] };
}

/**
 * Build a new version entry after an AI regeneration in Hammer.
 * Does NOT mutate the registry — call `addVersionToRegistry` with the result.
 */
export function buildRegenTranscriptVersionEntry(args: {
  transcript: HammerPersistedStructuredTranscript;
  prepResponse: HammerTranscriptPrepResponse;
  versionIndex: number; // 1-based count of existing hammer_ai versions before this one
}): { entry: HammerTranscriptVersionEntry; artifactPath: string } {
  const versionId = generateVersionId();
  const artifactPath = buildTranscriptVersionArtifactPath(versionId);
  const label = `AI regeneration ${args.versionIndex + 1}`;
  const entry: HammerTranscriptVersionEntry = {
    version_id: versionId,
    label,
    source: "hammer_ai",
    created_at: args.transcript.prepared_at,
    transcript_artifact_path: artifactPath,
    segment_count: args.transcript.segments.length,
    model: args.prepResponse.model ?? null,
    provider: args.prepResponse.provider ?? null,
    provider_request_id: args.prepResponse.provider_request_id ?? null,
    confidence_summary: buildConfidenceSummary(args.transcript),
  };
  return { entry, artifactPath };
}

/**
 * Return a new registry with `entry` appended and `active_version_id` pointing to it.
 */
export function addVersionToRegistry(
  registry: HammerPersistedTranscriptVersionRegistry,
  entry: HammerTranscriptVersionEntry,
): HammerPersistedTranscriptVersionRegistry {
  return {
    ...registry,
    active_version_id: entry.version_id,
    versions: [...registry.versions, entry],
  };
}

/**
 * Return a new registry with `active_version_id` changed.
 * Validates that the requested version exists.
 */
export function setActiveTranscriptVersion(
  registry: HammerPersistedTranscriptVersionRegistry,
  versionId: string,
): HammerPersistedTranscriptVersionRegistry | null {
  const exists = registry.versions.some((v) => v.version_id === versionId);
  if (!exists) return null;
  return { ...registry, active_version_id: versionId };
}

/** Retrieve the currently-active entry, or null if the registry is corrupt. */
export function resolveActiveTranscriptVersion(
  registry: HammerPersistedTranscriptVersionRegistry,
): HammerTranscriptVersionEntry | null {
  return registry.versions.find((v) => v.version_id === registry.active_version_id) ?? null;
}

/** Count existing versions by source, used for human-friendly labels. */
export function countVersionsBySource(
  registry: HammerPersistedTranscriptVersionRegistry,
  source: HammerTranscriptVersionSource,
): number {
  return registry.versions.filter((v) => v.source === source).length;
}

// ── Normalizer ──────────────────────────────────────────────────────────────

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeVersionEntry(value: unknown): HammerTranscriptVersionEntry | null {
  const row = readObject(value);
  if (!row) return null;
  const version_id = readString(row.version_id);
  const label = readString(row.label) ?? "(unknown)";
  const source = readString(row.source);
  const created_at = readString(row.created_at);
  const transcript_artifact_path = readString(row.transcript_artifact_path);
  const segment_count = readNumber(row.segment_count) ?? 0;
  if (!version_id || !source || !created_at || !transcript_artifact_path) return null;
  if (source !== "anvil" && source !== "hammer_ai" && source !== "imported") return null;
  return {
    version_id,
    label,
    source,
    created_at,
    transcript_artifact_path,
    segment_count,
    model: readString(row.model),
    provider: readString(row.provider),
    provider_request_id: readString(row.provider_request_id),
    confidence_summary: normalizeConfidenceSummary(row.confidence_summary),
  };
}

function normalizeConfidenceSummary(
  value: unknown,
): HammerTranscriptVersionEntry["confidence_summary"] {
  const row = readObject(value);
  if (!row) return null;
  const total_turns = readNumber(row.total_turns);
  const low_confidence_turns = readNumber(row.low_confidence_turns);
  if (total_turns == null || low_confidence_turns == null) return null;
  return { total_turns, low_confidence_turns };
}

/**
 * Safe deserializer for data loaded from storage.
 * Returns null if the payload is missing or malformed rather than throwing.
 */
export function normalizeTranscriptVersionRegistry(
  value: unknown,
): HammerPersistedTranscriptVersionRegistry | null {
  const row = readObject(value);
  if (!row) return null;
  if (row.schema_version !== 1) return null;
  const active_version_id = readString(row.active_version_id);
  if (!active_version_id) return null;
  if (!Array.isArray(row.versions)) return null;
  const versions = row.versions
    .map(normalizeVersionEntry)
    .filter((v): v is HammerTranscriptVersionEntry => v !== null);
  if (versions.length === 0) return null;
  const activeExists = versions.some((v) => v.version_id === active_version_id);
  if (!activeExists) return null;
  return { schema_version: 1, active_version_id, versions };
}

// ── Internals ────────────────────────────────────────────────────────────────

function generateVersionId(): string {
  // crypto.randomUUID is available in all modern browsers and Node 14.17+.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Minimal fallback (not cryptographically random, only for old environments).
  return `tvid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function buildConfidenceSummary(
  transcript: HammerPersistedStructuredTranscript,
): HammerTranscriptVersionEntry["confidence_summary"] {
  const totalTurns = transcript.segments.length;
  const lowConfidenceTurns = (transcript.confidence_flags ?? []).length;
  return { total_turns: totalTurns, low_confidence_turns: lowConfidenceTurns };
}
