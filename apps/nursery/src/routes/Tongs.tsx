import { useState } from "react";
import TongsCalendar from "./TongsCalendar";
import TongsRecordingSessions from "./TongsRecordingSessions";

type TongsMode = "calendar" | "sessions";

const MODE_STORAGE_KEY = "forge_tongs_mode_v1";

function readStoredMode(): TongsMode {
  if (typeof window === "undefined") return "sessions";
  try {
    const raw = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (raw === "calendar" || raw === "sessions") return raw;
  } catch {
    // ignore storage failures
  }
  return "sessions";
}

function writeStoredMode(mode: TongsMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // ignore storage failures
  }
}

export default function TongsRoute() {
  const [mode, setMode] = useState<TongsMode>(() => readStoredMode());

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, padding: "8px 8px 0 8px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            setMode("sessions");
            writeStoredMode("sessions");
          }}
          style={{
            background: mode === "sessions" ? "rgba(255,255,255,0.18)" : "transparent",
            border: "1px solid rgba(255,255,255,0.25)",
            color: "inherit",
          }}
        >
          Recording Sessions
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("calendar");
            writeStoredMode("calendar");
          }}
          style={{
            background: mode === "calendar" ? "rgba(255,255,255,0.18)" : "transparent",
            border: "1px solid rgba(255,255,255,0.25)",
            color: "inherit",
          }}
        >
          Calendar
        </button>
      </div>
      {mode === "calendar" ? <TongsCalendar /> : <TongsRecordingSessions />}
    </div>
  );
}

