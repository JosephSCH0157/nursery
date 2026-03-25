import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import { buildForgeRouteHref, parseForgeRouteContext } from "../lib/forge-route-context";
import { resolveTongsRequestApiToken } from "@hearth/lib/tongs-fetch";
import { tongsApiFetch, tongsApiRequest } from "../lib/tongs-api";
import {
  parseAnvilHandoffSearch,
  validateAnvilHandoffTarget,
  type HandoffEpisodeSummary,
} from "../lib/forge-handoff-validation";
import anvilDevSourceUrl from "../../../anvil/teleprompter_pro.html?url";
import "./Anvil.css";
import { useWorkspaceBootstrap } from "../hooks/useWorkspaceBootstrap";

const ANVIL_FULL_PAGE_URL = import.meta.env.DEV
  ? anvilDevSourceUrl
  : "/anvil/teleprompter_pro.html";
const TONGS_TOKEN_STORAGE_KEY = "forge_tongs_api_token_v1";

export default function AnvilRoute() {
  const shell = useOutletContext<AppShellContext>();
  const location = useLocation();
  const context = useMemo(() => parseForgeRouteContext(location.search), [location.search]);
  useWorkspaceBootstrap({ episodeId: context.workpieceId ?? undefined });
  const handoff = useMemo(() => parseAnvilHandoffSearch(location.search), [location.search]);
  const handoffValidationSeqRef = useRef(0);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffValidating, setHandoffValidating] = useState(false);
  const applyHandoffState = useCallback((validating: boolean, error: string | null) => {
    setHandoffValidating(validating);
    setHandoffError(error);
  }, []);
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
  const anvilHomeHref = useMemo(
    () =>
      buildForgeRouteHref(ANVIL_FULL_PAGE_URL, {
        search: location.search,
        workspaceId: resolvedWorkspaceId,
      }),
    [location.search, resolvedWorkspaceId],
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
  const hasRequestedHandoff = Boolean(
    context.workpieceId
    || context.hasInvalidWorkpieceId
    || handoff.scriptPath
    || handoff.hasInvalidScriptPath,
  );

  const bridgeTongsToken = useCallback(() => {
    try {
      const token = resolveTongsRequestApiToken();
      if (token) {
        window.localStorage.setItem(TONGS_TOKEN_STORAGE_KEY, token);
      }
    } catch {
      // Ignore storage failures; Anvil still may resolve token via env/query.
    }
  }, []);

  const listEpisodes = useCallback(async (workspaceId: string): Promise<HandoffEpisodeSummary[]> => {
    const data = await tongsApiRequest<{ episodes?: unknown }>(
      `/tongs/workspaces/${encodeURIComponent(workspaceId)}/episodes?include_archived=1`,
      { method: "GET" },
    );
    return Array.isArray(data.episodes)
      ? data.episodes.filter((row): row is HandoffEpisodeSummary => !!row && typeof row === "object")
      : [];
  }, []);

  const readTextFilePresence = useCallback(async (workpieceId: string, path: string): Promise<{ exists: boolean }> => {
    const response = await tongsApiFetch(
      `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(path)}`,
      { method: "GET" },
    );

    if (response.status === 404) {
      return { exists: false };
    }
    if (!response.ok) {
      throw new Error("handoff_script_read_failed");
    }

    let body: {
      ok?: unknown;
      exists?: unknown;
    } | null = null;
    try {
      body = await response.json() as { ok?: unknown; exists?: unknown } | null;
    } catch {
      body = null;
    }

    if (body?.ok !== true) {
      throw new Error("handoff_script_invalid_response");
    }

    if (body?.exists === false) {
      return { exists: false };
    }

    return { exists: true };
  }, []);

  useEffect(() => {
    if (!resolvedWorkspaceId || waitingForWorkspaceResolution) return;
    const requestSeq = handoffValidationSeqRef.current + 1;
    handoffValidationSeqRef.current = requestSeq;

    if (!hasRequestedHandoff) {
      bridgeTongsToken();
      window.location.replace(anvilHref);
      return;
    }

    if (context.hasInvalidWorkpieceId) {
      queueMicrotask(() => {
        applyHandoffState(false, "The requested workpiece context is invalid. Reopen Anvil from Hearth.");
      });
      return;
    }

    if (handoff.hasInvalidScriptPath) {
      queueMicrotask(() => {
        applyHandoffState(false, "The requested script path is invalid. Reopen the script from Hearth.");
      });
      return;
    }

    if (!context.workpieceId) {
      queueMicrotask(() => {
        applyHandoffState(false, "Open in Anvil requires a valid workpiece reference. Reopen the target from Hearth.");
      });
      return;
    }

    queueMicrotask(() => {
      applyHandoffState(true, null);
    });

    void validateAnvilHandoffTarget({
      workspaceId: resolvedWorkspaceId,
      workpieceId: context.workpieceId,
      scriptPath: handoff.scriptPath,
      listEpisodes,
      readTextFile: readTextFilePresence,
    }).then((result) => {
      if (handoffValidationSeqRef.current !== requestSeq) return;
      if (!result.ok) {
        setHandoffValidating(false);
        setHandoffError(result.message);
        return;
      }
      setHandoffValidating(false);
      setHandoffError(null);
      bridgeTongsToken();
      window.location.replace(anvilHref);
    }).catch(() => {
      if (handoffValidationSeqRef.current !== requestSeq) return;
      setHandoffValidating(false);
      setHandoffError("Unable to validate the requested Anvil target. Reopen it from Hearth.");
    });
  }, [
    anvilHref,
    applyHandoffState,
    bridgeTongsToken,
    context.hasInvalidWorkpieceId,
    context.workpieceId,
    handoff.hasInvalidScriptPath,
    handoff.scriptPath,
    hasRequestedHandoff,
    listEpisodes,
    readTextFilePresence,
    resolvedWorkspaceId,
    waitingForWorkspaceResolution,
  ]);

  if (waitingForWorkspaceResolution) {
    return (
      <section className="anvil-route-status">
        <h2 className="anvil-route-status__title">Resolving workspace access...</h2>
        <p className="anvil-route-status__copy">Validating the requested Anvil workspace before opening the teleprompter.</p>
      </section>
    );
  }

  if (!resolvedWorkspaceId) {
    return <WorkspaceRequiredNotice toolName="Anvil" />;
  }

  if (handoffValidating) {
    return (
      <section className="anvil-route-status">
        <h2 className="anvil-route-status__title">Validating Anvil handoff...</h2>
        <p className="anvil-route-status__copy">Rechecking the requested workpiece and script against canonical workspace state.</p>
      </section>
    );
  }

  if (handoffError) {
    return (
      <section className="anvil-route-status">
        <h2 className="anvil-route-status__title">Unable to open Anvil target</h2>
        <p className="anvil-route-status__copy">{handoffError}</p>
        <a href={anvilHomeHref}>Continue to Anvil home</a>
      </section>
    );
  }

  return (
    <section className="anvil-route-status">
      <h2 className="anvil-route-status__title">Opening Anvil...</h2>
      <a href={anvilHref}>Continue to Anvil</a>
    </section>
  );
}
