import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import type { Workspace } from "@barstock/lib/tongs-api";
import { supabase } from "../lib/supabase";
import { ForgeNav } from "../nav/ForgeNav";
import { FORGE_NAV_ACTION_AI_CONTROLS, forgeNavTree, type ForgeNavSection } from "../nav/forgeNavTree";
import {
  buildForgeRouteHref,
  parseForgeRouteContext,
  removeWorkspaceParams,
  warnMissingWorkspaceParamInDev,
} from "../lib/forge-route-context";
import { groupWorkspacesBySource, workspaceSelectOptionLabel } from "../lib/workspaces/workspaceLabel";
import { useForgeCloudStatus, type ForgeCloudState } from "../lib/forge-cloud-status";
import MobileWarningBanner from "../components/MobileWarningBanner";
import "./AppShell.css";

const AiControlsPanel = lazy(async () => {
  const module = await import("../components/hearth/AiControlsPanel");
  return { default: module.AiControlsPanel };
});

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
  "bar-stock",
  "calendar",
]);

const MOBILE_WARNING_TOOLS: Record<string, string> = {
  anvil: "Anvil",
  hammer: "Hammer",
  quench: "Quench",
};

function getAppSegment(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "app") return null;
  return parts[1] ?? null;
}

function routeRequiresWorkspace(pathname: string): boolean {
  const appSegment = getAppSegment(pathname);
  return !!(appSegment && WORKSPACE_REQUIRED_APP_SEGMENTS.has(appSegment));
}

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

function isMissingOrgServicesError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
    status?: unknown;
  };

  const code = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
  if (code === "PGRST202" || code === "404") return true;

  if (typeof row.status === "number" && row.status === 404) return true;

  const text = [
    typeof row.message === "string" ? row.message : "",
    typeof row.details === "string" ? row.details : "",
    typeof row.hint === "string" ? row.hint : "",
  ].join(" ").toLowerCase();
  return text.includes("get_or_create_my_personal_org_id")
    || text.includes("could not find the function")
    || text.includes("function")
      && text.includes("not found");
}

function isWorkspacePolicyRecursionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  const code = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
  if (code !== "42P17") return false;
  const text = [
    typeof row.message === "string" ? row.message : "",
    typeof row.details === "string" ? row.details : "",
    typeof row.hint === "string" ? row.hint : "",
  ].join(" ").toLowerCase();
  return text.includes("infinite recursion detected in policy")
    && text.includes("workspaces");
}

