import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDraft, type Draft } from "../domain/draft";
import type { HearthPlanningSession, HearthSessionDecision, HearthSessionOrigin } from "../domain/hearth-session";
import { HEARTH_SESSION_SCHEMA } from "../domain/hearth-session";
import { createRevision, type Revision, type RevisionKind } from "../domain/revision";
import type { HearthSession } from "../domain/session";
import {
  type BarStockSpark,
  enqueueBarStockSpark,
  isBarStockKey,
  readBarStockSparks,
  upsertBarStockSpark,
  writeBarStockSparks,
} from "../lib/barstock-sparks";
import SourcesView from "../views/SourcesView";
import "./HearthShell.css";
import { createHearthWorkpiece } from "../lib/hearth-workpiece";
import {
  isHearthPlanningSessionKey,
  readHearthPlanningSessionCache,
  writeHearthPlanningSessionCache,
} from "../lib/hearth-session-registry";
import {
  fetchHearthAiStatus,
  requestHearthChatReply,
  refreshMyAiCredits,
  resolveAiLaneFromStorage,
  type HearthAiLane,
  type HearthChatMessage,
} from "../lib/hearth-chat-api";
import { writeHearthAiRuntimeStatus } from "../lib/ai-runtime-status";
import { commitHearthSession, readHearthSession } from "../lib/hearth-session-repo";
import { useSourcesState } from "../hooks/useSourcesState";
import { resolveWorkpieceId, resolveWorkspaceId } from "../lib/sources-repo";
import { createHearthStore } from "../storage/store-factory";
import type { HearthStoreKind } from "../storage/hearth-store";
import { LocalSessionStore } from "../storage/local-session-store";
import {
  applyHearthOps,
  buildEpisodeContext,
  describeHearthOp,
  type EpisodeContext,
  type HearthOp,
  type HearthOpsStore,
} from "../lib/hearth-ai-ops";
import {
  formatScriptToAnvilTagsNoAi,
  validateAnvilTagContract,
  type AnvilTagValidation,
} from "../lib/anvil-tag-contract";

const AUTOSAVE_DELAY_MS = 2200;
const AUTOSAVE_MIN_GAP_MS = 5000;
const AUTOSAVE_REVISION_GAP_MS = 5 * 60 * 1000;
const SESSION_SAVE_DELAY_MS = 500;
const STORE_KIND_KEY = "hearth_store_kind";
const DEV_MODE_KEY = "tp_dev_mode";
const MODE_STORAGE_PREFIX = "hearth:ui:mode:v1:";

type HearthMode = "home" | "draft" | "planning" | "sources" | "revisions";

function resolveStoreKind(): HearthStoreKind {
  if (typeof window === "undefined") return "tongs";
  if (!isDevMode()) return "tongs";

  try {
    const params = new URLSearchParams(window.location.search);
    const requested = (params.get("store") ?? params.get("hearthStore") ?? "")
      .trim()
      .toLowerCase();

    if (requested === "tongs" || requested === "local") {
      try {
        window.localStorage.setItem(STORE_KIND_KEY, requested);
      } catch {
        // Ignore storage failures (private mode, access blocked, etc.).
      }
      return requested as HearthStoreKind;
    }
  } catch {
    // Ignore URL parsing failures and fall back to localStorage.
  }

  try {
    const saved = window.localStorage.getItem(STORE_KIND_KEY)?.trim().toLowerCase();
    if (saved === "tongs" || saved === "local") {
      return saved as HearthStoreKind;
    }
  } catch {
    // Ignore storage failures and fall back to tongs.
  }

  return "tongs";
}

function isDevMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("dev") || params.get("dev") === "1") return true;
  } catch {
    // Ignore query parsing failures.
  }
  try {
    if (window.localStorage.getItem(DEV_MODE_KEY) === "1") return true;
  } catch {
    // Ignore storage failures.
  }
  try {
    const w = window as typeof window & {
      __TP_DEV?: unknown;
      __TP_DEV1?: unknown;
      __tpDevMode?: unknown;
    };
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
  } catch {
    // Ignore global inspection failures.
  }
  return false;
}

