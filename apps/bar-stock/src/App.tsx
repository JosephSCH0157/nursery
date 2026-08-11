import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./index.css";
import "./App.css";

import type { Assignment, AssignmentId, Spark, SparkStatus } from "./lib/model";
import { makeSpark, now } from "./lib/model";

import { removeSpark, upsertSpark } from "./lib/store";
import {
  makeAssignment,
  upsertAssignment
} from "./lib/assignments";

import { extractTags, normalizeTag, querySparks, type SparkQuery } from "./lib/query";
import { copyText } from "./lib/clip";
import { buildExportPayload, downloadJson, parseImportJson } from "./lib/io";
import { supabase, supabaseAvailable } from "./lib/supabase";
import {
  listGraduatedEpisodeIds,
  listMyWorkspaces,
  type Workspace,
} from "./lib/tongs-api";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { createSupabaseBarStockRepository, type BarStockSnapshot } from "./lib/bar-stock-repository";
import { assignmentOperation, executeOperation, importLegacyBrowserData, reconcileRetryCache, sparkOperation, type OperationExecution } from "./lib/bar-stock-persistence";
import { setEntityState, type BarStockPersistenceState, type BarStockStateMap } from "./lib/bar-stock-state";
import { loadRetryCache } from "./lib/retry-cache";

type AssignmentFilter = "all" | AssignmentId;

const STANDALONE = import.meta.env.VITE_BARSTOCK_STANDALONE === "true";

const ACTIVE_WORKSPACE_KEY = "forge_workspace_id_v1";
const LEGACY_WORKSPACE_KEY = "barstock_workspace_id";
const SHOW_GRADUATED_PREF_PREFIX = "barstock_show_graduated_v1";
const WORKPIECE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SPARK_STATUS_LABELS: Record<SparkStatus, string> = {
  raw: "Open",
  warming: "Warming",
  forged: "Forged",
  graduated: "Graduated",
  archived: "Archived",
};

function loadStoredWorkspaceId(): string | null {
  return localStorage.getItem(ACTIVE_WORKSPACE_KEY)
    ?? localStorage.getItem(LEGACY_WORKSPACE_KEY);
}

function saveStoredWorkspaceId(id: string | null) {
  if (id) {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, id);
    localStorage.setItem(LEGACY_WORKSPACE_KEY, id);
    return;
  }
  localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
  localStorage.removeItem(LEGACY_WORKSPACE_KEY);
}

function normalizeWorkpieceId(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!trimmed) return null;
  return WORKPIECE_UUID_RE.test(trimmed) ? trimmed : null;
}

function showGraduatedPrefKey(workspaceId: string | null, userId: string | null): string | null {
  const workspace = workspaceId?.trim();
  if (!workspace) return null;
  return `${SHOW_GRADUATED_PREF_PREFIX}:${workspace}:${userId ?? "anon"}`;
}

function readShowGraduatedPref(workspaceId: string | null, userId: string | null): boolean {
  const key = showGraduatedPrefKey(workspaceId, userId);
  if (!key) return false;
  try {
    const raw = localStorage.getItem(key);
    return raw === "1" || raw === "true";
  } catch {
    return false;
  }
}

function writeShowGraduatedPref(workspaceId: string | null, userId: string | null, value: boolean): void {
  const key = showGraduatedPrefKey(workspaceId, userId);
  if (!key) return;
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore storage failures
  }
}

