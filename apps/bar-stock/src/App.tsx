import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./index.css";

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
import { buildHearthPacket, packetToClipboardText } from "./lib/hearth-packet";
import { supabase, supabaseAvailable } from "./lib/supabase";
import { listGraduatedEpisodeIds, listMyWorkspaces, type Workspace } from "./lib/tongs-api";
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

type WorkspaceState = {
  workspaces: Workspace[];
  workspaceId: string | null;
  onWorkspaceChange: (id: string | null) => void;
};

type BarstockAppProps = {
  workspaceState?: WorkspaceState;
  showWorkspacePicker?: boolean;
};

export default function App(props: BarstockAppProps = {}) {
  const [body, setBody] = useState("");
  const [sparks, setSparks] = useState<Spark[]>(() => loadSparks());
  const [showGraduated, setShowGraduated] = useState<boolean>(() => readShowGraduatedPref(loadStoredWorkspaceId(), null));
  const [graduatedEpisodeIds, setGraduatedEpisodeIds] = useState<string[]>([]);

  const [assignments, setAssignments] = useState<Assignment[]>(() => loadAssignments());
  const [activeAssignment, setActiveAssignment] = useState<AssignmentFilter>("all");
  const [newAssignmentName, setNewAssignmentName] = useState("");
  const [showEmptyProjects, setShowEmptyProjects] = useState(false);
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [email, setEmail] = useState("");
  const hasExternalWorkspaceState = !!props.workspaceState;
  const externalWorkspaces = props.workspaceState?.workspaces;
  const externalWorkspaceId = props.workspaceState?.workspaceId;
  const externalWorkspaceChange = props.workspaceState?.onWorkspaceChange;
  const showWorkspacePicker = props.showWorkspacePicker ?? !hasExternalWorkspaceState;

  const [workspaces, setWorkspaces] = useState<Workspace[]>(
    () => externalWorkspaces ?? [],
  );
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    () => (hasExternalWorkspaceState ? (externalWorkspaceId ?? null) : loadStoredWorkspaceId()),
  );

  const [q, setQ] = useState<SparkQuery>({ status: "all", pinned: "all" });
  const [tongsStatus, setTongsStatus] = useState<"offline" | "online">("offline");
  const [outboxCount, setOutboxCount] = useState(() => loadOutbox().length);
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
    pushOutbox(op);
    const items = compactOutbox(loadOutbox());
    saveOutbox(items);
    setOutboxCount(items.length);
  }

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

    const ops = peekOutbox();
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

      drainOutbox();
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
    saveSparks(sparks);
  }, [sparks]);

  useEffect(() => {
    saveAssignments(assignments);
  }, [assignments]);

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
        const pick = (saved && ws.find(x => x.id === saved)) ? saved : (ws[0]?.id ?? null);
        setWorkspaceId(pick);
        if (pick) saveStoredWorkspaceId(pick);
      } catch (err) {
        console.error(err);
        popToast("Failed loading workspaces");
      }
    })();
  }, [session, hasExternalWorkspaceState]);

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
  const canAdd = useMemo(() => body.trim().length > 0, [body]);
  const syncLabel = !supabaseAvailable ? "LOCAL-ONLY" : tongsStatus.toUpperCase();
  const syncHint = !supabaseAvailable
    ? "Cloud sync unavailable."
    : (tongsStatus === "offline" ? "Offline / local-only." : "Online.");

  const setActiveWorkspace = useCallback((next: string | null) => {
    if (hasExternalWorkspaceState && externalWorkspaceChange) {
      externalWorkspaceChange(next);
      return;
    }
    setWorkspaceId(next);
    saveStoredWorkspaceId(next);
  }, [hasExternalWorkspaceState, externalWorkspaceChange]);

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
    setSparks(prev => removeSpark(prev, id));
    enqueue({ op: "delete_spark", at: now(), sparkId: id });
  }

  function onTagClick(tag: string) {
    setQ(prev => ({ ...prev, tag: normalizeTag(tag) }));
  }


  function addAssignment() {
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

  return (
    <div
      className="barstock-root"
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
        color: "var(--barstock-text)",
        background: "var(--barstock-bg)",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          borderRight: "1px solid var(--barstock-border)",
          padding: 14
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18 }}>Bar-Stock</div>
        <div style={{ opacity: 0.75, marginTop: 6, fontSize: 13 }}>
          {showGraduated
            ? `${activeSparkCount} active • ${graduatedSparkCount} graduated`
            : `${activeSparkCount} sparks • idea mine`}
        </div>
        {showWorkspacePicker ? (
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <strong>Bar-Stock</strong>
              {session ? (
                <span style={{ opacity: 0.7 }}>{session.user.email}</span>
              ) : null}
            </div>

            {!supabaseAvailable ? (
              <div style={{ fontSize: 12, opacity: 0.7 }}>Cloud sync unavailable.</div>
            ) : session ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={workspaceId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setActiveWorkspace(v);
                  }}
                  style={{ padding: "6px", fontSize: 12 }}
                >
                  {workspaces.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                {STANDALONE ? (
                  <button onClick={() => supabase?.auth.signOut()} style={{ cursor: "pointer" }}>
                    Sign out
                  </button>
                ) : null}
              </div>
            ) : STANDALONE ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email for magic link"
                  style={{ padding: "6px", fontSize: 12 }}
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
                  style={{ cursor: "pointer" }}
                >
                  Send link
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.7 }}>Signed in via The Forge.</div>
            )}
          </div>
        ) : null}

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
            Projects
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SidebarItem
              label="All sparks"
              active={activeAssignment === "all"}
              onClick={() => setActiveAssignment("all")}
            />

            <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
              —
            </div>

            <label style={{ marginTop: 6, fontSize: 12, opacity: 0.8, display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={showEmptyProjects}
                onChange={(e) => setShowEmptyProjects(e.target.checked)}
              />
              Show empty projects
            </label>

            {visibleAssignments.length === 0 ? (
              <div style={{ opacity: 0.7, fontSize: 13, marginTop: 6 }}>
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

          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <input
              value={newAssignmentName}
              onChange={(e) => setNewAssignmentName(e.target.value)}
              placeholder="New project..."
              style={{ flex: 1, padding: 8 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") addAssignment();
              }}
            />
            <button
              onClick={addAssignment}
              disabled={!newAssignmentName.trim()}
              style={{
                padding: "8px 10px",
                cursor: newAssignmentName.trim() ? "pointer" : "not-allowed"
              }}
            >
              Add
            </button>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.86, display: "grid", gap: 6 }}>
            {activeProject ? (
              <>
                <div>
                  Working on: <b>{activeProject.name}</b>
                </div>
                <div style={{ opacity: 0.8 }}>
                  {activeProjectCounts?.active ?? 0} sparks ready
                </div>
                <button
                  onClick={launchActiveProjectInHearth}
                  style={{
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                    padding: "8px 10px",
                  }}
                >
                  Launch Episode in Hearth
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setActiveAssignment("all")}
                    style={{ cursor: "pointer", fontSize: 12 }}
                  >
                    Stop
                  </button>
                </div>
              </>
            ) : (
              <div>Working on: none</div>
            )}
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
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
              style={{ cursor: "pointer" }}
            >
              Export
            </button>

            <button onClick={() => importRef.current?.click()} style={{ cursor: "pointer" }}>
              Import
            </button>

            <input
              ref={importRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onImportFile(f);
              }}
            />
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--barstock-border)" }}>
            <div style={{ fontWeight: 700, fontSize: 13, opacity: 0.85 }}>Forge Sync</div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
              Status: <b>{syncLabel}</b> - Outbox: <b>{outboxCount}</b>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              {syncHint}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button
                onClick={onSyncNow}
                disabled={!supabaseAvailable || tongsStatus !== "online" || !session || !workspaceId || syncing || outboxCount === 0}
                style={{
                  cursor: !supabaseAvailable || tongsStatus !== "online" || !session || !workspaceId || syncing || outboxCount === 0
                    ? "not-allowed"
                    : "pointer"
                }}
              >
                {syncing ? "Syncing..." : "Sync now"}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ padding: 20, maxWidth: 980 }}>
        <h1 style={{ margin: 0 }}>Sparks</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          Dump the spark. No polish. No pressure.
        </p>

        {activeProject ? (
          <section
            style={{
              marginTop: 12,
              padding: 12,
              border: "1px solid var(--barstock-border)",
              borderRadius: 10,
              background: "var(--barstock-surface)",
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 13, opacity: 0.84 }}>
              Working on: <b>{activeProject.name}</b>
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {activeProjectCounts?.active ?? 0} sparks ready
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={launchActiveProjectInHearth}
                style={{
                  cursor: "pointer",
                  padding: "10px 14px",
                  fontWeight: 700,
                }}
              >
                Launch Episode in Hearth
              </button>
              <button
                onClick={() => setActiveAssignment("all")}
                style={{ cursor: "pointer" }}
              >
                Stop
              </button>
            </div>
          </section>
        ) : null}

        {toast && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 10px",
              border: "1px solid var(--barstock-border)",
              borderRadius: 8,
              background: "var(--barstock-surface)",
            }}
          >
            {toast}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type here… try #tags if you want."
            rows={4}
            style={{ flex: 1, padding: 12, fontSize: 14 }}
          />
          <button
            onClick={addSpark}
            disabled={!canAdd}
            style={{
              padding: "10px 14px",
              fontWeight: 600,
              cursor: canAdd ? "pointer" : "not-allowed"
            }}
          >
            Add Spark
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
          <input
            value={q.text ?? ""}
            onChange={(e) => setQ(prev => ({ ...prev, text: e.target.value }))}
            placeholder="Search sparks…"
            style={{ flex: 1, padding: 10 }}
          />
          <select
            value={q.status ?? "all"}
            onChange={(e) => setQ(prev => ({ ...prev, status: e.target.value as any }))}
            style={{ padding: 10 }}
          >
            <option value="all">All</option>
            <option value="raw">Open (Raw)</option>
            <option value="warming">Open (Warming)</option>
            <option value="forged">Forged</option>
            <option value="graduated">Graduated</option>
            <option value="archived">Archived</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.85 }}>
            <input
              type="checkbox"
              checked={showGraduated}
              onChange={(e) => setShowGraduated(e.target.checked)}
            />
            Show graduated
          </label>
        </div>

        {q.tag && (
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
            Filtering by tag: <b>#{q.tag}</b>{" "}
            <button onClick={() => setQ(prev => ({ ...prev, tag: undefined }))} style={{ cursor: "pointer" }}>
              clear
            </button>
          </div>
        )}

        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.length === 0 ? (
            <div style={{ opacity: 0.75, marginTop: 8 }}>
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
                  style={{
                    border: "1px solid var(--barstock-border)",
                    borderRadius: 10,
                    padding: 12,
                    background: "var(--barstock-surface)",
                    opacity: showGraduated && isGraduated ? 0.82 : 1,
                  }}
                >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div style={{ opacity: 0.7, fontSize: 12 }}>
                    {new Date(s.createdAt).toLocaleString()}
                    {s.pinned ? " • pinned" : ""}
                    {" • "}
                    {s.assignmentId ? (assignmentNameById.get(s.assignmentId) ?? "Unknown project") : "No project"}
                    {isGraduated ? " • graduated" : ""}
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {isGraduated ? (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: 0.2,
                          border: "1px solid var(--barstock-border)",
                          borderRadius: 999,
                          padding: "2px 8px",
                          opacity: 0.9,
                        }}
                        title="This spark has graduated to an approved/published script."
                      >
                        GRADUATED
                      </span>
                    ) : null}
                    <select
                      value={s.status}
                      onChange={(e) => setStatus(s, e.target.value as SparkStatus)}
                      style={{ padding: "4px 6px" }}
                      title="Status"
                    >
                      <option value="raw">Open (Raw)</option>
                      <option value="warming">Open (Warming)</option>
                      <option value="forged">Forged</option>
                      <option value="graduated">Graduated</option>
                      <option value="archived">Archived</option>
                    </select>

                    <select
                      value={s.assignmentId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateSpark(s, { assignmentId: v || null });
                      }}
                      style={{ padding: "4px 6px" }}
                      title="Project"
                    >
                      <option value="">No project</option>
                      {sortedAssignments.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>

                    <button onClick={() => togglePin(s)} style={{ cursor: "pointer" }}>
                      {s.pinned ? "Unpin" : "Pin"}
                    </button>

                    <button
                      onClick={async () => {
                        const ok = await copyText(s.body);
                        popToast(ok ? "Copied." : "Copy failed.");
                      }}
                      style={{ cursor: "pointer" }}
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

                          const packet = buildHearthPacket(s, "Ungrouped spark");
                          const ok = await copyText(packetToClipboardText(packet));
                          popToast(ok ? "Hearth packet copied (fallback)." : "Copy failed.");
                        }}
                        style={{ cursor: "pointer" }}
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
                        style={{ cursor: "pointer" }}
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
                          style={{ cursor: "pointer" }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditingBody("");
                          }}
                          style={{ cursor: "pointer" }}
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
                        style={{ cursor: "pointer" }}
                      >
                        Edit
                      </button>
                    )}

                    <button onClick={() => deleteSpark(s.id)} style={{ cursor: "pointer" }}>
                      Delete
                    </button>
                  </div>
                </div>

                {editingId === s.id ? (
                  <textarea
                    value={editingBody}
                    onChange={(e) => setEditingBody(e.target.value)}
                    rows={4}
                    style={{ width: "100%", marginTop: 10, padding: 10, fontSize: 14 }}
                  />
                ) : (
                  <pre style={{ margin: "10px 0 0", whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                    {s.body}
                  </pre>
                )}

                {s.tags.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {s.tags.map((t) => (
                      <button
                        key={t}
                        onClick={() => onTagClick(t)}
                        style={{
                          cursor: "pointer",
                          border: "1px solid var(--barstock-border)",
                          borderRadius: 999,
                          padding: "4px 10px",
                          fontSize: 12,
                          opacity: 0.9,
                          background: "rgba(26, 38, 61, 0.65)",
                        }}
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
      style={{
        textAlign: "left",
        width: "100%",
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid var(--barstock-border)",
        cursor: "pointer",
        fontWeight: props.active ? 800 : 600,
        opacity: props.active ? 1 : 0.85,
        background: props.active ? "var(--barstock-surface-strong)" : "transparent"
      }}
    >
      {props.label}
    </button>
  );
}