function readMode(workpieceId: string | null): HearthMode | null {
  if (!workpieceId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${MODE_STORAGE_PREFIX}${workpieceId}`);
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed === "draft" || trimmed === "planning" || trimmed === "sources" || trimmed === "revisions") {
      return trimmed;
    }
  } catch {
    // ignore storage failures
  }
  return null;
}

function writeMode(workpieceId: string | null, mode: HearthMode): void {
  if (!workpieceId || typeof window === "undefined") return;
  if (mode === "home") return;
  try {
    window.localStorage.setItem(`${MODE_STORAGE_PREFIX}${workpieceId}`, mode);
  } catch {
    // ignore storage failures
  }
}

function formatUpdatedAt(value: number | undefined): string {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed || "Untitled Draft";
}

function countWords(text: string): number {
  const matches = text.trim().match(/\b\w+\b/g);
  return matches ? matches.length : 0;
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

type SortKey = "updated" | "title";

type DraftSnapshot = {
  title: string;
  body: string;
  updatedAt: number;
};

type DiffLine = {
  left: string;
  right: string;
  status: "same" | "changed" | "added" | "removed" | "separator";
};

type PendingAiProposal = {
  assistantText: string;
  ops: HearthOp[];
  selected: boolean[];
  context: EpisodeContext;
};

type ScriptValidationState = {
  source: "save_gate" | "ai_apply" | "ai_repair";
  result: AnvilTagValidation;
};

function buildDiffLines(current: string, revision: string): DiffLine[] {
  const leftLines = splitLines(current);
  const rightLines = splitLines(revision);
  const maxLen = Math.max(leftLines.length, rightLines.length);
  const out: DiffLine[] = [];

  for (let i = 0; i < maxLen; i += 1) {
    const left = leftLines[i] ?? "";
    const right = rightLines[i] ?? "";
    const leftTrim = left.trim();
    const rightTrim = right.trim();
    if (leftTrim === "---" || rightTrim === "---") {
      out.push({ left, right, status: "separator" });
      continue;
    }
    if (!left && right) {
      out.push({ left, right, status: "added" });
      continue;
    }
    if (left && !right) {
      out.push({ left, right, status: "removed" });
      continue;
    }
    out.push({ left, right, status: left === right ? "same" : "changed" });
  }
  return out;
}

function diffCellClass(side: "left" | "right", status: DiffLine["status"]): string {
  const classes = ["hs-diff-cell"];
  if (status === "removed" && side === "left") classes.push("is-removed");
  if (status === "added" && side === "right") classes.push("is-added");
  if (status === "changed") {
    classes.push(side === "left" ? "is-changed-left" : "is-changed-right");
  }
  return classes.join(" ");
}

function formatSparkDate(value: number | undefined): string {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return String(value);
  }
}

function deriveSparkTitle(spark: BarStockSpark): string {
  const title = spark.title?.trim();
  if (title) return title;
  const line = spark.body.split(/\r?\n/).find((chunk) => chunk.trim());
  if (line) return line.trim().slice(0, 60);
  return "Untitled Spark";
}

function buildSparkPreview(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const preview = lines.slice(0, 2).join(" ");
  return preview.length > 180 ? `${preview.slice(0, 177)}...` : preview;
}

function formatSparkStatus(spark: BarStockSpark): { label: string; detail?: string } {
  const workpieceId = spark.links?.hearthWorkpieceId ?? spark.links?.hearthDraftId ?? null;
  if (workpieceId) {
    const shortId = workpieceId.length > 8 ? workpieceId.slice(0, 8) : workpieceId;
    return { label: "Used", detail: shortId };
  }
  if (spark.status === "forged") {
    return { label: "Used" };
  }
  return { label: "Unused" };
}

function parsePlanningLines(text: string): string[] {
  return splitLines(text)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatDecisionAt(value: string | undefined): string {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function deriveIntentFromOrigin(origin: HearthSessionOrigin | null | undefined): HearthPlanningSession["intent"] {
  if (!origin?.created_from) return undefined;
  return origin.created_from === "bar-stock" ? "from_spark" : "new_idea";
}

function buildOpenInAnvilHref(workspaceId: string | null, workpieceId: string | null): string | null {
  const workspace = workspaceId?.trim();
  const workpiece = workpieceId?.trim();
  if (!workspace || !workpiece) return null;

  const params = new URLSearchParams();
  params.set("workspace_id", workspace);
  params.set("workpiece_id", workpiece);
  return `/app/anvil?${params.toString()}`;
}

function isPlanningSessionEmpty(session: HearthPlanningSession | null): boolean {
  if (!session) return true;
  const hasTitle = Boolean(session.title && session.title.trim());
  const hasTitleVariants = Boolean(
    session.title_variants?.A?.trim()
    || session.title_variants?.B?.trim()
    || session.title_variants?.C?.trim(),
  );
  const hasGoals = (session.goals ?? []).length > 0;
  const hasOutline = (session.outline ?? []).length > 0;
  const hasDecisions = (session.decisions ?? []).length > 0;
  const hasAudience = Boolean(session.audience && session.audience.trim());
  const hasTone = Boolean(session.tone_preset && session.tone_preset.trim());
  return !(hasTitle || hasTitleVariants || hasGoals || hasOutline || hasDecisions || hasAudience || hasTone);
}

function buildSessionFingerprint(session: HearthPlanningSession): string {
  return JSON.stringify({
    workpiece_id: session.workpiece_id ?? null,
    workspace_id: session.workspace_id ?? null,
    origin: session.origin ?? null,
    intent: session.intent ?? null,
    title: session.title ?? "",
    title_variants: session.title_variants ?? null,
    goals: session.goals ?? [],
    outline: session.outline ?? [],
    audience: session.audience ?? "",
    tone_preset: session.tone_preset ?? "",
    links: session.links ?? null,
    decisions: session.decisions ?? [],
  });
}

function createPlanningSessionForEpisode(workpieceId: string, workspaceId: string | null): HearthPlanningSession {
  const nowIso = new Date().toISOString();
  return {
    schema: HEARTH_SESSION_SCHEMA,
    workpiece_id: workpieceId,
    workspace_id: workspaceId,
    created_at: nowIso,
    updated_at: nowIso,
    origin: null,
    intent: null,
    title: null,
    title_variants: null,
    goals: [],
    outline: [],
    audience: null,
    tone_preset: null,
    links: null,
    decisions: [],
  };
}

export default function HearthShell() {
  const storeKind = resolveStoreKind();
  const devMode = isDevMode();
  const store = useMemo(() => createHearthStore(storeKind), [storeKind]);
  const sessionStore = useMemo(() => new LocalSessionStore(), []);

  const [selectedMode, setSelectedMode] = useState<HearthMode>("home");
  const modeTouchedRef = useRef(false);
  const [sparks, setSparks] = useState<BarStockSpark[]>(() => readBarStockSparks());
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [isForging, setIsForging] = useState(false);

  const [workspaceId, setWorkspaceId] = useState<string | null>(() => resolveWorkspaceId());
  const [workpieceId, setWorkpieceId] = useState<string | null>(() => resolveWorkpieceId());

  const [planningSession, setPlanningSession] = useState<HearthPlanningSession | null>(() =>
    readHearthPlanningSessionCache(resolveWorkpieceId()),
  );
  const [sessionTouched, setSessionTouched] = useState(false);
  const [decisionDraft, setDecisionDraft] = useState("");

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const [draftSnapshot, setDraftSnapshot] = useState<DraftSnapshot | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isSavingRevision, setIsSavingRevision] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scriptValidation, setScriptValidation] = useState<ScriptValidationState | null>(null);
  const [isRepairingScript, setIsRepairingScript] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [showArchived, setShowArchived] = useState(false);
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionKind, setRevisionKind] = useState<RevisionKind>("manual");
  const [revisionView, setRevisionView] = useState<"list" | "preview" | "compare">("list");
  const [session, setSession] = useState<HearthSession | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState<number | null>(null);
  const [isBodyComposing, setIsBodyComposing] = useState(false);
  const [chatMessages, setChatMessages] = useState<HearthChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [showManualDraft, setShowManualDraft] = useState(false);
  const [showScriptPanel, setShowScriptPanel] = useState(false);
  const [pendingAiProposal, setPendingAiProposal] = useState<PendingAiProposal | null>(null);
  const [isApplyingAiOps, setIsApplyingAiOps] = useState(false);
  const [aiRuntimeWarning, setAiRuntimeWarning] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiTokenBalance, setAiTokenBalance] = useState<number | null>(null);
  const [aiBillingMode, setAiBillingMode] = useState<HearthAiLane>(() => resolveAiLaneFromStorage());

  const setMode = useCallback((mode: HearthMode) => {
    modeTouchedRef.current = true;
    setSelectedMode(mode);
  }, []);

  const autosaveTimer = useRef<number | null>(null);
  const autosaveInFlightRef = useRef(false);
  const autosaveQueuedRef = useRef(false);
  const lastAutosaveCommitAtRef = useRef(0);
  const draftEditVersionRef = useRef(0);
  const activeDraftRef = useRef<Draft | null>(null);
  const draftSnapshotRef = useRef<DraftSnapshot | null>(null);
  const sessionSaveTimer = useRef<number | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const sessionCommitRef = useRef<string | null>(null);
  const sessionCommitInFlight = useRef(false);
  const sessionCommitQueued = useRef(false);
  const restoredCursorDraftIdRef = useRef<string | null>(null);
  const aiRequestControllerRef = useRef<AbortController | null>(null);

  const lastAutosaveRevisionAt = useMemo(() => {
    const match = revisions.find((rev) => rev.kind === "autosave");
    return match?.createdAt ?? null;
  }, [revisions]);

  const isDirty = useMemo(() => {
    if (!activeDraft || !draftSnapshot) return false;
    return activeDraft.title !== draftSnapshot.title || activeDraft.body !== draftSnapshot.body;
  }, [activeDraft, draftSnapshot]);

  const wordCount = useMemo(() => countWords(activeDraft?.body ?? ""), [activeDraft?.body]);
  const charCount = useMemo(() => activeDraft?.body?.length ?? 0, [activeDraft?.body]);
  const statusText = isSaving ? "Saving..." : isDirty ? "Unsaved changes" : "Saved";
  const sessionTitle = planningSession?.title ?? "";
  const sessionGoalsText = useMemo(
    () => (planningSession?.goals ?? []).join("\n"),
    [planningSession?.goals],
  );
  const sessionOutlineText = useMemo(
    () => (planningSession?.outline ?? []).join("\n"),
    [planningSession?.outline],
  );
  const sessionDecisions = planningSession?.decisions ?? [];
  const sessionIntent = planningSession?.intent ?? deriveIntentFromOrigin(planningSession?.origin);
  const sessionSparkId = planningSession?.origin?.spark_id ?? planningSession?.links?.spark_id ?? null;
  const sourcesState = useSourcesState(workspaceId, workpieceId, activeDraft?.body ?? "", {
    mode: selectedMode === "sources" ? "full" : "summary",
  });
  const workpieceSources = sourcesState.workpieceSources;
  const sourceIndexById = sourcesState.sourceIndexById;
  const missingSourcesCount = sourcesState.missingCitedCount;
  const unusedSourcesCount = sourcesState.unusedRefsCount;
  const showHome = selectedMode === "home" || !workpieceId;
  const openInAnvilHref = useMemo(
    () => buildOpenInAnvilHref(workspaceId, workpieceId),
    [workspaceId, workpieceId],
  );
  const aiCreditsDepleted = aiBillingMode === "forge" && aiTokenBalance != null && aiTokenBalance <= 0;
  const aiEpisodeReady = Boolean(workpieceId?.trim());
  const activeEpisodeSparks = useMemo(
    () => sparks.filter((spark) => (
      (workpieceId && spark.links?.hearthWorkpieceId === workpieceId)
      || (activeDraft?.id && spark.links?.hearthDraftId === activeDraft.id)
    )),
    [activeDraft?.id, sparks, workpieceId],
  );

  const filteredDrafts = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const filtered = drafts
      .filter((draft) => (showArchived ? true : !draft.archived))
      .filter((draft) => {
        if (!query) return true;
        const title = draft.title.toLowerCase();
        const body = draft.body.toLowerCase();
        return title.includes(query) || body.includes(query);
      });

    const pinned = filtered.filter((draft) => draft.pinned);
    const unpinned = filtered.filter((draft) => !draft.pinned);

    const sortFn = sortKey === "title"
      ? (a: Draft, b: Draft) => a.title.localeCompare(b.title)
      : (a: Draft, b: Draft) => b.updatedAt - a.updatedAt;

    return [...pinned.sort(sortFn), ...unpinned.sort(sortFn)];
  }, [drafts, searchText, sortKey, showArchived]);

  const diffLines = useMemo(() => {
    if (!selectedRevision || !activeDraft) return [];
    return buildDiffLines(activeDraft.body, selectedRevision.bodySnapshot);
  }, [activeDraft, selectedRevision]);

  useEffect(() => {
    activeDraftRef.current = activeDraft;
  }, [activeDraft]);

  useEffect(() => {
    draftSnapshotRef.current = draftSnapshot;
  }, [draftSnapshot]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const syncAiRuntime = async () => {
      const lane = resolveAiLaneFromStorage();
      if (!cancelled) {
        setAiBillingMode(lane);
        if (lane === "byo") {
          setAiTokenBalance(null);
        }
      }

      const status = await fetchHearthAiStatus();
      if (cancelled) return;
      if (!status.runtime) return;
      if (lane === "byo") {
        setAiTokenBalance(null);
      } else {
        setAiTokenBalance(status.runtime.tokenBalance);
      }
    };

    void syncAiRuntime();

    const onAiSettingsChange = () => {
      void syncAiRuntime();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== "forge:hearth:aiSettings:v1") return;
      void syncAiRuntime();
    };

    window.addEventListener("forge:ai:settings", onAiSettingsChange as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("forge:ai:settings", onAiSettingsChange as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    writeHearthAiRuntimeStatus({
      isAiProcessing,
      tokenBalance: aiTokenBalance,
      billingMode: aiBillingMode,
    });
  }, [aiBillingMode, aiTokenBalance, isAiProcessing]);

  useEffect(() => {
    return () => {
      aiRequestControllerRef.current?.abort();
      writeHearthAiRuntimeStatus({ isAiProcessing: false });
    };
  }, []);

  useEffect(() => {
    if (!aiRuntimeWarning) return;
    const timer = window.setTimeout(() => setAiRuntimeWarning(null), 4000);
    return () => window.clearTimeout(timer);
  }, [aiRuntimeWarning]);

  const refreshDrafts = useCallback(async () => {
    const list = await store.listDrafts();
    setDrafts(list);
  }, [store]);

  const refreshRevisions = useCallback(async (draftId: string) => {
    const list = await store.listRevisions(draftId);
    setRevisions(list);
  }, [store]);

  const persistSession = useCallback(async (draftId: string | null, uiSelectedTab?: string) => {
    const now = Date.now();
    const base: HearthSession = session ?? {
      id: "default",
      createdAt: now,
      updatedAt: now,
    };
    const next: HearthSession = {
      ...base,
      activeDraftId: draftId ?? undefined,
      lastOpenedAt: now,
      updatedAt: now,
      uiState: {
        splitPane: selectedMode === "revisions",
        selectedTab: uiSelectedTab ?? base.uiState?.selectedTab,
        cursorPosition: cursorPosition ?? base.uiState?.cursorPosition,
        scrollTop: scrollTop ?? base.uiState?.scrollTop,
      },
    };
    setSession(next);
    await sessionStore.saveSession(next);
  }, [cursorPosition, scrollTop, selectedMode, session, sessionStore]);

  const selectDraft = useCallback(async (draft: Draft | null) => {
    if (!draft) {
      restoredCursorDraftIdRef.current = null;
      setActiveDraft(null);
      setDraftSnapshot(null);
      setRevisions([]);
      setSelectedRevision(null);
      return;
    }
    restoredCursorDraftIdRef.current = null;
    setActiveDraft(draft);
    setDraftSnapshot({ title: draft.title, body: draft.body, updatedAt: draft.updatedAt });
    await refreshRevisions(draft.id);
    await persistSession(draft.id, "draft");
  }, [persistSession, refreshRevisions]);

  const updatePlanningSession = useCallback((
    updater: (prev: HearthPlanningSession) => HearthPlanningSession,
    options?: { touched?: boolean },
  ) => {
    setPlanningSession((prev) => {
      const nowIso = new Date().toISOString();
      const base: HearthPlanningSession = prev ?? {
        schema: HEARTH_SESSION_SCHEMA,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const normalizedBase: HearthPlanningSession = {
        ...base,
        schema: HEARTH_SESSION_SCHEMA,
        intent: base.intent ?? deriveIntentFromOrigin(base.origin),
      };

      const next = updater(normalizedBase);
      const updated: HearthPlanningSession = {
        ...next,
        schema: HEARTH_SESSION_SCHEMA,
        workpiece_id: workpieceId ?? next.workpiece_id ?? null,
        workspace_id: workspaceId ?? next.workspace_id ?? null,
        created_at: next.created_at || normalizedBase.created_at || nowIso,
        updated_at: nowIso,
        intent: next.intent ?? deriveIntentFromOrigin(next.origin),
      };

      writeHearthPlanningSessionCache(updated, workpieceId ?? updated.workpiece_id ?? null);
      return updated;
    });

    if (options?.touched !== false) {
      setSessionTouched(true);
    }
  }, [workpieceId, workspaceId]);

  const syncSessionToTongs = useCallback(async (overrideSession?: HearthPlanningSession | null) => {
    const baseSession = overrideSession ?? planningSession;
    if (!baseSession || !workpieceId) return;
    if (sessionCommitInFlight.current) {
      sessionCommitQueued.current = true;
      return;
    }

    sessionCommitInFlight.current = true;
    try {
      do {
        sessionCommitQueued.current = false;

        const sourceIds = Array.from(
          new Set(workpieceSources.map((ref) => ref.source_id).filter(Boolean)),
        ).sort();
        const sparkId = baseSession.origin?.spark_id ?? baseSession.links?.spark_id ?? null;
        const links = sparkId || sourceIds.length ? {
          spark_id: sparkId ?? null,
          source_ids: sourceIds.length ? sourceIds : undefined,
        } : null;

        const sessionForCommit: HearthPlanningSession = {
          ...baseSession,
          schema: HEARTH_SESSION_SCHEMA,
          workpiece_id: workpieceId,
          workspace_id: workspaceId ?? baseSession.workspace_id ?? null,
          intent: baseSession.intent ?? deriveIntentFromOrigin(baseSession.origin),
          links,
        };

        const fingerprint = buildSessionFingerprint(sessionForCommit);

        const allowEmpty = overrideSession ? true : sessionTouched;
        if (!allowEmpty && isPlanningSessionEmpty(sessionForCommit)) {
          continue;
        }

        if (!sessionForCommit.workspace_id) {
          continue;
        }

        if (fingerprint === sessionCommitRef.current) {
          continue;
        }

        const result = await commitHearthSession(workpieceId, sessionForCommit, { allowEmpty });
        if (result.ok && !result.skipped) {
          sessionCommitRef.current = fingerprint;
          setSessionTouched(false);
          setPlanningSession((prev) => {
            if (!prev && !overrideSession) return prev;
            const next = { ...sessionForCommit, updated_at: new Date().toISOString() };
            writeHearthPlanningSessionCache(next, workpieceId);
            return next;
          });
        }
      } while (sessionCommitQueued.current);
    } finally {
      sessionCommitInFlight.current = false;
    }
  }, [
    planningSession,
    sessionTouched,
    workpieceId,
    workpieceSources,
    workspaceId,
  ]);

  const onSaveDraft = useCallback(async () => {
    if (!activeDraft) return;
    const now = Date.now();
    await persistDraft({ draft: activeDraft, updatedAt: now, createRevision: null });
  }, [activeDraft]);

  const applySessionOrigin = useCallback((origin: HearthSessionOrigin) => {
    updatePlanningSession((prev) => ({
      ...prev,
      origin,
      intent: prev.intent ?? deriveIntentFromOrigin(origin),
      links: {
        ...prev.links,
        spark_id: origin.spark_id ?? null,
      },
    }), { touched: false });
  }, [updatePlanningSession]);

  const createDraftAndOpen = useCallback(async (
    seed?: { title?: string; body?: string },
    mode: HearthMode = "draft",
  ) => {
    const next = createDraft(seed);
    await store.saveDraft(next);
    await refreshDrafts();
    await selectDraft(next);
    setMode(mode);
    return next;
  }, [refreshDrafts, selectDraft, setMode, store]);

  const startFromScratch = useCallback(async () => {
    if (isForging) return;
    setForgeError(null);
    setIsForging(true);
    try {
      const created = await createHearthWorkpiece({ created_from: "scratch" });
      if (!created.ok) {
        setForgeError("Workpiece creation failed; draft created locally.");
        if (created.workpieceId) {
          setWorkpieceId(created.workpieceId);
        }
      } else {
        setWorkpieceId(created.workpieceId);
      }
      setWorkspaceId(resolveWorkspaceId());
      applySessionOrigin({ created_from: "scratch" });
      await createDraftAndOpen(undefined, "draft");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start workpiece.";
      setForgeError(message);
    } finally {
      setIsForging(false);
    }
  }, [applySessionOrigin, createDraftAndOpen, isForging]);

  const forgeSpark = useCallback(async (spark: BarStockSpark) => {
    if (isForging) return;
    setForgeError(null);
    setIsForging(true);
    let workpieceId: string | undefined;
    try {
      const created = await createHearthWorkpiece({
        created_from: "bar-stock",
        spark_id: spark.id,
      });
      if (!created.ok) {
        workpieceId = created.workpieceId;
        setForgeError("Workpiece creation failed; draft created locally.");
      } else {
        workpieceId = created.workpieceId;
      }
      if (workpieceId) {
        setWorkpieceId(workpieceId);
      }
      setWorkspaceId(resolveWorkspaceId());
      applySessionOrigin({ created_from: "bar-stock", spark_id: spark.id });

      const draft = await createDraftAndOpen({
        title: spark.title,
        body: spark.body,
      }, "draft");

      const now = Date.now();
      const updatedSpark: BarStockSpark = {
        ...spark,
        status: "forged",
        updatedAt: now,
        links: {
          ...spark.links,
          hearthDraftId: draft.id,
          hearthWorkpieceId: workpieceId,
        },
      };
      const nextSparks = upsertBarStockSpark(sparks, updatedSpark);
      setSparks(nextSparks);
      writeBarStockSparks(nextSparks);
      enqueueBarStockSpark(updatedSpark);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Forge failed.";
      setForgeError(message);
    } finally {
      setIsForging(false);
    }
  }, [applySessionOrigin, createDraftAndOpen, isForging, sparks]);

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [storedSession, list] = await Promise.all([
        sessionStore.getSession(),
        store.listDrafts(),
      ]);

      setSession(storedSession);
      setDrafts(list);

      const tab = storedSession?.uiState?.selectedTab;
      if (tab === "preview" || tab === "compare" || tab === "list") {
        setRevisionView(tab);
      }

      const preferredId = storedSession?.activeDraftId;
      const first = preferredId ? list.find((draft) => draft.id === preferredId) : list[0];
      if (first) {
        restoredCursorDraftIdRef.current = null;
        setActiveDraft(first);
        setDraftSnapshot({ title: first.title, body: first.body, updatedAt: first.updatedAt });
        await refreshRevisions(first.id);
      } else {
        restoredCursorDraftIdRef.current = null;
        setActiveDraft(null);
        setDraftSnapshot(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load drafts.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [store, refreshRevisions, sessionStore]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setSparks(readBarStockSparks());
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (!isBarStockKey(event.key)) return;
      refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refreshSession = () => {
      const cached = readHearthPlanningSessionCache(workpieceId);
      if (cached) {
        setPlanningSession(cached);
        if (!workpieceId && cached.workpiece_id) {
          setWorkpieceId(cached.workpiece_id);
        }
        if (!workspaceId && cached.workspace_id) {
          setWorkspaceId(cached.workspace_id);
        }
      }
    };
    refreshSession();
    const onStorage = (event: StorageEvent) => {
      if (!isHearthPlanningSessionKey(event.key)) return;
      refreshSession();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [workpieceId, workspaceId]);

  useEffect(() => {
    if (!workpieceId) return;
    let cancelled = false;
    readHearthSession(workpieceId)
      .then((session) => {
        if (cancelled || !session) return;
        setPlanningSession(session);
        setSessionTouched(false);
        sessionCommitRef.current = buildSessionFingerprint(session);
        writeHearthPlanningSessionCache(session, workpieceId);
        if (!workspaceId && session.workspace_id) {
          setWorkspaceId(session.workspace_id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workpieceId, workspaceId]);

  useEffect(() => {
    if (!planningSession) return;
    const needsWorkspace = workspaceId && planningSession.workspace_id !== workspaceId;
    const needsWorkpiece = workpieceId && planningSession.workpiece_id !== workpieceId;
    if (!needsWorkspace && !needsWorkpiece) return;
    updatePlanningSession((prev) => ({
      ...prev,
      workspace_id: workspaceId ?? prev.workspace_id ?? null,
      workpiece_id: workpieceId ?? prev.workpiece_id ?? null,
    }), { touched: false });
  }, [planningSession, updatePlanningSession, workspaceId, workpieceId]);

  useEffect(() => {
    modeTouchedRef.current = false;
  }, [workpieceId]);

  useEffect(() => {
    if (!workpieceId) {
      setSelectedMode("home");
      return;
    }

    const saved = readMode(workpieceId);
    if (saved) {
      setSelectedMode(saved);
      return;
    }

    if (modeTouchedRef.current) return;
    const defaultMode = "draft";
    setSelectedMode(defaultMode);
  }, [workpieceId]);

  useEffect(() => {
    setShowManualDraft(false);
    setShowScriptPanel(false);
  }, [activeDraft?.id]);

  useEffect(() => {
    if ((activeDraft?.body ?? "").trim()) return;
    setShowScriptPanel(false);
  }, [activeDraft?.body]);

  useEffect(() => {
    if (!workpieceId) return;
    if (selectedMode === "home") return;
    writeMode(workpieceId, selectedMode);
  }, [selectedMode, workpieceId]);

  useEffect(() => {
    if (!activeDraft) return;
    void refreshRevisions(activeDraft.id);
  }, [activeDraft?.id, refreshRevisions]);

  useEffect(() => {
    if (!activeDraft) return;
    if (!isDirty) return;
    if (isBodyComposing) return;

    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
    }

    const now = Date.now();
    const remainingGap = Math.max(0, AUTOSAVE_MIN_GAP_MS - (now - lastAutosaveCommitAtRef.current));
    const delay = Math.max(AUTOSAVE_DELAY_MS, remainingGap);
    autosaveTimer.current = window.setTimeout(() => {
      void handleAutosave();
    }, delay);

    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [activeDraft?.title, activeDraft?.body, activeDraft?.id, isBodyComposing, isDirty]);

  useEffect(() => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [activeDraft?.body]);

  useEffect(() => {
    const activeDraftId = activeDraft?.id ?? null;
    const textarea = bodyRef.current;
    if (!textarea || !session?.uiState || !activeDraftId || activeDraftId !== session.activeDraftId) return;
    if (restoredCursorDraftIdRef.current === activeDraftId) return;

    restoredCursorDraftIdRef.current = activeDraftId;
    if (typeof session.uiState.cursorPosition === "number") {
      const pos = Math.min(session.uiState.cursorPosition, textarea.value.length);
      textarea.setSelectionRange(pos, pos);
      setCursorPosition(pos);
    }
    if (typeof session.uiState.scrollTop === "number") {
      textarea.scrollTop = session.uiState.scrollTop;
      setScrollTop(session.uiState.scrollTop);
    }
  }, [activeDraft?.id, session?.activeDraftId]);

  useEffect(() => {
    if (sessionSaveTimer.current) {
      window.clearTimeout(sessionSaveTimer.current);
    }
    sessionSaveTimer.current = window.setTimeout(() => {
      const tab = selectedMode === "revisions"
        ? revisionView
        : selectedMode === "home"
          ? "draft"
          : selectedMode;
      void persistSession(activeDraft?.id ?? null, tab);
    }, SESSION_SAVE_DELAY_MS);

    return () => {
      if (sessionSaveTimer.current) {
        window.clearTimeout(sessionSaveTimer.current);
        sessionSaveTimer.current = null;
      }
    };
  }, [activeDraft?.id, cursorPosition, persistSession, revisionView, scrollTop, selectedMode]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        if (event.shiftKey) {
          if (!revisionModalOpen && activeDraft) {
            setRevisionModalOpen(true);
          }
          return;
        }
        void onSaveDraft();
      }

      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeDraft, onSaveDraft, revisionModalOpen]);

  async function handleAutosave() {
    if (autosaveInFlightRef.current) {
      autosaveQueuedRef.current = true;
      return;
    }

    autosaveInFlightRef.current = true;
    try {
      do {
        autosaveQueuedRef.current = false;

        if (isBodyComposing) {
          continue;
        }

        const draft = activeDraftRef.current;
        const snapshot = draftSnapshotRef.current;
        if (!draft || !snapshot) {
          continue;
        }

        const draftIsDirty = draft.title !== snapshot.title || draft.body !== snapshot.body;
        if (!draftIsDirty) {
          continue;
        }

        const now = Date.now();
        const shouldAutoRevision = !lastAutosaveRevisionAt
          || now - lastAutosaveRevisionAt >= AUTOSAVE_REVISION_GAP_MS;

        const saved = await persistDraft({
          draft,
          updatedAt: now,
          createRevision: shouldAutoRevision ? {
            kind: "autosave",
            note: "Autosave",
          } : null,
          syncSources: false,
          syncSession: false,
          showSavingState: false,
        });

        if (saved) {
          lastAutosaveCommitAtRef.current = now;
        }
      } while (autosaveQueuedRef.current);
    } finally {
      autosaveInFlightRef.current = false;
    }
  }

  async function persistDraft(args: {
    draft: Draft;
    updatedAt: number;
    createRevision: { kind: RevisionKind; note?: string } | null;
    syncSources?: boolean;
    syncSession?: boolean;
    showSavingState?: boolean;
  }): Promise<boolean> {
    const showSavingState = args.showSavingState ?? true;
    if (showSavingState) {
      setIsSaving(true);
    }
    setError(null);
    const tagValidation = validateAnvilTagContract(args.draft.body);
    if (!tagValidation.ok) {
      setScriptValidation({
        source: "save_gate",
        result: tagValidation,
      });
      setError(`Script tag validation failed:\n${tagValidation.report}`);
      if (showSavingState) {
        setIsSaving(false);
      }
      return false;
    }
    setScriptValidation(null);
    const editVersionAtStart = draftEditVersionRef.current;
    try {
      let revisionCount = args.draft.revisionCount;
      let lastRevisionAt = args.draft.lastRevisionAt;
      let createdRevision: Revision | null = null;

      if (args.createRevision) {
        createdRevision = createRevision({
          draftId: args.draft.id,
          title: normalizeTitle(args.draft.title),
          body: args.draft.body,
          kind: args.createRevision.kind,
          note: args.createRevision.note,
        });
        await store.saveRevision(createdRevision);
        revisionCount = (revisionCount ?? revisions.length) + 1;
        lastRevisionAt = createdRevision.createdAt;
        setRevisions((prev) => [createdRevision!, ...prev]);
      }

      const toSave: Draft = {
        ...args.draft,
        title: normalizeTitle(args.draft.title),
        updatedAt: args.updatedAt,
        revisionCount,
        lastRevisionAt,
      };

      await store.saveDraft(toSave);

      const latestActiveDraft = activeDraftRef.current;
      const hasNewerEdits = latestActiveDraft?.id === toSave.id
        && draftEditVersionRef.current !== editVersionAtStart;

      if (!hasNewerEdits) {
        setActiveDraft(toSave);
        setDraftSnapshot({ title: toSave.title, body: toSave.body, updatedAt: toSave.updatedAt });
      }
      setDrafts((prev) => {
        const exists = prev.some((d) => d.id === toSave.id);
        const next = exists
          ? prev.map((d) => (d.id === toSave.id ? toSave : d))
          : [toSave, ...prev];
        return next;
      });

      if (createdRevision) {
        setSelectedRevision(createdRevision);
        setRevisionView("preview");
      }

      const tab = selectedMode === "revisions" ? revisionView : "draft";
      await persistSession(toSave.id, tab);
      if (args.syncSources) {
        sourcesState.syncSources();
      }
      if (args.syncSession) {
        void syncSessionToTongs();
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save draft.";
      setError(message);
      return false;
    } finally {
      if (showSavingState) {
        setIsSaving(false);
      }
    }
  }

  async function saveDraftMeta(draft: Draft, updates: Partial<Draft>) {
    const now = Date.now();
    const toSave: Draft = {
      ...draft,
      ...updates,
      title: normalizeTitle(updates.title ?? draft.title),
      updatedAt: now,
    };
    const tagValidation = validateAnvilTagContract(toSave.body);
    if (!tagValidation.ok) {
      setScriptValidation({
        source: "save_gate",
        result: tagValidation,
      });
      setError(`Script tag validation failed:\n${tagValidation.report}`);
      return;
    }
    setScriptValidation(null);
    await store.saveDraft(toSave);
    setDrafts((prev) => prev.map((d) => (d.id === toSave.id ? toSave : d)));
    if (activeDraft?.id === toSave.id) {
      setActiveDraft(toSave);
      setDraftSnapshot({ title: toSave.title, body: toSave.body, updatedAt: toSave.updatedAt });
    }
  }

  async function onCreateDraft() {
    setError(null);
    try {
      const next = createDraft();
      await store.saveDraft(next);
      await refreshDrafts();
      await selectDraft(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create draft.";
      setError(message);
    }
  }

  function onAddDecision() {
    const text = decisionDraft.trim();
    if (!text) return;
    const entry: HearthSessionDecision = {
      at: new Date().toISOString(),
      text,
    };
    updatePlanningSession((prev) => ({
      ...prev,
      decisions: [...(prev.decisions ?? []), entry],
    }));
    setDecisionDraft("");
  }

  function onUpdateDecision(idx: number, text: string) {
    updatePlanningSession((prev) => {
      const next = [...(prev.decisions ?? [])];
      if (!next[idx]) return prev;
      next[idx] = { ...next[idx], text };
      return { ...prev, decisions: next };
    });
  }

  function onRemoveDecision(idx: number) {
    updatePlanningSession((prev) => ({
      ...prev,
      decisions: (prev.decisions ?? []).filter((_, index) => index !== idx),
    }));
  }

  async function onDeleteDraft(draft: Draft) {
    const confirmDelete = window.confirm("Delete this draft? This cannot be undone.");
    if (!confirmDelete) return;
    setError(null);
    try {
      await store.deleteDraft(draft.id);
      await refreshDrafts();
      if (activeDraft?.id === draft.id) {
        await selectDraft(null);
      }
      await persistSession(activeDraft?.id === draft.id ? null : activeDraft?.id ?? null, "draft");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete draft.";
      setError(message);
    }
  }

  async function onConfirmRevision() {
    if (!activeDraft) return;
    const now = Date.now();
    await persistDraft({
      draft: activeDraft,
      updatedAt: now,
      createRevision: { kind: revisionKind, note: revisionNote.trim() || undefined },
    });
    setRevisionModalOpen(false);
    setRevisionNote("");
    setRevisionKind("manual");
  }

  async function onRestoreRevision(revision: Revision) {
    if (!activeDraft) return;
    const confirmRestore = window.confirm("Restore this revision? This will overwrite the current draft content.");
    if (!confirmRestore) return;

    const snapshot = await store.restoreRevision(revision.id);
    if (!snapshot) {
      setError("Revision not found.");
      return;
    }

    const now = Date.now();
    const restored: Draft = {
      ...activeDraft,
      title: snapshot.title,
      body: snapshot.body,
      updatedAt: now,
    };
    await persistDraft({ draft: restored, updatedAt: now, createRevision: null });
    setSelectedRevision(revision);
    setRevisionView("preview");
  }

  async function onUpdateRevisionNote(revision: Revision, note: string) {
    setIsSavingRevision(true);
    try {
      const updated: Revision = {
        ...revision,
        note: note.trim() || undefined,
      };
      await store.saveRevision(updated);
      setRevisions((prev) => prev.map((rev) => (rev.id === updated.id ? updated : rev)));
      setSelectedRevision(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update revision note.";
      setError(message);
    } finally {
      setIsSavingRevision(false);
    }
  }

  function openRevisionPanel() {
    setMode("revisions");
    setRevisionView("list");
    setSelectedRevision(null);
    void persistSession(activeDraft?.id ?? null, "list");
  }

  function closeRevisionPanel() {
    setMode("draft");
    setRevisionView("list");
    setSelectedRevision(null);
    void persistSession(activeDraft?.id ?? null, "draft");
  }

  function onCancelAiRequest() {
    aiRequestControllerRef.current?.abort();
  }

  const buildActiveEpisodeContext = useCallback((): EpisodeContext | null => {
    const episodeId = workpieceId?.trim();
    if (!episodeId) return null;
    return buildEpisodeContext({
      episodeId,
      draft: activeDraft,
      planningSession,
      workpieceSources,
      sourceIndexById,
      sparks: activeEpisodeSparks,
    });
  }, [
    activeDraft,
    activeEpisodeSparks,
    planningSession,
    sourceIndexById,
    workpieceId,
    workpieceSources,
  ]);

  function findNextBodyFromOps(baseBody: string, ops: HearthOp[]): string {
    let next = baseBody;
    for (const op of ops) {
      if (op.op === "set_body") {
        next = op.value;
      }
    }
    return next;
  }

  async function onFixScriptFormattingNoAi() {
    if (!activeDraft) return;
    const formattedBody = formatScriptToAnvilTagsNoAi(activeDraft.body);
    const validation = validateAnvilTagContract(formattedBody);
    if (!validation.ok) {
      setScriptValidation({
        source: "save_gate",
        result: validation,
      });
      setError(`Script tag validation failed:\n${validation.report}`);
      return;
    }

    const now = Date.now();
    const saved = await persistDraft({
      draft: { ...activeDraft, body: formattedBody, updatedAt: now },
      updatedAt: now,
      createRevision: null,
      syncSources: false,
      syncSession: false,
    });
    if (saved) {
      setScriptValidation(null);
    }
  }

  async function onAskAiRepairScript() {
    if (isRepairingScript || isAiProcessing) return;
    if (!activeDraft) return;

    const episodeContext = buildActiveEpisodeContext();
    if (!episodeContext) {
      setChatError("Select an Episode or Spark to start.");
      return;
    }

    const lane = resolveAiLaneFromStorage();
    setAiBillingMode(lane);
    if (lane === "forge" && aiTokenBalance != null && aiTokenBalance <= 0) {
      setChatError("No AI credits remaining.");
      return;
    }

    setChatError(null);
    setAiRuntimeWarning(null);
    setIsRepairingScript(true);

    const repairMessage = [
      "Repair this script to satisfy the canonical Anvil tag contract.",
      "Do NOT rewrite meaning, style, or wording except where required to fix markup.",
      "Return a set_body op with the repaired script.",
      "Also include script_text and tag_audit.",
      "",
      "SCRIPT TO REPAIR:",
      activeDraft.body,
    ].join("\n");

    const controller = new AbortController();
    aiRequestControllerRef.current = controller;
    setIsAiProcessing(true);

    try {
      const result = await requestHearthChatReply(
        [{ role: "user", content: repairMessage }],
        episodeContext,
        { signal: controller.signal },
      );

      setAiBillingMode(result.runtime.billingMode);
      if (result.runtime.billingMode === "byo") {
        setAiTokenBalance(null);
      }

      if (!result.ok) {
        if (!result.cancelled) {
          setChatError(result.error);
        }
        return;
      }

      const opBody = result.ops.find((op) => op.op === "set_body");
      const repairedBody = result.scriptText ?? (opBody && opBody.op === "set_body" ? opBody.value : "");
      const validation = validateAnvilTagContract(repairedBody);
      if (!validation.ok) {
        setScriptValidation({
          source: "ai_repair",
          result: validation,
        });
        setError(`Script tag validation failed after AI repair:\n${validation.report}`);
        return;
      }

      const now = Date.now();
      const saved = await persistDraft({
        draft: { ...activeDraft, body: repairedBody, updatedAt: now },
        updatedAt: now,
        createRevision: null,
        syncSources: false,
        syncSession: false,
      });
      if (saved) {
        setScriptValidation(null);
      }

      const assistantMessage: HearthChatMessage = {
        role: "assistant",
        content: result.assistantText || "Applied repaired script tags.",
      };
      setChatMessages((prev) => [...prev, assistantMessage].slice(-24));

      if (result.creditsWarning) {
        setAiRuntimeWarning(result.creditsWarning);
      }

      const refreshedCredits = await refreshMyAiCredits();
      if (refreshedCredits.ok) {
        setAiBillingMode(refreshedCredits.runtime.billingMode);
        setAiTokenBalance(refreshedCredits.runtime.tokenBalance);
      }
    } finally {
      if (aiRequestControllerRef.current === controller) {
        aiRequestControllerRef.current = null;
      }
      setIsAiProcessing(false);
      setIsRepairingScript(false);
    }
  }

  async function onApplyAiProposal(mode: "all" | "selected") {
    if (!pendingAiProposal || isApplyingAiOps) return;
    const episodeId = workpieceId?.trim();
    if (!episodeId || !activeDraft) {
      setChatError("Select an Episode or Spark to start.");
      return;
    }

    const opsToApply = mode === "all"
      ? pendingAiProposal.ops
      : pendingAiProposal.ops.filter((_, index) => pendingAiProposal.selected[index]);

    if (opsToApply.length === 0) {
      setChatError("Select at least one proposed change.");
      return;
    }

    const projectedBody = findNextBodyFromOps(activeDraft.body, opsToApply);
    const projectedValidation = validateAnvilTagContract(projectedBody);
    if (!projectedValidation.ok) {
      setScriptValidation({
        source: "ai_apply",
        result: projectedValidation,
      });
      setError(`Script tag validation failed:\n${projectedValidation.report}`);
      return;
    }

    setIsApplyingAiOps(true);
    setChatError(null);
    setError(null);
    setScriptValidation(null);

    let nextDraft: Draft = { ...activeDraft };
    let draftChanged = false;
    let nextPlanningSession = planningSession
      ? { ...planningSession }
      : createPlanningSessionForEpisode(episodeId, workspaceId);
    let planningChanged = false;
    let sourcesChanged = false;
    let saveRequested = false;

    const opsStore: HearthOpsStore = {
      setTitle: (value) => {
        if (nextDraft.title !== value) {
          nextDraft = { ...nextDraft, title: value };
          draftChanged = true;
        }
        if ((nextPlanningSession.title ?? "") !== value) {
          nextPlanningSession = { ...nextPlanningSession, title: value };
          planningChanged = true;
        }
      },
      setTitleVariant: (slot, value) => {
        const current = nextPlanningSession.title_variants ?? {};
        if ((current[slot] ?? "") === value) return;
        nextPlanningSession = {
          ...nextPlanningSession,
          title_variants: {
            ...current,
            [slot]: value,
          },
        };
        planningChanged = true;
      },
      setOutline: (value) => {
        const nextOutline = parsePlanningLines(value);
        const prevOutline = nextPlanningSession.outline ?? [];
        if (JSON.stringify(prevOutline) === JSON.stringify(nextOutline)) return;
        nextPlanningSession = {
          ...nextPlanningSession,
          outline: nextOutline,
        };
        planningChanged = true;
      },
      setBody: (value) => {
        if (nextDraft.body === value) return;
        nextDraft = { ...nextDraft, body: value };
        draftChanged = true;
      },
      addSource: async (source) => {
        const created = await sourcesState.addSourceToLibrary({
          title: source.title ?? "Untitled Source",
          type: "webpage",
          url: source.url ?? null,
          notes: source.note ?? null,
        }, { attachToWorkpiece: true });
        if (created) {
          sourcesChanged = true;
        }
      },
      updateSource: async (id, patch) => {
        if (patch.note !== undefined) {
          sourcesState.updateWorkpieceSourceNotes(id, patch.note);
          sourcesChanged = true;
        }
        const updated = await sourcesState.updateSourceInLibrary(id, {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.url !== undefined ? { url: patch.url } : {}),
          ...(patch.note !== undefined ? { notes: patch.note } : {}),
        });
        if (updated) {
          sourcesChanged = true;
        }
      },
      removeSource: (id) => {
        sourcesState.removeSourceFromWorkpiece(id);
        sourcesChanged = true;
      },
      requestSave: (reason) => {
        saveRequested = reason === "ai_apply_ops";
      },
    };

    try {
      await applyHearthOps(opsStore, opsToApply);

      if (saveRequested) {
        if (draftChanged) {
          const now = Date.now();
          const saved = await persistDraft({
            draft: { ...nextDraft, updatedAt: now },
            updatedAt: now,
            createRevision: null,
            syncSources: false,
            syncSession: false,
          });
          if (!saved) {
            return;
          }
        } else {
          setActiveDraft((prev) => (prev ? nextDraft : prev));
        }

        if (planningChanged) {
          const nowIso = new Date().toISOString();
          const committedSession: HearthPlanningSession = {
            ...nextPlanningSession,
            workpiece_id: episodeId,
            workspace_id: workspaceId ?? nextPlanningSession.workspace_id ?? null,
            updated_at: nowIso,
          };
          setPlanningSession(committedSession);
          writeHearthPlanningSessionCache(committedSession, episodeId);
          setSessionTouched(true);
          await syncSessionToTongs(committedSession);
        }

        if (sourcesChanged) {
          sourcesState.syncSources();
        }
      }

      if (mode === "all") {
        setPendingAiProposal(null);
      } else {
        setPendingAiProposal((prev) => {
          if (!prev) return prev;
          const remainingOps = prev.ops.filter((_, index) => !prev.selected[index]);
          if (remainingOps.length === 0) return null;
          return {
            ...prev,
            ops: remainingOps,
            selected: remainingOps.map(() => true),
          };
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to apply AI changes.";
      setChatError(message);
    } finally {
      setIsApplyingAiOps(false);
    }
  }

  async function onSendChat() {
    if (isAiProcessing) return;
    const content = chatDraft.trim();
    if (!content) return;
    const episodeContext = buildActiveEpisodeContext();
    if (!episodeContext) {
      setChatError("Select an Episode or Spark to start.");
      return;
    }
    const lane = resolveAiLaneFromStorage();
    setAiBillingMode(lane);
    if (lane === "forge" && aiTokenBalance != null && aiTokenBalance <= 0) {
      setChatError("No AI credits remaining.");
      return;
    }
    if (lane === "byo") {
      setAiTokenBalance(null);
    }

    const userMessage: HearthChatMessage = { role: "user", content };
    const nextMessages = [...chatMessages, userMessage].slice(-24);
    setChatMessages(nextMessages);
    setChatDraft("");
    setChatError(null);
    setAiRuntimeWarning(null);
    setPendingAiProposal(null);
    const controller = new AbortController();
    aiRequestControllerRef.current = controller;
    setIsAiProcessing(true);

    try {
      const result = await requestHearthChatReply(nextMessages, episodeContext, { signal: controller.signal });
      setAiBillingMode(result.runtime.billingMode);
      if (result.runtime.billingMode === "byo") {
        setAiTokenBalance(null);
      }
      if (!result.ok) {
        if (!result.cancelled) {
          setChatError(result.error);
        }
        return;
      }
      const assistantMessage: HearthChatMessage = { role: "assistant", content: result.assistantText };
      setChatMessages((prev) => [...prev, assistantMessage].slice(-24));
      if (result.ops.length > 0) {
        setPendingAiProposal({
          assistantText: result.assistantText,
          ops: result.ops,
          selected: result.ops.map(() => true),
          context: episodeContext,
        });
      }

      if (result.creditsWarning) {
        setAiRuntimeWarning(result.creditsWarning);
      }

      const refreshedCredits = await refreshMyAiCredits();
      if (refreshedCredits.ok) {
        setAiBillingMode(refreshedCredits.runtime.billingMode);
        setAiTokenBalance(refreshedCredits.runtime.tokenBalance);
      } else {
        setAiRuntimeWarning("Unable to update credits.");
      }
    } finally {
      if (aiRequestControllerRef.current === controller) {
        aiRequestControllerRef.current = null;
      }
      setIsAiProcessing(false);
    }
  }

  function onDiscardAiProposal() {
    setPendingAiProposal(null);
  }

  function onToggleAiProposalOp(index: number) {
    setPendingAiProposal((prev) => {
      if (!prev) return prev;
      const selected = prev.selected.slice();
      selected[index] = !selected[index];
      return { ...prev, selected };
    });
  }

  function onUseChatShortcut(prompt: string) {
    setChatDraft((prev) => (prev.trim() ? `${prev.trim()}\n${prompt}` : prompt));
    chatInputRef.current?.focus();
  }

  function formatSourceDiffText(source: {
    id?: string;
    title?: string;
    url?: string;
    note?: string;
  }): string {
    const parts: string[] = [];
    if (source.id) parts.push(`id: ${source.id}`);
    if (source.title) parts.push(`title: ${source.title}`);
    if (source.url) parts.push(`url: ${source.url}`);
    if (source.note) parts.push(`note: ${source.note}`);
    return parts.join("\n") || "(empty)";
  }

  function buildProposalDiff(op: HearthOp): { before: string; after: string } | null {
    const context = pendingAiProposal?.context;
    if (!context) return null;

    if (op.op === "set_title") {
      return { before: context.title, after: op.value };
    }
    if (op.op === "set_title_variant") {
      return {
        before: context.titleVariants[op.slot] ?? "",
        after: op.value,
      };
    }
    if (op.op === "set_outline") {
      return { before: context.outline, after: op.value };
    }
    if (op.op === "set_body") {
      return { before: context.body, after: op.value };
    }
    if (op.op === "add_source") {
      return {
        before: "(not attached)",
        after: formatSourceDiffText(op.source),
      };
    }
    if (op.op === "update_source") {
      const existing = context.sources.find((source) => source.id === op.id);
      return {
        before: formatSourceDiffText(existing ?? { id: op.id }),
        after: formatSourceDiffText({
          id: op.id,
          title: op.patch.title ?? existing?.title,
          url: op.patch.url ?? existing?.url,
          note: op.patch.note ?? existing?.note,
        }),
      };
    }
    if (op.op === "remove_source") {
      const existing = context.sources.find((source) => source.id === op.id);
      return {
        before: formatSourceDiffText(existing ?? { id: op.id }),
        after: "(removed from Episode)",
      };
    }
    return null;
  }

  function renderSectionedBody(text: string) {
    const lines = splitLines(text);
    return (
      <div className="hs-sectioned-body">
        {lines.map((line, idx) => (
          line.trim() === "---"
            ? <hr key={`sep-${idx}`} className="hs-divider" />
            : <div key={`line-${idx}`}>{line || " "}</div>
        ))}
      </div>
    );
  }

  const renderHomeView = () => {
    const sortedSparks = sparks.slice().sort((a, b) => b.createdAt - a.createdAt);
    return (
      <section className="hs-home">
        <header className="hs-home-header">
          <h2 className="hs-home-title">Hearth</h2>
          <p className="hs-home-subtext">Select a spark or begin a new workpiece.</p>
        </header>

        <section className="hs-home-section">
          <h3 className="hs-home-section-title">Start New Workpiece</h3>
          <div className="hs-home-actions">
            <button type="button" onClick={() => void startFromScratch()} disabled={isForging}>
              Start from scratch
            </button>
            {activeDraft ? (
              <button type="button" onClick={() => setMode("draft")}>
                Continue last draft
              </button>
            ) : null}
          </div>
        </section>

        {forgeError ? (
          <div className="hs-error-text-small">{forgeError}</div>
        ) : null}

        <section className="hs-home-barstock">
          <h3 className="hs-home-section-title">From Bar Stock</h3>
          {sortedSparks.length === 0 ? (
            <p className="hs-home-empty">
              No sparks yet. Capture ideas in Bar Stock first.
            </p>
          ) : (
            <div className="hs-home-spark-list">
              {sortedSparks.map((spark) => {
                const status = formatSparkStatus(spark);
                const preview = buildSparkPreview(spark.body);
                return (
                  <div
                    key={spark.id}
                    className="hs-spark-card"
                  >
                    <div className="hs-spark-header">
                      <div className="hs-spark-title">{deriveSparkTitle(spark)}</div>
                      <div className="hs-spark-date">
                        {formatSparkDate(spark.createdAt)}
                      </div>
                    </div>
                    <div className="hs-spark-preview">
                      {preview || "No preview available yet."}
                    </div>
                    <div className="hs-spark-footer">
                      <div className="hs-spark-status">
                        Status: {status.label}{status.detail ? ` · ${status.detail}` : ""}
                      </div>
                      <button
                        type="button"
                        onClick={() => void forgeSpark(spark)}
                        disabled={isForging}
                      >
                        Forge this
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </section>
    );
  };

  const renderDraftView = () => {
    const sourcesSummary = missingSourcesCount > 0
      ? `${missingSourcesCount} missing citation${missingSourcesCount === 1 ? "" : "s"}`
      : "No missing citations";
    const unusedSummary = unusedSourcesCount > 0
      ? ` · ${unusedSourcesCount} unused`
      : "";
    const hasScript = Boolean((activeDraft?.body ?? "").trim());
    const showScriptEditor = showManualDraft || showScriptPanel;

    return (
      <section className="hs-draft hs-draft-chat-first">
        <header className="hs-draft-header hs-draft-header-chat-first">
          <div className="hs-draft-title-wrap">
            <div className="hs-draft-title">Project</div>
            <div className="hs-draft-updated">
              Last updated {formatUpdatedAt(activeDraft?.updatedAt)}
            </div>
          </div>
          <label className="hs-project-title">
            <span className="hs-field-label">Project title</span>
            <input
              type="text"
              value={activeDraft?.title ?? ""}
              placeholder="Project title"
              onChange={(event) => {
                setActiveDraft((prev) => {
                  if (!prev) return prev;
                  draftEditVersionRef.current += 1;
                  return { ...prev, title: event.target.value };
                });
              }}
              disabled={!activeDraft}
            />
          </label>
        </header>

        <div className="hs-toolbar">
          <button onClick={onCreateDraft}>New Draft</button>
          <button onClick={onSaveDraft} disabled={!activeDraft || isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button onClick={() => setRevisionModalOpen(true)} disabled={!activeDraft || isSaving}>
            Create Revision
          </button>
          <button onClick={openRevisionPanel} disabled={!activeDraft}>
            Revisions
          </button>
          <span className="hs-status-text">{statusText}</span>
          <span className="hs-count-text">{wordCount} words · {charCount} chars</span>
        </div>

        {error ? (
          <div className="hs-error-text">{error}</div>
        ) : null}

        {scriptValidation ? (
          <section className="hs-script-validation" aria-label="Anvil tag validation">
            <div className="hs-script-validation-title">Script Tag Contract Failed</div>
            <div className="hs-script-validation-subtitle">
              {scriptValidation.source === "ai_apply"
                ? "AI proposed script changes are invalid."
                : scriptValidation.source === "ai_repair"
                  ? "AI repair result is still invalid."
                  : "Draft cannot be saved until tags are valid."}
            </div>
            <pre className="hs-script-validation-report">{scriptValidation.result.report}</pre>
            <div className="hs-script-validation-actions">
              <button
                type="button"
                onClick={() => void onFixScriptFormattingNoAi()}
                disabled={!activeDraft || isSaving || isRepairingScript}
              >
                Fix formatting (no AI)
              </button>
              <button
                type="button"
                onClick={() => void onAskAiRepairScript()}
                disabled={!activeDraft || !aiEpisodeReady || aiCreditsDepleted || isAiProcessing || isRepairingScript}
              >
                {isRepairingScript ? "Repairing..." : "Ask AI to repair"}
              </button>
              <button
                type="button"
                onClick={() => setScriptValidation(null)}
                disabled={isRepairingScript}
              >
                Dismiss
              </button>
            </div>
          </section>
        ) : null}

        <div className="hs-chat-stage-controls">
          <div className="hs-manual-draft-controls">
            <button
              type="button"
              onClick={() => setShowManualDraft((prev) => !prev)}
              disabled={!activeDraft}
            >
              {showManualDraft ? "Hide Manual Draft" : "Manual Draft (no AI)"}
            </button>
            {hasScript ? (
              <button
                type="button"
                onClick={() => setShowScriptPanel((prev) => !prev)}
                disabled={!activeDraft}
              >
                {showScriptPanel ? "Hide Script panel" : "Script panel"}
              </button>
            ) : null}
          </div>
          <div className="hs-field-label-muted">Write without AI (just a text editor)</div>
        </div>

        <div className={`hs-draft-stage${showScriptEditor ? " has-script-panel" : ""}`}>
          <section className="hs-ai-chat" aria-label="Hearth AI chat">
            <div className="hs-ai-chat-header">
              <div className="hs-ai-chat-title">Conversation</div>
              <button
                type="button"
                onClick={() => {
                  setChatMessages([]);
                  setChatError(null);
                  setPendingAiProposal(null);
                }}
                disabled={isAiProcessing || chatMessages.length === 0}
              >
                Clear
              </button>
            </div>

            <div className="hs-ai-chat-log" role="log" aria-live="polite">
              {chatMessages.length === 0 ? (
                <div className="hs-ai-chat-empty">
                  Ask a question about this Episode. Context is attached automatically.
                </div>
              ) : (
                chatMessages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`hs-ai-chat-msg is-${message.role}`}>
                    <span className="hs-ai-chat-role">{message.role === "assistant" ? "Hearth" : "You"}</span>
                    <span className="hs-ai-chat-content">{message.content}</span>
                  </div>
                ))
              )}
            </div>

            {pendingAiProposal && pendingAiProposal.ops.length > 0 ? (
              <div className="hs-ai-proposal" aria-label="Proposed AI changes">
                <div className="hs-ai-proposal-header">
                  <div className="hs-ai-proposal-title">Proposed changes</div>
                  <div className="hs-ai-proposal-meta">
                    {pendingAiProposal.selected.filter(Boolean).length} selected · {pendingAiProposal.ops.length} total
                  </div>
                </div>

                <div className="hs-ai-proposal-list">
                  {pendingAiProposal.ops.map((op, index) => {
                    const diff = buildProposalDiff(op);
                    return (
                      <label key={`ai-op-${index}`} className="hs-ai-op-row">
                        <input
                          type="checkbox"
                          checked={Boolean(pendingAiProposal.selected[index])}
                          onChange={() => onToggleAiProposalOp(index)}
                          disabled={isApplyingAiOps}
                        />
                        <div className="hs-ai-op-body">
                          <div className="hs-ai-op-title">{describeHearthOp(op)}</div>
                          {diff ? (
                            <div className="hs-ai-op-diff">
                              <pre>{`- ${diff.before || "(empty)"}`}</pre>
                              <pre>{`+ ${diff.after || "(empty)"}`}</pre>
                            </div>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="hs-ai-proposal-actions">
                  <button
                    type="button"
                    onClick={() => void onApplyAiProposal("all")}
                    disabled={isApplyingAiOps}
                  >
                    {isApplyingAiOps ? "Applying..." : "Apply"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onApplyAiProposal("selected")}
                    disabled={isApplyingAiOps || pendingAiProposal.selected.every((value) => !value)}
                  >
                    Apply selected
                  </button>
                  <button
                    type="button"
                    onClick={onDiscardAiProposal}
                    disabled={isApplyingAiOps}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ) : null}

            {chatError ? (
              <div className="hs-error-text-small">{chatError}</div>
            ) : null}

            {aiRuntimeWarning ? (
              <div className="hs-error-text-small">{aiRuntimeWarning}</div>
            ) : null}

            {aiCreditsDepleted ? (
              <div className="hs-error-text-small">No AI credits remaining.</div>
            ) : null}

            <div className="hs-ai-shortcut-row" role="group" aria-label="Chat shortcuts">
              <button type="button" onClick={() => onUseChatShortcut("Create a clear outline for this Episode.")}>
                Outline
              </button>
              <button type="button" onClick={() => onUseChatShortcut("Find strong sources I should cite for this Episode.")}>
                Find sources
              </button>
              <button type="button" onClick={() => onUseChatShortcut("Write a record-ready script using canonical Anvil tags.")}>
                Write script
              </button>
            </div>

            <div className="hs-ai-chat-compose">
              <textarea
                ref={chatInputRef}
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                placeholder={aiEpisodeReady ? "Talk it out... paste links... ask for an outline..." : "Select an Episode or Spark to start."}
                className="hs-ai-chat-input"
                rows={2}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;
                  event.preventDefault();
                  void onSendChat();
                }}
                disabled={isAiProcessing || aiCreditsDepleted || !aiEpisodeReady}
              />
              {isAiProcessing ? (
                <button type="button" onClick={onCancelAiRequest}>
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void onSendChat()}
                disabled={isAiProcessing || aiCreditsDepleted || !aiEpisodeReady || !chatDraft.trim()}
              >
                {isAiProcessing ? "Sending..." : "Send"}
              </button>
            </div>
          </section>

          {showScriptEditor ? (
            <section className="hs-script-panel" aria-label="Manual draft editor">
              <header className="hs-script-panel-header">
                <div className="hs-script-panel-title">
                  {showScriptPanel && hasScript ? "Script" : "Manual Draft"}
                </div>
                <div className="hs-script-panel-meta">Sources: {sourcesSummary}{unusedSummary}</div>
              </header>

              <label className="hs-field">
                <span className="hs-field-label">Body</span>
                <textarea
                  ref={bodyRef}
                  value={activeDraft?.body ?? ""}
                  placeholder="Start writing..."
                  onChange={(event) => {
                    setScriptValidation(null);
                    setActiveDraft((prev) => {
                      if (!prev) return prev;
                      draftEditVersionRef.current += 1;
                      return { ...prev, body: event.target.value };
                    });
                  }}
                  onCompositionStart={() => setIsBodyComposing(true)}
                  onCompositionEnd={() => setIsBodyComposing(false)}
                  onSelect={(event) => {
                    const target = event.target as HTMLTextAreaElement;
                    setCursorPosition(target.selectionStart);
                  }}
                  onKeyUp={(event) => {
                    const target = event.target as HTMLTextAreaElement;
                    setCursorPosition(target.selectionStart);
                  }}
                  onScroll={(event) => {
                    const target = event.target as HTMLTextAreaElement;
                    setScrollTop(target.scrollTop);
                  }}
                  disabled={!activeDraft}
                  className="hs-textarea-body hs-textarea-script-panel"
                />
              </label>

              <div className="hs-sources-row">
                <span className="hs-sources-summary">Sources: {sourcesSummary}{unusedSummary}</span>
                <button type="button" onClick={() => setMode("sources")} disabled={!workpieceId}>
                  Review sources
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    );
  };

  const renderPlanningView = () => (
    <section className="hs-planning">
      <header className="hs-planning-header">
        <div className="hs-planning-title">Planning Board</div>
        <div className="hs-planning-meta">
          {sessionIntent ? `Intent: ${sessionIntent === "from_spark" ? "From Spark" : "New Idea"}` : "Intent: —"}
          {sessionSparkId ? ` · Spark ${sessionSparkId.slice(0, 8)}` : ""}
        </div>
      </header>

      <div className="hs-toolbar">
        <button
          type="button"
          onClick={() => void syncSessionToTongs()}
          disabled={!planningSession || !workpieceId}
        >
          Save Planning
        </button>
        <span className="hs-status-text">
          {sessionTouched ? "Unsaved changes" : "Saved"}
        </span>
      </div>

      <label className="hs-field">
        <span className="hs-field-label">Title</span>
        <input
          type="text"
          value={sessionTitle}
          placeholder="Episode title seed"
          onChange={(event) => {
            updatePlanningSession((prev) => ({
              ...prev,
              title: event.target.value,
            }));
          }}
        />
      </label>
      <label className="hs-field">
        <span className="hs-field-label">Goals</span>
        <textarea
          value={sessionGoalsText}
          placeholder="One per line"
          onChange={(event) => {
            const nextGoals = parsePlanningLines(event.target.value);
            updatePlanningSession((prev) => ({
              ...prev,
              goals: nextGoals,
            }));
          }}
          className="hs-textarea-small"
        />
      </label>
      <label className="hs-field">
        <span className="hs-field-label">Outline</span>
        <textarea
          value={sessionOutlineText}
          placeholder="Bullet outline, one per line"
          onChange={(event) => {
            const nextOutline = parsePlanningLines(event.target.value);
            updatePlanningSession((prev) => ({
              ...prev,
              outline: nextOutline,
            }));
          }}
          className="hs-textarea-medium"
        />
      </label>
      <div className="hs-decision-section">
        <span className="hs-decision-title">Decision notes</span>
        <div className="hs-decision-input-row">
          <input
            type="text"
            value={decisionDraft}
            placeholder="Add a decision"
            onChange={(event) => setDecisionDraft(event.target.value)}
            className="hs-decision-input"
          />
          <button type="button" onClick={onAddDecision} disabled={!decisionDraft.trim()}>
            Add
          </button>
        </div>
        {sessionDecisions.length === 0 ? (
          <p className="hs-muted-text-small">No decisions logged yet.</p>
        ) : (
          <div className="hs-decision-list">
            {sessionDecisions.map((decision, idx) => (
              <div
                key={`${decision.at}-${idx}`}
                className="hs-decision-card"
              >
                <div className="hs-decision-time">
                  {formatDecisionAt(decision.at)}
                </div>
                <input
                  type="text"
                  value={decision.text}
                  onChange={(event) => onUpdateDecision(idx, event.target.value)}
                />
                <div className="hs-decision-actions">
                  <button type="button" onClick={() => onRemoveDecision(idx)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );

  const renderSourcesView = () => (
    <section className="hs-sources-view">
      <SourcesView state={sourcesState} workspaceId={workspaceId} workpieceId={workpieceId} />
    </section>
  );

  const renderRevisionsView = () => (
    <section className="hs-revisions">
      <header className="hs-revisions-header">
        <div className="hs-revisions-title">Revisions</div>
        <button type="button" onClick={closeRevisionPanel}>
          Back to Draft
        </button>
      </header>

      {revisions.length === 0 ? (
        <p className="hs-muted-text">No revisions yet.</p>
      ) : (
        <div className="hs-revisions-grid">
          <div className="hs-revision-list">
            {revisions.map((revision) => (
              <div
                key={revision.id}
                className={`hs-revision-card${selectedRevision?.id === revision.id ? " is-active" : ""}`}
              >
                <div className="hs-revision-card-header">
                  <span>{formatUpdatedAt(revision.createdAt)}</span>
                  <span className="hs-revision-kind">
                    {revision.kind}
                  </span>
                </div>
                <div className="hs-revision-note">
                  {revision.note || "No note"}
                </div>
                <div className="hs-revision-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRevision(revision);
                      setRevisionView("preview");
                    }}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRevision(revision);
                      setRevisionView("compare");
                    }}
                  >
                    Compare
                  </button>
                  <button type="button" onClick={() => void onRestoreRevision(revision)}>
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>

          {selectedRevision ? (
            <div className="hs-revision-detail">
              <div className="hs-revision-detail-title">
                {revisionView === "preview" ? "Preview" : "Compare"}
              </div>
              <div className="hs-revision-meta">
                {formatUpdatedAt(selectedRevision.createdAt)} · {selectedRevision.kind}
              </div>
              <label className="hs-revision-label">
                <span className="hs-revision-label-text">Revision note</span>
                <input
                  value={selectedRevision.note ?? ""}
                  onChange={(event) => {
                    setSelectedRevision({ ...selectedRevision, note: event.target.value });
                  }}
                  onBlur={(event) => void onUpdateRevisionNote(selectedRevision, event.target.value)}
                />
              </label>
              {revisionView === "preview" ? (
                <div className="hs-revision-preview">
                  <div className="hs-revision-preview-title">{selectedRevision.titleSnapshot}</div>
                  {renderSectionedBody(selectedRevision.bodySnapshot)}
                </div>
              ) : (
                <div className="hs-revision-diff-section">
                  <div className="hs-revision-diff-block">
                    <span className="hs-diff-label">Diff</span>
                    <div className="hs-diff-list">
                      {diffLines.map((line, idx) => {
                        const isSeparator = line.status === "separator";
                        if (isSeparator) {
                          return (
                            <div key={`diff-${idx}`} className="hs-diff-separator">
                              <hr className="hs-divider" />
                            </div>
                          );
                        }
                        return (
                          <div
                            key={`diff-${idx}`}
                            className="hs-diff-row"
                          >
                            <div className={diffCellClass("left", line.status)}>{line.left || " "}</div>
                            <div className={diffCellClass("right", line.status)}>{line.right || " "}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => void onUpdateRevisionNote(selectedRevision, selectedRevision.note ?? "")}
                disabled={isSavingRevision}
              >
                {isSavingRevision ? "Saving note..." : "Save note"}
              </button>
            </div>
          ) : (
            <div className="hs-muted-text-subtle">Select a revision to preview.</div>
          )}
        </div>
      )}
    </section>
  );

  const mainContent = showHome
    ? renderHomeView()
    : selectedMode === "planning"
      ? renderPlanningView()
      : selectedMode === "sources"
        ? renderSourcesView()
        : selectedMode === "revisions"
          ? renderRevisionsView()
          : renderDraftView();

  const sourcesBadge = missingSourcesCount > 0 ? String(missingSourcesCount) : null;
  const sourcesBadgeTitle = missingSourcesCount > 0
    ? `Missing cited sources: ${missingSourcesCount}${unusedSourcesCount ? ` · Unused refs: ${unusedSourcesCount}` : ""}`
    : unusedSourcesCount > 0
      ? `Unused refs: ${unusedSourcesCount}`
      : "Sources";

  return (
    <section className="hs-shell">
      <div className="hs-shell-grid">
        <aside
          className="hs-rail"
        >
          <div className="hs-rail-header">
            <div className="hs-rail-title">Hearth</div>
            {devMode ? (
              <div className="hs-rail-meta">Dev store: {storeKind}</div>
            ) : null}
            {workpieceId ? (
              <div className="hs-rail-meta">
                Workpiece {workpieceId.slice(0, 8)}
              </div>
            ) : null}
          </div>

          <div className="hs-rail-section">
            <div className="hs-rail-heading">Primary actions</div>
            <button type="button" onClick={() => void startFromScratch()} disabled={isForging}>
              New Workpiece
            </button>
            <button type="button" onClick={() => setMode("home")}>
              Forge from Bar Stock
            </button>
          </div>

          <div className="hs-rail-section">
            <label className="hs-rail-label">Search workpieces</label>
            <input
              ref={searchRef}
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search title or body"
            />
            <div className="hs-rail-sort">
              <label className="hs-rail-label">Sort</label>
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                <option value="updated">Recently updated</option>
                <option value="title">Title A-Z</option>
              </select>
            </div>
            <label className="hs-rail-checkbox">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              Show archived
            </label>
          </div>

          <div className="hs-rail-section">
            <div className="hs-rail-heading">Workpieces</div>
            {isLoading ? <p>Loading drafts...</p> : null}
            {!isLoading && drafts.length === 0 ? <p>No drafts yet.</p> : null}
            <ul className="hs-workpieces-list">
              {filteredDrafts.map((draft) => {
                const isActive = activeDraft?.id === draft.id;
                const isEditing = editingDraftId === draft.id;
                return (
                  <li key={draft.id}>
                    <div
                      className={`hs-workpiece-card${isActive ? " is-active" : ""}`}
                    >
                      {isEditing ? (
                        <input
                          value={editingTitle}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void saveDraftMeta(draft, { title: editingTitle });
                              setEditingDraftId(null);
                            }
                            if (event.key === "Escape") {
                              setEditingDraftId(null);
                            }
                          }}
                          onBlur={() => {
                            if (editingDraftId === draft.id) {
                              void saveDraftMeta(draft, { title: editingTitle });
                              setEditingDraftId(null);
                            }
                          }}
                        />
                      ) : (
                        <button
                          onClick={() => {
                            void selectDraft(draft);
                            setMode("draft");
                          }}
                          className="hs-workpiece-button"
                        >
                          <div className="hs-workpiece-title-row">
                            <div className="hs-workpiece-title">{draft.title || "Untitled Draft"}</div>
                            {draft.pinned ? (
                              <span className="hs-workpiece-pin" aria-label="Pinned" title="Pinned">
                                PIN
                              </span>
                            ) : null}
                          </div>
                          <div className="hs-workpiece-updated">
                            Updated {formatUpdatedAt(draft.updatedAt)}
                          </div>
                        </button>
                      )}
                      <div className="hs-workpiece-revisions">
                        Revisions {draft.revisionCount ?? "-"}
                      </div>
                      <div className="hs-workpiece-actions">
                        <button
                          type="button"
                          onClick={() => void saveDraftMeta(draft, { pinned: !draft.pinned })}
                        >
                          {draft.pinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDraftId(draft.id);
                            setEditingTitle(draft.title);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveDraftMeta(draft, { archived: !draft.archived })}
                        >
                          {draft.archived ? "Unarchive" : "Archive"}
                        </button>
                        <button type="button" onClick={() => void onDeleteDraft(draft)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {workpieceId ? (
            <div className="hs-active-workpiece">
              <div className="hs-rail-heading">Active workpiece</div>
              <button
                type="button"
                onClick={() => {
                  if (!openInAnvilHref) return;
                  window.location.assign(openInAnvilHref);
                }}
                disabled={!openInAnvilHref}
                className="hs-mode-button"
              >
                Open in Anvil
              </button>
              <button
                type="button"
                onClick={() => setMode("draft")}
                className={`hs-mode-button${selectedMode === "draft" ? " is-active" : ""}`}
              >
                Draft
                <span className="hs-mode-meta">{wordCount} words</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("planning")}
                className={`hs-mode-button${selectedMode === "planning" ? " is-active" : ""}`}
              >
                Planning Board
              </button>
              <button
                type="button"
                onClick={() => setMode("sources")}
                className={`hs-mode-button${selectedMode === "sources" ? " is-active" : ""}`}
                title={sourcesBadgeTitle}
              >
                Sources
                {sourcesBadge ? (
                  <span className={`hs-sources-badge${devMode ? " is-dev" : ""}`}>{sourcesBadge}</span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setMode("revisions")}
                className={`hs-mode-button${selectedMode === "revisions" ? " is-active" : ""}`}
              >
                Revisions
                <span className="hs-mode-meta">{revisions.length}</span>
              </button>
            </div>
          ) : null}
        </aside>

        <main className="hs-main">
          {mainContent}
        </main>
      </div>

      {revisionModalOpen ? (
        <div
          className="hs-modal-overlay"
        >
          <div
            className="hs-modal"
          >
            <div className="hs-modal-title">Create Revision</div>
            <label className="hs-field">
              <span className="hs-field-label-muted">Kind</span>
              <select value={revisionKind} onChange={(event) => setRevisionKind(event.target.value as RevisionKind)}>
                <option value="manual">Manual</option>
                <option value="milestone">Milestone</option>
              </select>
            </label>
            <label className="hs-field">
              <span className="hs-field-label-muted">Note (optional)</span>
              <textarea
                value={revisionNote}
                onChange={(event) => setRevisionNote(event.target.value)}
                placeholder="Why this change?"
                className="hs-textarea-modal"
              />
            </label>
            <div className="hs-modal-actions">
              <button
                type="button"
                onClick={() => {
                  setRevisionModalOpen(false);
                  setRevisionNote("");
                  setRevisionKind("manual");
                }}
              >
                Cancel
              </button>
              <button type="button" onClick={() => void onConfirmRevision()} disabled={!activeDraft}>
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
