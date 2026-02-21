import type { HearthSession } from "../domain/session";

export interface SessionStore {
  getSession(): Promise<HearthSession | null>;
  saveSession(session: HearthSession): Promise<void>;
  clearSession(): Promise<void>;
}
