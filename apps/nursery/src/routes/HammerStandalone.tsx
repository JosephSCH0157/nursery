import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AiControlsPanel } from "../components/hearth/AiControlsPanel";
import { buildForgeRouteHref, parseForgeRouteContext } from "../lib/forge-route-context";
import "./HammerStandalone.css";

export default function HammerStandalone() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [aiControlsOpen, setAiControlsOpen] = useState(false);
  const location = useLocation();
  const routeContext = useMemo(() => parseForgeRouteContext(location.search), [location.search]);
  const workspaceId = routeContext.workspaceId;

  const hammerHomeHref = useMemo(
    () => buildForgeRouteHref("/app/hammer", {
      search: location.search,
      workspaceId: routeContext.workspaceId,
      workpieceId: routeContext.workpieceId,
    }),
    [location.search, routeContext.workspaceId, routeContext.workpieceId],
  );

  const cardsHref = useMemo(
    () => buildForgeRouteHref("/app/hammer/dev/cards", {
      search: location.search,
      workspaceId: routeContext.workspaceId,
      workpieceId: routeContext.workpieceId,
    }),
    [location.search, routeContext.workspaceId, routeContext.workpieceId],
  );

  const relinkHref = useMemo(
    () => buildForgeRouteHref("/app/hammer/dev/relink", {
      search: location.search,
      workspaceId: routeContext.workspaceId,
      workpieceId: routeContext.workpieceId,
    }),
    [location.search, routeContext.workspaceId, routeContext.workpieceId],
  );

  const storageHref = useMemo(
    () => buildForgeRouteHref("/app/settings/storage", {
      search: location.search,
      workspaceId: routeContext.workspaceId,
      workpieceId: routeContext.workpieceId,
    }),
    [location.search, routeContext.workspaceId, routeContext.workpieceId],
  );

  const subscriptionsHref = useMemo(
    () => buildForgeRouteHref("/app/subscriptions", {
      search: location.search,
      workspaceId: routeContext.workspaceId,
      workpieceId: routeContext.workpieceId,
    }),
    [location.search, routeContext.workspaceId, routeContext.workpieceId],
  );

  const forgeBackHref = useMemo(
    () => buildForgeRouteHref("/app", {
      search: location.search,
      workspaceId: routeContext.workspaceId,
      workpieceId: routeContext.workpieceId,
    }),
    [location.search, routeContext.workspaceId, routeContext.workpieceId],
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
              <NavLink to={cardsHref} onClick={() => setMenuOpen(false)}>Dev Cards</NavLink>
              <NavLink to={relinkHref} onClick={() => setMenuOpen(false)}>Dev Relink</NavLink>
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
        <strong className="hammer-standalone__title">Hammer</strong>
        <div className="hammer-standalone__header-meta">
          <span className="hammer-standalone__pill">
            workspace: {workspaceId ?? "none"}
          </span>
          <Link to={forgeBackHref} className="hammer-standalone__back-link">
            Back to Forge
          </Link>
        </div>
      </header>

      <main className="hammer-standalone__main">
        <Outlet />
      </main>
    </div>
  );
}
