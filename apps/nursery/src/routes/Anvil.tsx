import { useEffect, useMemo } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import { buildForgeRouteHref, parseForgeRouteContext } from "../lib/forge-route-context";

const ANVIL_FULL_PAGE_URL = "/anvil/teleprompter_pro.html";

export default function AnvilRoute() {
  const shell = useOutletContext<AppShellContext>();
  const location = useLocation();
  const context = useMemo(() => parseForgeRouteContext(location.search), [location.search]);
  const anvilHref = useMemo(
    () =>
      buildForgeRouteHref(ANVIL_FULL_PAGE_URL, {
        search: location.search,
        workspaceId: shell.workspaceId,
        workpieceId: context.workpieceId,
      }),
    [context.workpieceId, location.search, shell.workspaceId],
  );

  useEffect(() => {
    if (!shell.workspaceId) return;
    window.location.replace(anvilHref);
  }, [anvilHref, shell.workspaceId]);

  if (!shell.workspaceId) {
    return <WorkspaceRequiredNotice toolName="Anvil" />;
  }

  return (
    <section style={{ padding: 24, display: "grid", gap: 8 }}>
      <h2 style={{ margin: 0 }}>Opening Anvil...</h2>
      <a href={anvilHref}>Continue to Anvil</a>
    </section>
  );
}
