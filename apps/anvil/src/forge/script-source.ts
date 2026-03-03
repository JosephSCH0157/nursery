export type ScriptSourceMode = "session" | "library";

const SOURCE_KEY = "forge_anvil_script_source_v1";
const RECORDING_SESSION_KEY = "forge_anvil_recording_session_v1";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readLocalStorage(key: string): string | null {
  try {
    return readString(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function emitScriptSourceChange(): void {
  try {
    window.dispatchEvent(new CustomEvent("tp:script-source:changed"));
  } catch {
    // ignore
  }
}

function emitRecordingSessionChange(): void {
  try {
    window.dispatchEvent(new CustomEvent("tp:recording-session:changed"));
  } catch {
    // ignore
  }
}

export function getScriptSourceMode(): ScriptSourceMode {
  const stored = readLocalStorage(SOURCE_KEY);
  if (stored === "library") return "library";
  return "session";
}

export function setScriptSourceMode(mode: ScriptSourceMode): void {
  const prev = getScriptSourceMode();
  if (prev === mode) return;
  writeLocalStorage(SOURCE_KEY, mode);
  emitScriptSourceChange();
}

export function getSelectedRecordingSessionId(): string | null {
  return readLocalStorage(RECORDING_SESSION_KEY);
}

export function setSelectedRecordingSessionId(sessionId: string | null): void {
  const normalized = sessionId ? sessionId.trim() : '';
  const next = normalized || null;
  const prev = getSelectedRecordingSessionId();
  if (prev === next) return;

  if (next) {
    writeLocalStorage(RECORDING_SESSION_KEY, next);
  } else {
    try {
      window.localStorage.removeItem(RECORDING_SESSION_KEY);
    } catch {
      // ignore storage failures
    }
  }
  emitRecordingSessionChange();
}
