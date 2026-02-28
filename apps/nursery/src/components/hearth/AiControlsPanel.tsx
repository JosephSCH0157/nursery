import * as React from "react";
import type { AiBehavior, AiLane } from "../../lib/hearth/ai-settings";
import {
  loadAiSettings,
  saveAiSettings,
  clearByoKey,
  hasByoKey,
} from "../../lib/hearth/ai-settings";

type Props = {
  onClose: () => void;
};

export function AiControlsPanel({ onClose }: Props) {
  const [settings, setSettings] = React.useState(() => loadAiSettings());
  const [keyDraft, setKeyDraft] = React.useState(settings.byoKey ?? "");
  const keyOk = hasByoKey();

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

      <div className="forge-ai-panel__footer">
        <button type="button" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
