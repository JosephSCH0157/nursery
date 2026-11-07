import type { HammerIngestDiagnosticV1 } from "../diagnostics/hammerIngestDiagnostics";

type RecoveredAnvilSnapshot = {
  segments: unknown[];
  capture_session_id: string;
  segment_count: number;
  live_path?: string | null;
  final_path?: string | null;
};

export function scanNonCanonicalAnvilTranscript(args: {
  workpieceId: string;
  find: (workpieceId: string) => RecoveredAnvilSnapshot | null;
}): {
  recovery: NonNullable<HammerIngestDiagnosticV1["live_noncanonical_asr"]>;
  evaluation: HammerIngestDiagnosticV1["transcript_sources_evaluated"][number] | null;
} {
  console.info("[hammer:transcript:canonical_missing]", { workpiece_id: args.workpieceId, timestamp: new Date().toISOString() });
  console.info("[hammer:transcript:live_noncanonical_scan_start]", { workpiece_id: args.workpieceId, timestamp: new Date().toISOString() });
  const recovery = { scan_attempted: true, match_found: false, capture_session_id: null, segment_count: null, blocked_reason: null } satisfies NonNullable<HammerIngestDiagnosticV1["live_noncanonical_asr"]>;
  try {
    const recovered = args.find(args.workpieceId);
    if (!recovered || recovered.segments.length === 0) return { recovery, evaluation: null };
    console.info("[hammer:transcript:live_noncanonical_match_found]", { workpiece_id: args.workpieceId, capture_session_id: recovered.capture_session_id, segment_count: recovered.segment_count, timestamp: new Date().toISOString() });
    return {
      recovery: { ...recovery, match_found: true, capture_session_id: recovered.capture_session_id, segment_count: recovered.segment_count, blocked_reason: "live_noncanonical_asr_cannot_seed_canonical_transcript" },
      evaluation: { source: "live_noncanonical", path: recovered.live_path ?? recovered.final_path ?? null, segment_count: recovered.segment_count, load_ok: false, status: "absent", rejection_reason: "live_noncanonical_asr" },
    };
  } catch (error) {
    return { recovery: { ...recovery, blocked_reason: error instanceof Error ? error.message : String(error) }, evaluation: null };
  }
}
