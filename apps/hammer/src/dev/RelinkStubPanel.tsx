import { useMemo } from "react";
import type { JSX } from "react";
import { Link, useLocation } from "react-router-dom";
import "./RelinkStubPanel.css";

type RelinkQueryState = {
  workspaceId: string | null;
  mediaId: string | null;
  action: string | null;
  returnTo: string;
};

const DEFAULT_RETURN_TO = "/app/hammer/dev/cards";

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
    <section className="hammer-relink-stub-panel">
      <header className="hammer-relink-stub-panel__header">
        <h2 className="hammer-relink-stub-panel__title">Relink Media (Stub)</h2>
        <div className="hammer-relink-stub-panel__subtitle">
          Stub route for validating RELINK_MEDIA CTA payload propagation.
        </div>
      </header>

      <div className={payloadReceived
        ? "hammer-relink-stub-panel__status hammer-relink-stub-panel__status--ok"
        : "hammer-relink-stub-panel__status hammer-relink-stub-panel__status--warn"}
      >
        {payloadReceived
          ? "Payload received."
          : `Missing required query params: ${missingFields.join(", ")}`}
      </div>

      <div className="hammer-relink-stub-panel__fields">
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

      <div className="hammer-relink-stub-panel__links">
        <Link to={query.returnTo}>Back</Link>
        <Link to={DEFAULT_RETURN_TO}>Back to Cards</Link>
      </div>
    </section>
  );
}
