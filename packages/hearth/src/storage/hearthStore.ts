// packages/hearth/src/storage/hearthStore.ts

import type {
  AssignmentId,
  RecordingSession,
  RecordingSessionId,
  ScriptDoc,
  ScriptId,
} from "../domain/types";

export interface HearthStore {
  // ----- Sessions -----
  getSession(sessionId: RecordingSessionId): Promise<RecordingSession | null>;
  upsertSession(session: RecordingSession): Promise<void>;

  listSessionsByAssignment(
    assignmentId: AssignmentId
  ): Promise<RecordingSession[]>;

  /**
   * Calendar -> session binding
   */
  getSessionIdForCalendarEvent(
    calendarEventId: string
  ): Promise<RecordingSessionId | null>;

  /**
   * Create the session if missing and persist the binding.
   * This is the canonical "Calendar event => stable sessionId" entrypoint.
   */
  ensureSessionForCalendarEvent(args: {
    calendarEventId: string;
    assignmentId: AssignmentId;
    title: string;
    scheduledStart: string; // ISO
    scheduledEnd?: string; // ISO
  }): Promise<RecordingSession>;

  // ----- Scripts -----
  getScript(scriptId: ScriptId): Promise<ScriptDoc | null>;
  upsertScript(script: ScriptDoc): Promise<void>;

  listScriptsForSession(sessionId: RecordingSessionId): Promise<ScriptDoc[]>;

  /**
   * Canonical ordering lives on the session.
   */
  setScriptOrder(
    sessionId: RecordingSessionId,
    scriptIds: ScriptId[]
  ): Promise<void>;

  setActiveScript(
    sessionId: RecordingSessionId,
    scriptId: ScriptId | null
  ): Promise<void>;

  /**
   * Convenience: create a new script for a session AND add it to the session's
   * canonical scriptOrder (at the end), and optionally set active.
   */
  createScriptForSession(args: {
    sessionId: RecordingSessionId;
    title: string;
    body?: string;
    setActive?: boolean;
  }): Promise<ScriptDoc>;
}
