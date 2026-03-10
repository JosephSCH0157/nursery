import { useEffect, useMemo } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import { resolveTongsRequestApiToken } from "@hearth/lib/tongs-fetch";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import { buildForgeRouteHref, parseForgeRouteContext } from "../lib/forge-route-context";

const ANVIL_FULL_PAGE_URL = "/anvil/teleprompter_pro.html";
const TONGS_TOKEN_STORAGE_KEY = "forge_tongs_api_token_v1";

export default function AnvilRoute() {
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
  const anvilHref = useMemo(
    () =>
      buildForgeRouteHref(ANVIL_FULL_PAGE_URL, {
        search: location.search,
        workspaceId: resolvedWorkspaceId,
        workpieceId: context.workpieceId,
      }),
    [context.workpieceId, location.search, resolvedWorkspaceId],
  );

  useEffect(() => {
    if (!resolvedWorkspaceId || waitingForWorkspaceResolution) return;
    try {
      const token = resolveTongsRequestApiToken();
      if (token) {
        window.localStorage.setItem(TONGS_TOKEN_STORAGE_KEY, token);
      }
    } catch {
      // Ignore storage failures; Anvil still may resolve token via env/query.
    }
    window.location.replace(anvilHref);
  }, [anvilHref, location.search, resolvedWorkspaceId, waitingForWorkspaceResolution]);

  if (waitingForWorkspaceResolution) {
    return (
      <section style={{ padding: 24, display: "grid", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Resolving workspace access...</h2>
        <p style={{ margin: 0 }}>Validating the requested Anvil workspace before opening the teleprompter.</p>
      </section>
    );
  }

  if (!resolvedWorkspaceId) {
    return <WorkspaceRequiredNotice toolName="Anvil" />;
  }

  return (
    <section style={{ padding: 24, display: "grid", gap: 8 }}>
      <h2 style={{ margin: 0 }}>Opening Anvil...</h2>
      <a href={anvilHref}>Continue to Anvil</a>
    </section>
  );
}
