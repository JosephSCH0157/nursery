import type { User } from "@supabase/supabase-js";
import type { EpisodeWorkspaceReadModel } from "@forge/shared/episode-workspace";
import { listMyWorkspaces, type Workspace } from "@barstock/lib/tongs-api";
import type { HammerShellContext, HammerShellWorkspaceOption, HammerWorkspaceResolutionState } from "@hammer/app/hammerShellContext";
import {
  loadHammerWorkpieceManifestContext,
  loadHammerWorkspaceWorkpieceLabel,
  persistHammerStoredActiveWorkspaceId,
  readHammerRouteWorkspaceId,
  readHammerStoredActiveWorkspaceId,
  readHammerWorkspaceCache,
  resolveHammerRouteWorkpieceId,
} from "@hammer/app/hammerRuntimeData";
import { buildHammerEditorHref, buildHammerRouteState, resolveHammerRouteSelection } from "@hammer/app/hammerNavigation";
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { buildForgeRouteHref } from "../lib/forge-route-context";
import { useWorkspaceBootstrap } from "../hooks/useWorkspaceBootstrap";
import { supabase } from "../lib/supabase";
import {
  loadHammerPrepAiNoticeAcknowledgedLane,
  resolveHammerPrepAiEffectiveLane,
  saveHammerPrepAiNoticeAcknowledgedLane,
  type HammerPrepAiEffectiveLane,
  type HammerPrepAiNoticeResolutionState,
} from "../lib/hammer/hammerPrepAiNotice";
import {
  useEpisodeWorkspaceLoading,
  useEpisodeWorkspaceReadModel,
} from "../workspace/useEpisodeWorkspaceReadModel";
import "./HammerStandalone.css";

const AiControlsPanel = lazy(async () => {
  const module = await import("../components/hearth/AiControlsPanel");
  return { default: module.AiControlsPanel };
});

const WORKSPACE_CACHE_KEY = "forge_workspaces_cache_v1";

