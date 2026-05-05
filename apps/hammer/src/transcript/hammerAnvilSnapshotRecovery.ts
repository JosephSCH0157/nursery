import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerPersistedStructuredTranscript } from "../persistence/hammerPersistenceContract";
import type { HammerPersistenceTarget } from "../persistence/hammerPersistenceContract";
import { HAMMER_RUNTIME_WRITTEN_BY } from "../prep/hammerPrep";
import { saveHammerPersistenceSnapshot } from "../persistence/hammerPersistence";

export type HammerRecoveredAnvilSnapshot = {
  key: string;
  capture_session_id: string;
  workpiece_id: string;
  status: string | null;
  final_path: string | null;
  live_path: string | null;
  segment_count: number;
  segments: HammerTranscriptSegment[];
};

const ANVIL_LIVE_TRANSCRIPT_PREFIX = "forge_anvil_live_transcript_v1:";
const DEFAULT_SPEAKER = "unknown";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeSegments(raw: unknown): HammerTranscriptSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: HammerTranscriptSegment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const seg = item as Record<string, unknown>;
    const text = readString(seg.text);
    if (!text) continue;
    const startSec = typeof seg.start_sec === "number" && Number.isFinite(seg.start_sec) ? seg.start_sec : 0;
    const endSec = typeof seg.end_sec === "number" && Number.isFinite(seg.end_sec) ? seg.end_sec : startSec;
    out.push({
      segment_id: readString(seg.segment_id) ?? `seg-${out.length + 1}`,
      start_sec: startSec,
      end_sec: endSec,
      speaker: readString(seg.speaker) ?? DEFAULT_SPEAKER,
      text,
    });
  }
  return out;
}

export function findRecoveredAnvilSnapshotByWorkpieceId(
  workpieceId: string,
  storage: Storage = window.localStorage,
): HammerRecoveredAnvilSnapshot | null {
  const normalizedWorkpieceId = readString(workpieceId);
  if (!normalizedWorkpieceId) return null;

  let best: HammerRecoveredAnvilSnapshot | null = null;
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key || !key.startsWith(ANVIL_LIVE_TRANSCRIPT_PREFIX)) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (readString(parsed.workpiece_id) !== normalizedWorkpieceId) continue;
      const segments = normalizeSegments(parsed.segments);
      const segmentCount = segments.length > 0
        ? segments.length
        : Number.isFinite(Number(parsed.segment_count))
          ? Math.max(0, Math.floor(Number(parsed.segment_count)))
          : 0;
      const candidate: HammerRecoveredAnvilSnapshot = {
        key,
        capture_session_id: readString(parsed.capture_session_id) ?? "",
        workpiece_id: normalizedWorkpieceId,
        status: readString(parsed.status),
        final_path: readString(parsed.final_path),
        live_path: readString(parsed.live_path),
        segment_count: segmentCount,
        segments,
      };
      if (!best || candidate.segment_count > best.segment_count) {
        best = candidate;
      }
    } catch {
      // ignore malformed snapshot entries
    }
  }
  return best;
}

/**
 * Convert a recovered Anvil live snapshot into Hammer's structured transcript format.
 * The provider is tagged as "anvil-live-asr" to distinguish it from AI-prepared transcripts.
 */
export function convertAnvilSnapshotToHammerTranscript(
  snapshot: HammerRecoveredAnvilSnapshot,
): HammerPersistedStructuredTranscript {
  return {
    schema_version: 1,
    transcript_id: snapshot.capture_session_id || `recovered-${Date.now()}`,
    media_id: `capture-session:${snapshot.capture_session_id}`,
    media_signature: null,
    prepared_at: new Date().toISOString(),
    structure: "speaker_turns",
    source_media_ref: null,
    diarization: {
      label_scheme: "forge-neutral-speakers.v1",
      labels: [DEFAULT_SPEAKER],
      raw_labels: [DEFAULT_SPEAKER],
      version: "anvil-live-transcript.v1",
      // Type widened in contract to accept "anvil-live-asr"; cast required for strict union.
      provider: "anvil-live-asr" as "openai",
      provider_request_id: null,
      model: null,
    },
    confidence_flags: [],
    segments: snapshot.segments,
  };
}

export type AnvilLocalTranscriptPromoteResult =
  | { ok: true; segment_count: number }
  | { ok: false; error: string };

/**
 * Write a recovered Anvil live transcript into Hammer's canonical Tongs slot so that
 * the workpiece can be opened normally on next load without repeating the recovery scan.
 */
export async function promoteAnvilLocalTranscriptToTongs(
  target: HammerPersistenceTarget,
  transcript: HammerPersistedStructuredTranscript,
): Promise<AnvilLocalTranscriptPromoteResult> {
  const result = await saveHammerPersistenceSnapshot(target, {
    written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
    structured_transcript: { data: transcript },
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, segment_count: transcript.segments.length };
}

