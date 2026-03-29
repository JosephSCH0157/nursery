import { useMemo } from "react";
import type { EpisodeMediaMapEntry } from "../../lib/episode-package-v2";
import { formatHearthVisualPurposeLabel } from "../../lib/hearth-visual-purpose";

type EpisodeMediaMapPanelProps = {
  entries: EpisodeMediaMapEntry[];
  selectedEntryId: string | null;
  scriptVersionLabel: string;
  mapStatus: string;
  stale: boolean;
  saveState: "saved" | "editing" | "saving" | "error";
  saveError: string | null;
  message: string | null;
  disabled?: boolean;
  generationScope: string;
  draft: {
    type: string;
    anchorMode: string;
    anchorTarget: string;
    inOffsetSec: string;
    durationSec: string;
    description: string;
    intent: string;
    sourceStatus: string;
    sourceAssetId: string;
    confidence: string;
    optional: boolean;
    critical: boolean;
  };
  onSelectEntry: (id: string) => void;
  onDraftChange: (field: string, value: string | boolean) => void;
  onGenerationScopeChange: (value: string) => void;
  onGenerateFromPlans: () => void;
  onActivateMap: () => void;
  onAddEntry: () => void;
  onSaveEntry: () => void;
  onDeleteEntry: () => void;
};

const TYPES = ["image", "b_roll", "contextual_data_composite"];
const ANCHOR_MODES = ["line_anchor", "phrase_match", "speaker_turn", "section_marker", "absolute_time"];
const SOURCE_STATUS = ["unresolved", "selected", "attached"];
const CONFIDENCE = ["high", "medium", "low"];
const GENERATION_SCOPES = [
  { value: "images_only", label: "Images only" },
  { value: "images_broll", label: "Images + B-roll" },
  { value: "images_reference_clips", label: "Images + Reference Clips" },
  { value: "full_media_plan", label: "Full media plan" },
];

function formatMediaKindLabel(kind: string): string {
  if (kind === "b_roll") return "B-roll";
  if (kind === "contextual_data_composite" || kind === "reference_clip") return "Reference Clip";
  return "Image";
}

function resolveEntryPurposeSummary(entry: EpisodeMediaMapEntry): string {
  if (entry.purpose === "emphasis") return "Key visual or hero moment";
  if (entry.purpose === "explanation") return "Explains context, comparison, or structure";
  return "Covers motion, mood, or narrative support";
}

