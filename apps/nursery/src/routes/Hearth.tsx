import { useEffect, useMemo } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import { buildForgeRouteHref, parseForgeRouteContext } from "../lib/forge-route-context";

const HEARTH_FULL_PAGE_URL = "/apps/hearth";

export default function HearthRoute() {
  const shell = useOutletContext<AppShellContext>();
  const location = useLocation();
  const context = useMemo(() => parseForgeRouteContext(location.search), [location.search]);
  const hearthHref = useMemo(
    () =>
      buildForgeRouteHref(HEARTH_FULL_PAGE_URL, {
        search: location.search,
        workspaceId: shell.workspaceId,
        workpieceId: context.workpieceId,
      }),
    [context.workpieceId, location.search, shell.workspaceId],
  );

  useEffect(() => {
    if (!shell.workspaceId) return;
    window.location.replace(hearthHref);
  }, [hearthHref, shell.workspaceId]);

  if (!shell.workspaceId) {
    return <WorkspaceRequiredNotice toolName="Hearth" />;
  }

  return (
    <section style={{ padding: 24, display: "grid", gap: 8 }}>
      <h2 style={{ margin: 0 }}>Opening Hearth...</h2>
      <a href={hearthHref}>Continue to Hearth</a>
    </section>
  );
}
