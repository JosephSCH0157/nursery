import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { loadMountRegistry } from "../lib/mount-registry";
import { supabase } from "../lib/supabase";
import { listMyWorkspaces, type Workspace } from "@barstock/lib/tongs-api";
import { ForgeNav } from "../nav/ForgeNav";
import { forgeNavTree } from "../nav/forgeNavTree";
import { parseForgeRouteContext, removeWorkspaceParams } from "../lib/forge-route-context";

const WORKSPACE_CACHE_KEY = "forge_workspaces_cache_v1";
const ACTIVE_WORKSPACE_KEY = "forge_workspace_id_v1";
const LEGACY_BARSTOCK_WORKSPACE_KEY = "barstock_workspace_id";
const WORKSPACE_REQUIRED_APP_SEGMENTS = new Set([
  "anvil",
  "hearth",
  "hammer",
  "tongs",
  "quench",
  "ledger",
  "barstock",
  "calendar",
]);

function loadWorkspaceCache(): Workspace[] {
  try {
    const raw = localStorage.getItem(WORKSPACE_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Workspace[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveWorkspaceCache(workspaces: Workspace[]) {
  try {
    localStorage.setItem(WORKSPACE_CACHE_KEY, JSON.stringify(workspaces));
  } catch {
    // ignore
  }
}

function loadActiveWorkspaceId(): string | null {
  return localStorage.getItem(ACTIVE_WORKSPACE_KEY)
    ?? localStorage.getItem(LEGACY_BARSTOCK_WORKSPACE_KEY);
}

function saveActiveWorkspaceId(id: string | null) {
  if (id) {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, id);
    localStorage.setItem(LEGACY_BARSTOCK_WORKSPACE_KEY, id);
    return;
  }
  localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
  localStorage.removeItem(LEGACY_BARSTOCK_WORKSPACE_KEY);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export type AppShellContext = {
  workspaceId: string | null;
  workspaces: Workspace[];
  selectWorkspace: (id: string | null) => void;
  refreshWorkspaces: (opts?: { force?: boolean; preferId?: string | null }) => Promise<void>;
  session: SupabaseSession | null;
};

export default function AppShell() {
  const nav = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => loadWorkspaceCache());
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => {
    const fromUrl = typeof window !== "undefined"
      ? parseForgeRouteContext(window.location.search).workspaceId
      : null;
    return fromUrl ?? loadActiveWorkspaceId();
  });
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);
  const [hasWorkspaceFetchSucceeded, setHasWorkspaceFetchSucceeded] = useState(false);
  const lastSessionUserId = useRef<string | null>(null);
  const lastUrlWorkspaceRefresh = useRef<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [workspaceGateChoice, setWorkspaceGateChoice] = useState("");

  const urlContext = useMemo(() => parseForgeRouteContext(location.search), [location.search]);
  const urlWorkspaceId = urlContext.workspaceId;

  useEffect(() => {
    const res = loadMountRegistry("default");
    if (!res.ok) {
      console.warn("[tongs] mount registry recovered/seeded due to issues:", res.issues);
    } else if (res.seeded) {
      console.log("[tongs] mount registry seeded");
    }
  }, []);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!alive) return;
      setSession(s ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const selectWorkspace = useCallback((id: string | null) => {
    setWorkspaceId(id);
    saveActiveWorkspaceId(id);
  }, []);

  const refreshWorkspaces = useCallback(async (opts?: { force?: boolean; preferId?: string | null }) => {
    if (!session) return;
    if (!opts?.force && workspaces.length) return;
    setLoadingWorkspaces(true);
    setWorkspaceLoadError(null);
    try {
      const ws = await listMyWorkspaces();
      setWorkspaces(ws);
      saveWorkspaceCache(ws);
      setHasWorkspaceFetchSucceeded(true);

      const preferId = opts?.preferId ?? null;
      const current = workspaceId;
      const saved = loadActiveWorkspaceId();
      const pick =
        (preferId && ws.some(w => w.id === preferId)) ? preferId
          : (urlWorkspaceId && ws.some(w => w.id === urlWorkspaceId)) ? urlWorkspaceId
            : (saved && ws.some(w => w.id === saved)) ? saved
              : (current && ws.some(w => w.id === current)) ? current
                : (ws[0]?.id ?? null);

      if (pick !== workspaceId) {
        selectWorkspace(pick);
      }
    } catch (err) {
      console.warn("[workspace] refresh failed", err);
      setWorkspaceLoadError(getErrorMessage(err, "Failed loading workspaces. Try refresh."));
    } finally {
      setLoadingWorkspaces(false);
    }
  }, [session, workspaces.length, workspaceId, selectWorkspace, urlWorkspaceId]);

  useEffect(() => {
    const userId = session?.user?.id ?? null;
    if (!userId) {
      lastSessionUserId.current = null;
      lastUrlWorkspaceRefresh.current = null;
      setWorkspaces([]);
      setWorkspaceId(null);
      setWorkspaceLoadError(null);
      setHasWorkspaceFetchSucceeded(false);
      return;
    }

    if (lastSessionUserId.current !== userId) {
      lastSessionUserId.current = userId;
      void refreshWorkspaces({ force: true, preferId: urlWorkspaceId });
      return;
    }

    if (workspaceId && workspaces.some(w => w.id === workspaceId)) return;
    if (!workspaceId && workspaces.length === 0) return;
    const saved = loadActiveWorkspaceId();
    const pick =
      (urlWorkspaceId && workspaces.some((w) => w.id === urlWorkspaceId)) ? urlWorkspaceId
        : (saved && workspaces.some((w) => w.id === saved)) ? saved
          : (workspaces[0]?.id ?? null);
    if (pick !== workspaceId) selectWorkspace(pick);
  }, [session, workspaces, workspaceId, refreshWorkspaces, selectWorkspace, urlWorkspaceId]);

  useEffect(() => {
    if (!session || !urlWorkspaceId) {
      lastUrlWorkspaceRefresh.current = null;
      return;
    }

    if (workspaces.some((w) => w.id === urlWorkspaceId)) {
      if (workspaceId !== urlWorkspaceId) {
        selectWorkspace(urlWorkspaceId);
      }
      return;
    }

    if (lastUrlWorkspaceRefresh.current === urlWorkspaceId) {
      return;
    }
    lastUrlWorkspaceRefresh.current = urlWorkspaceId;
    void refreshWorkspaces({ force: true, preferId: urlWorkspaceId });
  }, [session, urlWorkspaceId, workspaces, workspaceId, refreshWorkspaces, selectWorkspace]);

  useEffect(() => {
    if (!session || !urlWorkspaceId) return;
    if (!hasWorkspaceFetchSucceeded || loadingWorkspaces) return;
    if (workspaces.some((w) => w.id === urlWorkspaceId)) return;
    nav(
      {
        pathname: location.pathname,
        search: removeWorkspaceParams(location.search),
        hash: location.hash,
      },
      { replace: true },
    );
  }, [
    session,
    urlWorkspaceId,
    hasWorkspaceFetchSucceeded,
    loadingWorkspaces,
    workspaces,
    location.pathname,
    location.search,
    location.hash,
    nav,
  ]);

  useEffect(() => {
    if (!urlContext.hasInvalidWorkspaceId) return;
    nav(
      {
        pathname: location.pathname,
        search: removeWorkspaceParams(location.search),
        hash: location.hash,
      },
      { replace: true },
    );
  }, [
    urlContext.hasInvalidWorkspaceId,
    location.pathname,
    location.search,
    location.hash,
    nav,
  ]);

  async function onSignOut() {
    await supabase.auth.signOut();
    nav("/app", { replace: true });
  }

  function onSignIn() {
    const next = encodeURIComponent(`${location.pathname}${location.search}${location.hash}`);
    nav(`/login?next=${next}`, { replace: false });
  }

  function openCreateWorkspace() {
    setCreateError(null);
    setCreateOpen(true);
  }

  function openRenameWorkspace() {
    const current = workspaces.find(w => w.id === workspaceId);
    if (!current) return;
    setRenameValue(current.name ?? "");
    setRenameError(null);
    setRenameOpen(true);
  }

  function closeRenameWorkspace() {
    setRenameOpen(false);
    setRenameError(null);
  }

  async function onRenameWorkspace() {
    if (!session || !workspaceId) return;
    const name = renameValue.trim();
    if (!name) {
      setRenameError("Workspace name cannot be empty.");
      return;
    }

    setRenaming(true);
    setRenameError(null);
    try {
      const { data, error } = await supabase
        .schema("tongs")
        .from("workspaces")
        .update({ name })
        .eq("id", workspaceId)
        .select("id,name")
        .single();

      if (error) throw error;
      if (!data) throw new Error("Workspace rename missing row.");

      setWorkspaces((prev) => {
        const next = prev.map((w) => (w.id === workspaceId ? { ...w, name: data.name } : w));
        saveWorkspaceCache(next);
        return next;
      });
      setRenameOpen(false);
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "message" in err
        ? String((err as { message?: unknown }).message ?? "Failed to rename workspace.")
        : "Failed to rename workspace.";
      setRenameError(message);
    } finally {
      setRenaming(false);
    }
  }

  async function onCreateWorkspace() {
    if (!session) return;
    setCreating(true);
    setCreateError(null);
    try {
      // Prefer a single atomic RPC so row creation + owner membership are guaranteed together.
      let workspaceId: string | null = null;
      const { data: createdViaRpc, error: rpcError } = await supabase
        .schema("tongs")
        .rpc("create_workspace_with_owner", { _name: "Workspace" })
        .single();

      if (!rpcError && createdViaRpc && typeof createdViaRpc === "object") {
        const id = (createdViaRpc as { id?: unknown }).id;
        workspaceId = typeof id === "string" && id.trim() ? id : null;
      }

      if (!workspaceId) {
        if (rpcError) {
          console.warn("[workspace] rpc create failed; falling back to direct insert", rpcError);
        }

        const { data: workspace, error: insertError } = await supabase
          .schema("tongs")
          .from("workspaces")
          .insert({
            name: "Workspace",
            created_by: session.user.id,
          })
          .select("id,name")
          .single();

        if (insertError) {
          setCreateError(getErrorMessage(insertError, "Failed to create workspace."));
          return;
        }
        workspaceId = typeof workspace?.id === "string" && workspace.id.trim() ? workspace.id : null;
      }

      if (!workspaceId) {
        setCreateError("Failed to create workspace.");
        return;
      }

      await refreshWorkspaces({ force: true, preferId: workspaceId });
      selectWorkspace(workspaceId);
      setCreateOpen(false);
    } finally {
      setCreating(false);
    }
  }

  const initials = useMemo(() => {
    const email = session?.user?.email ?? "";
    return (email[0] ?? "?").toUpperCase();
  }, [session]);

  const trialWorkspaces = useMemo<Workspace[]>(
    () => [{ id: "default", name: "Trial Workspace" }],
    [],
  );
  const inTrialMode = !session;
  const visibleWorkspaces = session ? workspaces : trialWorkspaces;
  const effectiveWorkspaceId = session ? workspaceId : "default";
  const workspaceValue = effectiveWorkspaceId ?? "";
  const workspaceSelectDisabled = !session || loadingWorkspaces;
  const activeWorkspace = workspaces.find(w => w.id === workspaceId) ?? null;
  const workspaceIsValid = !!activeWorkspace;
  const appSegment = useMemo(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] !== "app") return null;
    return parts[1] ?? null;
  }, [location.pathname]);
  const routeNeedsWorkspace = !!(appSegment && WORKSPACE_REQUIRED_APP_SEGMENTS.has(appSegment));
  const shouldBlockWorkspaceRoute = !!session && routeNeedsWorkspace && !workspaceIsValid;
  const workspaceGateLoading = shouldBlockWorkspaceRoute
    && loadingWorkspaces
    && workspaces.length === 0;

  useEffect(() => {
    if (!shouldBlockWorkspaceRoute) {
      setWorkspaceGateChoice("");
      return;
    }

    if (workspaceGateChoice && workspaces.some((w) => w.id === workspaceGateChoice)) {
      return;
    }

    setWorkspaceGateChoice(workspaces[0]?.id ?? "");
  }, [shouldBlockWorkspaceRoute, workspaceGateChoice, workspaces]);

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "system-ui",
        display: "flex",
        flexDirection: "column",
        color: "var(--forge-text)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid var(--forge-border)",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link to="/app" style={{ fontWeight: 800, textDecoration: "none", color: "inherit" }}>
            Nursery
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Workspace</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <select
                  value={workspaceValue}
                  disabled={workspaceSelectDisabled}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__create__") {
                      openCreateWorkspace();
                      return;
                    }
                    selectWorkspace(v || null);
                  }}
                  style={{ padding: "6px 8px", fontSize: 12, minWidth: 220 }}
                >
                  <option value="" disabled>
                    {loadingWorkspaces
                      ? "Loading..."
                      : session
                        ? "Select workspace"
                        : "Trial workspace (read-only cloud)"}
                  </option>
                  {visibleWorkspaces.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                  {session ? <option value="__create__">+ Create workspace...</option> : null}
                </select>
                <button
                  type="button"
                  onClick={openRenameWorkspace}
                  disabled={!activeWorkspace || !session}
                  style={{ fontSize: 12, padding: "6px 8px", cursor: "pointer" }}
                >
                  Rename
                </button>
              </div>
              {renameOpen && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    placeholder="Workspace name"
                    style={{ padding: "6px 8px", fontSize: 12, minWidth: 220 }}
                  />
                  <button type="button" onClick={onRenameWorkspace} disabled={renaming}>
                    Save
                  </button>
                  <button type="button" onClick={closeRenameWorkspace}>
                    Cancel
                  </button>
                  {renameError && (
                    <span style={{ color: "var(--forge-danger)", fontSize: 12 }}>
                      {renameError}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: "var(--forge-bg-raised)",
              color: "var(--forge-text)",
              display: "grid",
              placeItems: "center",
              fontSize: 12,
            }}
            title={session?.user?.email ?? "Trial mode"}
          >
            {initials}
          </div>
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            {session?.user?.email ?? "Anonymous trial"}
          </span>
          {session ? (
            <button onClick={onSignOut} style={{ cursor: "pointer" }}>
              Sign out
            </button>
          ) : (
            <button onClick={onSignIn} style={{ cursor: "pointer" }}>
              Sign in
            </button>
          )}
        </div>
      </header>

      {inTrialMode ? (
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--forge-border)",
            background: "rgba(255, 255, 255, 0.03)",
            fontSize: 13,
            opacity: 0.9,
          }}
        >
          Trial mode is active. You can explore tools with limited access. Sign in to unlock cloud workspaces, calendar writes, and full persistence.
        </div>
      ) : null}

      <div style={{ display: "flex", flex: 1 }}>
        <aside style={{ width: 240, padding: 16, borderRight: "1px solid var(--forge-border)" }}>
          <ForgeNav tree={forgeNavTree} />
        </aside>

        <main style={{ flex: 1, padding: 16 }}>
          {shouldBlockWorkspaceRoute ? (
            <section
              style={{
                border: "1px solid var(--forge-border)",
                borderRadius: 14,
                background: "var(--forge-bg-elevated)",
                padding: 18,
                maxWidth: 560,
                display: "grid",
                gap: 12,
              }}
            >
              <h2 style={{ margin: 0 }}>You need a workspace to use the Forge.</h2>
              {workspaceGateLoading ? (
                <p style={{ margin: 0, opacity: 0.8 }}>Loading workspaces...</p>
              ) : workspaceLoadError && workspaces.length === 0 ? (
                <>
                  <p style={{ margin: 0, opacity: 0.8 }}>
                    Could not load workspaces right now.
                  </p>
                  <div style={{ color: "var(--forge-danger)", fontSize: 13 }}>{workspaceLoadError}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => void refreshWorkspaces({ force: true, preferId: urlWorkspaceId })}
                      disabled={loadingWorkspaces}
                    >
                      Retry
                    </button>
                  </div>
                </>
              ) : workspaces.length === 0 ? (
                <>
                  <p style={{ margin: 0, opacity: 0.8 }}>
                    Create your first workspace before opening tools.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={openCreateWorkspace} disabled={creating}>
                      Create workspace
                    </button>
                    <button
                      type="button"
                      onClick={() => void refreshWorkspaces({ force: true, preferId: urlWorkspaceId })}
                      disabled={loadingWorkspaces}
                    >
                      Refresh
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, opacity: 0.8 }}>
                    Select a workspace to continue.
                  </p>
                  {workspaceLoadError && (
                    <div style={{ color: "var(--forge-danger)", fontSize: 13 }}>
                      {workspaceLoadError}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <select
                      value={workspaceGateChoice}
                      onChange={(e) => setWorkspaceGateChoice(e.target.value)}
                      style={{ minWidth: 240, padding: "6px 8px" }}
                    >
                      <option value="" disabled>Select workspace</option>
                      {workspaces.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (!workspaceGateChoice) return;
                        selectWorkspace(workspaceGateChoice);
                      }}
                      disabled={!workspaceGateChoice}
                    >
                      Continue
                    </button>
                    <button type="button" onClick={openCreateWorkspace}>
                      Create workspace
                    </button>
                  </div>
                </>
              )}
            </section>
          ) : (
            <Outlet
              context={{
                workspaceId,
                workspaces,
                selectWorkspace,
                refreshWorkspaces,
                session,
              } satisfies AppShellContext}
            />
          )}
        </main>
      </div>

      {createOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.65)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--forge-bg-elevated)",
              border: "1px solid var(--forge-border)",
              padding: 16,
              borderRadius: 12,
              width: "100%",
              maxWidth: 420,
            }}
          >
            <h3 style={{ marginTop: 0 }}>Create workspace</h3>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                This creates an ID-only workspace container.
              </div>
              {createError && (
                <div style={{ color: "var(--forge-danger)", fontSize: 12 }}>{createError}</div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  onClick={() => setCreateOpen(false)}
                  disabled={creating}
                  style={{ cursor: creating ? "not-allowed" : "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={onCreateWorkspace}
                  disabled={creating}
                  style={{ cursor: creating ? "not-allowed" : "pointer" }}
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
