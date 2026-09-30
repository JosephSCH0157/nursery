import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import type { EpisodeWorkspaceReadModel } from "@forge/shared/episode-workspace";
import { Link, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import {
  readHearthAiRuntimeStatus,
  type HearthAiRuntimeStatus,
} from "@hearth/lib/ai-runtime-status";
import { configureTongsUserAccessTokenResolver } from "@hearth/lib/tongs-fetch";
import { ForgeNav } from "../nav/ForgeNav";
import { FORGE_NAV_ACTION_AI_CONTROLS, forgeNavTree } from "../nav/forgeNavTree";
import { resolveCanonicalSupabaseAccessToken, supabase } from "../lib/supabase";
import {
  buildForgeRouteHref,
  parseForgeRouteContext,
  warnMissingWorkspaceParamInDev,
} from "../lib/forge-route-context";
import { useForgeCloudStatus } from "../lib/forge-cloud-status";
import { useWorkspaceBootstrap } from "../hooks/useWorkspaceBootstrap";
import {
  useEpisodeWorkspaceLoading,
  useEpisodeWorkspaceReadModel,
} from "../workspace/useEpisodeWorkspaceReadModel";
import "./HearthStandalone.css";

configureTongsUserAccessTokenResolver(resolveCanonicalSupabaseAccessToken);

const AiControlsPanel = lazy(async () => {
  const module = await import("../components/hearth/AiControlsPanel");
  return { default: module.AiControlsPanel };
});
const HearthShell = lazy(() => import("@hearth/routes/HearthShell"));

type StoreKind = "local" | "tongs";

const STORE_KIND_KEY = "hearth_store_kind";
const DEV_MODE_KEY = "tp_dev_mode";

function readAiStatus(): HearthAiRuntimeStatus {
  return readHearthAiRuntimeStatus();
}

function resolveStoreKind(search: string): StoreKind {
  if (typeof window === "undefined") return "tongs";
  if (!isDevMode(search)) return "tongs";

  const params = new URLSearchParams(search);
  const requested = (params.get("store") ?? params.get("hearthStore") ?? "")
    .trim()
    .toLowerCase();

  if (requested === "tongs" || requested === "local") {
    return requested;
  }

  try {
    const saved = window.localStorage.getItem(STORE_KIND_KEY)?.trim().toLowerCase();
    if (saved === "tongs" || saved === "local") {
      return saved;
    }
  } catch {
    // ignore storage access errors
  }

  return "tongs";
}

function isDevMode(search: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(search);
    if (params.has("dev") || params.get("dev") === "1") return true;
  } catch {
    // ignore query parsing failures
  }
  try {
    if (window.localStorage.getItem(DEV_MODE_KEY) === "1") return true;
  } catch {
    // ignore storage failures
  }
  try {
    const w = window as typeof window & {
      __TP_DEV?: unknown;
      __TP_DEV1?: unknown;
      __tpDevMode?: unknown;
    };
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
  } catch {
    // ignore global inspection failures
  }
  return false;
}

function useAiStatus() {
  const [status, setStatus] = useState<HearthAiRuntimeStatus>(() => readAiStatus());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setStatus(readAiStatus());
    update();
    const handler = () => update();
    window.addEventListener("forge:ai:status", handler);
    return () => window.removeEventListener("forge:ai:status", handler);
  }, []);

  return status;
}

function useForgeSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      setSession(next ?? null);
      setLoading(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

function pickDisplayName(session: Session | null): string {
  if (!session?.user) return "Signed out";
  const meta = session.user.user_metadata as Record<string, unknown> | null;
  const fromMeta =
    (typeof meta?.display_name === "string" && meta.display_name.trim())
      || (typeof meta?.full_name === "string" && meta.full_name.trim())
      || (typeof meta?.name === "string" && meta.name.trim());
  return fromMeta || session.user.email || "Signed in";
}

export default function HearthStandalone() {
  const [navOpen, setNavOpen] = useState(false);
  const [aiControlsOpen, setAiControlsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [episodeReadModel, setEpisodeReadModel] = useState<EpisodeWorkspaceReadModel | null>(null);
  const [episodeLoadingId, setEpisodeLoadingId] = useState<string | null>(null);
  const { session, loading } = useForgeSession();
  const aiStatus = useAiStatus();
  const location = useLocation();
  const routeContext = useMemo(() => parseForgeRouteContext(location.search), [location.search]);
  const devMode = useMemo(() => isDevMode(location.search), [location.search]);
  const storeKind = useMemo(() => resolveStoreKind(location.search), [location.search]);
  const cloud = useForgeCloudStatus({
    session,
    sessionLoading: loading,
    localOnly: storeKind === "local",
  });
  const workspaceId = routeContext.workspaceId;

  // Hydrate the global EpisodeWorkspaceContext from URL params so the
  // EpisodeWorkspaceShell header can show episode identity while in Hearth.
  useWorkspaceBootstrap({ episodeId: routeContext.workpieceId ?? undefined });
  useEpisodeWorkspaceLoading(episodeLoadingId, Boolean(episodeLoadingId));
  useEpisodeWorkspaceReadModel(episodeReadModel);

  const navTreeWithContext = useMemo(
    () => forgeNavTree.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if (!item.to || !item.to.startsWith("/app")) return item;
        const nextTo = buildForgeRouteHref(item.to, {
          search: location.search,
          workspaceId: routeContext.workspaceId,
          workpieceId: routeContext.workpieceId,
        });
        warnMissingWorkspaceParamInDev({
          source: `HearthStandalone:${section.id}:${item.id}`,
          href: nextTo,
          workspaceId: routeContext.workspaceId,
        });
        return {
          ...item,
          to: nextTo,
        };
      }),
    })),
    [location.search, routeContext.workspaceId, routeContext.workpieceId],
  );

  const loginHref = useMemo(() => {
    const next = encodeURIComponent(
      `${location.pathname}${location.search}${location.hash}`,
    );
    return `/login?next=${next}`;
  }, [location.hash, location.pathname, location.search]);

  const displayName = useMemo(() => pickDisplayName(session), [session]);

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setNavOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [navOpen]);

  async function onLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setLoggingOut(false);
    }
  }

  function onNavAction(actionId: string) {
    if (actionId !== FORGE_NAV_ACTION_AI_CONTROLS) return;
    setNavOpen(false);
    setAiControlsOpen(true);
  }

  const aiBalanceLabel = aiStatus.billingMode === "byo"
    ? "AI Credits: BYO"
    : aiStatus.tokenBalance == null
      ? "AI Credits: --"
      : `AI Credits: ${aiStatus.tokenBalance.toLocaleString()}`;
  const aiPillText = aiStatus.ownerChatCapability.status === "checking"
    ? "AI: Checking"
    : aiStatus.ownerChatCapability.status === "unavailable"
      ? "AI: Unavailable"
      : aiStatus.ownerChatCapability.status === "unknown"
        ? "AI: Status unknown"
        : aiStatus.billingMode === "byo"
          ? "AI: BYO Mode"
          : aiStatus.isAiProcessing
            ? "AI: Active"
            : "AI: Idle";
  const aiCapabilityClass = aiStatus.ownerChatCapability.status === "checking"
    || aiStatus.ownerChatCapability.status === "unavailable"
    || aiStatus.ownerChatCapability.status === "unknown"
      ? ` is-${aiStatus.ownerChatCapability.status}`
      : "";
  const navExtraItems = useMemo(
    () => [
      { id: "ai-controls", label: "AI Controls", actionId: FORGE_NAV_ACTION_AI_CONTROLS },
      { id: "forge-subscriptions", label: "Account & Billing", to: "/app/subscriptions" },
    ],
    [],
  );

  return (
    <div className="hearth-standalone">
      {navOpen ? (
        <div
          role="presentation"
          className="hearth-standalone__overlay"
          onClick={() => setNavOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="The Forge menu"
            className="hearth-standalone__menu"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="hearth-standalone__menu-header">
              <h2 className="hearth-standalone__menu-title">
                The Forge Menu
              </h2>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setNavOpen(false)}
                className="hearth-standalone__menu-close"
              >
                ×
              </button>
            </div>
            <div className="hearth-standalone__menu-body">
              <ForgeNav
                tree={navTreeWithContext}
                extraItems={navExtraItems}
                onNavigate={() => setNavOpen(false)}
                onAction={onNavAction}
              />
            </div>
            <div className="hearth-standalone__menu-footer">
              Select an item to navigate.
            </div>
          </section>
        </div>
      ) : null}

      {aiControlsOpen ? (
        <div
          role="presentation"
          className="hearth-standalone__overlay hearth-standalone__overlay--panel"
          onClick={() => setAiControlsOpen(false)}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <Suspense fallback={<div className="hearth-standalone__ai-controls-loading">Loading AI controls...</div>}>
              <AiControlsPanel
                onClose={() => setAiControlsOpen(false)}
                workspaceId={workspaceId}
              />
            </Suspense>
          </div>
        </div>
      ) : null}

      <header className="hearth-standalone__header">
        <button
          type="button"
          aria-label="Open The Forge menu"
          onClick={() => setNavOpen(true)}
          className="hearth-standalone__menu-trigger"
        >
          ☰
        </button>
        <strong className="hearth-standalone__title">Hearth</strong>

        <div className="hearth-standalone__status-row">
          <span className="hearth-standalone__pill hearth-standalone__pill--credits">
            {aiBalanceLabel}
          </span>
          <span
            className={`hearth-standalone__pill hearth-standalone__pill--activity${
              aiStatus.isAiProcessing ? " is-active" : ""
            }${aiCapabilityClass}`}
          >
            {aiPillText}
          </span>
          <span
            className={`hearth-standalone__pill hearth-standalone__pill--cloud is-${cloud.status}`}
            title={cloud.detail}
          >
            {cloud.label}
          </span>

          {devMode ? (
            <>
              <Link
                to="/apps/hearth?store=local"
                className={`hearth-standalone__store-link${storeKind === "local" ? " is-active" : ""}`}
              >
                Dev store: Local
              </Link>
              <Link
                to="/apps/hearth?store=tongs"
                className={`hearth-standalone__store-link${storeKind === "tongs" ? " is-active" : ""}`}
              >
                Dev store: Tongs
              </Link>
              <span className="hearth-standalone__store-caption">
                Dev store: {storeKind}
              </span>
            </>
          ) : null}

          <span className="hearth-standalone__pill hearth-standalone__pill--session">
            {loading ? "Checking session..." : `Logged in as ${displayName}`}
          </span>

          {session ? (
            <button
              type="button"
              onClick={() => void onLogout()}
              disabled={loggingOut}
              className="hearth-standalone__auth-button"
            >
              {loggingOut ? "Signing out..." : "Log out"}
            </button>
          ) : (
            <Link to={loginHref} className="hearth-standalone__auth-link">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="hearth-standalone__main">
        <HearthShell
          onEpisodeContextLoadingChange={setEpisodeLoadingId}
          onEpisodeReadModelChange={setEpisodeReadModel}
        />
      </main>
    </div>
  );
}
