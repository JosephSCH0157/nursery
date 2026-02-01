// packages/hearth/src/storage/localHearthStore.ts

import {
  nowIso,
  type AssignmentId,
  type RecordingSession,
  type RecordingSessionId,
  type ScriptDoc,
  type ScriptId,
} from "../domain/types";
import type { HearthStore } from "./hearthStore";
import { newId } from "./ids";

type StoreStateV1 = {
  schemaVersion: 1;
  sessions: Record<RecordingSessionId, RecordingSession>;
  scripts: Record<ScriptId, ScriptDoc>;
  calendarEventToSessionId: Record<string, RecordingSessionId>;
};

const DEFAULT_STATE: StoreStateV1 = {
  schemaVersion: 1,
  sessions: {},
  scripts: {},
  calendarEventToSessionId: {},
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function loadState(storageKey: string): StoreStateV1 {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ...DEFAULT_STATE };

    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return { ...DEFAULT_STATE };
    if (parsed.schemaVersion !== 1) return { ...DEFAULT_STATE };

    // Be defensive: if any bucket is missing, restore it.
    return {
      schemaVersion: 1,
      sessions: isObject(parsed.sessions) ? (parsed.sessions as any) : {},
      scripts: isObject(parsed.scripts) ? (parsed.scripts as any) : {},
      calendarEventToSessionId: isObject(parsed.calendarEventToSessionId)
        ? (parsed.calendarEventToSessionId as any)
        : {},
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(storageKey: string, state: StoreStateV1): void {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

export class LocalHearthStore implements HearthStore {
  private readonly storageKey: string;

  constructor(storageKey = "forge.hearth.store.v1") {
    this.storageKey = storageKey;
  }

  // ----- Sessions -----
  async getSession(
    sessionId: RecordingSessionId
  ): Promise<RecordingSession | null> {
    const st = loadState(this.storageKey);
    return st.sessions[sessionId] ?? null;
  }

  async upsertSession(session: RecordingSession): Promise<void> {
    const st = loadState(this.storageKey);
    st.sessions[session.sessionId] = session;
    saveState(this.storageKey, st);
  }

  async listSessionsByAssignment(
    assignmentId: AssignmentId
  ): Promise<RecordingSession[]> {
    const st = loadState(this.storageKey);
    return Object.values(st.sessions)
      .filter((s) => s.assignmentId === assignmentId)
      .sort((a, b) => (a.scheduledStart < b.scheduledStart ? -1 : 1));
  }

  async getSessionIdForCalendarEvent(
    calendarEventId: string
  ): Promise<RecordingSessionId | null> {
    const st = loadState(this.storageKey);
    return st.calendarEventToSessionId[calendarEventId] ?? null;
  }

  async ensureSessionForCalendarEvent(args: {
    calendarEventId: string;
    assignmentId: AssignmentId;
    title: string;
    scheduledStart: string;
    scheduledEnd?: string;
  }): Promise<RecordingSession> {
    const st = loadState(this.storageKey);

    const existingSessionId =
      st.calendarEventToSessionId[args.calendarEventId];

    if (existingSessionId) {
      const existing = st.sessions[existingSessionId];
      if (existing) return existing;
      // If mapping exists but session missing, fall through and recreate.
    }

    const createdAt = nowIso();
    const sessionId = newId();

    const session: RecordingSession = {
      schemaVersion: 1,
      sessionId,
      assignmentId: args.assignmentId,
      title: args.title,
      scheduledStart: args.scheduledStart,
      scheduledEnd: args.scheduledEnd,
      calendarEventId: args.calendarEventId,
      scriptOrder: [],
      activeScriptId: null,
      createdAt,
      updatedAt: createdAt,
    };

    st.sessions[sessionId] = session;
    st.calendarEventToSessionId[args.calendarEventId] = sessionId;

    saveState(this.storageKey, st);
    return session;
  }

  // ----- Scripts -----
  async getScript(scriptId: ScriptId): Promise<ScriptDoc | null> {
    const st = loadState(this.storageKey);
    return st.scripts[scriptId] ?? null;
  }

  async upsertScript(script: ScriptDoc): Promise<void> {
    const st = loadState(this.storageKey);
    st.scripts[script.scriptId] = script;
    saveState(this.storageKey, st);
  }

  async listScriptsForSession(
    sessionId: RecordingSessionId
  ): Promise<ScriptDoc[]> {
    const st = loadState(this.storageKey);
    const session = st.sessions[sessionId];
    if (!session) return [];

    // Canonical ordering comes from session.scriptOrder.
    const ordered: ScriptDoc[] = [];
    for (const id of session.scriptOrder) {
      const doc = st.scripts[id];
      if (doc && doc.sessionId === sessionId) ordered.push(doc);
    }

    // Include any "orphan" scripts for the session that aren't in the order yet
    // (should be rare; keeps us resilient).
    const orderedIds = new Set(session.scriptOrder);
    const orphans = Object.values(st.scripts).filter(
      (s) => s.sessionId === sessionId && !orderedIds.has(s.scriptId)
    );

    return [...ordered, ...orphans];
  }

  async setScriptOrder(
    sessionId: RecordingSessionId,
    scriptIds: ScriptId[]
  ): Promise<void> {
    const st = loadState(this.storageKey);
    const session = st.sessions[sessionId];
    if (!session) return;

    session.scriptOrder = [...scriptIds];
    session.updatedAt = nowIso();

    st.sessions[sessionId] = session;
    saveState(this.storageKey, st);
  }

  async setActiveScript(
    sessionId: RecordingSessionId,
    scriptId: ScriptId | null
  ): Promise<void> {
    const st = loadState(this.storageKey);
    const session = st.sessions[sessionId];
    if (!session) return;

    session.activeScriptId = scriptId;
    session.updatedAt = nowIso();

    st.sessions[sessionId] = session;
    saveState(this.storageKey, st);
  }

  async createScriptForSession(args: {
    sessionId: RecordingSessionId;
    title: string;
    body?: string;
    setActive?: boolean;
  }): Promise<ScriptDoc> {
    const st = loadState(this.storageKey);
    const session = st.sessions[args.sessionId];
    if (!session) {
      throw new Error(
        `Cannot create script: session not found (${args.sessionId})`
      );
    }

    const scriptId = newId();
    const createdAt = nowIso();

    const doc: ScriptDoc = {
      schemaVersion: 1,
      scriptId,
      sessionId: args.sessionId,
      title: args.title,
      body: args.body ?? "",
      revision: 1,
      createdAt,
      updatedAt: createdAt,
    };

    st.scripts[scriptId] = doc;

    // Append to canonical order (session owns it)
    session.scriptOrder = [...session.scriptOrder, scriptId];
    if (args.setActive) session.activeScriptId = scriptId;
    session.updatedAt = nowIso();

    st.sessions[args.sessionId] = session;
    saveState(this.storageKey, st);

    return doc;
  }
}
