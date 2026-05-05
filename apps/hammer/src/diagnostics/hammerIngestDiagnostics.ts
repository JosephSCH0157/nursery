import { HAMMER_RUNTIME_WRITTEN_BY } from "../prep/hammerPrep";
import { tongsFetch } from "../lib/tongsFetch";

export const HAMMER_INGEST_DIAGNOSTIC_PATH = "hammer/diagnostics/ingest-last.v1.json";

export type HammerIngestFinalStatus =
  | "reused_transcript"
  | "prepared_transcript"
  | "blocked"
  | "degraded";

export type HammerIngestTranscriptSource = "registered" | "revision" | "baseline" | "local_anvil";

export type HammerIngestDiagnosticV1 = {
  schema_version: 1;
  timestamp: string;
  workspace_id: string;
  workpiece_id: string;
  revision_id: string | null;
  canonical_recording_id: string | null;
  final_status: HammerIngestFinalStatus;
  prep_source: {
    media_kind: string;
    source_kind: string;
    canonical_workpiece_path: string | null;
    local_relpath: string | null;
    media_signature?: string | null;
    media_id?: string | null;
  } | null;
  transcript_sources_evaluated: Array<{
    source: HammerIngestTranscriptSource;
    path: string | null;
    segment_count: number | null;
    load_ok: boolean;
    rejection_reason: string | null;
  }>;
  pointers: {
    transcript_artifact_path: string | null;
    revision_transcript_path: string | null;
    baseline_transcript_path: string | null;
  };
  pointer_self_heal: {
    attempted: boolean;
    definitive_failure: boolean;
    action: "none" | "quarantined" | "cleared";
    reason: string | null;
  };
  local_anvil_recovery?: {
    scan_attempted: boolean;
    match_found: boolean;
    capture_session_id: string | null;
    segment_count: number | null;
    promote_ok: boolean | null;
    promote_error: string | null;
  };
  seal: {
    attempted: boolean;
    outcome: "sealed" | "already_sealed" | "conflict_recovered" | "skipped" | "failed";
    error_code?: string;
    error_message?: string;
  };
  request_ids: {
    client_request_id?: string;
    provider_request_id?: string;
    tongs_request_id?: string;
  };
  extra?: Record<string, unknown>;
};

export async function writeHammerIngestDiagnostics(args: {
  workpieceId: string;
  diagnostic: HammerIngestDiagnosticV1;
  correlationId?: string | null;
}): Promise<{ ok: true; tongs_request_id: string | null } | { ok: false; error: string }> {
  try {
    const response = await tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
      {
        method: "POST",
        json: {
          path: HAMMER_INGEST_DIAGNOSTIC_PATH,
          content_type: "application/json",
          file_type: "hammer_diagnostic",
          written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
          event_name: "hammer.ingest.diagnostic.saved.v1",
          event_payload: {
            schema_version: 1,
            workpiece_id: args.diagnostic.workpiece_id,
            workspace_id: args.diagnostic.workspace_id,
            kind: "ingest_last",
            final_status: args.diagnostic.final_status,
          },
          ...(args.correlationId ? { correlation_id: args.correlationId } : {}),
          json: args.diagnostic,
        },
        timeoutMs: 20_000,
      },
    );
    const requestId = response.headers.get("x-request-id");
    if (!response.ok) {
      return { ok: false, error: `Failed to write ingest diagnostics (status ${response.status}).` };
    }
    return { ok: true, tongs_request_id: requestId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to write ingest diagnostics." };
  }
}

