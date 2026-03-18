import { useState } from "react";
import TongsCalendar from "./TongsCalendar";
import TongsReleasePrep from "./TongsReleasePrep";
import TongsRecordingSessions from "./TongsRecordingSessions";
import TongsStorage from "./TongsStorage";
import TongsTeam from "./TongsTeam";
import "./Tongs.css";

type TongsMode = "calendar" | "sessions" | "team" | "release" | "storage";

const MODE_STORAGE_KEY = "forge_tongs_mode_v1";

function readStoredMode(): TongsMode {
  if (typeof window === "undefined") return "sessions";
  try {
    const raw = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (raw === "calendar" || raw === "sessions" || raw === "team" || raw === "release" || raw === "storage") {
      return raw;
    }
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

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  const className = active ? "tongs-mode-button tongs-mode-button--active" : "tongs-mode-button";
  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
    >
      {label}
    </button>
  );
}

export default function TongsRoute() {
  const [mode, setMode] = useState<TongsMode>(() => readStoredMode());

  const setModeAndPersist = (nextMode: TongsMode) => {
    setMode(nextMode);
    writeStoredMode(nextMode);
  };

  return (
    <div className="tongs-page">
      <div className="tongs-mode-row">
        <ModeButton
          active={mode === "sessions"}
          label="Recording Sessions"
          onClick={() => setModeAndPersist("sessions")}
        />
        <ModeButton
          active={mode === "calendar"}
          label="Calendar"
          onClick={() => setModeAndPersist("calendar")}
        />
        <ModeButton
          active={mode === "team"}
          label="Team"
          onClick={() => setModeAndPersist("team")}
        />
        <ModeButton
          active={mode === "storage"}
          label="Storage"
          onClick={() => setModeAndPersist("storage")}
        />
        <ModeButton
          active={mode === "release"}
          label="Release Prep"
          onClick={() => setModeAndPersist("release")}
        />
      </div>
      {mode === "calendar"
        ? <TongsCalendar />
        : mode === "team"
        ? <TongsTeam />
        : mode === "storage"
        ? <TongsStorage />
        : mode === "release"
        ? <TongsReleasePrep />
        : <TongsRecordingSessions />}
    </div>
  );
}
