export type HammerRecoveredAnvilSnapshot = {
  key: string;
  capture_session_id: string;
  workpiece_id: string;
  status: string | null;
  final_path: string | null;
  live_path: string | null;
  segment_count: number;
};

const ANVIL_LIVE_TRANSCRIPT_PREFIX = "forge_anvil_live_transcript_v1:";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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
      const candidate: HammerRecoveredAnvilSnapshot = {
        key,
        capture_session_id: readString(parsed.capture_session_id) ?? "",
        workpiece_id: normalizedWorkpieceId,
        status: readString(parsed.status),
        final_path: readString(parsed.final_path),
        live_path: readString(parsed.live_path),
        segment_count: Number.isFinite(Number(parsed.segment_count))
          ? Math.max(0, Math.floor(Number(parsed.segment_count)))
          : 0,
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

