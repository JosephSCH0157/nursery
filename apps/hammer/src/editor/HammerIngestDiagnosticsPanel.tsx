import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import type { HammerIngestDiagnosticV1 } from "../diagnostics/hammerIngestDiagnostics";
import { loadLatestHammerIngestDiagnostics } from "../diagnostics/hammerIngestDiagnosticsRead";

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeDiagnosticV1(payload: unknown): HammerIngestDiagnosticV1 | null {
  const root = readObject(payload);
  if (!root) return null;
  if (root.schema_version !== 1) return null;
  const finalStatus = readString(root.final_status);
  if (!finalStatus) return null;
  return payload as HammerIngestDiagnosticV1;
}

function mapSelectedSourceLabel(value: string | null): string {
  switch (value) {
    case "registered_transcript":
      return "Registered pointer";
    case "revision_transcript":
      return "Revision transcript";
    case "canonical_baseline":
      return "Canonical baseline";
    default:
      return value ? value : "Unknown";
  }
}

function mapFinalStatusLabel(value: string | null): string {
  switch (value) {
    case "reused_transcript":
      return "Reused transcript";
    case "prepared_transcript":
      return "Prepared transcript";
    case "degraded":
      return "Degraded";
    case "blocked":
      return "Blocked";
    default:
      return value ? value : "Unknown";
  }
}

function deriveSelectedSegmentCount(diag: HammerIngestDiagnosticV1, selectedSource: string | null): number | null {
  const selected = selectedSource ?? null;
  const sourceKey = selected === "registered_transcript"
    ? "registered"
    : selected === "revision_transcript"
      ? "revision"
      : selected === "canonical_baseline"
        ? "baseline"
        : null;
  if (!sourceKey) return null;
  const row = diag.transcript_sources_evaluated.find((entry) => entry.source === sourceKey) ?? null;
  return row?.segment_count ?? null;
}

function buildHeadline(diag: HammerIngestDiagnosticV1, selectedSource: string | null): string {
  const finalStatus = diag.final_status;
  const prepCode = readString((diag.extra as Record<string, unknown> | undefined)?.prep_error_code ?? null);
  const sealOutcome = diag.seal?.outcome ?? null;
  if (finalStatus === "reused_transcript" && selectedSource === "registered_transcript") {
    return "Hammer reused the registered transcript and entered in reusable mode.";
  }
  if (finalStatus === "reused_transcript") {
    return "Hammer reused an existing transcript and entered in reusable mode.";
  }
  if (finalStatus === "prepared_transcript") {
    return "Hammer prepared a new transcript and entered in prepared mode.";
  }
  if (finalStatus === "blocked" && prepCode) {
    return `Hammer could not reuse any transcript and transcript prep failed with ${prepCode}.`;
  }
  if (diag.pointer_self_heal?.action === "cleared") {
    return "Hammer found a bad registered transcript pointer, cleared it, and fell back to another source.";
  }
  if (sealOutcome === "conflict_recovered" || sealOutcome === "already_sealed") {
    return "Hammer hit a seal race but recovered by re-reading canonical baseline.";
  }
  return "Hammer ingest details are available below.";
}

