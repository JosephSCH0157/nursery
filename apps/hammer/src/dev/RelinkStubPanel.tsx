import { useMemo } from "react";
import type { CSSProperties, JSX } from "react";
import { Link, useLocation } from "react-router-dom";

type RelinkQueryState = {
  workspaceId: string | null;
  mediaId: string | null;
  action: string | null;
  returnTo: string;
};

const DEFAULT_RETURN_TO = "/app/hammer/dev/cards";

const PANEL_STYLE: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.3)",
  borderRadius: 12,
  padding: 16,
  background: "rgba(15, 23, 38, 0.82)",
  color: "#e6edf7",
  display: "grid",
  gap: 12,
};

const FIELD_GRID_STYLE: CSSProperties = {
  display: "grid",
  gap: 8,
  border: "1px solid rgba(148, 163, 184, 0.26)",
  borderRadius: 10,
  padding: 10,
  background: "rgba(2, 6, 23, 0.4)",
};

const STATUS_OK_STYLE: CSSProperties = {
  border: "1px solid rgba(34, 197, 94, 0.45)",
  borderRadius: 10,
  padding: "8px 10px",
  background: "rgba(34, 197, 94, 0.12)",
  color: "#bbf7d0",
  fontWeight: 700,
};

const STATUS_WARN_STYLE: CSSProperties = {
  border: "1px solid rgba(245, 158, 11, 0.45)",
  borderRadius: 10,
  padding: "8px 10px",
  background: "rgba(245, 158, 11, 0.12)",
  color: "#fde68a",
  fontWeight: 700,
};

function readTrimmed(params: URLSearchParams, key: string): string | null {
  const raw = params.get(key);
  if (!raw) return null;
  const next = raw.trim();
  return next.length ? next : null;
}

function readWorkspaceId(params: URLSearchParams): string | null {
  return readTrimmed(params, "workspace_id")
    ?? readTrimmed(params, "workspaceId")
    ?? readTrimmed(params, "workspace");
}

function sanitizeReturnTo(value: string | null): string {
  if (!value) return DEFAULT_RETURN_TO;
  const next = value.trim();
  if (!next) return DEFAULT_RETURN_TO;
  if (!next.startsWith("/")) return DEFAULT_RETURN_TO;
  return next;
}

function readRelinkQuery(search: string): RelinkQueryState {
  const params = new URLSearchParams(search);
  return {
    workspaceId: readWorkspaceId(params),
    mediaId: readTrimmed(params, "media_id") ?? readTrimmed(params, "mediaId"),
    action: readTrimmed(params, "action"),
    returnTo: sanitizeReturnTo(readTrimmed(params, "return_to") ?? readTrimmed(params, "returnTo")),
  };
}

function formatValue(value: string | null): string {
  return value ?? "(missing)";
}

export default function RelinkStubPanel(): JSX.Element {
  const location = useLocation();
  const query = useMemo(() => readRelinkQuery(location.search), [location.search]);

  const missingFields = useMemo(() => {
    const fields: string[] = [];
    if (!query.workspaceId) fields.push("workspace_id");
    if (!query.mediaId) fields.push("media_id");
    return fields;
  }, [query.mediaId, query.workspaceId]);

  const payloadReceived = missingFields.length === 0;

  return (
    <section style={PANEL_STYLE}>
      <header style={{ display: "grid", gap: 4 }}>
        <h2 style={{ margin: 0 }}>Relink Media (Stub)</h2>
        <div style={{ opacity: 0.82, fontSize: 13 }}>
          Stub route for validating RELINK_MEDIA CTA payload propagation.
        </div>
      </header>

      <div style={payloadReceived ? STATUS_OK_STYLE : STATUS_WARN_STYLE}>
        {payloadReceived
          ? "Payload received."
          : `Missing required query params: ${missingFields.join(", ")}`}
      </div>

      <div style={FIELD_GRID_STYLE}>
        <div>
          <strong>workspace_id:</strong> {formatValue(query.workspaceId)}
        </div>
        <div>
          <strong>media_id:</strong> {formatValue(query.mediaId)}
        </div>
        <div>
          <strong>action:</strong> {formatValue(query.action)}
        </div>
        <div>
          <strong>return_to:</strong> {query.returnTo}
        </div>
        <div>
          <strong>source route:</strong> {`${location.pathname}${location.search}`}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
        <Link to={query.returnTo}>Back</Link>
        <Link to={DEFAULT_RETURN_TO}>Back to Cards</Link>
      </div>
    </section>
  );
}
