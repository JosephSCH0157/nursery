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
  const requestedWorkspaceId = context.workspaceId;
  const requestedWorkspaceKnown = useMemo(
    () => !!requestedWorkspaceId && shell.workspaces.some((workspace) => workspace.id === requestedWorkspaceId),
    [requestedWorkspaceId, shell.workspaces],
  );
  const resolvedWorkspaceId = useMemo(() => {
    if (requestedWorkspaceKnown) return requestedWorkspaceId;
    if (shell.workspaceId && shell.workspaces.some((workspace) => workspace.id === shell.workspaceId)) {
      return shell.workspaceId;
    }
    return shell.workspaces[0]?.id ?? null;
  }, [requestedWorkspaceId, requestedWorkspaceKnown, shell.workspaceId, shell.workspaces]);
  const waitingForWorkspaceResolution = Boolean(
    requestedWorkspaceId
    && !requestedWorkspaceKnown
    && (!shell.hasWorkspaceFetchSucceeded || shell.loadingWorkspaces),
  );
  const hearthHref = useMemo(
    () =>
      buildForgeRouteHref(HEARTH_FULL_PAGE_URL, {
        search: location.search,
        workspaceId: resolvedWorkspaceId,
        workpieceId: context.workpieceId,
      }),
    [context.workpieceId, location.search, resolvedWorkspaceId],
  );

  useEffect(() => {
    if (!resolvedWorkspaceId || waitingForWorkspaceResolution) return;
    window.location.replace(hearthHref);
  }, [hearthHref, resolvedWorkspaceId, waitingForWorkspaceResolution]);

  if (waitingForWorkspaceResolution) {
    return (
      <section style={{ padding: 24, display: "grid", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Resolving workspace access...</h2>
        <p style={{ margin: 0 }}>Validating the requested Hearth workspace before opening the full app.</p>
      </section>
    );
  }

  if (!resolvedWorkspaceId) {
    return <WorkspaceRequiredNotice toolName="Hearth" />;
  }

  return (
    <section style={{ padding: 24, display: "grid", gap: 8 }}>
      <h2 style={{ margin: 0 }}>Opening Hearth...</h2>
      <a href={hearthHref}>Continue to Hearth</a>
    </section>
  );
}