function describeUser(user: User | null): string {
  if (!user) return "Guest";
  const metadata = user.user_metadata ?? {};
  const displayName = typeof metadata.display_name === "string" && metadata.display_name.trim()
    ? metadata.display_name.trim()
    : typeof metadata.full_name === "string" && metadata.full_name.trim()
    ? metadata.full_name.trim()
    : null;
  return displayName
    ?? user.email?.trim()
    ?? user.phone?.trim()
    ?? `User ${user.id.slice(0, 8)}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function searchFromHref(href: string): string {
  const q = href.indexOf("?");
  return q >= 0 ? href.slice(q) : "";
}

function saveWorkspaceCache(workspaces: HammerShellWorkspaceOption[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORKSPACE_CACHE_KEY, JSON.stringify(workspaces));
  } catch {
    // ignore storage errors
  }
}

function toHammerWorkspaceOptions(workspaces: Workspace[]): HammerShellWorkspaceOption[] {
  return workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    role: workspace.role ?? null,
  }));
}

function isAccessibleWorkspaceId(
  workspaceId: string | null,
  workspaces: HammerShellWorkspaceOption[],
  hasLoadedWorkspaces: boolean,
): string | null {
  if (!workspaceId) return null;
  if (!hasLoadedWorkspaces) return workspaceId;
  return workspaces.some((workspace) => workspace.id === workspaceId) ? workspaceId : null;
}

export default function HammerStandalone() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [aiControlsOpen, setAiControlsOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<HammerShellWorkspaceOption[]>(() => readHammerWorkspaceCache());
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [hasLoadedWorkspaces, setHasLoadedWorkspaces] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [storedWorkspaceId, setStoredWorkspaceId] = useState<string | null>(() => readHammerStoredActiveWorkspaceId());
  const [inferredWorkspaceId, setInferredWorkspaceId] = useState<string | null>(null);
  const [resolvingInferredWorkspace, setResolvingInferredWorkspace] = useState(false);
  const [viewerLabel, setViewerLabel] = useState("Guest");
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [workpieceLabel, setWorkpieceLabel] = useState<string | null>(null);
  const [workpieceLabelLoading, setWorkpieceLabelLoading] = useState(false);
  const [prepAiNoticeEffectiveLane, setPrepAiNoticeEffectiveLane] = useState<HammerPrepAiEffectiveLane>("forge-managed");
  const [prepAiNoticeAcknowledgedLaneSignature, setPrepAiNoticeAcknowledgedLaneSignature] = useState<string | null>(null);
  const [prepAiNoticeResolutionState, setPrepAiNoticeResolutionState] = useState<HammerPrepAiNoticeResolutionState>("loading");
  const [prepAiNoticeResolutionError, setPrepAiNoticeResolutionError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const allowStubScenario = import.meta.env.DEV;
  const hammerSelection = useMemo(
    () => resolveHammerRouteSelection(location.search, location.state, { allowStubScenario }),
    [allowStubScenario, location.search, location.state],
  );
  const routeWorkspaceId = useMemo(
    () => readHammerRouteWorkspaceId(location.search),
    [location.search],
  );
  const workpieceId = useMemo(
    () => resolveHammerRouteWorkpieceId(location.search),
    [location.search],
  );
  const isEditorRoute = location.pathname.startsWith("/app/hammer/editor");
  useWorkspaceBootstrap({
    episodeId: workpieceId ?? undefined,
    phase: isEditorRoute ? "edit" : undefined,
  });
  const currentOutputId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("output")?.trim() || "main-edit";
  }, [location.search]);
  const projectOutputs = hammerSelection.scenario?.outputs ?? [];
  const currentOutput = projectOutputs.find((output) => output.id === currentOutputId) ?? projectOutputs[0] ?? null;

  const refreshWorkspaces = useCallback(async () => {
    if (!isAuthenticated) {
      setWorkspaces([]);
      setWorkspaceError(null);
      setHasLoadedWorkspaces(true);
      return;
    }

    setLoadingWorkspaces(true);
    setHasLoadedWorkspaces(false);
    setWorkspaceError(null);
    try {
      const nextWorkspaces = toHammerWorkspaceOptions(await listMyWorkspaces());
      setWorkspaces(nextWorkspaces);
      saveWorkspaceCache(nextWorkspaces);
    } catch (error) {
      setWorkspaceError(getErrorMessage(error, "Hammer could not load workspace context."));
    } finally {
      setLoadingWorkspaces(false);
      setHasLoadedWorkspaces(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let active = true;

    const applyUser = (user: User | null) => {
      if (!active) return;
      setAuthUserId(user?.id ?? null);
      setViewerLabel(describeUser(user));
      setIsAuthenticated(Boolean(user));
      setAuthResolved(true);
    };

    void supabase.auth.getUser().then(({ data }) => {
      applyUser(data.user ?? null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authUserId) {
      setWorkspaces([]);
      setWorkspaceError(null);
      setHasLoadedWorkspaces(true);
      return;
    }
    void refreshWorkspaces();
  }, [authUserId, refreshWorkspaces]);

  const persistPrepAiNoticeAcknowledgedLane = useCallback(async (laneSignature: string) => {
    await saveHammerPrepAiNoticeAcknowledgedLane(laneSignature);
    setPrepAiNoticeAcknowledgedLaneSignature(laneSignature);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncWorkspaceContext = () => {
      setStoredWorkspaceId(readHammerStoredActiveWorkspaceId());
      setWorkspaces(isAuthenticated ? readHammerWorkspaceCache() : []);
    };
    window.addEventListener("storage", syncWorkspaceContext);
    window.addEventListener("focus", syncWorkspaceContext);
    return () => {
      window.removeEventListener("storage", syncWorkspaceContext);
      window.removeEventListener("focus", syncWorkspaceContext);
    };
  }, [isAuthenticated]);

  const accessibleRouteWorkspaceId = useMemo(
    () => isAccessibleWorkspaceId(routeWorkspaceId, workspaces, hasLoadedWorkspaces),
    [hasLoadedWorkspaces, routeWorkspaceId, workspaces],
  );
  const accessibleStoredWorkspaceId = useMemo(
    () => (isAuthenticated
      ? isAccessibleWorkspaceId(storedWorkspaceId, workspaces, hasLoadedWorkspaces)
      : null),
    [hasLoadedWorkspaces, isAuthenticated, storedWorkspaceId, workspaces],
  );
  const shouldInferWorkspaceFromWorkpiece = Boolean(
    workpieceId && !accessibleRouteWorkspaceId,
  );

  useEffect(() => {
    if (!shouldInferWorkspaceFromWorkpiece || !workpieceId) {
      setInferredWorkspaceId(null);
      setResolvingInferredWorkspace(false);
      return;
    }

    let active = true;
    setInferredWorkspaceId(null);
    setResolvingInferredWorkspace(true);

    void loadHammerWorkpieceManifestContext(workpieceId)
      .then((manifestContext) => {
        if (!active) return;
        setInferredWorkspaceId(manifestContext.workspaceId);
        setResolvingInferredWorkspace(false);
      })
      .catch(() => {
        if (!active) return;
        setInferredWorkspaceId(null);
        setResolvingInferredWorkspace(false);
      });

    return () => {
      active = false;
    };
  }, [shouldInferWorkspaceFromWorkpiece, workpieceId]);

  const workspaceId = inferredWorkspaceId
    ?? accessibleRouteWorkspaceId
    ?? accessibleStoredWorkspaceId;
  const workspaceResolutionState: HammerWorkspaceResolutionState = resolvingInferredWorkspace
    ? "resolving"
    : workspaceId
    ? "ready"
    : "missing";

  useEffect(() => {
    let active = true;

    if (!authResolved) {
      setPrepAiNoticeResolutionState("loading");
      setPrepAiNoticeResolutionError(null);
      return () => {
        active = false;
      };
    }

    if (!authUserId) {
      setPrepAiNoticeEffectiveLane("forge-managed");
      setPrepAiNoticeAcknowledgedLaneSignature(null);
      setPrepAiNoticeResolutionState("ready");
      setPrepAiNoticeResolutionError(null);
      return () => {
        active = false;
      };
    }

    const resolveNoticeState = async () => {
      setPrepAiNoticeResolutionState("loading");
      setPrepAiNoticeResolutionError(null);
      try {
        const [effectiveLane, acknowledgedLane] = await Promise.all([
          resolveHammerPrepAiEffectiveLane(workspaceId),
          loadHammerPrepAiNoticeAcknowledgedLane(),
        ]);
        if (!active) return;
        setPrepAiNoticeEffectiveLane(effectiveLane);
        setPrepAiNoticeAcknowledgedLaneSignature(acknowledgedLane);
        setPrepAiNoticeResolutionState("ready");
      } catch (error) {
        if (!active) return;
        setPrepAiNoticeResolutionState("error");
        setPrepAiNoticeResolutionError(getErrorMessage(error, "Hammer could not resolve AI notice policy state."));
      }
    };

    void resolveNoticeState();

    const onAiSettingsChanged = () => {
      void resolveNoticeState();
    };
    window.addEventListener("forge:ai:settings", onAiSettingsChanged);

    return () => {
      active = false;
      window.removeEventListener("forge:ai:settings", onAiSettingsChanged);
    };
  }, [authResolved, authUserId, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    persistHammerStoredActiveWorkspaceId(workspaceId);
    setStoredWorkspaceId((current) => current === workspaceId ? current : workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    if (!workpieceId || !inferredWorkspaceId) return;
    if (routeWorkspaceId === inferredWorkspaceId) return;

    const nextHref = buildForgeRouteHref(location.pathname, {
      search: location.search,
      workspaceId: inferredWorkspaceId,
      workpieceId,
    });
    const nextSearch = searchFromHref(nextHref);
    if (nextSearch === location.search) return;

    navigate(
      {
        pathname: location.pathname,
        search: nextSearch,
        hash: location.hash,
      },
      { replace: true },
    );
  }, [
    inferredWorkspaceId,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    routeWorkspaceId,
    workpieceId,
  ]);

  useEffect(() => {
    if (!workspaceId || !workpieceId) {
      setWorkpieceLabel(null);
      setWorkpieceLabelLoading(false);
      return;
    }

    let active = true;
    setWorkpieceLabel(null);
    setWorkpieceLabelLoading(true);

    void loadHammerWorkspaceWorkpieceLabel(workspaceId, workpieceId)
      .then((label) => {
        if (!active) return;
        setWorkpieceLabel(label);
        setWorkpieceLabelLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setWorkpieceLabel(null);
        setWorkpieceLabelLoading(false);
      });

    return () => {
      active = false;
    };
  }, [workspaceId, workpieceId]);

  const workspaceName = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? null,
    [workspaces, workspaceId],
  );

  const projectTitle = isEditorRoute
    ? resolvingInferredWorkspace
      ? "Resolving workpiece..."
      : workpieceLabelLoading
      ? "Loading workpiece..."
      : workpieceLabel ?? (workpieceId ? "Workpiece unavailable" : "Hammer Editor")
    : "Project Library";
  const routeStatusLabel = isEditorRoute ? "Editor" : "Project Library";
  const workspaceSummaryLabel = workspaceResolutionState === "resolving"
    ? "Resolving workspace..."
    : workspaceName ?? (workspaceId ? "Workspace selected" : "Choose workspace");
  const hammerEpisodeReadModel = useMemo(() => {
    const episodeId = workpieceId?.trim() ?? "";
    const title = workpieceLabel?.trim() ?? "";
    if (!episodeId || !isEditorRoute || !title) return null;
    return {
      episodeId,
      title,
      phase: "edit",
      displayStatus: "editing",
    } satisfies EpisodeWorkspaceReadModel;
  }, [isEditorRoute, workpieceId, workpieceLabel]);
  useEpisodeWorkspaceLoading(
    workpieceId ?? null,
    Boolean(workpieceId && (resolvingInferredWorkspace || workpieceLabelLoading) && !hammerEpisodeReadModel),
  );
  useEpisodeWorkspaceReadModel(hammerEpisodeReadModel);

  const selectWorkspace = useCallback((nextWorkspaceId: string | null) => {
    persistHammerStoredActiveWorkspaceId(nextWorkspaceId);
    setStoredWorkspaceId(nextWorkspaceId);
    setInferredWorkspaceId(null);

    const boundWorkspaceId = inferredWorkspaceId ?? accessibleRouteWorkspaceId;
    const shouldDropWorkpiece = location.pathname.startsWith("/app/hammer/editor")
      && Boolean(workpieceId)
      && Boolean(nextWorkspaceId)
      && Boolean(boundWorkspaceId)
      && boundWorkspaceId !== nextWorkspaceId;
    const nextPathname = shouldDropWorkpiece ? "/app/hammer" : location.pathname;
    const nextHref = buildForgeRouteHref(nextPathname, {
      search: location.search,
      workspaceId: nextWorkspaceId,
      workpieceId: shouldDropWorkpiece ? null : workpieceId,
    });

    navigate(nextHref);
  }, [
    accessibleRouteWorkspaceId,
    inferredWorkspaceId,
    location.pathname,
    location.search,
    navigate,
    workpieceId,
  ]);

  const hammerHomeHref = useMemo(
    () => buildForgeRouteHref("/app/hammer", {
      search: location.search,
      workspaceId,
      workpieceId: null,
    }),
    [location.search, workspaceId],
  );

  const harnessHref = useMemo(
    () => buildForgeRouteHref("/app/hammer/dev/editor", {
      search: location.search,
      workspaceId,
      workpieceId,
    }),
    [location.search, workspaceId, workpieceId],
  );

  const cardsHref = useMemo(
    () => buildForgeRouteHref("/app/hammer/dev/cards", {
      search: location.search,
      workspaceId,
      workpieceId,
    }),
    [location.search, workspaceId, workpieceId],
  );

  const launchHref = useMemo(
    () => buildForgeRouteHref("/app/hammer/dev/launch", {
      search: location.search,
      workspaceId,
      workpieceId,
    }),
    [location.search, workspaceId, workpieceId],
  );

  const goldenCleanupHref = useMemo(
    () => buildForgeRouteHref("/app/hammer/dev/golden-cleanup", {
      search: location.search,
      workspaceId,
      workpieceId,
    }),
    [location.search, workspaceId, workpieceId],
  );

  const relinkHref = useMemo(
    () => buildForgeRouteHref("/app/hammer/dev/relink", {
      search: location.search,
      workspaceId,
      workpieceId,
    }),
    [location.search, workspaceId, workpieceId],
  );

  const editorHref = useMemo(() => {
    if (hammerSelection.scenario) {
      return buildHammerEditorHref(location.search, hammerSelection.scenario, currentOutputId);
    }
    return buildForgeRouteHref("/app/hammer/editor", {
      search: location.search,
      workspaceId,
      workpieceId,
    });
  }, [currentOutputId, hammerSelection.scenario, location.search, workspaceId, workpieceId]);

  const storageHref = useMemo(
    () => buildForgeRouteHref("/app/settings/storage", {
      search: location.search,
      workspaceId,
      workpieceId,
    }),
    [location.search, workspaceId, workpieceId],
  );

  const subscriptionsHref = useMemo(
    () => buildForgeRouteHref("/app/subscriptions", {
      search: location.search,
      workspaceId,
      workpieceId,
    }),
    [location.search, workspaceId, workpieceId],
  );

  const forgeBackHref = useMemo(
    () => buildForgeRouteHref("/app", {
      search: location.search,
      workspaceId,
      workpieceId,
    }),
    [location.search, workspaceId, workpieceId],
  );

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function switchProjectOutput(outputId: string) {
    if (!hammerSelection.scenario) return;
    navigate(buildHammerEditorHref(location.search, hammerSelection.scenario, outputId), {
      state: buildHammerRouteState(hammerSelection.scenario),
    });
  }

  async function handleAuthAction() {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    try {
      setSigningOut(true);
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="hammer-standalone">
      {menuOpen ? (
        <div
          role="presentation"
          className="hammer-standalone__overlay"
          onClick={() => setMenuOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Hammer menu"
            className="hammer-standalone__drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="hammer-standalone__drawer-header">
              <h2 className="hammer-standalone__drawer-title">Hammer Menu</h2>
              <button
                type="button"
                className="hammer-standalone__drawer-close"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                x
              </button>
            </div>

            <nav className="hammer-standalone__drawer-body">
              <NavLink to={hammerHomeHref} onClick={() => setMenuOpen(false)}>Projects</NavLink>
              <NavLink to={editorHref} onClick={() => setMenuOpen(false)}>Editor</NavLink>
              {import.meta.env.DEV ? (
                <>
                  <NavLink to={harnessHref} onClick={() => setMenuOpen(false)}>Dev Harness</NavLink>
                  <NavLink to={launchHref} onClick={() => setMenuOpen(false)}>Dev Launch</NavLink>
                  <NavLink to={cardsHref} onClick={() => setMenuOpen(false)}>Dev Cards</NavLink>
                  <NavLink to={goldenCleanupHref} onClick={() => setMenuOpen(false)}>Golden Cleanup Diff</NavLink>
                  <NavLink to={relinkHref} onClick={() => setMenuOpen(false)}>Dev Relink</NavLink>
                </>
              ) : null}
              <NavLink to={storageHref} onClick={() => setMenuOpen(false)}>Storage Mounts</NavLink>
              <button
                type="button"
                className="hammer-standalone__drawer-action"
                onClick={() => {
                  setMenuOpen(false);
                  setAiControlsOpen(true);
                }}
              >
                AI Controls
              </button>
              <NavLink to={subscriptionsHref} onClick={() => setMenuOpen(false)}>
                Account & Billing
              </NavLink>
              <Link to={forgeBackHref} onClick={() => setMenuOpen(false)}>
                Back to Forge
              </Link>
            </nav>
          </section>
        </div>
      ) : null}

      {aiControlsOpen ? (
        <div
          role="presentation"
          className="hammer-standalone__overlay hammer-standalone__overlay--panel"
          onClick={() => setAiControlsOpen(false)}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <Suspense fallback={<div className="hammer-standalone__ai-controls-loading">Loading AI controls...</div>}>
              <AiControlsPanel onClose={() => setAiControlsOpen(false)} workspaceId={workspaceId} />
            </Suspense>
          </div>
        </div>
      ) : null}

      <header className="hammer-standalone__header">
        <button
          type="button"
          aria-label="Open Hammer menu"
          className="hammer-standalone__menu-trigger"
          onClick={() => setMenuOpen(true)}
        >
          ☰
        </button>
        <div className="hammer-standalone__brand">
          <strong className="hammer-standalone__title">Hammer</strong>
          <span className="hammer-standalone__version">v1.1</span>
        </div>
        <div className="hammer-standalone__project-block">
          <div className="hammer-standalone__project-title">{projectTitle}</div>
          {isEditorRoute && currentOutput ? (
            <details className="hammer-standalone__project-menu">
              <summary className="hammer-standalone__project-menu-trigger">
                {currentOutput.label}
              </summary>
              <div className="hammer-standalone__project-menu-body">
                {projectOutputs.map((output) => (
                  <button
                    key={output.id}
                    type="button"
                    className="hammer-standalone__project-menu-item"
                    onClick={() => switchProjectOutput(output.id)}
                  >
                    {output.label}
                  </button>
                ))}
              </div>
            </details>
          ) : null}
        </div>
        <div className="hammer-standalone__header-meta">
          <div className="hammer-standalone__workspace-field">
            <span className="hammer-standalone__workspace-label">Workspace</span>
            <select
              aria-label="Hammer workspace"
              value={workspaceId ?? ""}
              className="hammer-standalone__workspace-select"
              onChange={(event) => {
                const nextWorkspaceId = event.target.value.trim() || null;
                selectWorkspace(nextWorkspaceId);
              }}
              disabled={loadingWorkspaces || (workspaceResolutionState === "resolving" && workspaces.length === 0)}
            >
              <option value="">
                {loadingWorkspaces && workspaces.length === 0
                  ? "Loading workspaces..."
                  : "Choose workspace"}
              </option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>
          {isEditorRoute ? <span className="hammer-standalone__pill">{routeStatusLabel}</span> : null}
          {isEditorRoute ? <span className="hammer-standalone__pill">{workspaceSummaryLabel}</span> : null}
          {isEditorRoute && workspaceId ? (
            <span className="hammer-standalone__pill hammer-standalone__pill--mono">{workspaceId}</span>
          ) : null}
          <button
            type="button"
            className="hammer-standalone__meta-button"
            onClick={() => {
              void refreshWorkspaces();
            }}
            disabled={loadingWorkspaces}
          >
            {loadingWorkspaces ? "Refreshing..." : "Refresh"}
          </button>
          {isEditorRoute ? (
            <button
              type="button"
              className="hammer-standalone__meta-button"
              onClick={() => setAiControlsOpen(true)}
            >
              AI Controls
            </button>
          ) : null}
          <span className="hammer-standalone__pill">{viewerLabel}</span>
          <button
            type="button"
            className="hammer-standalone__meta-button"
            onClick={() => {
              void handleAuthAction();
            }}
            disabled={signingOut}
          >
            {isAuthenticated ? (signingOut ? "Signing out..." : "Sign out") : "Login"}
          </button>
        </div>
      </header>

      <main
        className={[
          "hammer-standalone__main",
          isEditorRoute ? "hammer-standalone__main--editor" : "",
        ].filter(Boolean).join(" ")}
      >
        <Outlet
          context={{
            workspaceId,
            workspaceName,
            workpieceId,
            userId: authUserId,
            workspaces,
            loadingWorkspaces,
            workspaceError,
            workspaceResolutionState,
            prepAiNoticeEffectiveLane,
            prepAiNoticeAcknowledgedLaneSignature,
            prepAiNoticeResolutionState,
            prepAiNoticeResolutionError,
            selectWorkspace,
            refreshWorkspaces,
            savePrepAiNoticeAcknowledgedLane: persistPrepAiNoticeAcknowledgedLane,
            openAiSettings: () => setAiControlsOpen(true),
          } satisfies HammerShellContext}
        />
      </main>
    </div>
  );
}
