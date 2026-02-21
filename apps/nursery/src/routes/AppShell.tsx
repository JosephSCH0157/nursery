import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { loadMountRegistry } from "../lib/mount-registry";
import { supabase } from "../lib/supabase";
import { listMyWorkspaces, type Workspace } from "@barstock/lib/tongs-api";
import { ForgeNav } from "../nav/ForgeNav";
import { forgeNavTree } from "../nav/forgeNavTree";
import forgeInteriorImage from "../../../../assets/forge-interior.png";

const WORKSPACE_CACHE_KEY = "forge_workspaces_cache_v1";
const ACTIVE_WORKSPACE_KEY = "forge_workspace_id_v1";
const LEGACY_BARSTOCK_WORKSPACE_KEY = "barstock_workspace_id";

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

export type AppShellContext = {
  workspaceId: string | null;
  workspaces: Workspace[];
  selectWorkspace: (id: string | null) => void;
  refreshWorkspaces: (opts?: { force?: boolean; preferId?: string | null }) => Promise<void>;
  session: SupabaseSession | null;
};

export default function AppShell() {
  const location = useLocation();
  const nav = useNavigate();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => loadWorkspaceCache());
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => loadActiveWorkspaceId());
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const lastSessionUserId = useRef<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

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
    try {
      const ws = await listMyWorkspaces();
      setWorkspaces(ws);
      saveWorkspaceCache(ws);

      const preferId = opts?.preferId ?? null;
      const current = workspaceId;
      const saved = loadActiveWorkspaceId();
      const pick =
        (preferId && ws.some(w => w.id === preferId)) ? preferId
          : (current && ws.some(w => w.id === current)) ? current
            : (saved && ws.some(w => w.id === saved)) ? saved
              : (ws[0]?.id ?? null);

      if (pick !== workspaceId) {
        selectWorkspace(pick);
      }
    } finally {
      setLoadingWorkspaces(false);
    }
  }, [session, workspaces.length, workspaceId, selectWorkspace]);

  useEffect(() => {
    const userId = session?.user?.id ?? null;
    if (!userId) {
      lastSessionUserId.current = null;
      if (workspaces.length) setWorkspaces([]);
      if (workspaceId !== null) setWorkspaceId(null);
      return;
    }

    if (lastSessionUserId.current !== userId) {
      lastSessionUserId.current = userId;
      void refreshWorkspaces({ force: true });
      return;
    }

    if (workspaceId && workspaces.some(w => w.id === workspaceId)) return;
    if (!workspaceId && workspaces.length === 0) return;
    const saved = loadActiveWorkspaceId();
    const pick = (saved && workspaces.some(w => w.id === saved)) ? saved : (workspaces[0]?.id ?? null);
    if (pick !== workspaceId) selectWorkspace(pick);
  }, [session, workspaces, workspaceId, refreshWorkspaces, selectWorkspace]);

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
      const { data: workspace, error } = await supabase
        .schema("tongs")
        .from("workspaces")
        .insert({
          name: "Workspace",
        })
        .select("id,name")
        .single();

      if (error) {
        const msg =
          typeof error === "object" && error !== null && "message" in error
            ? String((error as { message?: unknown }).message)
            : "Unknown error";
        setCreateError(msg);
        return;
      }

      if (!workspace?.id) {
        setCreateError("Failed to create workspace.");
        return;
      }

      if (session.user?.id) {
        const { error: memberError } = await supabase
          .schema("tongs")
          .from("workspace_members")
          .insert({
            workspace_id: workspace.id,
            user_id: session.user.id,
            role: "owner",
          });
        if (memberError) {
          console.warn("[workspace] member insert failed", memberError);
        }
      }

      await refreshWorkspaces({ force: true, preferId: workspace.id });
      selectWorkspace(workspace.id);
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
  const visibleWorkspaces = session ? workspaces : trialWorkspaces;
  const effectiveWorkspaceId = session ? workspaceId : "default";
  const workspaceValue = effectiveWorkspaceId ?? "";
  const workspaceSelectDisabled = !session || loadingWorkspaces;
  const activeWorkspace = visibleWorkspaces.find(w => w.id === effectiveWorkspaceId) ?? null;
  const inTrialMode = !session;
  const isHomeRoute = location.pathname === "/app" || location.pathname === "/app/";
  const showHomeMainBackground = !!session && isHomeRoute;

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

        <main
          style={{
            flex: 1,
            padding: 16,
            backgroundImage: showHomeMainBackground
              ? `linear-gradient(rgba(7, 11, 19, 0.62), rgba(7, 11, 19, 0.72)), url(${forgeInteriorImage})`
              : undefined,
            backgroundSize: showHomeMainBackground ? "cover" : undefined,
            backgroundPosition: showHomeMainBackground ? "center center" : undefined,
            backgroundRepeat: "no-repeat",
          }}
        >
          <Outlet
            context={{
              workspaceId: effectiveWorkspaceId,
              workspaces: visibleWorkspaces,
              selectWorkspace,
              refreshWorkspaces,
              session,
            } satisfies AppShellContext}
          />
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