export function HammerIngestDiagnosticsPanel(props: { workpieceId: string | null }): JSX.Element | null {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState<boolean | null>(null);
  const [payload, setPayload] = useState<unknown | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!props.workpieceId) return;
    let active = true;
    setLoading(true);
    setError(null);
    void loadLatestHammerIngestDiagnostics(props.workpieceId)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setExists(null);
          setPayload(null);
          setError(result.error);
          return;
        }
        setExists(result.exists);
        setPayload(result.payload);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [props.workpieceId, refreshNonce]);

  const diag = useMemo(() => normalizeDiagnosticV1(payload), [payload]);
  const selectedSource = useMemo(() => {
    if (!diag) return null;
    const extra = (diag.extra ?? {}) as Record<string, unknown>;
    return readString(extra.selected_transcript_source) ?? null;
  }, [diag]);
  const selectedSegments = useMemo(() => (diag && selectedSource ? deriveSelectedSegmentCount(diag, selectedSource) : null), [diag, selectedSource]);
  const prepClientRequestId = useMemo(() => diag?.request_ids?.client_request_id ?? null, [diag]);
  const prepProviderRequestId = useMemo(() => diag?.request_ids?.provider_request_id ?? null, [diag]);
  const prepErrorCode = useMemo(() => readString((diag?.extra as Record<string, unknown> | undefined)?.prep_error_code ?? null), [diag]);
  const headline = useMemo(() => (diag ? buildHeadline(diag, selectedSource) : "Ingest diagnostics are not available yet."), [diag, selectedSource]);

  const onRefresh = useCallback(() => {
    setRefreshNonce((current) => current + 1);
  }, []);

  const onCopySummary = useCallback(async () => {
    if (!diag) return;
    const copyPayload = {
      final_status: diag.final_status,
      selected_source: selectedSource,
      segment_count: selectedSegments,
      prep_error_code: prepErrorCode,
      pointer_self_heal: diag.pointer_self_heal?.action !== "none",
      seal_outcome: diag.seal?.outcome ?? null,
      timestamp: diag.timestamp,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(copyPayload, null, 2));
      setCopyStatus("Copied.");
      window.setTimeout(() => setCopyStatus(null), 2000);
    } catch (e) {
      setCopyStatus(e instanceof Error ? e.message : "Copy failed.");
      window.setTimeout(() => setCopyStatus(null), 4000);
    }
  }, [diag, prepErrorCode, selectedSegments, selectedSource]);

  if (!props.workpieceId) return null;

  return (
    <section className="hammer-ingest-diagnostics">
      <header className="hammer-ingest-diagnostics__header">
        <strong>Ingest Diagnostics</strong>
        <div className="hammer-ingest-diagnostics__actions">
          <button
            type="button"
            className="hammer-prep-shell__session-action"
            onClick={onRefresh}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="hammer-prep-shell__session-action"
            onClick={() => void onCopySummary()}
            disabled={!diag}
          >
            Copy summary
          </button>
        </div>
      </header>

      <div className="hammer-ingest-diagnostics__body">
        <div className="hammer-ingest-diagnostics__headline">{headline}</div>

        {loading ? (
          <div className="hammer-ingest-diagnostics__muted">Loading ingest diagnostics…</div>
        ) : error ? (
          <div className="hammer-ingest-diagnostics__muted">Failed to load ingest diagnostics: {error}</div>
        ) : exists === false ? (
          <div className="hammer-ingest-diagnostics__muted">No ingest diagnostics recorded yet.</div>
        ) : !diag ? (
          <div className="hammer-ingest-diagnostics__muted">Ingest diagnostics exist, but are not in a recognized format.</div>
        ) : (
          <dl className="hammer-ingest-diagnostics__grid">
            <div>
              <dt>Ingest result</dt>
              <dd>{mapFinalStatusLabel(diag.final_status)}</dd>
            </div>
            <div>
              <dt>Transcript source</dt>
              <dd>{mapSelectedSourceLabel(selectedSource)}</dd>
            </div>
            <div>
              <dt>Segments</dt>
              <dd>{selectedSegments ?? "—"}</dd>
            </div>
            <div>
              <dt>Pointer self-heal</dt>
              <dd>{diag.pointer_self_heal?.action === "none" ? "No" : diag.pointer_self_heal?.action}</dd>
            </div>
            <div>
              <dt>Seal outcome</dt>
              <dd>{diag.seal?.outcome ?? "—"}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{diag.timestamp}</dd>
            </div>
            <div>
              <dt>Prep request</dt>
              <dd>{prepClientRequestId ?? "—"}</dd>
            </div>
            <div>
              <dt>Provider request</dt>
              <dd>{prepProviderRequestId ?? "—"}</dd>
            </div>
            <div>
              <dt>Prep error</dt>
              <dd>{prepErrorCode ?? "—"}</dd>
            </div>
          </dl>
        )}

        {copyStatus ? <div className="hammer-ingest-diagnostics__muted">{copyStatus}</div> : null}

        {exists === false ? null : (
          <details className="hammer-ingest-diagnostics__details">
            <summary>Show ingest details</summary>
            {payload == null ? (
              <div className="hammer-ingest-diagnostics__muted">
                No ingest diagnostics recorded yet. Run a prep cycle (or regenerate transcript) to produce `hammer/diagnostics/ingest-last.v1.json`.
              </div>
            ) : (
              <pre className="hammer-ingest-diagnostics__json">{JSON.stringify(payload, null, 2)}</pre>
            )}
          </details>
        )}
      </div>
    </section>
  );
}
