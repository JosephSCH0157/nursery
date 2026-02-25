import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import HearthShell from "@hearth/routes/HearthShell";
import { ForgeNav } from "../nav/ForgeNav";
import { FORGE_NAV_ACTION_AI_CONTROLS, forgeNavTree } from "../nav/forgeNavTree";
import { supabase } from "../lib/supabase";
import { AiControlsPanel } from "../components/hearth/AiControlsPanel";

type AiStatus = {
  balance: number | null;
  inUse: boolean;
};

type StoreKind = "local" | "tongs";

const STORE_KIND_KEY = "hearth_store_kind";
const DEV_MODE_KEY = "tp_dev_mode";

function readAiStatus(): AiStatus {
  if (typeof window === "undefined") {
    return { balance: null, inUse: false };
  }
  const w = window as typeof window & {
    __forgeAiTokenBalance?: unknown;
    __forgeAiTokens?: unknown;
    __forgeAiInUse?: unknown;
    __forgeAiActive?: unknown;
  };
  const balanceRaw = w.__forgeAiTokenBalance ?? w.__forgeAiTokens;
  const balance =
    typeof balanceRaw === "number" && Number.isFinite(balanceRaw) ? balanceRaw : null;
  const inUse = w.__forgeAiInUse === true || w.__forgeAiActive === true;
  return { balance, inUse };
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
  const [status, setStatus] = useState<AiStatus>(() => readAiStatus());

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
  const { session, loading } = useForgeSession();
  const aiStatus = useAiStatus();
  const location = useLocation();
  const devMode = useMemo(() => isDevMode(location.search), [location.search]);
  const storeKind = useMemo(() => resolveStoreKind(location.search), [location.search]);

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

  const aiBalanceLabel = aiStatus.balance == null
    ? "AI Tokens: --"
    : `AI Tokens: ${aiStatus.balance.toLocaleString()}`;
  const aiPillText = aiStatus.inUse ? "AI: In use" : "AI: Idle";
  const storeLinkStyle = (active: boolean) => ({
    fontSize: 12,
    opacity: active ? 1 : 0.6,
    textDecoration: active ? "underline" : "none",
    textUnderlineOffset: "3px",
    color: "inherit",
  });
  const navExtraItems = useMemo(
    () => [{ id: "ai-controls", label: "AI Controls", actionId: FORGE_NAV_ACTION_AI_CONTROLS }],
    [],
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {navOpen ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5, 10, 18, 0.58)",
            zIndex: 9999,
          }}
          onClick={() => setNavOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Nursery menu"
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              bottom: 12,
              width: "min(360px, calc(100vw - 24px))",
              borderRadius: 14,
              border: "1px solid rgba(255, 255, 255, 0.16)",
              background: "#0b1020",
              color: "#eaf0ff",
              boxShadow: "0 18px 40px rgba(0, 0, 0, 0.42)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "14px 14px 10px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "0.02em" }}>
                Nursery Menu
              </h2>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setNavOpen(false)}
                style={{
                  width: 32,
                  height: 32,
                  border: "1px solid rgba(255, 255, 255, 0.22)",
                  borderRadius: 8,
                  background: "rgba(255, 255, 255, 0.04)",
                  color: "inherit",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: "1 1 auto", overflow: "auto", padding: "10px 14px" }}>
              <ForgeNav
                tree={forgeNavTree}
                extraItems={navExtraItems}
                onNavigate={() => setNavOpen(false)}
                onAction={onNavAction}
              />
            </div>
            <div style={{ padding: "0 14px 12px", opacity: 0.74, fontSize: 12 }}>
              Select an item to navigate.
            </div>
          </section>
        </div>
      ) : null}

      {aiControlsOpen ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5, 10, 18, 0.58)",
            zIndex: 10000,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onClick={() => setAiControlsOpen(false)}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <AiControlsPanel onClose={() => setAiControlsOpen(false)} />
          </div>
        </div>
      ) : null}

      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderBottom: "1px solid var(--forge-border)",
          background: "linear-gradient(180deg, rgba(12,18,32,0.9), rgba(12,18,32,0.7))",
          position: "sticky",
          top: 0,
          zIndex: 5,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          aria-label="Open Nursery menu"
          onClick={() => setNavOpen(true)}
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.28)",
            background: "rgba(14,20,32,0.92)",
            color: "rgba(233,240,255,0.96)",
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1,
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ☰
        </button>
        <strong style={{ fontSize: 16 }}>Hearth</strong>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {aiBalanceLabel}
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: aiStatus.inUse ? "rgba(121, 226, 166, 0.2)" : "rgba(255,255,255,0.08)",
              color: aiStatus.inUse ? "#b9f3d2" : "inherit",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {aiPillText}
          </span>

          {devMode ? (
            <>
              <Link
                to="/apps/hearth?store=local"
                style={storeLinkStyle(storeKind === "local")}
              >
                Dev store: Local
              </Link>
              <Link
                to="/apps/hearth?store=tongs"
                style={storeLinkStyle(storeKind === "tongs")}
              >
                Dev store: Tongs
              </Link>
              <span style={{ fontSize: 11, opacity: 0.6 }}>
                Dev store: {storeKind}
              </span>
            </>
          ) : null}

          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
              fontSize: 12,
            }}
          >
            {loading ? "Checking session..." : `Logged in as ${displayName}`}
          </span>

          {session ? (
            <button
              type="button"
              onClick={() => void onLogout()}
              disabled={loggingOut}
              style={{ padding: "6px 10px", fontSize: 12 }}
            >
              {loggingOut ? "Signing out..." : "Log out"}
            </button>
          ) : (
            <Link to={loginHref} style={{ fontSize: 12 }}>
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <HearthShell />
      </main>
    </div>
  );
}
