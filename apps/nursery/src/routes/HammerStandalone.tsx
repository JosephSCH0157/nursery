import type { User } from "@supabase/supabase-js";
import {
  readHammerWorkspaceCache,
  resolveHammerRouteWorkspaceId,
  resolveHammerRouteWorkpieceId,
  loadHammerWorkspaceWorkpieceLabel,
} from "@hammer/app/hammerRuntimeData";
import { buildHammerEditorHref, buildHammerRouteState, resolveHammerRouteSelection } from "@hammer/app/hammerNavigation";
import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AiControlsPanel } from "../components/hearth/AiControlsPanel";
import { buildForgeRouteHref } from "../lib/forge-route-context";
import { supabase } from "../lib/supabase";
import "./HammerStandalone.css";

const ACTIVE_WORKSPACE_KEY = "forge_workspace_id_v1";
const LEGACY_WORKSPACE_KEY = "barstock_workspace_id";

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

function persistActiveWorkspaceId(workspaceId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (workspaceId) {
      window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
      window.localStorage.setItem(LEGACY_WORKSPACE_KEY, workspaceId);
      return;
    }
    window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
    window.localStorage.removeItem(LEGACY_WORKSPACE_KEY);
  } catch {
    // ignore storage errors
  }
}

export default function HammerStandalone() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [aiControlsOpen, setAiControlsOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    () => (typeof window !== "undefined" ? resolveHammerRouteWorkspaceId(window.location.search) : null),
  );
  const [workspaceCache, setWorkspaceCache] = useState(() => readHammerWorkspaceCache());
  const [viewerLabel, setViewerLabel] = useState("Guest");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [workpieceLabel, setWorkpieceLabel] = useState<string | null>(null);
  const [workpieceLabelLoading, setWorkpieceLabelLoading] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const allowStubScenario = import.meta.env.DEV;
  const hammerSelection = useMemo(
    () => resolveHammerRouteSelection(location.search, location.state, { allowStubScenario }),
    [allowStubScenario, location.search, location.state],
  );
  const workpieceId = useMemo(
    () => resolveHammerRouteWorkpieceId(location.search),
    [location.search],
  );
  const isEditorRoute = location.pathname.startsWith("/app/hammer/editor");
  const currentOutputId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("output")?.trim() || "main-edit";
  }, [location.search]);
  const projectOutputs = hammerSelection.scenario?.outputs ?? [];
  const currentOutput = projectOutputs.find((output) => output.id === currentOutputId) ?? projectOutputs[0] ?? null;

  useEffect(() => {
    setWorkspaceId(resolveHammerRouteWorkspaceId(location.search));
    setWorkspaceCache(readHammerWorkspaceCache());
  }, [location.search]);

  useEffect(() => {
    if (!workspaceId) {
      persistActiveWorkspaceId(null);
      return;
    }
    persistActiveWorkspaceId(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleStorage = () => {
      setWorkspaceId(resolveHammerRouteWorkspaceId(window.location.search));
      setWorkspaceCache(readHammerWorkspaceCache());
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const applyUser = (user: User | null) => {
      if (!active) return;
      setViewerLabel(describeUser(user));
      setIsAuthenticated(Boolean(user));
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
    () => workspaceCache.find((workspace) => workspace.id === workspaceId)?.name ?? null,
    [workspaceCache, workspaceId],
  );

  const projectTitle = isEditorRoute
    ? workpieceLabelLoading
      ? "Loading workpiece..."
      : workpieceLabel ?? (workpieceId ? "Workpiece unavailable" : "Hammer Editor")
    : "Project Library";
  const routeStatusLabel = isEditorRoute ? "Editor" : "Project Library";
  const workspaceSummaryLabel = workspaceName ?? (workspaceId ? "Workspace unavailable" : "No workspace selected");

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
                Forge Subscriptions
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
            <AiControlsPanel onClose={() => setAiControlsOpen(false)} workspaceId={workspaceId} />
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
          <span className="hammer-standalone__pill">{routeStatusLabel}</span>
          <span className="hammer-standalone__pill">{workspaceSummaryLabel}</span>
          {workspaceId ? (
            <span className="hammer-standalone__pill hammer-standalone__pill--mono">{workspaceId}</span>
          ) : null}
          <button
            type="button"
            className="hammer-standalone__meta-button"
            onClick={() => setAiControlsOpen(true)}
          >
            AI Controls
          </button>
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

      <main className="hammer-standalone__main">
        <Outlet />
      </main>
    </div>
  );
}
