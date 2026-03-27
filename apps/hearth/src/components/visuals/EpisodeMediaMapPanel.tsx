import { useMemo } from "react";
import type { EpisodeMediaMapEntry } from "../../lib/episode-package-v2";

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
  { value: "images_cdc", label: "Images + Reference Clips" },
  { value: "full_media_plan", label: "Full media plan" },
];

function formatMediaKindLabel(kind: string): string {
  if (kind === "b_roll") return "B-roll";
  if (kind === "contextual_data_composite" || kind === "reference_clip") return "Reference Clip";
  return "Image";
}

function resolveEntryClassificationReason(entry: EpisodeMediaMapEntry): string {
  const lowerIntent = (entry.intent ?? "").toLowerCase();
  const lowerDescription = (entry.description ?? "").toLowerCase();
  const lowerTarget = (entry.anchor?.target ?? "").toLowerCase();
  const mergedText = `${lowerIntent} ${lowerDescription} ${lowerTarget}`;

  if (entry.final_media_kind === "image") {
    if (lowerIntent.includes("thumbnail_concept") || lowerTarget.startsWith("thumbnail:")) {
      return "Thumbnail concept anchor";
    }
    if (entry.anchor.mode === "section_marker") {
      return "Section-level visual context";
    }
    return "Narrative still-image support";
  }

  if (entry.final_media_kind === "b_roll") {
    if (lowerIntent.includes("map")) return "Geography/movement context";
    if (lowerIntent.includes("timeline")) return "Sequence or progression cue";
    if (lowerIntent.includes("data_visual")) return "Data explained through motion";
    if (/\b(walk|drive|move|turn|load|build|open|close|enter|exit|record|show)\b/.test(mergedText)) {
      return "Action/process moment";
    }
    return "Motion-based narrative support";
  }

  if (entry.final_media_kind === "contextual_data_composite") {
    if (/\b(percent|%|increase|decrease|higher|lower|versus|vs\.?)\b/.test(mergedText)) {
      return "Comparison/metric claim";
    }
    if (/\b(year|years|timeline|before|after|since)\b/.test(mergedText)) {
      return "Time-series context";
    }
    if (/\b(state|county|city|region|country|map)\b/.test(mergedText)) {
      return "Geographic context";
    }
    return "Reference clip with structured context";
  }

  return "Classifier heuristic";
}

export default function EpisodeMediaMapPanel(props: EpisodeMediaMapPanelProps) {
  const selectedEntry = useMemo(
    () => props.entries.find((entry) => entry.id === props.selectedEntryId) ?? null,
    [props.entries, props.selectedEntryId],
  );
  const selectedEntryReason = useMemo(
    () => (selectedEntry ? resolveEntryClassificationReason(selectedEntry) : null),
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
            Activate this media plan to finalize beat decisions and route image, B-roll, and reference clip cues to their fulfillment paths.
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
          <button type="button" className="hs-secondary-btn" onClick={props.onGenerateFromPlans} disabled={props.disabled}>
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
              <div className="hs-imap-entry-meta">{formatMediaKindLabel(entry.final_media_kind)} · {entry.anchor.mode} · {entry.source.status}</div>
              <div className="hs-imap-entry-meta">Reason: {resolveEntryClassificationReason(entry)}</div>
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
                <label>Description</label>
                <textarea value={props.draft.description} onChange={(event) => props.onDraftChange("description", event.target.value)} disabled={props.disabled} rows={2} />
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
                {selectedEntryReason ? (
                  <div className="hs-imap-help-text">Classification reason: {selectedEntryReason}</div>
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