function parseWorkspaceCreatedAtMs(workspace: Workspace): number {
  if (!workspace.createdAt) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(workspace.createdAt);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function pickPreferredWorkspaceId(
  workspaces: Workspace[],
  savedId: string | null,
  currentId?: string | null,
): string | null {
  const hasWorkspace = (id: string | null | undefined): id is string =>
    typeof id === "string" && workspaces.some((workspace) => workspace.id === id);

  if (hasWorkspace(savedId)) return savedId;
  if (hasWorkspace(currentId ?? null)) return currentId ?? null;

  const ownerOrAdmin = [...workspaces]
    .filter((workspace) => workspace.role === "owner" || workspace.role === "admin")
    .sort((a, b) => parseWorkspaceCreatedAtMs(a) - parseWorkspaceCreatedAtMs(b));
  if (ownerOrAdmin.length > 0) return ownerOrAdmin[0].id;

  const ordered = [...workspaces].sort((a, b) => parseWorkspaceCreatedAtMs(a) - parseWorkspaceCreatedAtMs(b));
  return ordered[0]?.id ?? null;
}

type WorkspaceState = {
  workspaces: Workspace[];
  workspaceId: string | null;
  onWorkspaceChange: (id: string | null) => void;
  isCloudConnected?: boolean;
};

type MobileRouteMode = "list" | "new" | "detail";

type BarstockMobileRoute = {
  mode: MobileRouteMode;
  sparkId?: string;
  onOpenSpark: (sparkId: string) => void;
  onOpenNew: () => void;
  onBackToList: () => void;
};

type BarstockMobilePage = {
  title: string;
  children: ReactNode;
  onBack?: () => void;
  showBack?: boolean;
  rightAction?: ReactNode;
  bottomBar?: ReactNode;
};

type BarstockAppProps = {
  workspaceState?: WorkspaceState;
  showWorkspacePicker?: boolean;
  mobileRoute?: BarstockMobileRoute | null;
  renderMobilePage?: (page: BarstockMobilePage) => ReactNode;
};

export default function App(props: BarstockAppProps = {}) {
  const hasExternalWorkspaceState = !!props.workspaceState;
  const externalWorkspaces = props.workspaceState?.workspaces;
  const externalWorkspaceId = props.workspaceState?.workspaceId;
  const externalWorkspaceChange = props.workspaceState?.onWorkspaceChange;
  const externalCloudConnected = props.workspaceState?.isCloudConnected;
  const showWorkspacePicker = props.showWorkspacePicker ?? !hasExternalWorkspaceState;
  const initialWorkspaceId = hasExternalWorkspaceState
    ? (externalWorkspaceId ?? null)
    : loadStoredWorkspaceId();

  const [body, setBody] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(initialWorkspaceId);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [showGraduated, setShowGraduated] = useState<boolean>(() => readShowGraduatedPref(initialWorkspaceId, null));
  const [graduatedEpisodeIds, setGraduatedEpisodeIds] = useState<string[]>([]);
  const [activeAssignment, setActiveAssignment] = useState<AssignmentFilter>("all");
  const [newAssignmentName, setNewAssignmentName] = useState("");
  const [showEmptyProjects, setShowEmptyProjects] = useState(false);
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [email, setEmail] = useState("");

  const [workspaces, setWorkspaces] = useState<Workspace[]>(
    () => externalWorkspaces ?? [],
  );

  const [q, setQ] = useState<SparkQuery>({ status: "all", pinned: "all" });
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(() => (
    typeof navigator === "undefined" ? true : navigator.onLine
  ));
  const [outboxCount, setOutboxCount] = useState(() => initialWorkspaceId ? loadRetryCache(localStorage, initialWorkspaceId).length : 0);
  const [syncing, setSyncing] = useState(false);
  const [authorityReady, setAuthorityReady] = useState(false);
  const [persistenceState, setPersistenceState] = useState<BarStockPersistenceState>({ status: "offline", message: "Authentication and workspace resolution required." });
  const [entityStates, setEntityStates] = useState<BarStockStateMap>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [openMenuSparkId, setOpenMenuSparkId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const sessionUserId = session?.user.id ?? null;
  const repository = useMemo(() => supabase ? createSupabaseBarStockRepository(supabase) : null, []);
  const syncOnline = useMemo(() => {
    if (!supabaseAvailable || !workspaceId) return false;
    if (hasExternalWorkspaceState) return externalCloudConnected === true;
    return isBrowserOnline && !!sessionUserId;
  }, [
    externalCloudConnected,
    hasExternalWorkspaceState,
    isBrowserOnline,
    sessionUserId,
    workspaceId,
  ]);

  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!openMenuSparkId) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".barstock-spark-card__more-wrap")) return;
      setOpenMenuSparkId(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenMenuSparkId(null);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenuSparkId]);

  function popToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1200);
  }

  const snapshot = useMemo<BarStockSnapshot>(() => ({
    assignments,
    sparks,
    links: Object.fromEntries(assignments.filter((item) => item.workpieceId).map((item) => [item.id, item.workpieceId!])),
  }), [assignments, sparks]);

  const applyExecution = useCallback((execution: OperationExecution) => {
    const { operation, state, row, acknowledged } = execution;
    setEntityStates((current) => setEntityState(current, operation.kind, operation.entityId, state));
    setPersistenceState(state);
    if (acknowledged && (operation.action === "archive" || operation.action === "delete")) {
      if (operation.kind === "assignment") setAssignments((current) => current.filter((item) => item.id !== operation.entityId));
      else setSparks((current) => removeSpark(current, operation.entityId));
    } else if (row) {
      if (operation.kind === "assignment") setAssignments((current) => upsertAssignment(current, row as Assignment));
      else setSparks((current) => upsertSpark(current, row as Spark));
    }
    setOutboxCount(loadRetryCache(localStorage, operation.workspaceId).length);
  }, []);

  const commitOperation = useCallback(async (operation: Parameters<typeof executeOperation>[0]["operation"]) => {
    if (!repository || !sessionUserId || !workspaceId) {
      setPersistenceState({ status: "unavailable", operationId: operation.operationId, message: "Authentication, workspace, and migration 20260713170000 are required." });
      return null;
    }
    setEntityStates((current) => setEntityState(current, operation.kind, operation.entityId, { status: "pending", operationId: operation.operationId }));
    setPersistenceState({ status: "pending", operationId: operation.operationId });
    const execution = await executeOperation({
      repository,
      storage: localStorage,
      scope: { workspaceId, userId: sessionUserId },
      operation,
      online: syncOnline,
      snapshot,
    });
    applyExecution(execution);
    return execution;
  }, [applyExecution, repository, sessionUserId, snapshot, syncOnline, workspaceId]);

  const setActiveWorkspace = useCallback((next: string | null) => {
    if (hasExternalWorkspaceState && externalWorkspaceChange) {
      externalWorkspaceChange(next);
      return;
    }
    setWorkspaceId(next);
    saveStoredWorkspaceId(next);
  }, [hasExternalWorkspaceState, externalWorkspaceChange]);

  const onSyncNow = useCallback(async () => {
    if (!repository || !sessionUserId || !workspaceId) return popToast("Canonical persistence unavailable.");
    try {
      setSyncing(true);
      const canonical = await repository.hydrateWorkspace({ workspaceId, userId: sessionUserId });
      const results = await reconcileRetryCache({
        repository, storage: localStorage, scope: { workspaceId, userId: sessionUserId }, snapshot: canonical, online: syncOnline,
        onTransition: (operation, state) => setEntityStates((current) => setEntityState(current, operation.kind, operation.entityId, state)),
      });
      for (const result of results) applyExecution(result);
      const refreshed = await repository.hydrateWorkspace({ workspaceId, userId: sessionUserId });
      setAssignments(refreshed.assignments);
      setSparks(refreshed.sparks);
      setOutboxCount(loadRetryCache(localStorage, workspaceId).length);
      popToast(`Reconciled ${results.filter((result) => result.acknowledged).length} item(s).`);
    } catch (e: any) {
      console.error(e);
      popToast(`Sync failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  }, [applyExecution, repository, sessionUserId, syncOnline, workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setIsBrowserOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    if (!supabaseAvailable) return;
    if (!syncOnline) return;
    if (outboxCount === 0) return;
    onSyncNow();
  }, [supabaseAvailable, syncOnline, outboxCount, onSyncNow]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!hasExternalWorkspaceState) return;
    setWorkspaces(externalWorkspaces ?? []);
  }, [hasExternalWorkspaceState, externalWorkspaces]);

  useEffect(() => {
    if (!hasExternalWorkspaceState) return;
    setWorkspaceId(externalWorkspaceId ?? null);
  }, [hasExternalWorkspaceState, externalWorkspaceId]);

  useEffect(() => {
    setShowGraduated(readShowGraduatedPref(workspaceId, session?.user.id ?? null));
  }, [workspaceId, session?.user.id]);

  useEffect(() => {
    writeShowGraduatedPref(workspaceId, session?.user.id ?? null, showGraduated);
  }, [workspaceId, session?.user.id, showGraduated]);

  useEffect(() => {
    setAssignments([]);
    setSparks([]);
    setEntityStates({});
    setAuthorityReady(false);
    setActiveAssignment("all");
    if (!repository || !sessionUserId || !workspaceId) {
      setPersistenceState({ status: "offline", message: "Authentication and workspace resolution required." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setPersistenceState({ status: "loading" });
        const scope = { workspaceId, userId: sessionUserId };
        await repository.hydrateWorkspace(scope);
        await importLegacyBrowserData({ repository, storage: localStorage, scope, online: syncOnline });
        const canonical = await repository.hydrateWorkspace(scope);
        const retryResults = await reconcileRetryCache({
          repository, storage: localStorage, scope, snapshot: canonical, online: syncOnline,
          onTransition: (operation, state) => setEntityStates((current) => setEntityState(current, operation.kind, operation.entityId, state)),
        });
        const refreshed = retryResults.some((result) => result.acknowledged) ? await repository.hydrateWorkspace(scope) : canonical;
        if (cancelled) return;
        setAssignments(refreshed.assignments);
        setSparks(refreshed.sparks);
        setAuthorityReady(true);
        for (const result of retryResults) applyExecution(result);
        setOutboxCount(loadRetryCache(localStorage, workspaceId).length);
        const unresolved = [...retryResults].reverse().find((result) => !result.acknowledged);
        setPersistenceState(unresolved?.state ?? { status: "saved" });
      } catch (err) {
        if (!cancelled) {
          console.warn("[bar-stock] failed to hydrate workspace state", err);
          setAuthorityReady(false);
          setPersistenceState({ status: "unavailable", message: err instanceof Error ? err.message : String(err) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyExecution, repository, sessionUserId, syncOnline, workspaceId]);

  useEffect(() => {
    if (hasExternalWorkspaceState) return;
    if (!sessionUserId) {
      setWorkspaces([]);
      setWorkspaceId(null);
      return;
    }

    (async () => {
      try {
        const ws = await listMyWorkspaces();
        setWorkspaces(ws);
        const saved = loadStoredWorkspaceId();
        const pick = pickPreferredWorkspaceId(ws, saved);
        setActiveWorkspace(pick);
      } catch (err) {
        console.error(err);
        popToast("Failed loading workspaces");
      }
    })();
  }, [sessionUserId, hasExternalWorkspaceState, setActiveWorkspace]);

  const sparkEpisodeIdsForGraduation = useMemo(() => {
    const ids = new Set<string>();
    for (const spark of sparks) {
      const normalized = normalizeWorkpieceId(spark.links?.hearthWorkpieceId);
      if (normalized) ids.add(normalized);
    }
    return [...ids];
  }, [sparks]);

  useEffect(() => {
    if (!supabaseAvailable || !sessionUserId || !workspaceId) {
      setGraduatedEpisodeIds([]);
      return;
    }

    let cancelled = false;
    const refreshGraduated = async (forceRefresh = false) => {
      try {
        const ids = await listGraduatedEpisodeIds(workspaceId, {
          candidateEpisodeIds: sparkEpisodeIdsForGraduation,
          forceRefresh,
        });
        if (cancelled) return;
        setGraduatedEpisodeIds(ids);
      } catch (err) {
        if (!cancelled) {
          console.warn("[bar-stock] failed to refresh graduated sparks", err);
        }
      }
    };

    void refreshGraduated();
    const onFocus = () => { void refreshGraduated(true); };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [sessionUserId, sparkEpisodeIdsForGraduation, supabaseAvailable, workspaceId]);

  const graduatedEpisodeIdSet = useMemo(() => {
    return new Set(
      graduatedEpisodeIds
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean),
    );
  }, [graduatedEpisodeIds]);

  const isSparkGraduated = useCallback((spark: Spark): boolean => {
    if (spark.status === "graduated") return true;
    const episodeId = normalizeWorkpieceId(spark.links?.hearthWorkpieceId);
    return Boolean(episodeId && graduatedEpisodeIdSet.has(episodeId));
  }, [graduatedEpisodeIdSet]);

  const sparksForList = useMemo(() => {
    if (showGraduated) return sparks;
    return sparks.filter((spark) => !isSparkGraduated(spark));
  }, [isSparkGraduated, showGraduated, sparks]);

  const activeSparkCount = useMemo(
    () => sparks.reduce((count, spark) => (isSparkGraduated(spark) ? count : count + 1), 0),
    [isSparkGraduated, sparks],
  );
  const graduatedSparkCount = sparks.length - activeSparkCount;
  const activeWorkspaceRole = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId)?.role ?? null,
    [workspaceId, workspaces],
  );
  const canWrite = useMemo(() => {
    if (!authorityReady || !activeWorkspaceRole || !sessionUserId || !workspaceId || !repository) return false;
    return activeWorkspaceRole === "owner" || activeWorkspaceRole === "admin" || activeWorkspaceRole === "editor";
  }, [activeWorkspaceRole, authorityReady, repository, sessionUserId, workspaceId]);
  const canAdd = useMemo(() => canWrite && body.trim().length > 0, [body, canWrite]);
  const attentionCount = useMemo(
    () => Object.values(entityStates).filter((state) => state.status !== "saved").length,
    [entityStates],
  );
  const mobileRoute = props.mobileRoute ?? null;
  const isMobileRoute = mobileRoute !== null;
  const mobileMode: MobileRouteMode = mobileRoute?.mode ?? "list";
  const syncLabel = persistenceState.status.toUpperCase();
  const syncHint = !supabaseAvailable
    ? "Cloud sync unavailable."
    : (!workspaceId
        ? "Pick a workspace first."
        : hasExternalWorkspaceState && sessionUserId && !syncOnline
          ? "Forge Cloud is not connected."
          : !sessionUserId
            ? "Sign in to enable cloud sync."
            : !isBrowserOnline
              ? "Browser is offline."
              : "Online.");

  function navigateToHearthForProject(projectId: string) {
    const normalizedProjectId = projectId.trim().toLowerCase();
    if (!normalizeWorkpieceId(normalizedProjectId)) return;

    const params = new URLSearchParams();
    params.set("project_id", normalizedProjectId);
    if (workspaceId) {
      params.set("workspace_id", workspaceId);
    }

    const isNurseryAppRoute = window.location.pathname.startsWith("/app/");
    const targetPath = isNurseryAppRoute ? "/app/hearth" : "/hearth";
    window.location.assign(`${targetPath}?${params.toString()}`);
  }

  function navigateToHearthForSpark(sparkId: string) {
    const normalizedSparkId = sparkId.trim().toLowerCase();
    if (!normalizeWorkpieceId(normalizedSparkId)) return;

    const params = new URLSearchParams();
    params.set("spark_id", normalizedSparkId);
    if (workspaceId) {
      params.set("workspace_id", workspaceId);
    }

    const isNurseryAppRoute = window.location.pathname.startsWith("/app/");
    const targetPath = isNurseryAppRoute ? "/app/hearth" : "/hearth";
    window.location.assign(`${targetPath}?${params.toString()}`);
  }

  function navigateToAnvilForEpisode(episodeId: string) {
    const normalizedEpisodeId = episodeId.trim();
    if (!normalizedEpisodeId) return;

    const params = new URLSearchParams();
    params.set("workpiece_id", normalizedEpisodeId);
    if (workspaceId) {
      params.set("workspace_id", workspaceId);
    }

    const isNurseryAppRoute = window.location.pathname.startsWith("/app/");
    const targetPath = isNurseryAppRoute ? "/app/anvil" : "/anvil";
    window.location.assign(`${targetPath}?${params.toString()}`);
  }

  function updateSpark(s: Spark, patch: Partial<Spark>) {
    if (!canWrite) {
      popToast("Editor access required.");
      return;
    }
    const ts = now();
    const next: Spark = { ...s, ...patch, updatedAt: ts };
    setSparks(prev => upsertSpark(prev, next));
    if (!workspaceId) return;
    void commitOperation(sparkOperation({ workspaceId, action: "update", spark: next }));
  }

  function setStatus(s: Spark, status: SparkStatus) {
    const nextStatus = isSparkGraduated(s) && status !== "archived"
      ? "graduated"
      : status;
    updateSpark(s, { status: nextStatus });
  }

  function togglePin(s: Spark) {
    updateSpark(s, { pinned: !s.pinned });
  }

  function deleteSpark(id: string) {
    if (!canWrite) {
      popToast("Editor access required.");
      return;
    }
    const spark = sparks.find((item) => item.id === id);
    if (!spark || !workspaceId) return;
    const intent = { ...spark, status: "archived" as const, updatedAt: now() };
    void commitOperation(sparkOperation({ workspaceId, action: "archive", spark: intent }));
  }

  function confirmDeleteSpark(spark: Spark) {
    const label = spark.title?.trim() || spark.body.trim().split(/\r?\n/)[0] || "this spark";
    const confirmed = window.confirm(`Archive ${label}? The canonical Workpiece, if any, will be preserved.`);
    if (!confirmed) return;
    deleteSpark(spark.id);
    popToast("Spark archive requested.");
  }

  function onTagClick(tag: string) {
    setQ(prev => ({ ...prev, tag: normalizeTag(tag) }));
  }


  function addAssignment() {
    if (!canWrite) {
      popToast("Editor access required.");
      return;
    }
    const name = newAssignmentName.trim();
    if (!name) return;
    const a = makeAssignment(name);
    setAssignments(prev => upsertAssignment(prev, a));
    if (workspaceId) void commitOperation(assignmentOperation({ workspaceId, action: "create", assignment: a }));
    setNewAssignmentName("");
    setActiveAssignment(a.id);
    popToast("Project created.");
  }

  function addSpark() {
    if (!canWrite) {
      popToast("Editor access required.");
      return;
    }
    if (!canAdd) return;

    const tags = extractTags(body);

    const assignmentId: AssignmentId | null = activeAssignment === "all"
      ? null
      : activeAssignment;

    const s = makeSpark(body, assignmentId, {
      source: "typed",
      tags
    });

    setSparks(prev => upsertSpark(prev, s));
    if (workspaceId) void commitOperation(sparkOperation({ workspaceId, action: "create", spark: s }));
    setBody("");
  }

  function launchActiveProjectInHearth() {
    if (!activeProject) return;
    popToast("Opening Hearth...");
    navigateToHearthForProject(activeProject.id);
  }

  const filteredByAssignment = useMemo(() => {
    if (activeAssignment === "all") return sparksForList;
    return sparksForList.filter(s => s.assignmentId === activeAssignment);
  }, [sparksForList, activeAssignment]);

  const filtered = useMemo(() => querySparks(filteredByAssignment, q), [filteredByAssignment, q]);

  const sortedAssignments = useMemo(() => {
    // pinned first then alpha
    return [...assignments].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return a.name.localeCompare(b.name);
    });
  }, [assignments]);

  const projectCountsByAssignmentId = useMemo(() => {
    const counts = new Map<string, { active: number; total: number }>();
    for (const spark of sparks) {
      if (!spark.assignmentId) continue;
      const current = counts.get(spark.assignmentId) ?? { active: 0, total: 0 };
      current.total += 1;
      if (!isSparkGraduated(spark)) {
        current.active += 1;
      }
      counts.set(spark.assignmentId, current);
    }
    return counts;
  }, [isSparkGraduated, sparks]);

  const visibleAssignments = useMemo(() => {
    if (showEmptyProjects) return sortedAssignments;
    return sortedAssignments.filter((assignment) => {
      const counts = projectCountsByAssignmentId.get(assignment.id);
      return (counts?.active ?? 0) > 0;
    });
  }, [projectCountsByAssignmentId, showEmptyProjects, sortedAssignments]);

  const activeProject = useMemo(
    () => (activeAssignment === "all" ? null : assignments.find((assignment) => assignment.id === activeAssignment) ?? null),
    [activeAssignment, assignments],
  );
  const activeProjectCounts = useMemo(
    () => (activeProject ? (projectCountsByAssignmentId.get(activeProject.id) ?? { active: 0, total: 0 }) : null),
    [activeProject, projectCountsByAssignmentId],
  );
  const isProjectView = activeAssignment !== "all";

  useEffect(() => {
    if (activeAssignment === "all") return;
    if (assignments.some((assignment) => assignment.id === activeAssignment)) return;
    setActiveAssignment("all");
  }, [activeAssignment, assignments]);

  useEffect(() => {
    if (activeAssignment === "all") return;
    if (showEmptyProjects) return;
    const counts = projectCountsByAssignmentId.get(activeAssignment);
    if ((counts?.active ?? 0) > 0) return;
    setActiveAssignment("all");
  }, [activeAssignment, projectCountsByAssignmentId, showEmptyProjects]);

  async function onImportFile(file: File) {
    if (!workspaceId || !canWrite) {
      popToast("Authenticated editor workspace required.");
      return;
    }
    const text = await file.text();
    const parsed = parseImportJson(text);

    if (parsed.sparks.length === 0) {
      popToast("Import failed (no sparks found).");
      return;
    }

    let acknowledged = 0;
    for (const spark of parsed.sparks) {
      setSparks((current) => upsertSpark(current, spark));
      const result = await commitOperation(sparkOperation({ workspaceId, action: "create", spark }));
      if (result?.acknowledged) acknowledged++;
    }
    const msgParts = [`Acknowledged ${acknowledged}`];
    const pending = parsed.sparks.length - acknowledged;
    if (pending) msgParts.push(`pending ${pending}`);
    if (parsed.errors) msgParts.push(`errors ${parsed.errors}`);
    popToast(msgParts.join(", ") + ".");
  }

  const assignmentNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assignments) m.set(a.id, a.name);
    return m;
  }, [assignments]);

  const renderMobilePage = useCallback((page: BarstockMobilePage): ReactNode => {
    if (props.renderMobilePage) {
      return props.renderMobilePage(page);
    }
    return (
      <section className="barstock-mobile-fallback">
        <header className="barstock-mobile-fallback__header">
          <div className="barstock-mobile-fallback__left">
            {page.showBack === false ? null : (
              <button type="button" onClick={page.onBack}>
                Back
              </button>
            )}
          </div>
          <h1 className="barstock-mobile-fallback__title">{page.title}</h1>
          <div className="barstock-mobile-fallback__right">{page.rightAction}</div>
        </header>
        <div className="barstock-mobile-fallback__body">{page.children}</div>
        {page.bottomBar ? (
          <footer className="barstock-mobile-fallback__bottom">{page.bottomBar}</footer>
        ) : null}
      </section>
    );
  }, [props.renderMobilePage]);

  const mobileDetailSpark = useMemo(() => {
    if (!mobileRoute || mobileMode !== "detail" || !mobileRoute.sparkId) return null;
    return sparks.find((spark) => spark.id === mobileRoute.sparkId) ?? null;
  }, [mobileMode, mobileRoute, sparks]);

  useEffect(() => {
    if (!mobileRoute) return;
    if (mobileMode !== "detail") return;
    if (!mobileRoute.sparkId) {
      mobileRoute.onBackToList();
      return;
    }
    const existsInWorkspace = sparks.some((spark) => spark.id === mobileRoute.sparkId);
    if (!existsInWorkspace) {
      mobileRoute.onBackToList();
    }
  }, [mobileMode, mobileRoute, sparks]);

  if (isMobileRoute && mobileRoute) {
    if (mobileMode === "new") {
      return (
        <div className="barstock-root barstock-mobile-root">
          {renderMobilePage({
            title: "New Spark",
            onBack: () => mobileRoute.onBackToList(),
            children: (
              <div className="barstock-mobile-content">
                {toast ? <div className="barstock-mobile-toast">{toast}</div> : null}
                {!canWrite ? (
                  <p className="barstock-mobile-message">
                    Viewer role is read-only in this workspace.
                  </p>
                ) : null}
                <label className="barstock-mobile-field">
                  <span className="barstock-mobile-field__label">Spark</span>
                  <textarea
                    aria-label="Spark text"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Type here… try #tags if you want."
                    rows={16}
                    className="barstock-mobile-textarea"
                  />
                </label>
              </div>
            ),
            bottomBar: (
              <div className="barstock-mobile-actions">
                <button
                  type="button"
                  className="barstock-mobile-button"
                  onClick={() => {
                    setBody("");
                    mobileRoute.onBackToList();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="barstock-mobile-button barstock-mobile-button--primary"
                  disabled={!canAdd}
                  onClick={() => {
                    addSpark();
                    if (!canWrite) return;
                    mobileRoute.onBackToList();
                  }}
                >
                  Save
                </button>
              </div>
            ),
          })}
        </div>
      );
    }

    if (mobileMode === "detail") {
      if (!mobileDetailSpark) {
        return (
          <div className="barstock-root barstock-mobile-root">
            {renderMobilePage({
              title: "Spark",
              onBack: () => mobileRoute.onBackToList(),
              children: (
                <div className="barstock-mobile-content">
                  <p className="barstock-mobile-message">
                    Spark not found in this workspace.
                  </p>
                </div>
              ),
            })}
          </div>
        );
      }

      const detailEditing = editingId === mobileDetailSpark.id;
      const detailIsGraduated = isSparkGraduated(mobileDetailSpark);

      return (
        <div className="barstock-root barstock-mobile-root">
          {renderMobilePage({
            title: mobileDetailSpark.title?.trim() || "Spark",
            onBack: () => mobileRoute.onBackToList(),
            rightAction: canWrite ? (
              detailEditing ? (
                <button
                  type="button"
                  className="barstock-mobile-button"
                  onClick={() => {
                    setEditingId(null);
                    setEditingBody("");
                  }}
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className="barstock-mobile-button"
                  onClick={() => {
                    setEditingId(mobileDetailSpark.id);
                    setEditingBody(mobileDetailSpark.body);
                  }}
                >
                  Edit
                </button>
              )
            ) : null,
            children: (
              <div className="barstock-mobile-content">
                {toast ? <div className="barstock-mobile-toast">{toast}</div> : null}
                <div className="barstock-mobile-meta">
                  <span>{new Date(mobileDetailSpark.updatedAt).toLocaleString()}</span>
                  {detailIsGraduated ? <span>Graduated</span> : null}
                  <span>{assignmentNameById.get(mobileDetailSpark.assignmentId ?? "") ?? "No project"}</span>
                </div>

                <label className="barstock-mobile-field">
                  <span className="barstock-mobile-field__label">Status</span>
                  <select
                    aria-label="Spark status"
                    value={mobileDetailSpark.status}
                    disabled={!canWrite}
                    onChange={(event) => setStatus(mobileDetailSpark, event.target.value as SparkStatus)}
                  >
                    <option value="raw">Open (Raw)</option>
                    <option value="warming">Open (Warming)</option>
                    <option value="forged">Forged</option>
                    <option value="graduated">Graduated</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>

                <label className="barstock-mobile-field">
                  <span className="barstock-mobile-field__label">Project</span>
                  <select
                    aria-label="Spark project"
                    value={mobileDetailSpark.assignmentId ?? ""}
                    disabled={!canWrite}
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      updateSpark(mobileDetailSpark, { assignmentId: value || null });
                    }}
                  >
                    <option value="">No project</option>
                    {sortedAssignments.map((assignment) => (
                      <option key={assignment.id} value={assignment.id}>
                        {assignment.name}
                      </option>
                    ))}
                  </select>
                </label>

                {detailEditing ? (
                  <textarea
                    aria-label="Edit spark text"
                    value={editingBody}
                    onChange={(event) => setEditingBody(event.target.value)}
                    rows={14}
                    className="barstock-mobile-textarea"
                  />
                ) : (
                  <pre className="barstock-mobile-detail-body">{mobileDetailSpark.body}</pre>
                )}
              </div>
            ),
            bottomBar: canWrite ? (
              <div className="barstock-mobile-actions">
                {detailEditing ? (
                  <>
                    <button
                      type="button"
                      className="barstock-mobile-button"
                      onClick={() => {
                        setEditingId(null);
                        setEditingBody("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="barstock-mobile-button barstock-mobile-button--primary"
                      onClick={() => {
                        updateSpark(mobileDetailSpark, { body: editingBody });
                        setEditingId(null);
                        setEditingBody("");
                        popToast("Saved.");
                      }}
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="barstock-mobile-button"
                      disabled={!mobileDetailSpark.assignmentId}
                      onClick={() => {
                        if (!mobileDetailSpark.assignmentId) return;
                        navigateToHearthForProject(mobileDetailSpark.assignmentId);
                      }}
                    >
                      Launch Episode
                    </button>
                    <button
                      type="button"
                      className="barstock-mobile-button barstock-mobile-button--danger"
                      onClick={() => {
                        confirmDeleteSpark(mobileDetailSpark);
                        mobileRoute.onBackToList();
                      }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            ) : null,
          })}
        </div>
      );
    }

    return (
      <div className="barstock-root barstock-mobile-root">
        {renderMobilePage({
          title: "Bar-Stock",
          showBack: false,
          rightAction: canWrite ? (
            <button
              type="button"
              className="barstock-mobile-button barstock-mobile-button--primary"
              onClick={() => mobileRoute.onOpenNew()}
            >
              New Spark
            </button>
          ) : null,
          children: (
            <div className="barstock-mobile-content">
              {toast ? <div className="barstock-mobile-toast">{toast}</div> : null}
              <p className="barstock-mobile-count">
                {showGraduated
                  ? `${activeSparkCount} active • ${graduatedSparkCount} graduated`
                  : `${activeSparkCount} sparks • idea mine`}
              </p>

              <label className="barstock-mobile-field">
                <span className="barstock-mobile-field__label">Project</span>
                <select
                  value={activeAssignment}
                  onChange={(event) => {
                    const next = event.target.value;
                    setActiveAssignment(next === "all" ? "all" : next);
                  }}
                >
                  <option value="all">All sparks</option>
                  {visibleAssignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.name} ({projectCountsByAssignmentId.get(assignment.id)?.active ?? 0})
                    </option>
                  ))}
                </select>
              </label>

              <label className="barstock-mobile-field">
                <span className="barstock-mobile-field__label">Search</span>
                <input
                  value={q.text ?? ""}
                  onChange={(event) => setQ((prev) => ({ ...prev, text: event.target.value }))}
                  placeholder="Search sparks…"
                />
              </label>

              <label className="barstock-mobile-checkbox">
                <input
                  type="checkbox"
                  checked={showGraduated}
                  onChange={(event) => setShowGraduated(event.target.checked)}
                />
                Show graduated
              </label>

              {filtered.length === 0 ? (
                <p className="barstock-mobile-message">No sparks yet. Toss one in.</p>
              ) : (
                <div className="barstock-mobile-list">
                  {filtered.map((spark) => {
                    const isGraduated = isSparkGraduated(spark);
                    return (
                      <button
                        key={spark.id}
                        type="button"
                        className="barstock-mobile-spark-row"
                        onClick={() => mobileRoute.onOpenSpark(spark.id)}
                      >
                        <div className="barstock-mobile-spark-row__meta">
                          <span>{new Date(spark.createdAt).toLocaleDateString()}</span>
                          <span>{assignmentNameById.get(spark.assignmentId ?? "") ?? "No project"}</span>
                          {isGraduated ? <span>Graduated</span> : null}
                        </div>
                        <span className="barstock-mobile-spark-row__body">
                          {spark.body}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ),
        })}
      </div>
    );
  }

  return (
    <div className="barstock-root barstock-layout">
      {/* Sidebar */}
      <aside className="barstock-sidebar">
        <div className="barstock-sidebar__title">Bar-Stock</div>
        <div className="barstock-sidebar__summary">
          {showGraduated
            ? `${activeSparkCount} active • ${graduatedSparkCount} graduated`
            : `${activeSparkCount} sparks • idea mine`}
        </div>
        {showWorkspacePicker ? (
          <div className="barstock-workspace-row">
            <div className="barstock-workspace-user">
              <strong>Bar-Stock</strong>
              {session ? (
                <span className="barstock-workspace-email">{session.user.email}</span>
              ) : null}
            </div>

            {!supabaseAvailable ? (
              <div className="barstock-workspace-muted">Cloud sync unavailable.</div>
            ) : session ? (
              <div className="barstock-workspace-controls">
                <select
                  aria-label="Workspace"
                  value={workspaceId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setActiveWorkspace(v);
                  }}
                  className="barstock-workspace-select"
                >
                  {workspaces.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                {STANDALONE ? (
                  <button onClick={() => supabase?.auth.signOut()}>
                    Sign out
                  </button>
                ) : null}
              </div>
            ) : STANDALONE ? (
              <div className="barstock-workspace-controls">
                <input
                  aria-label="Email for magic link"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email for magic link"
                  className="barstock-workspace-input"
                />
                <button
                  onClick={async () => {
                    if (!supabase) return;
                    const { error } = await supabase.auth.signInWithOtp({
                      email,
                      options: { emailRedirectTo: window.location.origin }
                    });
                    popToast(error ? error.message : "Magic link sent.");
                  }}
                >
                  Send link
                </button>
              </div>
            ) : (
              <div className="barstock-workspace-muted">Signed in via The Forge.</div>
            )}
          </div>
        ) : null}

        <div className="barstock-sidebar__section">
          <div className="barstock-sidebar__section-title">
            Projects
          </div>

          <div className="barstock-sidebar__project-list">
            <SidebarItem
              label="All sparks"
              active={activeAssignment === "all"}
              onClick={() => setActiveAssignment("all")}
            />

            <div className="barstock-sidebar__separator">
              —
            </div>

            <label className="barstock-sidebar__checkbox">
              <input
                type="checkbox"
                checked={showEmptyProjects}
                onChange={(e) => setShowEmptyProjects(e.target.checked)}
              />
              Show empty projects
            </label>

            {visibleAssignments.length === 0 ? (
              <div className="barstock-sidebar__empty">
                No active projects yet.
              </div>
            ) : (
              visibleAssignments.map(a => (
                <SidebarItem
                  key={a.id}
                  label={`${a.name} (${projectCountsByAssignmentId.get(a.id)?.active ?? 0})`}
                  active={activeAssignment === a.id}
                  onClick={() => setActiveAssignment(a.id)}
                />
              ))
            )}
          </div>

          <div className="barstock-sidebar__new-project-row">
            <input
              aria-label="New project name"
              value={newAssignmentName}
              onChange={(e) => setNewAssignmentName(e.target.value)}
              placeholder="New project..."
              className="barstock-sidebar__new-project-input"
              onKeyDown={(e) => {
                if (e.key === "Enter") addAssignment();
              }}
            />
            <button
              onClick={addAssignment}
              disabled={!newAssignmentName.trim()}
              className="barstock-sidebar__new-project-add"
            >
              Add
            </button>
          </div>

          <div className="barstock-sidebar__active-project">
            {activeProject ? (
              <>
                <div>
                  Working on: <b>{activeProject.name}</b>
                </div>
                <div className="barstock-sidebar__active-project-meta">
                  {activeProjectCounts?.active ?? 0} sparks ready
                </div>
                <button
                  onClick={launchActiveProjectInHearth}
                  className="barstock-sidebar__launch-button"
                >
                  Launch Episode in Hearth
                </button>
                <div className="barstock-sidebar__active-project-actions">
                  <button
                    onClick={() => setActiveAssignment("all")}
                    className="barstock-sidebar__stop-button"
                  >
                    Stop
                  </button>
                </div>
              </>
            ) : (
              <div>Working on: none</div>
            )}
          </div>

          <div className="barstock-sidebar__import-export-row">
            <button
              onClick={() => {
                const d = new Date();
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, "0");
                const day = String(d.getDate()).padStart(2, "0");
                const filename = `bar-stock_sparks_${y}-${m}-${day}.json`;
                downloadJson(filename, buildExportPayload(sparks));
                popToast("Exported.");
              }}
            >
              Export
            </button>

            <button onClick={() => importRef.current?.click()}>
              Import
            </button>

            <input
              ref={importRef}
              type="file"
              aria-label="Import sparks JSON file"
              accept="application/json"
              className="barstock-hidden-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onImportFile(f);
              }}
            />
          </div>
          <div className="barstock-sidebar__sync">
            <div className="barstock-sidebar__section-title">Forge Sync</div>
            <div className="barstock-sidebar__sync-status">
              Status: <b>{syncLabel}</b> - Retry cache: <b>{outboxCount}</b> - Attention: <b>{attentionCount}</b>
            </div>
            <div className="barstock-sidebar__sync-hint">
              {syncHint}
            </div>
            <div className="barstock-sidebar__sync-actions">
              <button
                onClick={onSyncNow}
                disabled={!supabaseAvailable || !syncOnline || !session || !workspaceId || syncing || outboxCount === 0}
              >
                {syncing ? "Syncing..." : "Sync now"}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="barstock-main">
        <h1 className="barstock-main__title">Sparks</h1>
        <p className="barstock-main__subtitle">
          Dump the spark. No polish. No pressure.
        </p>
        <p className="barstock-main__kicker">
          One idea is enough to begin.
        </p>

        {activeProject ? (
          <section className="barstock-main__active-project-card">
            <div className="barstock-main__active-project-title">
              Working on: <b>{activeProject.name}</b>
            </div>
            <div className="barstock-main__active-project-meta">
              {activeProjectCounts?.active ?? 0} sparks ready
            </div>
            <div className="barstock-main__active-project-actions">
              <button
                onClick={launchActiveProjectInHearth}
                className="barstock-main__launch-button"
              >
                Launch Episode in Hearth
              </button>
              <button
                onClick={() => setActiveAssignment("all")}
              >
                Stop
              </button>
            </div>
          </section>
        ) : null}

        {toast && (
          <div className="barstock-main__toast">
            {toast}
          </div>
        )}

        <div className="barstock-main__composer">
          <textarea
            aria-label="New spark text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type here… try #tags if you want."
            rows={6}
            className="barstock-main__composer-textarea"
          />
          <button
            onClick={addSpark}
            disabled={!canAdd}
            className="barstock-main__composer-button"
          >
            Add Spark
          </button>
        </div>

        {/* Filters */}
        <div className="barstock-main__filters">
          <input
            aria-label="Search sparks"
            value={q.text ?? ""}
            onChange={(e) => setQ(prev => ({ ...prev, text: e.target.value }))}
            placeholder="Search sparks…"
            className="barstock-main__filter-search"
          />
          <select
            aria-label="Filter by spark status"
            value={q.status ?? "all"}
            onChange={(e) => setQ(prev => ({ ...prev, status: e.target.value as any }))}
            className="barstock-main__filter-status"
          >
            <option value="all">All</option>
            <option value="raw">Open (Raw)</option>
            <option value="warming">Open (Warming)</option>
            <option value="forged">Forged</option>
            <option value="graduated">Graduated</option>
            <option value="archived">Archived</option>
          </select>
          <label className="barstock-main__filter-checkbox">
            <input
              type="checkbox"
              checked={showGraduated}
              onChange={(e) => setShowGraduated(e.target.checked)}
            />
            Show graduated
          </label>
        </div>

        {q.tag && (
          <div className="barstock-main__tag-filter">
            Filtering by tag: <b>#{q.tag}</b>{" "}
            <button onClick={() => setQ(prev => ({ ...prev, tag: undefined }))}>
              clear
            </button>
          </div>
        )}

        <div className="barstock-main__spark-list">
          {filtered.length === 0 ? (
            <div className="barstock-main__empty">
              No sparks yet. Toss one in.
            </div>
          ) : (
            filtered.map((s) => {
              const linkedWorkpieceId = normalizeWorkpieceId(s.links?.hearthWorkpieceId);
              const isGraduated = isSparkGraduated(s);
              const projectLabel = s.assignmentId
                ? (assignmentNameById.get(s.assignmentId) ?? "Unknown project")
                : "No project";
              const isMenuOpen = openMenuSparkId === s.id;
              return (
                <div
                  key={s.id}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest("button,select,input,textarea,option")) return;
                    setActiveAssignment(s.assignmentId ?? "all");
                  }}
                  className={`barstock-spark-card${showGraduated && isGraduated ? " is-graduated-dimmed" : ""}`}
                >
                <div className="barstock-spark-card__head">
                  <div className="barstock-spark-card__meta-wrap">
                    <div className="barstock-spark-card__meta">
                      {new Date(s.createdAt).toLocaleString()}
                      {s.pinned ? " • pinned" : ""}
                    </div>
                    <div className="barstock-spark-card__chips">
                      <span className={`barstock-spark-chip barstock-spark-chip--${s.status}`}>
                        {SPARK_STATUS_LABELS[s.status]}
                      </span>
                      <span className="barstock-spark-chip barstock-spark-chip--project">{projectLabel}</span>
                      {isGraduated ? (
                        <span
                          className="barstock-spark-chip barstock-spark-chip--graduated"
                          title="This spark has graduated to an approved/published script."
                        >
                          GRADUATED
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="barstock-spark-card__actions">
                    <select
                      aria-label="Spark status"
                      value={s.status}
                      onChange={(e) => setStatus(s, e.target.value as SparkStatus)}
                      className="barstock-spark-card__compact-select"
                      title="Status"
                    >
                      <option value="raw">Open (Raw)</option>
                      <option value="warming">Open (Warming)</option>
                      <option value="forged">Forged</option>
                      <option value="graduated">Graduated</option>
                      <option value="archived">Archived</option>
                    </select>

                    <select
                      aria-label="Spark project"
                      value={s.assignmentId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateSpark(s, { assignmentId: v || null });
                      }}
                      className="barstock-spark-card__compact-select"
                      title="Project"
                    >
                      <option value="">No project</option>
                      {sortedAssignments.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>

                    {!isProjectView ? (
                      <button
                        className="barstock-spark-card__primary-action"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (s.assignmentId) {
                            popToast("Opening Hearth...");
                            navigateToHearthForProject(s.assignmentId);
                            return;
                          }
                            popToast("Opening Hearth...");
                            navigateToHearthForSpark(s.id);
                        }}
                      >
                        Send to Hearth
                      </button>
                    ) : null}

                    {isGraduated && linkedWorkpieceId ? (
                      <button
                        className="barstock-spark-card__secondary-action"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateToAnvilForEpisode(linkedWorkpieceId);
                        }}
                      >
                        Open in Anvil
                      </button>
                    ) : null}

                    {editingId === s.id ? (
                      <>
                        <button
                          onClick={() => {
                            updateSpark(s, { body: editingBody });
                            setEditingId(null);
                            setEditingBody("");
                            popToast("Saved.");
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditingBody("");
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <div className="barstock-spark-card__more-wrap">
                        <button
                          type="button"
                          className="barstock-spark-card__more-toggle"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuSparkId((prev) => (prev === s.id ? null : s.id));
                          }}
                        >
                          More
                        </button>
                        {isMenuOpen ? (
                          <div className="barstock-spark-card__more-menu">
                            <button
                              onClick={() => {
                                togglePin(s);
                                setOpenMenuSparkId(null);
                              }}
                            >
                              {s.pinned ? "Unpin" : "Pin"}
                            </button>
                            <button
                              onClick={async () => {
                                const ok = await copyText(s.body);
                                popToast(ok ? "Copied." : "Copy failed.");
                                setOpenMenuSparkId(null);
                              }}
                            >
                              Copy
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(s.id);
                                setEditingBody(s.body);
                                setOpenMenuSparkId(null);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="barstock-spark-card__danger"
                              onClick={() => {
                                confirmDeleteSpark(s);
                                setOpenMenuSparkId(null);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                {editingId === s.id ? (
                  <textarea
                    aria-label="Edit spark text"
                    value={editingBody}
                    onChange={(e) => setEditingBody(e.target.value)}
                    rows={4}
                    className="barstock-spark-card__edit-textarea"
                  />
                ) : (
                  <pre className="barstock-spark-card__body">
                    {s.body}
                  </pre>
                )}

                {s.tags.length > 0 && (
                  <div className="barstock-spark-card__tags">
                    {s.tags.map((t) => (
                      <button
                        key={t}
                        onClick={() => onTagClick(t)}
                        className="barstock-spark-card__tag-button"
                        title="Filter by tag"
                      >
                        #{normalizeTag(t)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}

function SidebarItem(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      className={`barstock-sidebar-item${props.active ? " is-active" : ""}`}
    >
      {props.label}
    </button>
  );
}