export default function EpisodeMediaMapPanel(props: EpisodeMediaMapPanelProps) {
  const selectedEntry = useMemo(
    () => props.entries.find((entry) => entry.id === props.selectedEntryId) ?? null,
    [props.entries, props.selectedEntryId],
  );
  const selectedEntryPurposeSummary = useMemo(
    () => (selectedEntry ? resolveEntryPurposeSummary(selectedEntry) : null),
    [selectedEntry],
  );

  return (
    <div className="hs-imap-panel">
      <div className="hs-imap-header">
        <div>
          <h4 className="hs-imap-title">Episode Media Map</h4>
          <p className="hs-imap-subtitle">
            Canonical visual intent map for Hammer. Script version: {props.scriptVersionLabel}
            {props.stale ? " (needs review)" : ""}
          </p>
          <p className="hs-imap-help-text">
            This reflects the current thumbnail, Timeline Images, B-roll, and Reference Clip plans. Activate it when those lanes are ready to hand off.
          </p>
        </div>
        <div className="hs-imap-candidate-action-group">
          <label>
            Plan Scope
            <select
              value={props.generationScope}
              onChange={(event) => props.onGenerationScopeChange(event.target.value)}
              disabled={props.disabled}
            >
              {GENERATION_SCOPES.map((scope) => (
                <option key={scope.value} value={scope.value}>{scope.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="hs-primary-btn" onClick={props.onGenerateFromPlans} disabled={props.disabled}>
            Generate Episode Media Map
          </button>
          <button type="button" className="hs-secondary-btn" onClick={props.onActivateMap} disabled={props.disabled}>
            Activate Media Plan
          </button>
          <button type="button" className="hs-secondary-btn" onClick={props.onAddEntry} disabled={props.disabled}>
            Add Entry
          </button>
        </div>
      </div>

      <div className="hs-imap-toolbar">
        <span className="hs-pill">{props.entries.length} entry{props.entries.length === 1 ? "" : "ies"}</span>
        <span className="hs-pill">Map: {props.mapStatus}</span>
        <span className="hs-pill">State: {props.saveState}</span>
      </div>

      <div className="hs-imap-grid">
        <section className="hs-imap-list" aria-label="Episode media map entries">
          {props.entries.length === 0 ? (
            <div className="hs-imap-empty">No media map entries yet.</div>
          ) : props.entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`hs-imap-entry${entry.id === props.selectedEntryId ? " is-selected" : ""}`}
              onClick={() => props.onSelectEntry(entry.id)}
              disabled={props.disabled}
            >
              <div className="hs-imap-entry-title">{entry.description || entry.anchor.target || "Untitled entry"}</div>
              <div className="hs-imap-entry-meta">{formatMediaKindLabel(entry.final_media_kind)} · {formatHearthVisualPurposeLabel(entry.purpose)} · {entry.anchor.mode}</div>
              <div className="hs-imap-entry-meta">{resolveEntryPurposeSummary(entry)}</div>
            </button>
          ))}
        </section>

        <section className="hs-imap-editor" aria-label="Episode media map editor">
          {!selectedEntry ? (
            <div className="hs-imap-empty">Select an entry to edit.</div>
          ) : (
            <>
              <div className="hs-imap-field-grid">
                <label>
                  Type
                  <select value={props.draft.type} onChange={(event) => props.onDraftChange("type", event.target.value)} disabled={props.disabled}>
                    {TYPES.map((value) => <option key={value} value={value}>{formatMediaKindLabel(value)}</option>)}
                  </select>
                </label>
                <label>
                  Anchor Mode
                  <select value={props.draft.anchorMode} onChange={(event) => props.onDraftChange("anchorMode", event.target.value)} disabled={props.disabled}>
                    {ANCHOR_MODES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  Anchor Target
                  <input value={props.draft.anchorTarget} onChange={(event) => props.onDraftChange("anchorTarget", event.target.value)} disabled={props.disabled} />
                </label>
              </div>

              <div className="hs-imap-field-grid">
                <label>
                  In Offset (sec)
                  <input value={props.draft.inOffsetSec} onChange={(event) => props.onDraftChange("inOffsetSec", event.target.value)} disabled={props.disabled} />
                </label>
                <label>
                  Duration (sec)
                  <input value={props.draft.durationSec} onChange={(event) => props.onDraftChange("durationSec", event.target.value)} disabled={props.disabled} />
                </label>
                <label>
                  Confidence
                  <select value={props.draft.confidence} onChange={(event) => props.onDraftChange("confidence", event.target.value)} disabled={props.disabled}>
                    {CONFIDENCE.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>

              <div className="hs-imap-field">
                <label htmlFor="description-textarea">Description</label>
                <textarea id="description-textarea" value={props.draft.description} onChange={(event) => props.onDraftChange("description", event.target.value)} disabled={props.disabled} rows={2} />
              </div>

              <div className="hs-imap-field-grid">
                <label>
                  Intent
                  <input value={props.draft.intent} onChange={(event) => props.onDraftChange("intent", event.target.value)} disabled={props.disabled} />
                </label>
                <label>
                  Source Status
                  <select value={props.draft.sourceStatus} onChange={(event) => props.onDraftChange("sourceStatus", event.target.value)} disabled={props.disabled}>
                    {SOURCE_STATUS.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  Source Asset ID
                  <input value={props.draft.sourceAssetId} onChange={(event) => props.onDraftChange("sourceAssetId", event.target.value)} disabled={props.disabled} />
                </label>
              </div>

              <div className="hs-imap-candidate-toolbar hs-imap-candidate-toolbar-actions">
                {selectedEntryPurposeSummary ? (
                  <div className="hs-imap-help-text">
                    Purpose: {formatHearthVisualPurposeLabel(selectedEntry.purpose)}. {selectedEntryPurposeSummary}
                  </div>
                ) : null}
                <label className="hs-checkbox">
                  <input
                    type="checkbox"
                    checked={props.draft.optional}
                    onChange={(event) => props.onDraftChange("optional", event.target.checked)}
                    disabled={props.disabled}
                  />
                  Optional
                </label>
                <label className="hs-checkbox">
                  <input
                    type="checkbox"
                    checked={props.draft.critical}
                    onChange={(event) => props.onDraftChange("critical", event.target.checked)}
                    disabled={props.disabled}
                  />
                  Critical
                </label>
                <div className="hs-imap-candidate-action-group">
                  <button type="button" onClick={props.onSaveEntry} disabled={props.disabled}>Save Entry</button>
                  <button type="button" onClick={props.onDeleteEntry} disabled={props.disabled}>Delete Entry</button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {props.saveError ? <div className="hs-error-text-small">{props.saveError}</div> : null}
      {props.message ? <div className="hs-imap-help-text">{props.message}</div> : null}
    </div>
  );
}
