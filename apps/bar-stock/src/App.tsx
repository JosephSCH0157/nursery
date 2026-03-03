import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./index.css";
import "./App.css";

import type { Assignment, AssignmentId, Spark, SparkStatus } from "./lib/model";
import { makeSpark, now } from "./lib/model";

import { loadSparks, removeSpark, saveSparks, upsertSpark } from "./lib/store";
import {
  buildAssignmentNameFromSpark,
  loadAssignments,
  makeAssignment,
  saveAssignments,
  upsertAssignment
} from "./lib/assignments";

import { extractTags, normalizeTag, querySparks, type SparkQuery } from "./lib/query";
import { copyText } from "./lib/clip";
import { buildExportPayload, downloadJson, mergeSparks, parseImportJson } from "./lib/io";
import { compactOutbox, drainOutbox, loadOutbox, peekOutbox, pushOutbox, saveOutbox } from "./lib/outbox";
import { supabase, supabaseAvailable } from "./lib/supabase";
import {
  listGraduatedEpisodeIds,
  listMyWorkspaces,
  listWorkspaceProjects,
  listWorkspaceSparks,
  type Workspace,
} from "./lib/tongs-api";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { flushOutboxToTongs, checkTongsOnline } from "./lib/tongs-sync";

type AssignmentFilter = "all" | AssignmentId;

const STANDALONE = import.meta.env.VITE_BARSTOCK_STANDALONE === "true";

const ACTIVE_WORKSPACE_KEY = "forge_workspace_id_v1";
const LEGACY_WORKSPACE_KEY = "barstock_workspace_id";
const SHOW_GRADUATED_PREF_PREFIX = "barstock_show_graduated_v1";
const WORKPIECE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_ID_MAP_KEY = "forge_barstock_project_id_map_v1";

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

function loadProjectIdMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PROJECT_ID_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function saveProjectIdMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(PROJECT_ID_MAP_KEY, JSON.stringify(map));
  } catch {
    // ignore storage failures
  }
}

