import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EpisodeWorkspaceReadModel } from "@forge/shared/episode-workspace";
import { useLocation, useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import { buildForgeRouteHref, parseForgeRouteContext } from "../lib/forge-route-context";
import { appendAnvilDevFlagsToHref } from "../lib/anvil-dev-flags";
import { resolveTongsRequestApiToken } from "@hearth/lib/tongs-fetch";
import { tongsApiFetch, tongsApiRequest } from "../lib/tongs-api";
import {
  parseAnvilHandoffSearch,
  validateAnvilHandoffTarget,
  type HandoffEpisodeSummary,
} from "../lib/forge-handoff-validation";
import "./Anvil.css";
import { useWorkspaceBootstrap } from "../hooks/useWorkspaceBootstrap";
import EpisodeContinuityStrip from "../shell/EpisodeContinuityStrip";
import {
  useEpisodeWorkspaceLoading,
  useEpisodeWorkspaceReadModel,
} from "../workspace/useEpisodeWorkspaceReadModel";

const ANVIL_FULL_PAGE_URL = "/anvil/teleprompter_pro.html";
const TONGS_TOKEN_STORAGE_KEY = "forge_tongs_api_token_v1";

function appendEpisodeTitleParam(href: string, episodeTitle: string | null): string {
  const normalizedTitle = episodeTitle?.trim() ?? "";
  if (!normalizedTitle) return href;
  const [pathname, rawSearch = ""] = href.split("?", 2);
  const params = new URLSearchParams(rawSearch);
  params.set("episode_title", normalizedTitle);
  const nextSearch = params.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}

function finalizeAnvilLaunchHref(href: string, search: string, episodeTitle: string | null): string {
  const withTitle = appendEpisodeTitleParam(href, episodeTitle);
  try {
    return appendAnvilDevFlagsToHref({
      href: withTitle,
      search,
      storage: typeof window !== "undefined" ? window.localStorage : null,
    });
  } catch {
    return withTitle;
  }
}

export default function AnvilRoute() {
  const shell = useOutletContext<AppShellContext>();
  const location = useLocation();
  const context = useMemo(() => parseForgeRouteContext(location.search), [location.search]);
  useWorkspaceBootstrap({ episodeId: context.workpieceId ?? undefined });
  const handoff = useMemo(() => parseAnvilHandoffSearch(location.search), [location.search]);
  const handoffValidationSeqRef = useRef(0);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffValidating, setHandoffValidating] = useState(false);
  const [resolvedEpisodeTitle, setResolvedEpisodeTitle] = useState<string | null>(null);
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
  const anvilHomeHref = useMemo(() => finalizeAnvilLaunchHref(
    buildForgeRouteHref(ANVIL_FULL_PAGE_URL, {
        search: location.search,
        workspaceId: resolvedWorkspaceId,
      }),
    location.search,
    resolvedEpisodeTitle,
  ), [location.search, resolvedEpisodeTitle, resolvedWorkspaceId]);
  const anvilHref = useMemo(() => finalizeAnvilLaunchHref(
    buildForgeRouteHref(ANVIL_FULL_PAGE_URL, {
        search: location.search,
        workspaceId: resolvedWorkspaceId,
        workpieceId: context.workpieceId,
      }),
    location.search,
    resolvedEpisodeTitle,
  ), [context.workpieceId, location.search, resolvedEpisodeTitle, resolvedWorkspaceId]);
  const hasRequestedHandoff = Boolean(
    context.workpieceId
    || context.hasInvalidWorkpieceId
    || handoff.scriptPath
    || handoff.hasInvalidScriptPath,
  );
  const anvilEpisodeReadModel = useMemo(() => {
    const episodeId = context.workpieceId?.trim() ?? "";
    const title = resolvedEpisodeTitle?.trim() ?? "";
    if (!episodeId || !title) return null;
    return {
      episodeId,
      title,
      phase: "record",
      displayStatus: handoffValidating ? "scheduled" : "recording",
    } satisfies EpisodeWorkspaceReadModel;
  }, [context.workpieceId, handoffValidating, resolvedEpisodeTitle]);
  useEpisodeWorkspaceLoading(
    context.workpieceId ?? null,
    Boolean(context.workpieceId && (waitingForWorkspaceResolution || handoffValidating) && !anvilEpisodeReadModel),
  );
  useEpisodeWorkspaceReadModel(anvilEpisodeReadModel);

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
    setResolvedEpisodeTitle(null);
    const data = await tongsApiRequest<{ episodes?: unknown }>(
      `/tongs/workspaces/${encodeURIComponent(workspaceId)}/episodes?include_archived=1`,
      { method: "GET" },
    );
    const episodes = Array.isArray(data.episodes)
      ? data.episodes.filter((row): row is HandoffEpisodeSummary => !!row && typeof row === "object")
      : [];
    const matchedEpisode = context.workpieceId
      ? episodes.find((row) => row.id === context.workpieceId)
      : null;
    setResolvedEpisodeTitle(matchedEpisode?.title?.trim() ?? null);
    return episodes;
  }, [context.workpieceId]);

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
        applyHandoffState(false, "This recording link is invalid. Start Recording again from Script.");
      });
      return;
    }

    if (handoff.hasInvalidScriptPath) {
      queueMicrotask(() => {
        applyHandoffState(false, "This script link is invalid. Start Recording again from Script.");
      });
      return;
    }

    if (!context.workpieceId) {
      queueMicrotask(() => {
        applyHandoffState(false, "Start Recording needs a valid episode reference. Reopen this episode from Script.");
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
      setHandoffError("Unable to validate this recording handoff. Start Recording again from Script.");
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
        <EpisodeContinuityStrip
          phase="record"
          workpieceId={context.workpieceId}
          compact
          detail="Preparing the recording workspace for this episode."
        />
        <h2 className="anvil-route-status__title">Loading Recording workspace...</h2>
        <p className="anvil-route-status__copy">Confirming episode and workspace access before opening the recorder.</p>
      </section>
    );
  }

  if (!resolvedWorkspaceId) {
    return <WorkspaceRequiredNotice toolName="Anvil" />;
  }

  if (handoffValidating) {
    return (
      <section className="anvil-route-status">
        <EpisodeContinuityStrip
          phase="record"
          workpieceId={context.workpieceId}
          compact
          detail="Checking that this episode and script are ready to record."
        />
        <h2 className="anvil-route-status__title">Checking recording handoff...</h2>
        <p className="anvil-route-status__copy">Making sure the latest script and episode context are ready before recording starts.</p>
      </section>
    );
  }

  if (handoffError) {
    return (
      <section className="anvil-route-status">
        <EpisodeContinuityStrip
          phase="record"
          workpieceId={context.workpieceId}
          compact
          detail="This episode is still in the recording phase, but the current handoff needs attention."
          ctaLabel="Back to Script"
          ctaPhase="script"
        />
        <h2 className="anvil-route-status__title">Unable to start recording</h2>
        <p className="anvil-route-status__copy">{handoffError}</p>
        <a className="forge-workflow-link" href={anvilHomeHref}>Go to Recording home</a>
      </section>
    );
  }

  return (
    <section className="anvil-route-status">
      <EpisodeContinuityStrip
        phase="record"
        workpieceId={context.workpieceId}
        compact
        detail="Recording is opening with this episode already attached."
      />
      <h2 className="anvil-route-status__title">Opening Recording...</h2>
      <a className="forge-workflow-link" href={anvilHref}>Continue to Recording</a>
    </section>
  );
}
