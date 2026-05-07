import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";

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

