import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { buildForgeRouteHref, parseForgeRouteContext } from "../lib/forge-route-context";

const ACCOUNT_PAGE_PATH = "/anvil/account.html";

export default function SubscriptionsRoute() {
  const location = useLocation();
  const routeContext = useMemo(() => parseForgeRouteContext(location.search), [location.search]);

  const accountHref = useMemo(
    () =>
      buildForgeRouteHref(ACCOUNT_PAGE_PATH, {
        search: location.search,
        workspaceId: routeContext.workspaceId,
        workpieceId: routeContext.workpieceId,
      }),
    [location.search, routeContext.workspaceId, routeContext.workpieceId],
  );

  return (
    <section
      style={{
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr)",
        gap: 8,
        height: "calc(100dvh - 96px)",
        background: "#0b1220",
        color: "#e6edf7",
        border: "1px solid rgba(148, 163, 184, 0.25)",
        borderRadius: 12,
        padding: 8,
      }}
    >
      <details
        style={{
          border: "1px solid rgba(148, 163, 184, 0.25)",
          borderRadius: 8,
          padding: "6px 8px",
          background: "rgba(15, 23, 38, 0.72)",
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
          Forge Subscriptions
        </summary>
        <div style={{ fontSize: 13, opacity: 0.84, marginTop: 6 }}>
          Manage your Forge plan and billing.
          {" "}
          <a href={accountHref} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>
            Open in new tab
          </a>
        </div>
      </details>

      <iframe
        title="Forge Subscriptions"
        src={accountHref}
        style={{
          width: "100%",
          height: "100%",
          minHeight: 0,
          border: "1px solid rgba(148, 163, 184, 0.35)",
          borderRadius: 10,
          background: "#0b1220",
        }}
      />
    </section>
  );
}
