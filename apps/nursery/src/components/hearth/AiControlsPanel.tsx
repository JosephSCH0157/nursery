import * as React from "react";
import type { AiBehavior, AiLane } from "../../lib/hearth/ai-settings";
import {
  loadAiSettings,
  saveAiSettings,
  clearByoKey,
  hasByoKey,
} from "../../lib/hearth/ai-settings";
import {
  getStyleInsights,
  getWorkspaceFeatures,
  isAdaptiveStyleAccelerateEnabled,
  isAdaptiveStyleEnabled,
  isStyleAlignmentPaused,
  resetStyleProfile,
  setStyleAlignmentPaused,
  type WorkspaceFeatures,
} from "@hearth/lib/hearth-style-service";

type Props = {
  onClose: () => void;
  workspaceId?: string | null;
  workspaceRole?: string | null;
};

function roleCanManageFeatures(role: string | null | undefined): boolean {
  return role === "admin" || role === "owner";
}

function confidenceLabel(scriptCount: number): "Emerging" | "Established" {
  return scriptCount >= 8 ? "Established" : "Emerging";
}

export function AiControlsPanel({ onClose, workspaceId = null, workspaceRole = null }: Props) {
  const [settings, setSettings] = React.useState(() => loadAiSettings());
  const [keyDraft, setKeyDraft] = React.useState(settings.byoKey ?? "");
  const keyOk = hasByoKey();
  const [features, setFeatures] = React.useState<WorkspaceFeatures | null>(null);
  const [featuresLoading, setFeaturesLoading] = React.useState(false);
  const [featuresError, setFeaturesError] = React.useState<string | null>(null);
  const [insightsOpen, setInsightsOpen] = React.useState(false);
  const [insightsLoading, setInsightsLoading] = React.useState(false);
  const [insightsError, setInsightsError] = React.useState<string | null>(null);
  const [insightsLines, setInsightsLines] = React.useState<string[]>([]);
  const [insightsMeta, setInsightsMeta] = React.useState<{
    scriptsAnalyzedCount: number;
    confidence: "Emerging" | "Established";
  } | null>(null);
  const [alignmentPaused, setAlignmentPaused] = React.useState(() => isStyleAlignmentPaused(workspaceId));
  const [resetBusy, setResetBusy] = React.useState(false);
  const [resetNotice, setResetNotice] = React.useState<string | null>(null);
  const canManageFeatures = roleCanManageFeatures(workspaceRole);

  React.useEffect(() => {
    setAlignmentPaused(isStyleAlignmentPaused(workspaceId));
  }, [workspaceId]);

  React.useEffect(() => {
    let cancelled = false;
    setInsightsOpen(false);
    setInsightsError(null);
    setInsightsLines([]);
    setInsightsMeta(null);
    setResetNotice(null);

    if (!workspaceId) {
      setFeatures(null);
      setFeaturesError(null);
      return () => {
        cancelled = true;
      };
    }

    setFeaturesLoading(true);
    setFeaturesError(null);
    void getWorkspaceFeatures(workspaceId, { force: true })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setFeatures(null);
          setFeaturesError(result.error);
          return;
        }
        setFeatures(result.data);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load workspace features.";
        setFeaturesError(message);
      })
      .finally(() => {
        if (cancelled) return;
        setFeaturesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  function updateLane(lane: AiLane) {
    const next = { ...settings, lane };
    setSettings(next);
    saveAiSettings(next);
  }

  function updateBehavior(behavior: AiBehavior) {
    const next = { ...settings, behavior };
    setSettings(next);
    saveAiSettings(next);
  }

  function updateAutoApproveImageSpend(enabled: boolean) {
    const next = { ...settings, autoApproveImageSpend: enabled };
    setSettings(next);
    saveAiSettings(next);
  }

  function saveKey() {
    const next = { ...settings, byoKey: keyDraft };
    setSettings(next);
    saveAiSettings(next);
  }

  function clearKey() {
    clearByoKey();
    const next = loadAiSettings();
    setSettings(next);
    setKeyDraft("");
  }

  function toggleAlignmentPause() {
    const next = !alignmentPaused;
    setStyleAlignmentPaused(workspaceId, next);
    setAlignmentPaused(next);
  }

  async function onViewStyleInsights() {
    if (!workspaceId) return;
    if (insightsLoading) return;
    setInsightsLoading(true);
    setInsightsError(null);
    setResetNotice(null);
    try {
      const result = await getStyleInsights(workspaceId);
      if (!result.ok) {
        setInsightsError(result.error);
        return;
      }
      if (!result.enabled) {
        setInsightsError(null);
        setInsightsMeta(null);
        setInsightsLines([]);
        setInsightsOpen(false);
        return;
      }
      const scriptsAnalyzedCount = result.profile?.scriptsAnalyzedCount ?? 0;
      setInsightsMeta({
        scriptsAnalyzedCount,
        confidence: confidenceLabel(scriptsAnalyzedCount),
      });
      setInsightsLines(result.insights);
      setInsightsOpen(true);
    } finally {
      setInsightsLoading(false);
    }
  }

  async function onResetStyleProfile() {
    if (!workspaceId || resetBusy) return;
    const confirmed = window.confirm("Reset adaptive style profile for this workspace?");
    if (!confirmed) return;
    setResetBusy(true);
    setResetNotice(null);
    setInsightsError(null);
    try {
      const result = await resetStyleProfile(workspaceId);
      if (!result.ok) {
        setResetNotice(result.error);
        return;
      }
      setInsightsMeta({
        scriptsAnalyzedCount: 0,
        confidence: "Emerging",
      });
      setInsightsLines([]);
      setInsightsOpen(true);
      setResetNotice(result.data ? "Style profile reset." : "Style profile already empty.");
    } finally {
      setResetBusy(false);
    }
  }

  const alignmentEnabled = isAdaptiveStyleEnabled(features);
  const accelerateEnabled = isAdaptiveStyleAccelerateEnabled(features);

  return (
    <div className="forge-ai-panel">
      <div className="forge-ai-panel__header">
        <div className="forge-ai-panel__title">AI Controls</div>
        <button type="button" className="forge-ai-panel__close" onClick={onClose} aria-label="Close">
          x
        </button>
      </div>

      <div className="forge-ai-panel__section">
        <div className="forge-ai-panel__label">Lane</div>
        <div className="forge-ai-panel__row">
          <label>
            <input
              type="radio"
              checked={settings.lane === "forge"}
              onChange={() => updateLane("forge")}
            />
            Forge-managed (dev key hidden)
          </label>
        </div>
        <div className="forge-ai-panel__row">
          <label>
            <input
              type="radio"
              checked={settings.lane === "byo"}
              onChange={() => updateLane("byo")}
            />
            Bring your own key
          </label>
        </div>
      </div>

      <div className="forge-ai-panel__section">
        <div className="forge-ai-panel__label">Provider</div>
        <div className="forge-ai-panel__row">
          <select disabled value="openai">
            <option value="openai">OpenAI</option>
          </select>
          <div className="forge-ai-panel__hint">More providers later.</div>
        </div>
      </div>

      <div className="forge-ai-panel__section">
        <div className="forge-ai-panel__label">API Key (BYO only)</div>
        <div className="forge-ai-panel__row">
          <input
            type="password"
            placeholder="sk-..."
            value={keyDraft}
            onChange={(event) => setKeyDraft(event.target.value)}
            disabled={settings.lane !== "byo"}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="forge-ai-panel__row">
          <button type="button" onClick={saveKey} disabled={settings.lane !== "byo"}>
            Save
          </button>
          <button type="button" onClick={clearKey} disabled={settings.lane !== "byo"}>
            Clear
          </button>
        </div>
      </div>

      <div className="forge-ai-panel__section">
        <div className="forge-ai-panel__label">Behavior</div>
        <div className="forge-ai-panel__row">
          <select
            value={settings.behavior}
            onChange={(event) => updateBehavior(event.target.value as AiBehavior)}
          >
            <option value="fast">Fast</option>
            <option value="careful">Careful</option>
            <option value="deterministic">Deterministic</option>
            <option value="creative">Creative</option>
          </select>
        </div>
      </div>

      <div className="forge-ai-panel__section">
        <div className="forge-ai-panel__label">Image Spend Confirmation</div>
        <div className="forge-ai-panel__row">
          <label>
            <input
              type="checkbox"
              checked={settings.autoApproveImageSpend === true}
              onChange={(event) => updateAutoApproveImageSpend(event.target.checked)}
            />
            Always approve thumbnail generation spend
          </label>
        </div>
      </div>

      <div className="forge-ai-panel__section">
        <div className="forge-ai-panel__label">Status</div>
        <div className="forge-ai-panel__row">
          {settings.lane === "forge" ? (
            <span>Using Forge dev key (hidden).</span>
          ) : keyOk ? (
            <span>BYO key saved.</span>
          ) : (
            <span>No BYO key set.</span>
          )}
        </div>
      </div>

      {!featuresLoading && !featuresError && workspaceId && alignmentEnabled ? (
        <div className="forge-ai-panel__section">
          <div className="forge-ai-panel__label">Adaptive Style Alignment</div>
          <div className="forge-ai-panel__style-status">
            <div className="forge-ai-panel__style-title">Growing with you</div>
            <div className="forge-ai-panel__style-confidence">
              Confidence: {insightsMeta?.confidence ?? "Emerging"}
            </div>
          </div>
          <div className="forge-ai-panel__row">
            <button
              type="button"
              onClick={() => void onViewStyleInsights()}
              disabled={insightsLoading}
            >
              {insightsLoading ? "Loading..." : "View Style Insights"}
            </button>
            {accelerateEnabled ? (
              <button type="button">
                Accelerate
              </button>
            ) : null}
            <button type="button" onClick={toggleAlignmentPause}>
              {alignmentPaused ? "Resume Alignment" : "Pause Alignment"}
            </button>
            <button type="button" onClick={() => void onResetStyleProfile()} disabled={resetBusy}>
              {resetBusy ? "Resetting..." : "Reset Profile"}
            </button>
          </div>
          {insightsError ? <div className="forge-ai-panel__hint">{insightsError}</div> : null}
          {resetNotice ? <div className="forge-ai-panel__hint">{resetNotice}</div> : null}
          {alignmentPaused ? (
            <div className="forge-ai-panel__hint">Alignment is paused on this device.</div>
          ) : null}
          {insightsOpen ? (
            <div className="forge-ai-panel__style-insights">
              <div className="forge-ai-panel__style-meta">
                Scripts analyzed: {insightsMeta?.scriptsAnalyzedCount ?? 0}
              </div>
              {insightsLines.length ? (
                <ul className="forge-ai-panel__style-list">
                  {insightsLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <div className="forge-ai-panel__hint">
                  No profile yet. Approve scripts to start learning your structure.
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {featuresLoading ? (
        <div className="forge-ai-panel__hint">Loading workspace features...</div>
      ) : null}
      {featuresError ? (
        <div className="forge-ai-panel__hint">{featuresError}</div>
      ) : null}
      {!workspaceId ? (
        <div className="forge-ai-panel__hint">Select a workspace to use adaptive style features.</div>
      ) : null}
      {workspaceId && !canManageFeatures ? (
        <div className="forge-ai-panel__hint">Workspace feature toggles are managed in Settings by Admin/Owner.</div>
      ) : null}

      <div className="forge-ai-panel__footer">
        <button type="button" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
