// packages/hearth/src/domain/types.ts

export type IsoDateTime = string; // ISO 8601 string

export type RecordingSessionId = string; // UUID (enforced at creation sites)
export type ScriptId = string; // UUID
export type AssignmentId = string; // UUID

export interface RecordingSession {
  schemaVersion: 1;

  sessionId: RecordingSessionId;
  assignmentId: AssignmentId;

  title: string;
  scheduledStart: IsoDateTime;
  scheduledEnd?: IsoDateTime;

  /**
   * Optional binding to a calendar event (Tongs Calendar).
   * This is how Calendar -> sessionId becomes stable.
   */
  calendarEventId?: string;

  /**
   * Canonical script lineup order for this session.
   * Never derive order from timestamps.
   */
  scriptOrder: ScriptId[];

  /**
   * Canonical currently-selected script for this session (teleprompter focus).
   */
  activeScriptId: ScriptId | null;

  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ScriptDoc {
  schemaVersion: 1;

  scriptId: ScriptId;
  sessionId: RecordingSessionId;

  title: string;
  body: string;

  revision: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/**
 * Minimal helper for consistent timestamps.
 * Keep it simple and deterministic across the app.
 */
export function nowIso(): IsoDateTime {
  return new Date().toISOString();
}