function readInviteToken(search: string): string | null {
  const params = new URLSearchParams(search);
  const raw = params.get("invite_token") ?? params.get("inviteToken");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function removeInviteToken(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("invite_token");
  params.delete("inviteToken");
  const next = params.toString();
  return next ? `?${next}` : "";
}

function searchFromHref(href: string): string {
  const q = href.indexOf("?");
  return q >= 0 ? href.slice(q) : "";
}

type InvitePreview = {
  workspace_id: string;
  workspace_name: string;
  role: string;
  email: string;
  expires_at: string;
};

export type AppShellContext = {
  workspaceId: string | null;
  workspaceAccessDeniedId: string | null;
  workspaces: Workspace[];
  loadingWorkspaces: boolean;
  hasWorkspaceFetchSucceeded: boolean;
  selectWorkspace: (id: string | null) => void;
  refreshWorkspaces: (opts?: { force?: boolean; preferId?: string | null }) => Promise<void>;
  session: SupabaseSession | null;
  cloud: ForgeCloudState;
};

export default function AppShell() {
  const nav = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
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
  const [workspaceAccessDeniedId, setWorkspaceAccessDeniedId] = useState<string | null>(null);
  const lastSessionUserId = useRef<string | null>(null);
  const lastUrlWorkspaceRefresh = useRef<string | null>(null);
  const lastCanonicalNavTarget = useRef<string | null>(null);
  const workspacePolicyFatalRef = useRef(false);
  const pendingWorkspaceSelection = useRef<{
    active: boolean;
    target: string | null;
  }>({
    active: false,
    target: null,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetName, setDeleteTargetName] = useState("");
  const [deleteConfirmValue, setDeleteConfirmValue] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [workspaceGateChoice, setWorkspaceGateChoice] = useState("");
  const [aiControlsOpen, setAiControlsOpen] = useState(false);
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  const [invitePreviewLoading, setInvitePreviewLoading] = useState(false);
  const [invitePreviewError, setInvitePreviewError] = useState<string | null>(null);
  const [inviteAccepting, setInviteAccepting] = useState(false);
  const invitePreviewTokenRef = useRef<string | null>(null);

  const urlContext = useMemo(() => parseForgeRouteContext(location.search), [location.search]);
  const urlWorkspaceId = urlContext.workspaceId;
  const inviteToken = useMemo(() => readInviteToken(location.search), [location.search]);
  const cloud = useForgeCloudStatus({ session, sessionLoading });

  const clearPendingWorkspaceSelection = useCallback(() => {
    pendingWorkspaceSelection.current.active = false;
    pendingWorkspaceSelection.current.target = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    void import("../lib/mount-registry").then(({ loadMountRegistry }) => {
      if (cancelled) return;
      const res = loadMountRegistry("default");
      if (!res.ok) {
        console.warn("[tongs] mount registry recovered/seeded due to issues:", res.issues);
      } else if (res.seeded) {
        console.log("[tongs] mount registry seeded");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session ?? null);
      setSessionLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!alive) return;
      setSession(s ?? null);
      setSessionLoading(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const selectWorkspace = useCallback((id: string | null) => {
    pendingWorkspaceSelection.current.active = true;
    pendingWorkspaceSelection.current.target = id;
    if (id) setWorkspaceAccessDeniedId(null);
    setWorkspaceId(id);
    saveActiveWorkspaceId(id);
    if (!location.pathname.startsWith("/app")) {
      clearPendingWorkspaceSelection();
      return;
    }

    const nextHref = buildForgeRouteHref(location.pathname, {
      search: location.search,
      workspaceId: id,
      workpieceId: urlContext.workpieceId,
    });
    const nextSearch = searchFromHref(nextHref);
    if (nextSearch === location.search) {
      clearPendingWorkspaceSelection();
      return;
    }
    nav(
      {
        pathname: location.pathname,
        search: nextSearch,
        hash: location.hash,
      },
      { replace: true },
    );
  }, [
    clearPendingWorkspaceSelection,
    location.pathname,
    location.search,
    location.hash,
    nav,
    urlContext.workpieceId,
  ]);

  useEffect(() => {
    if (!workspaceId) return;
    saveActiveWorkspaceId(workspaceId);
  }, [workspaceId]);

  const refreshWorkspaces = useCallback(async (opts?: { force?: boolean; preferId?: string | null }) => {
    if (!session) return;
    if (workspacePolicyFatalRef.current) {
      setWorkspaceLoadError(
        "Workspace access is temporarily unavailable (database policy recursion). Apply the workspace RLS fix migration.",
      );
      return;
    }
    if (!opts?.force && workspaces.length) return;
    setLoadingWorkspaces(true);
    setWorkspaceLoadError(null);
    try {
      const { listMyWorkspaces } = await import("@barstock/lib/tongs-api");
      const ws = await listMyWorkspaces();
      workspacePolicyFatalRef.current = false;
      setWorkspaces(ws);
      saveWorkspaceCache(ws);
      setHasWorkspaceFetchSucceeded(true);

      const preferId = opts?.preferId ?? null;
      const current = workspaceId;
      const saved = loadActiveWorkspaceId();
      const requestedWorkspaceMissingMembership = !!urlWorkspaceId && !ws.some((w) => w.id === urlWorkspaceId);
      const fallbackSelection =
        (saved && ws.some((w) => w.id === saved)) ? saved
          : (current && ws.some((w) => w.id === current)) ? current
            : (ws[0]?.id ?? null);
      if (requestedWorkspaceMissingMembership) {
        setWorkspaceAccessDeniedId(urlWorkspaceId);
        if (fallbackSelection) {
          if (fallbackSelection !== workspaceId) {
            selectWorkspace(fallbackSelection);
          } else {
            saveActiveWorkspaceId(fallbackSelection);
          }
        } else {
          setWorkspaceId(null);
          saveActiveWorkspaceId(null);
        }
        return;
      }
      const pick =
        (preferId && ws.some(w => w.id === preferId)) ? preferId
          : (urlWorkspaceId && ws.some(w => w.id === urlWorkspaceId)) ? urlWorkspaceId
            : fallbackSelection;

      if (pick !== workspaceId) {
        selectWorkspace(pick);
      }
    } catch (err) {
      console.warn("[workspace] refresh failed", err);
      if (isWorkspacePolicyRecursionError(err)) {
        workspacePolicyFatalRef.current = true;
        setWorkspaceLoadError(
          "Workspace access is temporarily unavailable (database policy recursion). Apply the workspace RLS fix migration.",
        );
      } else {
        setWorkspaceLoadError(getErrorMessage(err, "Failed loading workspaces. Try refresh."));
      }
    } finally {
      setLoadingWorkspaces(false);
    }
  }, [session, workspaces.length, workspaceId, selectWorkspace, urlWorkspaceId]);

  useEffect(() => {
    const userId = session?.user?.id ?? null;
    if (!userId) {
      lastSessionUserId.current = null;
      lastUrlWorkspaceRefresh.current = null;
      clearPendingWorkspaceSelection();
      setWorkspaces((prev) => (prev.length ? [] : prev));
      setWorkspaceId(null);
      setWorkspaceLoadError(null);
      setHasWorkspaceFetchSucceeded(false);
      setWorkspaceAccessDeniedId(null);
      return;
    }

    if (lastSessionUserId.current !== userId) {
      lastSessionUserId.current = userId;
      void refreshWorkspaces({ force: true, preferId: urlWorkspaceId });
      return;
    }

    if (workspaceId && workspaces.some(w => w.id === workspaceId)) return;
    if (workspaces.length === 0) return;
    const saved = loadActiveWorkspaceId();
    const pick =
      (urlWorkspaceId && workspaces.some((w) => w.id === urlWorkspaceId)) ? urlWorkspaceId
        : (saved && workspaces.some((w) => w.id === saved)) ? saved
          : (workspaces[0]?.id ?? null);
    if (pick !== workspaceId) selectWorkspace(pick);
  }, [
    clearPendingWorkspaceSelection,
    session,
    workspaces,
    workspaceId,
    refreshWorkspaces,
    selectWorkspace,
    urlWorkspaceId,
  ]);

  useEffect(() => {
    if (!session || !urlWorkspaceId) {
      lastUrlWorkspaceRefresh.current = null;
      if (!urlWorkspaceId) {
        clearPendingWorkspaceSelection();
      }
      return;
    }

    const pendingSelection = pendingWorkspaceSelection.current;
    if (
      pendingSelection.active
      && pendingSelection.target !== urlWorkspaceId
      && workspaceId === pendingSelection.target
    ) {
      return;
    }

    if (workspaces.some((w) => w.id === urlWorkspaceId)) {
      if (workspaceId !== urlWorkspaceId) {
        selectWorkspace(urlWorkspaceId);
        return;
      }
      clearPendingWorkspaceSelection();
      return;
    }

    if (lastUrlWorkspaceRefresh.current === urlWorkspaceId) {
      return;
    }
    lastUrlWorkspaceRefresh.current = urlWorkspaceId;
    void refreshWorkspaces({ force: true, preferId: urlWorkspaceId });
  }, [
    clearPendingWorkspaceSelection,
    session,
    urlWorkspaceId,
    workspaces,
    workspaceId,
    refreshWorkspaces,
    selectWorkspace,
  ]);

  useEffect(() => {
    if (!session || !urlWorkspaceId) return;
    if (!hasWorkspaceFetchSucceeded || loadingWorkspaces) return;
    if (workspaces.some((w) => w.id === urlWorkspaceId)) return;
    setWorkspaceAccessDeniedId(urlWorkspaceId);
    nav(
      {
        pathname: location.pathname,
        search: removeWorkspaceParams(location.search),
        hash: location.hash,
      },
      {
        replace: true,
        state: {
          forgeWorkspaceAccessDenied: true,
          deniedWorkspaceId: urlWorkspaceId,
        },
      },
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
    if (location.pathname !== "/app") return;
    if (!workspaceAccessDeniedId) return;
    setWorkspaceAccessDeniedId(null);
  }, [location.pathname, workspaceAccessDeniedId]);

  useEffect(() => {
    if (!urlContext.hasInvalidWorkspaceId) return;
    const nextHref = buildForgeRouteHref(location.pathname, {
      search: location.search,
      workspaceId: urlWorkspaceId,
      workpieceId: urlContext.workpieceId,
    });
    const nextSearch = searchFromHref(nextHref);
    if (nextSearch === location.search) return;
    nav(
      {
        pathname: location.pathname,
        search: nextSearch,
        hash: location.hash,
      },
      { replace: true },
    );
  }, [
    urlContext.hasInvalidWorkspaceId,
    urlWorkspaceId,
    urlContext.workpieceId,
    location.pathname,
    location.search,
    location.hash,
    nav,
  ]);

  useEffect(() => {
    if (!session) return;
    if (!location.pathname.startsWith("/app")) return;
    if (!hasWorkspaceFetchSucceeded) return;
    if (urlWorkspaceId && !workspaces.some((workspace) => workspace.id === urlWorkspaceId)) {
      // Let the explicit non-member handler strip workspace params so it can tag
      // history state with an access-denied reason for downstream notices.
      return;
    }
    const selectedWorkspaceId = workspaceId && workspaces.some((workspace) => workspace.id === workspaceId)
      ? workspaceId
      : null;
    const pendingWorkspaceId =
      pendingWorkspaceSelection.current.active
      && pendingWorkspaceSelection.current.target
      && workspaces.some((workspace) => workspace.id === pendingWorkspaceSelection.current.target)
        ? pendingWorkspaceSelection.current.target
        : null;
    const enforceWorkspaceInUrl = routeRequiresWorkspace(location.pathname);
    const targetWorkspaceId = enforceWorkspaceInUrl
      ? (pendingWorkspaceId ?? selectedWorkspaceId)
      : urlWorkspaceId;
    const nextHref = buildForgeRouteHref(location.pathname, {
      search: location.search,
      workspaceId: targetWorkspaceId,
      workpieceId: urlContext.workpieceId,
    });
    const nextSearch = searchFromHref(nextHref);
    if (nextSearch === location.search) return;
    const targetKey = `${location.pathname}|${nextSearch}|${location.hash}`;
    if (lastCanonicalNavTarget.current === targetKey) return;
    lastCanonicalNavTarget.current = targetKey;
    nav(
      {
        pathname: location.pathname,
        search: nextSearch,
        hash: location.hash,
      },
      { replace: true },
    );
  }, [
    session,
    hasWorkspaceFetchSucceeded,
    workspaceId,
    workspaces,
    location.pathname,
    location.search,
    location.hash,
    urlWorkspaceId,
    urlContext.workpieceId,
    nav,
  ]);

  useEffect(() => {
    lastCanonicalNavTarget.current = null;
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!inviteToken || !session) {
      if (!inviteToken) {
        invitePreviewTokenRef.current = null;
        setInvitePreview(null);
        setInvitePreviewError(null);
        setInvitePreviewLoading(false);
      }
      return;
    }

    if (invitePreviewTokenRef.current === inviteToken) return;
    invitePreviewTokenRef.current = inviteToken;
    setInvitePreviewLoading(true);
    setInvitePreviewError(null);

    let cancelled = false;
    const tongsRpcClient = supabase.schema("tongs") as unknown as {
      rpc: (
        fn: string,
        args?: Record<string, unknown>,
      ) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };

    void tongsRpcClient
      .rpc("get_workspace_invite_preview", { p_token: inviteToken })
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) throw error;
        setInvitePreview((data ?? null) as InvitePreview | null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setInvitePreview(null);
        setInvitePreviewError(getErrorMessage(err, "Failed loading invite details."));
      })
      .finally(() => {
        if (cancelled) return;
        setInvitePreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [inviteToken, session]);

  async function onSignOut() {
    await supabase.auth.signOut();
    nav("/app", { replace: true });
  }

  function onSignIn() {
    const params = new URLSearchParams(location.search);
    if (workspaceId) {
      params.delete("workspaceId");
      params.delete("workspace");
      params.set("workspace_id", workspaceId);
    }
    const nextSearch = params.toString();
    const nextPath = `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`;
    const next = encodeURIComponent(nextPath);
    nav(`/login?next=${next}`, { replace: false });
  }

  const clearInviteToken = useCallback(() => {
    nav(
      {
        pathname: location.pathname,
        search: removeInviteToken(location.search),
        hash: location.hash,
      },
      { replace: true },
    );
  }, [location.pathname, location.search, location.hash, nav]);

  const acceptInvite = useCallback(async () => {
    if (!session || !inviteToken) return;

    setInviteAccepting(true);
    setInvitePreviewError(null);
    try {
      const tongsRpcClient = supabase.schema("tongs") as unknown as {
        rpc: (
          fn: string,
          args?: Record<string, unknown>,
        ) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };

      const { data, error } = await tongsRpcClient
        .rpc("accept_workspace_invite", { p_token: inviteToken })
        .single();
      if (error) throw error;

      const resolvedWorkspaceId = (data as { workspace_id?: unknown } | null)?.workspace_id;
      const workspaceIdFromInvite = typeof resolvedWorkspaceId === "string" && resolvedWorkspaceId.trim()
        ? resolvedWorkspaceId
        : invitePreview?.workspace_id ?? null;

      await refreshWorkspaces({ force: true, preferId: workspaceIdFromInvite });
      if (workspaceIdFromInvite) {
        selectWorkspace(workspaceIdFromInvite);
      }
      clearInviteToken();
    } catch (err: unknown) {
      setInvitePreviewError(getErrorMessage(err, "Failed to accept workspace invite."));
    } finally {
      setInviteAccepting(false);
    }
  }, [
    session,
    inviteToken,
    invitePreview?.workspace_id,
    refreshWorkspaces,
    selectWorkspace,
    clearInviteToken,
  ]);

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

  function openDeleteWorkspace() {
    const current = workspaces.find(w => w.id === workspaceId);
    if (!current) return;
    setDeleteTargetId(current.id);
    setDeleteTargetName(current.name ?? "");
    setDeleteConfirmValue("");
    setDeleteError(null);
    setDeleteOpen(true);
  }

  function closeDeleteWorkspace(force = false) {
    if (deleting && !force) return;
    setDeleteOpen(false);
    setDeleteTargetId(null);
    setDeleteTargetName("");
    setDeleteConfirmValue("");
    setDeleteError(null);
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

  async function onDeleteWorkspace() {
    if (!session || !deleteTargetId) return;
    const targetWorkspace = workspaces.find((w) => w.id === deleteTargetId);
    const canDeleteTarget = (targetWorkspace?.role ?? null) === "owner";
    if (!canDeleteTarget) {
      setDeleteError("Only workspace owners can delete a workspace.");
      return;
    }
    const expectedName = deleteTargetName.trim();
    if (!expectedName) {
      setDeleteError("Workspace name is missing. Refresh and try again.");
      return;
    }

    if (deleteConfirmValue.trim() !== expectedName) {
      setDeleteError(`Type "${expectedName}" to confirm deletion.`);
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      const tongsRpcClient = supabase.schema("tongs") as unknown as {
        rpc: (
          fn: string,
          args?: Record<string, unknown>,
        ) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };

      const { data, error } = await tongsRpcClient
        .rpc("delete_workspace_with_owner_check", { _workspace_id: deleteTargetId })
        .single();
      if (error) throw error;
      const deleted = (data as { deleted?: unknown } | null)?.deleted;
      if (deleted !== true) {
        throw new Error("Workspace delete was not confirmed by the database.");
      }

      closeDeleteWorkspace(true);
      selectWorkspace(null);
      await refreshWorkspaces({ force: true, preferId: null });
    } catch (err: unknown) {
      setDeleteError(getErrorMessage(err, "Failed to delete workspace."));
    } finally {
      setDeleting(false);
    }
  }

  async function onCreateWorkspace() {
    if (!session) return;
    setCreating(true);
    setCreateError(null);
    try {
      // Prefer a single atomic RPC so row creation + owner membership are guaranteed together.
      let workspaceId: string | null = null;
      const tongsRpcClient = supabase.schema("tongs") as unknown as {
        rpc: (
          fn: string,
          args?: Record<string, unknown>,
        ) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
      const { data: createdViaRpc, error: rpcError } = await tongsRpcClient
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

        const { data: orgData, error: orgError } = await tongsRpcClient
          .rpc("get_or_create_my_personal_org_id")
          .single();
        if (orgError) {
          setCreateError(
            isMissingOrgServicesError(orgError)
              ? "Org services are not available yet - deploy the DB migration, then retry."
              : getErrorMessage(orgError, "Failed to resolve organization for workspace."),
          );
          return;
        }
        const resolvedOrgId = (orgData as { org_id?: unknown } | null)?.org_id;
        const orgId = typeof resolvedOrgId === "string" && resolvedOrgId.trim()
          ? resolvedOrgId
          : null;
        if (!orgId) {
          setCreateError("Org services are not available yet - deploy the DB migration, then retry.");
          return;
        }

        const { data: workspace, error: insertError } = await supabase
          .schema("tongs")
          .from("workspaces")
          .insert({
            name: "Workspace",
            created_by: session.user.id,
            org_id: orgId,
          })
          .select("id,name")
          .single();

        if (insertError) {
          setCreateError(getErrorMessage(insertError, "Failed to create workspace."));
          return;
        }
        workspaceId = typeof workspace?.id === "string" && workspace.id.trim() ? workspace.id : null;
        if (!workspaceId) {
          setCreateError("Failed to create workspace.");
          return;
        }

        const { error: memberInsertError } = await supabase
          .schema("tongs")
          .from("workspace_members")
          .insert({
            workspace_id: workspaceId,
            user_id: session.user.id,
            role: "owner",
            created_by: session.user.id,
          });
        if (memberInsertError) {
          setCreateError(getErrorMessage(memberInsertError, "Failed to create workspace membership."));
          return;
        }
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
  const groupedVisibleWorkspaces = useMemo(
    () => groupWorkspacesBySource(visibleWorkspaces),
    [visibleWorkspaces],
  );
  const groupedSessionWorkspaces = useMemo(
    () => groupWorkspacesBySource(workspaces),
    [workspaces],
  );
  const effectiveWorkspaceId = session ? workspaceId : "default";
  const workspaceValue = effectiveWorkspaceId ?? "";
  const workspaceSelectDisabled = !session || loadingWorkspaces;
  const activeWorkspace = workspaces.find(w => w.id === workspaceId) ?? null;
  const canDeleteActiveWorkspace = !!activeWorkspace && (activeWorkspace.role ?? null) === "owner";
  const deleteConfirmationTarget = deleteTargetName.trim();
  const deleteConfirmationMatches = deleteConfirmationTarget.length > 0
    && deleteConfirmValue.trim() === deleteConfirmationTarget;
  const workspaceIsValid = !!activeWorkspace;
  const appSegment = useMemo(() => getAppSegment(location.pathname), [location.pathname]);
  const routeNeedsWorkspace = !!(appSegment && WORKSPACE_REQUIRED_APP_SEGMENTS.has(appSegment));
  const shouldBlockWorkspaceRoute = !!session && routeNeedsWorkspace && !workspaceIsValid;
  const workspaceGateLoading = shouldBlockWorkspaceRoute
    && loadingWorkspaces
    && workspaces.length === 0;
  const invitePromptOpen = !!inviteToken;
  const invitePromptRequiresLogin = invitePromptOpen && !session;
  const inviteRoleLabel = useMemo(() => {
    const role = (invitePreview?.role ?? "").trim().toLowerCase();
    if (!role) return "Unknown";
    return `${role[0].toUpperCase()}${role.slice(1)}`;
  }, [invitePreview?.role]);

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

  function onNavAction(actionId: string) {
    if (actionId !== FORGE_NAV_ACTION_AI_CONTROLS) return;
    setAiControlsOpen(true);
  }

  const navExtraItems = useMemo(
    () => [
      { id: "ai-controls", label: "AI Controls", actionId: FORGE_NAV_ACTION_AI_CONTROLS },
      { id: "forge-subscriptions", label: "Account & Billing", to: "/app/subscriptions" },
    ],
    [],
  );
  const selectedWorkspaceId = workspaceId && workspaces.some((workspace) => workspace.id === workspaceId)
    ? workspaceId
    : null;
  const homeHref = useMemo(
    () => buildForgeRouteHref("/app", {
      search: location.search,
      workspaceId: selectedWorkspaceId,
      workpieceId: urlContext.workpieceId,
    }),
    [location.search, selectedWorkspaceId, urlContext.workpieceId],
  );
  const navTreeWithWorkspace = useMemo<ForgeNavSection[]>(
    () => forgeNavTree.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if (!item.to || !item.to.startsWith("/app")) return item;
        const nextTo = buildForgeRouteHref(item.to, {
          search: location.search,
          workspaceId: selectedWorkspaceId,
          workpieceId: urlContext.workpieceId,
        });
        warnMissingWorkspaceParamInDev({
          source: `AppShell:${section.id}:${item.id}`,
          href: nextTo,
          workspaceId: selectedWorkspaceId,
        });
        return {
          ...item,
          to: nextTo,
        };
      }),
    })),
    [location.search, selectedWorkspaceId, urlContext.workpieceId],
  );

  return (
    <div className="appshell-root">
      <header className="appshell-header">
        <div className="appshell-header-left">
          <Link to={homeHref} className="appshell-brand-link">
            The Forge
          </Link>
          <div className="appshell-workspace-group">
            <span className="appshell-workspace-label">Workspace</span>
            <div className="appshell-workspace-stack">
              <div className="appshell-workspace-controls">
                <select
                  aria-label="Workspace"
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
                  className="appshell-workspace-select"
                >
                  <option value="" disabled>
                    {loadingWorkspaces
                      ? "Loading..."
                      : session
                        ? "Select workspace"
                        : "Trial workspace (read-only cloud)"}
                  </option>
                  {session ? (
                    <>
                      {groupedVisibleWorkspaces.personal.length ? (
                        <optgroup label="Personal">
                          {groupedVisibleWorkspaces.personal.map((w) => (
                            <option key={w.id} value={w.id}>{workspaceSelectOptionLabel(w)}</option>
                          ))}
                        </optgroup>
                      ) : null}
                      {groupedVisibleWorkspaces.shared.length ? (
                        <optgroup label="Shared with You">
                          {groupedVisibleWorkspaces.shared.map((w) => (
                            <option key={w.id} value={w.id}>{workspaceSelectOptionLabel(w)}</option>
                          ))}
                        </optgroup>
                      ) : null}
                    </>
                  ) : (
                    visibleWorkspaces.map((w) => (
                      <option key={w.id} value={w.id}>{workspaceSelectOptionLabel(w)}</option>
                    ))
                  )}
                  {session ? <option value="__create__">+ Create workspace...</option> : null}
                </select>
                <button
                  type="button"
                  onClick={openRenameWorkspace}
                  disabled={!activeWorkspace || !session}
                  className="appshell-workspace-button"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={openDeleteWorkspace}
                  disabled={!activeWorkspace || !session || !canDeleteActiveWorkspace}
                  title={
                    !session
                      ? "Sign in to manage workspaces."
                      : !activeWorkspace
                        ? "Select a workspace first."
                      : canDeleteActiveWorkspace
                          ? "Delete workspace"
                          : "Only workspace owners can delete a workspace."
                  }
                  className="appshell-workspace-button appshell-workspace-button--danger"
                >
                  Delete
                </button>
              </div>
              {renameOpen && (
                <div className="appshell-rename-row">
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    placeholder="Workspace name"
                    className="appshell-rename-input"
                  />
                  <button type="button" onClick={onRenameWorkspace} disabled={renaming}>
                    Save
                  </button>
                  <button type="button" onClick={closeRenameWorkspace}>
                    Cancel
                  </button>
                  {renameError && (
                    <span className="appshell-inline-error">
                      {renameError}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="appshell-user-controls">
          <div
            className={`appshell-cloud-pill appshell-cloud-pill--${cloud.status}`}
            title={cloud.detail}
          >
            {cloud.label}
          </div>
          <div
            className="appshell-avatar"
            title={session?.user?.email ?? "Trial mode"}
          >
            {initials}
          </div>
          <span className="appshell-user-email">
            {session?.user?.email ?? "Anonymous trial"}
          </span>
          {session ? (
            <button onClick={onSignOut} className="appshell-auth-button">
              Sign out
            </button>
          ) : (
            <button onClick={onSignIn} className="appshell-auth-button">
              Sign in
            </button>
          )}
        </div>
      </header>

      {inTrialMode ? (
        <div className="appshell-trial-banner">
          Trial mode is active. You can explore tools with limited access. Sign in to unlock cloud workspaces, calendar writes, and full persistence.
        </div>
      ) : null}

      <div className="appshell-body">
        <aside className="appshell-nav">
          <ForgeNav tree={navTreeWithWorkspace} extraItems={navExtraItems} onAction={onNavAction} />
        </aside>

        <main className="appshell-main">
          {appSegment && MOBILE_WARNING_TOOLS[appSegment] ? (
            <MobileWarningBanner
              appName={MOBILE_WARNING_TOOLS[appSegment]}
              storageKey={`forge_mobile_warn_dismissed_${appSegment}_v1`}
            />
          ) : null}
          {shouldBlockWorkspaceRoute ? (
            <section className="appshell-workspace-gate">
              <h2 className="appshell-workspace-gate-title">You need a workspace to use the Forge.</h2>
              {workspaceGateLoading ? (
                <p className="appshell-muted-text">Loading workspaces...</p>
              ) : workspaceLoadError && workspaces.length === 0 ? (
                <>
                  <p className="appshell-muted-text">
                    Could not load workspaces right now.
                  </p>
                  <div className="appshell-error-text">{workspaceLoadError}</div>
                  <div className="appshell-row">
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
                  <p className="appshell-muted-text">
                    Create your first workspace before opening tools.
                  </p>
                  <div className="appshell-row">
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
                  <p className="appshell-muted-text">
                    Select a workspace to continue.
                  </p>
                  {workspaceLoadError && (
                    <div className="appshell-error-text">
                      {workspaceLoadError}
                    </div>
                  )}
                  <div className="appshell-row appshell-row--wrap">
                    <select
                      aria-label="Select workspace"
                      value={workspaceGateChoice}
                      onChange={(e) => setWorkspaceGateChoice(e.target.value)}
                      className="appshell-gate-select"
                    >
                      <option value="" disabled>Select workspace</option>
                      {groupedSessionWorkspaces.personal.length ? (
                        <optgroup label="Personal">
                          {groupedSessionWorkspaces.personal.map((w) => (
                            <option key={w.id} value={w.id}>
                              {workspaceSelectOptionLabel(w)}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {groupedSessionWorkspaces.shared.length ? (
                        <optgroup label="Shared with You">
                          {groupedSessionWorkspaces.shared.map((w) => (
                            <option key={w.id} value={w.id}>
                              {workspaceSelectOptionLabel(w)}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
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
                workspaceAccessDeniedId,
                workspaces,
                loadingWorkspaces,
                hasWorkspaceFetchSucceeded,
                selectWorkspace,
                refreshWorkspaces,
                session,
                cloud,
              } satisfies AppShellContext}
            />
          )}
        </main>
      </div>

      {createOpen && (
        <div className="appshell-modal-backdrop">
          <div className="appshell-modal-card">
            <h3 className="appshell-modal-title">Create workspace</h3>
            <div className="appshell-modal-body">
              <div className="appshell-modal-kicker">
                This creates an ID-only workspace container.
              </div>
              {createError && (
                <div className="appshell-modal-error">{createError}</div>
              )}
              <div className="appshell-modal-actions">
                <button
                  onClick={() => setCreateOpen(false)}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  onClick={onCreateWorkspace}
                  disabled={creating}
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="appshell-modal-backdrop appshell-modal-backdrop--danger">
          <div className="appshell-modal-card appshell-modal-card--danger">
            <h3 className="appshell-modal-title appshell-modal-title--danger">
              Delete workspace
            </h3>
            <p className="appshell-modal-copy">
              This permanently deletes the workspace and all related content, including projects,
              sparks, episodes, recordings, assets, and history. This cannot be undone.
            </p>
            <p className="appshell-modal-copy appshell-modal-copy--muted">
              Database records are deleted immediately. Uploaded storage files may remain until cleanup.
            </p>
            <div className="appshell-modal-kicker">
              Type <strong>{deleteConfirmationTarget}</strong> to verify.
            </div>
            <input
              value={deleteConfirmValue}
              onChange={(e) => setDeleteConfirmValue(e.target.value)}
              placeholder={deleteConfirmationTarget}
              autoFocus
              className="appshell-modal-input"
            />
            {deleteError && (
              <div className="appshell-modal-error">{deleteError}</div>
            )}
            <div className="appshell-modal-actions">
              <button
                type="button"
                onClick={() => closeDeleteWorkspace()}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDeleteWorkspace}
                disabled={deleting || !deleteConfirmationMatches}
                className="appshell-danger-button"
              >
                {deleting ? "Deleting..." : "Delete workspace"}
              </button>
            </div>
          </div>
        </div>
      )}

      {invitePromptOpen ? (
        <div className="appshell-invite-backdrop">
          <div className="appshell-invite-card">
            <h3 className="appshell-invite-title">Workspace Invite</h3>
            {invitePromptRequiresLogin ? (
              <>
                <p className="appshell-invite-copy">
                  Sign in with the invited email address to accept this workspace invite.
                </p>
                <div className="appshell-invite-actions">
                  <button type="button" onClick={clearInviteToken}>
                    Not now
                  </button>
                  <button type="button" onClick={onSignIn}>
                    Sign in
                  </button>
                </div>
              </>
            ) : invitePreviewLoading ? (
              <p className="appshell-invite-copy">Loading invite details...</p>
            ) : invitePreviewError ? (
              <>
                <div className="appshell-invite-error">{invitePreviewError}</div>
                <div className="appshell-invite-actions">
                  <button type="button" onClick={clearInviteToken}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="appshell-invite-copy">
                  Accept invite to <strong>{invitePreview?.workspace_name ?? "Workspace"}</strong> as{" "}
                  <strong>{inviteRoleLabel}</strong>.
                </p>
                <p className="appshell-invite-copy appshell-invite-copy--muted">
                  Invited email: {invitePreview?.email ?? "Unknown"} • Expires {invitePreview?.expires_at
                    ? new Date(invitePreview.expires_at).toLocaleString()
                    : "Unknown"}
                </p>
                <div className="appshell-invite-actions">
                  <button type="button" onClick={clearInviteToken} disabled={inviteAccepting}>
                    Cancel
                  </button>
                  <button type="button" onClick={() => void acceptInvite()} disabled={inviteAccepting}>
                    {inviteAccepting ? "Accepting..." : "Accept Invite"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {aiControlsOpen ? (
        <div
          className="appshell-ai-controls-backdrop"
          onClick={() => setAiControlsOpen(false)}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <Suspense fallback={<div className="appshell-card">Loading AI controls...</div>}>
              <AiControlsPanel
                onClose={() => setAiControlsOpen(false)}
                workspaceId={workspaceId}
                workspaceRole={activeWorkspace?.role ?? null}
              />
            </Suspense>
          </div>
        </div>
      ) : null}
    </div>
  );
}