function normalizeProjectId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (WORKPIECE_UUID_RE.test(normalized)) return normalized;

  const map = loadProjectIdMap();
  const existing = map[normalized];
  if (typeof existing === "string" && WORKPIECE_UUID_RE.test(existing)) {
    return existing.toLowerCase();
  }

  const generated = crypto.randomUUID();
  map[normalized] = generated;
  saveProjectIdMap(map);
  return generated;
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
  const showWorkspacePicker = props.showWorkspacePicker ?? !hasExternalWorkspaceState;
  const initialWorkspaceId = hasExternalWorkspaceState
    ? (externalWorkspaceId ?? null)
    : loadStoredWorkspaceId();

  const [body, setBody] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(initialWorkspaceId);
  const [sparks, setSparks] = useState<Spark[]>(() => loadSparks(initialWorkspaceId));
  const [assignments, setAssignments] = useState<Assignment[]>(() => loadAssignments(initialWorkspaceId));
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
  const [tongsStatus, setTongsStatus] = useState<"offline" | "online">("offline");
  const [outboxCount, setOutboxCount] = useState(() => loadOutbox(initialWorkspaceId).length);
  const [syncing, setSyncing] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const importRef = useRef<HTMLInputElement | null>(null);

  function popToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1200);
  }

  function enqueue(op: any) {
    pushOutbox(op, workspaceId);
    const items = compactOutbox(loadOutbox(workspaceId));
    saveOutbox(items, workspaceId);
    setOutboxCount(items.length);
  }

  const setActiveWorkspace = useCallback((next: string | null) => {
    if (hasExternalWorkspaceState && externalWorkspaceChange) {
      externalWorkspaceChange(next);
      return;
    }
    setWorkspaceId(next);
    saveStoredWorkspaceId(next);
  }, [hasExternalWorkspaceState, externalWorkspaceChange]);

  function normalizeAssignmentsState(inputSparks: Spark[], inputAssignments: Assignment[]) {
    const assignmentById = new Map<string, Assignment>();
    const updatedAssignments: Assignment[] = [];
    for (const assignment of inputAssignments) {
      const normalizedId = normalizeProjectId(assignment.id);
      const createdAt = assignment.createdAt ?? now();
      const normalized: Assignment = {
        ...assignment,
        id: normalizedId,
        name: assignment.name?.trim() || "Imported Project",
        createdAt,
        updatedAt: assignment.updatedAt ?? createdAt,
      };
      const existing = assignmentById.get(normalized.id);
      if (!existing) {
        assignmentById.set(normalized.id, normalized);
        if (
          normalized.id !== assignment.id
          || normalized.name !== assignment.name
          || normalized.createdAt !== assignment.createdAt
          || normalized.updatedAt !== assignment.updatedAt
        ) {
          updatedAssignments.push(normalized);
        }
        continue;
      }
      const existingUpdatedAt = existing.updatedAt ?? existing.createdAt ?? 0;
      const nextUpdatedAt = normalized.updatedAt ?? normalized.createdAt ?? 0;
      if (nextUpdatedAt >= existingUpdatedAt) {
        assignmentById.set(normalized.id, normalized);
      }
      if (
        normalized.id !== assignment.id
        || normalized.name !== assignment.name
        || normalized.createdAt !== assignment.createdAt
        || normalized.updatedAt !== assignment.updatedAt
      ) {
        updatedAssignments.push(normalized);
      }
    }

    const updatedSparkById = new Map<string, Spark>();

    const legacyKey = "session" + "Id";

    const nextSparks = inputSparks.map((s) => {
      const legacyId = (s as any)[legacyKey] as string | undefined;
      const rawAssignmentId = s.assignmentId ?? legacyId;
      const assignmentId = typeof rawAssignmentId === "string" && rawAssignmentId.trim()
        ? normalizeProjectId(rawAssignmentId)
        : null;

      if (assignmentId && !assignmentById.has(assignmentId)) {
        const createdAt = s.createdAt ?? now();
        const title = s.title?.trim() || buildAssignmentNameFromSpark(s.body, createdAt) || "Imported Project";
        const assignment = makeAssignment(title, {
          id: assignmentId,
          createdAt,
          updatedAt: s.updatedAt ?? createdAt,
        });
        assignmentById.set(assignmentId, assignment);
        updatedAssignments.push(assignment);
      }

      if (s.assignmentId !== assignmentId || legacyId) {
        const next = { ...s, assignmentId };
        updatedSparkById.set(next.id, next);
        return next;
      }
      return s;
    });

    const dedupedAssignments = [...assignmentById.values()];
    const updatedSparks = [...updatedSparkById.values()];
    const changed = updatedAssignments.length > 0
      || updatedSparks.length > 0
      || dedupedAssignments.length !== inputAssignments.length;

    return {
      changed,
      sparks: nextSparks,
      assignments: dedupedAssignments,
      updatedSparks,
      updatedAssignments,
    };
  }

  useEffect(() => {
    const res = normalizeAssignmentsState(sparks, assignments);
    if (!res.changed) return;

    setAssignments(res.assignments);
    setSparks(res.sparks);

    const ts = now();
    for (const a of res.updatedAssignments) {
      enqueue({ op: "upsert_assignment", at: ts, assignment: a });
    }
    for (const s of res.updatedSparks) {
      enqueue({ op: "upsert_spark", at: ts, spark: s });
    }
  }, []);

  const onSyncNow = useCallback(async () => {
    if (!supabaseAvailable) return popToast("Cloud sync unavailable.");
    if (!session) return popToast("Sign in first.");
    if (!workspaceId) return popToast("Pick a workspace first.");

    const ops = peekOutbox(workspaceId);
    if (!ops.length) return popToast("Nothing to sync.");

    try {
      setSyncing(true);

      const res = await flushOutboxToTongs({
        workspaceId,
        userId: session.user.id,
        ops
      });

      if (res.errors.length) {
        console.error(res.errors);
        popToast(`Sync had issues: ${res.errors[0]}`);
        return;
      }

      drainOutbox(workspaceId);
      setOutboxCount(0);
      popToast(`Synced ${res.sent} item(s).`);
    } catch (e: any) {
      console.error(e);
      popToast(`Sync failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  }, [session, workspaceId, supabaseAvailable]);

  useEffect(() => {
    if (!supabaseAvailable) return;
    if (tongsStatus !== "online") return;
    if (outboxCount === 0) return;
    onSyncNow();
  }, [supabaseAvailable, tongsStatus, outboxCount, onSyncNow]);

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
    const nextSparks = loadSparks(workspaceId);
    const nextAssignments = loadAssignments(workspaceId);
    const nextOutbox = compactOutbox(loadOutbox(workspaceId));
    setSparks(nextSparks);
    setAssignments(nextAssignments);
    saveOutbox(nextOutbox, workspaceId);
    setOutboxCount(nextOutbox.length);
    setActiveAssignment("all");
  }, [workspaceId]);

  useEffect(() => {
    saveSparks(sparks, workspaceId);
  }, [sparks, workspaceId]);

  useEffect(() => {
    saveAssignments(assignments, workspaceId);
  }, [assignments, workspaceId]);

  useEffect(() => {
    if (!supabaseAvailable || !session || !workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const [remoteAssignments, remoteSparks] = await Promise.all([
          listWorkspaceProjects(workspaceId),
          listWorkspaceSparks(workspaceId),
        ]);
        if (cancelled) return;
        setAssignments(remoteAssignments);
        setSparks(remoteSparks);
      } catch (err) {
        if (!cancelled) {
          console.warn("[bar-stock] failed to hydrate workspace state", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, supabaseAvailable, workspaceId]);

  useEffect(() => {
    if (!supabaseAvailable || !session || !workspaceId) {
      setTongsStatus("offline");
      return;
    }

    let cancelled = false;

    (async () => {
      const online = await checkTongsOnline(workspaceId, { reason: "effect" });
      if (!cancelled) {
        setTongsStatus(online ? "online" : "offline");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabaseAvailable, session, workspaceId]);

  useEffect(() => {
    if (hasExternalWorkspaceState) return;
    if (!session) {
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
  }, [session, hasExternalWorkspaceState, setActiveWorkspace]);

  const sparkEpisodeIdsForGraduation = useMemo(() => {
    const ids = new Set<string>();
    for (const spark of sparks) {
      const normalized = normalizeWorkpieceId(spark.links?.hearthWorkpieceId);
      if (normalized) ids.add(normalized);
    }
    return [...ids];
  }, [sparks]);

  useEffect(() => {
    if (!supabaseAvailable || !session || !workspaceId) {
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
  }, [session, sparkEpisodeIdsForGraduation, supabaseAvailable, workspaceId]);

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

  useEffect(() => {
    if (!graduatedEpisodeIdSet.size) return;
    const promoted: Spark[] = [];
    const ts = now();
    const nextSparks = sparks.map((spark) => {
      if (spark.status === "graduated" || spark.status === "archived") return spark;
      const episodeId = normalizeWorkpieceId(spark.links?.hearthWorkpieceId);
      if (!episodeId || !graduatedEpisodeIdSet.has(episodeId)) return spark;
      const updated: Spark = { ...spark, status: "graduated", updatedAt: ts };
      promoted.push(updated);
      return updated;
    });
    if (promoted.length === 0) return;
    setSparks(nextSparks);
    for (const spark of promoted) {
      enqueue({ op: "upsert_spark", at: ts, spark });
    }
  }, [graduatedEpisodeIdSet, sparks]);

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
    if (!activeWorkspaceRole) return true;
    return activeWorkspaceRole === "owner" || activeWorkspaceRole === "admin" || activeWorkspaceRole === "editor";
  }, [activeWorkspaceRole]);
  const canAdd = useMemo(() => canWrite && body.trim().length > 0, [body, canWrite]);
  const mobileRoute = props.mobileRoute ?? null;
  const isMobileRoute = mobileRoute !== null;
  const mobileMode: MobileRouteMode = mobileRoute?.mode ?? "list";
  const syncLabel = !supabaseAvailable ? "LOCAL-ONLY" : tongsStatus.toUpperCase();
  const syncHint = !supabaseAvailable
    ? "Cloud sync unavailable."
    : (tongsStatus === "offline" ? "Offline / local-only." : "Online.");

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
    enqueue({ op: "upsert_spark", at: ts, spark: next });
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
    setSparks(prev => removeSpark(prev, id));
    enqueue({ op: "delete_spark", at: now(), sparkId: id });
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
    enqueue({ op: "upsert_assignment", at: now(), assignment: a });
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
    enqueue({ op: "upsert_spark", at: now(), spark: s });
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
    const text = await file.text();
    const parsed = parseImportJson(text);

    if (parsed.sparks.length === 0) {
      popToast("Import failed (no sparks found).");
      return;
    }

    const res = mergeSparks(sparks, parsed.sparks);
    setSparks(res.merged);

    const msgParts = [`Imported ${res.imported}`];
    if (res.skipped) msgParts.push(`skipped ${res.skipped}`);
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
                        deleteSpark(mobileDetailSpark.id);
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
              Status: <b>{syncLabel}</b> - Outbox: <b>{outboxCount}</b>
            </div>
            <div className="barstock-sidebar__sync-hint">
              {syncHint}
            </div>
            <div className="barstock-sidebar__sync-actions">
              <button
                onClick={onSyncNow}
                disabled={!supabaseAvailable || tongsStatus !== "online" || !session || !workspaceId || syncing || outboxCount === 0}
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
            rows={4}
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
                  <div className="barstock-spark-card__meta">
                    {new Date(s.createdAt).toLocaleString()}
                    {s.pinned ? " • pinned" : ""}
                    {" • "}
                    {s.assignmentId ? (assignmentNameById.get(s.assignmentId) ?? "Unknown project") : "No project"}
                    {isGraduated ? " • graduated" : ""}
                  </div>

                  <div className="barstock-spark-card__actions">
                    {isGraduated ? (
                      <span
                        className="barstock-spark-card__graduated-badge"
                        title="This spark has graduated to an approved/published script."
                      >
                        GRADUATED
                      </span>
                    ) : null}
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

                    <button onClick={() => togglePin(s)}>
                      {s.pinned ? "Unpin" : "Pin"}
                    </button>

                    <button
                      onClick={async () => {
                        const ok = await copyText(s.body);
                        popToast(ok ? "Copied." : "Copy failed.");
                      }}
                    >
                      Copy
                    </button>

                    {!isProjectView ? (
                      <button
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
                      <button
                        onClick={() => {
                          setEditingId(s.id);
                          setEditingBody(s.body);
                        }}
                      >
                        Edit
                      </button>
                    )}

                    <button onClick={() => deleteSpark(s.id)}>
                      Delete
                    </button>
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
