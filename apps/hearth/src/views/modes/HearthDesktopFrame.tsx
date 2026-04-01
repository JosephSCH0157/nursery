import type { ReactNode } from "react";

type HearthMode = "sparks" | "episodes" | "ready" | "series" | "focus";
type UiDensity = "comfortable" | "compact";

type HearthDesktopFrameProps = {
  devMode: boolean;
  storeKind: string;
  workpieceId: string | null;
  isForging: boolean;
  onStartFromScratch: () => void | Promise<void>;
  onCreateDraft: () => void | Promise<void>;
  mode: HearthMode;
  onModeChange: (mode: HearthMode) => void;
  uiDensity: UiDensity;
  onUiDensityChange: (density: UiDensity) => void;
  railContent: ReactNode;
  mainContent: ReactNode;
};

export default function HearthDesktopFrame({
  devMode,
  storeKind,
  workpieceId,
  isForging,
  onStartFromScratch,
  onCreateDraft,
  mode,
  onModeChange,
  uiDensity,
  onUiDensityChange,
  railContent,
  mainContent,
}: HearthDesktopFrameProps) {
  return (
    <div className="hs-shell-grid">
      <aside className="hs-rail">
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
          <button type="button" onClick={() => void onStartFromScratch()} disabled={isForging}>
            New Workpiece
          </button>
          <button type="button" onClick={() => void onCreateDraft()}>
            New Draft
          </button>
        </div>

        <div className="hs-rail-section">
          <div className="hs-rail-heading">Modes</div>
          <button
            type="button"
            className={`hs-mode-button${mode === "sparks" ? " is-active" : ""}`}
            onClick={() => onModeChange("sparks")}
          >
            Sparks
          </button>
          <button
            type="button"
            className={`hs-mode-button${mode === "episodes" ? " is-active" : ""}`}
            onClick={() => onModeChange("episodes")}
          >
            Episodes (In Progress)
          </button>
          <button
            type="button"
            className={`hs-mode-button${mode === "ready" ? " is-active" : ""}`}
            onClick={() => onModeChange("ready")}
          >
            Ready
          </button>
          <button
            type="button"
            className={`hs-mode-button${mode === "series" ? " is-active" : ""}`}
            onClick={() => onModeChange("series")}
          >
            Series
          </button>
        </div>

        <div className="hs-rail-section">
          <label className="hs-rail-label" htmlFor="hs-density-select">Density</label>
          <select
            id="hs-density-select"
            aria-label="UI density"
            value={uiDensity}
            onChange={(event) => onUiDensityChange(event.target.value === "compact" ? "compact" : "comfortable")}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </div>

        {railContent}
      </aside>

      <main className="hs-main">
        {mainContent}
      </main>
    </div>
  );
}
