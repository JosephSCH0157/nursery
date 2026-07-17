import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import TongsCalendar from "./TongsCalendar";
import TongsReleasePrep from "./TongsReleasePrep";
import TongsRecordingSessions from "./TongsRecordingSessions";
import TongsStorage from "./TongsStorage";
import TongsBranding from "./TongsBranding";
import "./Tongs.css";

type TongsMode = "calendar" | "sessions" | "release" | "storage" | "branding";
type TongsRouteMode = TongsMode | "team";

const MODE_STORAGE_KEY = "forge_tongs_mode_v1";

function readStoredMode(): TongsMode {
  if (typeof window === "undefined") return "sessions";
  try {
    const raw = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (raw === "calendar" || raw === "sessions" || raw === "release" || raw === "storage" || raw === "branding") {
      return raw;
    }
    if (raw === "team") return "sessions";
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

function readModeFromSearch(search: string): TongsRouteMode | null {
  const params = new URLSearchParams(search);
  const raw = params.get("mode")?.trim().toLowerCase() ?? "";
  if (raw === "calendar" || raw === "sessions" || raw === "team" || raw === "release" || raw === "storage" || raw === "branding") {
    return raw;
  }
  return null;
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
  const location = useLocation();
  const routeMode = readModeFromSearch(location.search);
  const [mode, setMode] = useState<TongsMode>(() => (routeMode === "team" ? "sessions" : (routeMode ?? readStoredMode())));
  const activeMode = routeMode === "team" ? "sessions" : (routeMode ?? mode);

  const orgTeamsHref = (() => {
    const params = new URLSearchParams(location.search);
    params.delete("mode");
    const search = params.toString();
    return search ? `/app/settings/org/teams?${search}` : "/app/settings/org/teams";
  })();

  const setModeAndPersist = (nextMode: TongsMode) => {
    setMode(nextMode);
    writeStoredMode(nextMode);
  };

  if (routeMode === "team") {
    return <Navigate to={orgTeamsHref} replace />;
  }

  return (
    <div className="tongs-page">
      <div className="tongs-mode-row">
        <ModeButton
          active={activeMode === "branding"}
          label="Branding"
          onClick={() => setModeAndPersist("branding")}
        />
        <ModeButton
          active={activeMode === "sessions"}
          label="Recording Sessions"
          onClick={() => setModeAndPersist("sessions")}
        />
        <ModeButton
          active={activeMode === "calendar"}
          label="Calendar"
          onClick={() => setModeAndPersist("calendar")}
        />
        <ModeButton
          active={activeMode === "storage"}
          label="Storage"
          onClick={() => setModeAndPersist("storage")}
        />
        <ModeButton
          active={activeMode === "release"}
          label="Release Prep"
          onClick={() => setModeAndPersist("release")}
        />
        <Link className="tongs-mode-link" to={orgTeamsHref}>
          Org Teams
        </Link>
      </div>
      {activeMode === "calendar"
        ? <TongsCalendar />
        : activeMode === "storage"
        ? <TongsStorage />
        : activeMode === "release"
        ? <TongsReleasePrep />
        : activeMode === "branding"
        ? <TongsBranding />
        : <TongsRecordingSessions />}
    </div>
  );
}
