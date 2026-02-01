import { Outlet, Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { loadMountRegistry } from "../lib/mount-registry";
import { supabase } from "../lib/supabase";
import { listMyWorkspaces, type Workspace } from "@barstock/lib/tongs-api";

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
  const nav = useNavigate();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => loadWorkspaceCache());
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => loadActiveWorkspaceId());
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const lastSessionUserId = useRef<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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
      setWorkspaces([]);
      setWorkspaceId(null);
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
    nav("/login", { replace: true });
  }

  function openCreateWorkspace() {
    setCreateError(null);
    setCreateOpen(true);
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
          created_by: session.user.id,
        })
        .select("id,name")
        .single();

      if (error || !workspace?.id) {
        setCreateError(error?.message ?? "Failed to create workspace.");
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

  const workspaceValue = workspaceId ?? "";
  const workspaceSelectDisabled = !session || loadingWorkspaces;

  return (
    <div style={{ minHeight: "100vh", fontFamily: "system-ui", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid #ddd",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link to="/app" style={{ fontWeight: 800, textDecoration: "none", color: "inherit" }}>
            Nursery
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Workspace</span>
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
                {loadingWorkspaces ? "Loading..." : "Select workspace"}
              </option>
              {workspaces.map(w => (
                <option key={w.id} value={w.id}>{w.id}</option>
              ))}
              <option value="__create__">+ Create workspace...</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: "#222",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontSize: 12,
            }}
            title={session?.user?.email ?? "User"}
          >
            {initials}
          </div>
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            {session?.user?.email ?? "Signed in"}
          </span>
          <button onClick={onSignOut} style={{ cursor: "pointer" }}>
            Sign out
          </button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1 }}>
        <aside style={{ width: 240, padding: 16, borderRight: "1px solid #ddd" }}>
          <h3>Nursery</h3>
          <nav style={{ display: "grid", gap: 8 }}>
            <Link to="/app">Home</Link>
            <Link to="/app/tongs">Tongs Calendar</Link>
            <Link to="/app/anvil">Anvil</Link>
            <Link to="/app/hearth">Hearth</Link>
            <Link to="/app/hammer">Hammer</Link>
            <Link to="/app/barstock">Barstock</Link>
          </nav>
          <hr />
          <div style={{ fontSize: "0.85rem", color: "#666" }}>Settings</div>
          <nav style={{ display: "grid", gap: 6, marginTop: 4 }}>
            <Link to="/app/settings">Settings home</Link>
            <Link to="/app/settings/storage">Storage (Mounts)</Link>
          </nav>
        </aside>

        <main style={{ flex: 1, padding: 16 }}>
          <Outlet
            context={{
              workspaceId,
              workspaces,
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
            background: "rgba(0, 0, 0, 0.35)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div style={{ background: "#fff", padding: 16, borderRadius: 12, width: "100%", maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>Create workspace</h3>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                This creates an ID-only workspace container.
              </div>
              {createError && (
                <div style={{ color: "#b00020", fontSize: 12 }}>{createError}</div>
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
