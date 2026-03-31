import { useEffect, useMemo, useState } from "react";
import type { EpisodeMediaMapEntry } from "../../lib/episode-package-v2";
import {
  buildMediaMapBeatCards,
  resolveMediaMapConversationSummary,
  type MediaMapConversationDirectionId,
  type MediaMapConversationSeed,
} from "../../lib/hearth-media-map-conversation";
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
  conversation: {
    state: "idle" | "loading" | "ready" | "error";
    seed: MediaMapConversationSeed | null;
    error: string | null;
    onBuildAndApply: (args: {
      directionId: MediaMapConversationDirectionId;
      constraintsText: string;
      derivedFromScript: boolean;
    }) => Promise<boolean>;
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

const FALLBACK_CONVERSATION: EpisodeMediaMapPanelProps["conversation"] = {
  state: "idle",
  seed: null,
  error: null,
  onBuildAndApply: async () => false,
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
const CONSTRAINT_CHIPS = [
  "Keep it simple.",
  "Only 2-3 generated clips.",
  "Heavier on B-roll than graphics.",
  "Avoid branded visuals.",
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

function appendConstraint(currentValue: string, nextValue: string): string {
  const trimmedCurrent = currentValue.trim();
  const trimmedNext = nextValue.trim();
  if (!trimmedCurrent) return trimmedNext;
  if (trimmedCurrent.toLowerCase().includes(trimmedNext.toLowerCase())) return trimmedCurrent;
  return `${trimmedCurrent} ${trimmedNext}`.trim();
}

function MediaMapAdvancedEditor(props: EpisodeMediaMapPanelProps & {
  selectedEntry: EpisodeMediaMapEntry | null;
  selectedEntryPurposeSummary: string | null;
}) {
  return (
    <div className="hs-imap-advanced-body">
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
          Build Draft From Plans
        </button>
        <button type="button" className="hs-secondary-btn" onClick={props.onActivateMap} disabled={props.disabled}>
          Activate Current Map
        </button>
        <button type="button" className="hs-secondary-btn" onClick={props.onAddEntry} disabled={props.disabled}>
          Add Entry
        </button>
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
          {!props.selectedEntry ? (
            <div className="hs-imap-empty">Select an entry to edit.</div>
          ) : (
            <>
              <div className="hs-imap-field-grid">
                <label>
                  Type
                  <select
                    value={props.draft.type === "reference_clip" ? "contextual_data_composite" : props.draft.type}
                    onChange={(event) => props.onDraftChange("type", event.target.value)}
                    disabled={props.disabled}
                  >
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
                {props.selectedEntryPurposeSummary ? (
                  <div className="hs-imap-help-text">
                    Purpose: {formatHearthVisualPurposeLabel(props.selectedEntry.purpose)}. {props.selectedEntryPurposeSummary}
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
    </div>
  );
}

export default function EpisodeMediaMapPanel(props: EpisodeMediaMapPanelProps) {
  const conversation = props.conversation ?? FALLBACK_CONVERSATION;
  const selectedEntry = useMemo(
    () => props.entries.find((entry) => entry.id === props.selectedEntryId) ?? null,
    [props.entries, props.selectedEntryId],
  );
  const selectedEntryPurposeSummary = useMemo(
    () => (selectedEntry ? resolveEntryPurposeSummary(selectedEntry) : null),
    [selectedEntry],
  );
  const beatCards = useMemo(() => buildMediaMapBeatCards(props.entries), [props.entries]);
  const [selectedDirectionId, setSelectedDirectionId] = useState<MediaMapConversationDirectionId | null>(null);
  const [constraintsText, setConstraintsText] = useState("");
  const [showPlanningConversation, setShowPlanningConversation] = useState(props.entries.length === 0);
  const [isConversationApplying, setIsConversationApplying] = useState(false);
  const selectedDirection = conversation.seed?.directions?.find((direction) => direction.id === selectedDirectionId) ?? null;
  const summary = useMemo(
    () => resolveMediaMapConversationSummary({
      entries: props.entries,
      directionId: selectedDirectionId,
      constraintsText,
      derivedFromScript: selectedDirectionId ? conversation.seed?.derivedFromScript : undefined,
    }),
    [constraintsText, conversation.seed?.derivedFromScript, props.entries, selectedDirectionId],
  );

  useEffect(() => {
    if (props.entries.length > 0 && !isConversationApplying) {
      setShowPlanningConversation(false);
    }
  }, [isConversationApplying, props.entries.length]);

  useEffect(() => {
    if (props.entries.length === 0) {
      setShowPlanningConversation(true);
    }
  }, [props.entries.length]);

  return (
    <div className="hs-imap-panel">
      <div className="hs-imap-header">
        <div>
          <h4 className="hs-imap-title">Episode Media Map</h4>
          <p className="hs-imap-subtitle">
            Producer-facing visual plan for Hammer. Script version: {props.scriptVersionLabel}
            {props.stale ? " (needs review)" : ""}
          </p>
          <p className="hs-imap-help-text">
            Hearth reads the current script, helps you choose a visual direction, then lays out and applies the plan in one move.
          </p>
        </div>
        <div className={`hs-imap-save-state is-${props.saveState}`}>
          {props.saveState}
        </div>
      </div>

      <div className="hs-imap-toolbar">
        <span className="hs-pill">{props.entries.length} mapped beat{props.entries.length === 1 ? "" : "s"}</span>
        <span className="hs-pill">Map: {props.mapStatus}</span>
        <span className="hs-pill">State: {props.saveState}</span>
      </div>

      {summary && props.entries.length > 0 ? (
        <section className="hs-imap-summary-band" aria-label="Applied media map summary">
          <div className="hs-imap-summary-copy">
            <div className="hs-imap-summary-title">Applied visual plan</div>
            <div className="hs-imap-summary-meta">
              <span>Direction: {summary.directionLabel}</span>
              <span>Constraints: {summary.constraintsLabel}</span>
              <span>{summary.sourceLabel}</span>
            </div>
          </div>
          <button
            type="button"
            className="hs-secondary-btn"
            onClick={() => setShowPlanningConversation((prev) => !prev)}
            disabled={props.disabled}
          >
            {showPlanningConversation ? "Hide planning conversation" : "Show planning conversation"}
          </button>
        </section>
      ) : null}

      {showPlanningConversation ? (
        <section className="hs-imap-conversation" aria-label="Media map planning conversation">
          <div className="hs-imap-conversation-bubble is-hearth">
            <div className="hs-imap-conversation-speaker">Hearth</div>
            <p>{conversation.seed?.lead ?? "I'm reading through the episode to find the cleanest visual package."}</p>
            <p>{conversation.seed?.ask ?? "Which direction feels closest for this visual plan?"}</p>
          </div>

          {conversation.error ? (
            <div className="hs-imap-help-text">
              {conversation.error} I can still lay this out if you choose the direction manually.
            </div>
          ) : null}

          <div className="hs-imap-direction-list" aria-label="Suggested visual directions">
            {(conversation.seed?.directions ?? []).map((direction) => (
              <button
                key={direction.id}
                type="button"
                className={`hs-imap-direction-chip${direction.id === selectedDirectionId ? " is-selected" : ""}`}
                onClick={() => setSelectedDirectionId(direction.id)}
                disabled={props.disabled || conversation.state === "loading" || isConversationApplying}
              >
                <span className="hs-imap-direction-chip-title">{direction.label}</span>
                <span className="hs-imap-direction-chip-copy">{direction.lead}</span>
              </button>
            ))}
          </div>

          {selectedDirection ? (
            <>
              <div className="hs-imap-conversation-bubble is-hearth">
                <div className="hs-imap-conversation-speaker">Hearth</div>
                <p>{selectedDirection.plan}</p>
                <p>Anything I should keep in mind before I lay this out?</p>
              </div>

              <label className="hs-field">
                <span className="hs-field-label">Optional constraints</span>
                <textarea
                  value={constraintsText}
                  onChange={(event) => setConstraintsText(event.target.value)}
                  rows={3}
                  placeholder="Keep it simple. Heavier on B-roll than graphics. Avoid branded visuals."
                  disabled={props.disabled || isConversationApplying}
                />
              </label>

              <div className="hs-imap-constraint-chips">
                {CONSTRAINT_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="hs-imap-constraint-chip"
                    onClick={() => setConstraintsText((current) => appendConstraint(current, chip))}
                    disabled={props.disabled || isConversationApplying}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              <div className="hs-imap-conversation-actions">
                <button
                  type="button"
                  className="hs-imap-primary-action"
                  disabled={props.disabled || isConversationApplying}
                  onClick={async () => {
                    if (!selectedDirectionId) return;
                    setIsConversationApplying(true);
                    const applied = await conversation.onBuildAndApply({
                      directionId: selectedDirectionId,
                      constraintsText,
                      derivedFromScript: Boolean(conversation.seed?.derivedFromScript),
                    });
                    setIsConversationApplying(false);
                    if (applied) {
                      setShowPlanningConversation(false);
                    }
                  }}
                >
                  {isConversationApplying ? "Building visual plan..." : "Go Ahead: Build Visual Plan"}
                </button>
                <div className="hs-imap-help-text">
                  This builds, applies, and persists the map in one action. Choosing a direction alone does not apply anything.
                </div>
              </div>
            </>
          ) : (
            <div className="hs-imap-help-text">Pick the direction that feels closest. Hearth will wait for your go-ahead before applying the plan.</div>
          )}
        </section>
      ) : null}

      <details className="hs-imap-advanced" aria-label="Advanced media map controls">
        <summary>Advanced / Fine Tune</summary>
        <MediaMapAdvancedEditor
          {...props}
          selectedEntry={selectedEntry}
          selectedEntryPurposeSummary={selectedEntryPurposeSummary}
        />
      </details>

      {props.entries.length === 0 ? (
        <div className="hs-imap-empty">No media map is applied yet.</div>
      ) : (
        <section className="hs-imap-beat-cards" aria-label="Mapped visual beats">
          {beatCards.map((card, index) => (
            <article key={card.id} className="hs-imap-beat-card">
              <div className="hs-imap-beat-card-header">
                <div>
                  <div className="hs-imap-beat-card-title">{card.title}</div>
                  <div className="hs-imap-beat-card-meta">Beat {index + 1} · {card.mediaKindLabel} · {card.purposeLabel}</div>
                </div>
              </div>
              <div className="hs-imap-beat-card-copy">{card.description}</div>
              <div className="hs-imap-beat-card-detail">
                <strong>What it is doing:</strong> {card.whatItDoes}
              </div>
              <div className="hs-imap-beat-card-detail">
                <strong>Why it is here:</strong> {card.whyHere}
              </div>
              <div className="hs-imap-beat-card-hold">{card.holdLabel}</div>
            </article>
          ))}
        </section>
      )}

      {props.saveError ? <div className="hs-error-text-small">{props.saveError}</div> : null}
      {props.message ? <div className="hs-imap-help-text">{props.message}</div> : null}
    </div>
  );
}
