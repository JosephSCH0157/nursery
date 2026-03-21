import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import type { HammerEditPlan, HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { MediaRef, WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import { createSemanticEditPlanSignature } from "../lib/editPlanSignature";
import type { HammerWorkspaceSnapshot } from "./hammerWorkspaceSnapshot";
import type {
  HammerPersistedAudioPolish,
  HammerPersistedStructuredTranscript,
  HammerPersistedVisualPlacements,
} from "../persistence/hammerPersistenceContract";
import type { HammerPreparedNextStepActionId } from "./hammerPreparedHandoff";
import {
  moveSegmentTiming,
  resolveFocusAfterPlayheadChange,
  resolvePreviewLabel,
  resolvePlayheadSegment,
  resolveWorkspaceFocusMode,
  roundToTenth,
  trimSegmentEndTiming,
  trimSegmentStartTiming,
  updateSegmentInTimeline,
  type HammerWorkspaceFocusOverride,
  type HammerWorkspaceToolId,
} from "./hammerWorkspaceTimeline";
import "./HammerWorkspaceShell.css";

const TOOLBAR_WIDTH_PX = 72;
const PREVIEW_BAY_MAX_WIDTH_PX = 460;
const TIMELINE_DOCK_BASELINE_HEIGHT_PX = 376;
const TIMELINE_DOCK_TIME_FOCUS_HEIGHT_PX = 504;

type HammerToolId = HammerWorkspaceToolId;
type HammerSourceTabId = "transcript" | "images" | "assets" | "broll";

type HammerWorkspaceShellProps = {
  launchContext?: HammerLaunchContext;
  structuredTranscript?: HammerPersistedStructuredTranscript | null;
  visualPlacements?: HammerPersistedVisualPlacements | null;
  audioPolish?: HammerPersistedAudioPolish | null;
  releasePrepHref?: string | null;
  selectedMacroRecipeRef?: string | null;
  lastMacroRunRef?: string | null;
  prepHandoffAction?: {
    id: Exclude<HammerPreparedNextStepActionId, "export_later">;
    token: number;
  } | null;
  onWorkspaceSnapshotChange?: (snapshot: HammerWorkspaceSnapshot) => void;
};

const SOURCE_TABS: Array<{ id: HammerSourceTabId; label: string }> = [
  { id: "transcript", label: "Transcript" },
  { id: "images", label: "Images" },
  { id: "assets", label: "Assets" },
  { id: "broll", label: "B-roll" },
];

const TOOL_ORDER: Array<{ id: HammerToolId; shortLabel: string; label: string }> = [
  { id: "polish", shortLabel: "P", label: "Polish" },
  { id: "audio", shortLabel: "A", label: "Audio" },
  { id: "video", shortLabel: "V", label: "Video" },
  { id: "captions", shortLabel: "C", label: "Captions" },
  { id: "details", shortLabel: "D", label: "Details" },
  { id: "finishing", shortLabel: "F", label: "Finishing" },
  { id: "export", shortLabel: "E", label: "Export" },
];

function readTranscriptSegments(
  launchContext: HammerLaunchContext,
  structuredTranscript: HammerPersistedStructuredTranscript | null,
): HammerTranscriptSegment[] {
  if (structuredTranscript?.segments?.length) {
    return structuredTranscript.segments.map((segment) => ({ ...segment }));
  }

  if (launchContext.transcript.kind === "tongs-stub") {
    return launchContext.transcript.segments.map((segment) => ({ ...segment }));
  }

  return [];
}

function resolveMediaRef(launchContext: HammerLaunchContext): MediaRef | null {
  if (launchContext.media.kind === "mapped-local" || launchContext.media.kind === "tongs-stub") {
    return { ...launchContext.media.ref };
  }
  return null;
}

function resolveWorkspaceMapping(launchContext: HammerLaunchContext): WorkspaceMediaMapping | null {
  if (launchContext.media.kind === "tongs-stub") {
    return launchContext.media.workspace_mapping ? { ...launchContext.media.workspace_mapping } : null;
  }
  return null;
}

function createFallbackEditPlan(
  launchContext: HammerLaunchContext,
  transcriptSourceId: string,
  previewMode: HammerPreviewMode,
): HammerEditPlan {
  const now = new Date().toISOString();
  const sessionId = launchContext.session_id ?? `${launchContext.workpiece_id}:session`;
  return {
    edit_plan_id: `${launchContext.workpiece_id}:plan`,
    version: "1",
    created_at: now,
    updated_at: now,
    source_transcript_id: transcriptSourceId,
    instructions: [],
    preview_mode: previewMode,
    workspace_id: launchContext.workspace_id,
    workpiece_id: launchContext.workpiece_id,
    session_id: sessionId,
  };
}

export default function HammerWorkspaceShell(props: HammerWorkspaceShellProps): JSX.Element {
  if (!props.launchContext) {
    return (
      <section className="hammer-workspace-shell__missing-context">
        <h2>Hammer needs a workpiece context.</h2>
        <p>Select a workpiece from the Hammer library to open the workspace shell.</p>
      </section>
    );
  }

  const launchContext = props.launchContext;
  const transcriptSegments = useMemo(
    () => readTranscriptSegments(launchContext, props.structuredTranscript ?? null),
    [launchContext, props.structuredTranscript],
  );
  const transcriptSourceId = props.structuredTranscript?.transcript_id
    ?? (launchContext.transcript.kind === "tongs-stub" ? launchContext.transcript.transcript_id : "runtime-transcript");

  const [selectedSourceTab, setSelectedSourceTab] = useState<HammerSourceTabId>("transcript");
  const [activeTool, setActiveTool] = useState<HammerToolId>("polish");
  const [editableTranscriptSegments, setEditableTranscriptSegments] = useState<HammerTranscriptSegment[]>(
    () => transcriptSegments,
  );
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(transcriptSegments[0]?.segment_id ?? null);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [focusOverride, setFocusOverride] = useState<HammerWorkspaceFocusOverride>("auto");
  const [polishStrength, setPolishStrength] = useState(60);
  const [audioLevelingEnabled, setAudioLevelingEnabled] = useState(true);
  const [audioNoiseReductionEnabled, setAudioNoiseReductionEnabled] = useState(true);
  const [videoSnapMode, setVideoSnapMode] = useState<"timeline" | "segment">("timeline");
  const [captionStyle, setCaptionStyle] = useState<"sentence" | "title" | "upper">("sentence");
  const [detailTag, setDetailTag] = useState("main-edit");
  const [finishingChecklist, setFinishingChecklist] = useState({
    transcriptReviewed: false,
    visualsReviewed: false,
    audioReviewed: false,
  });
  const lastHandledHandoffTokenRef = useRef<number | null>(null);

  const previewMode: HammerPreviewMode = launchContext.preview_mode ?? launchContext.edit_plan?.preview_mode ?? "edit-aware";
  const workspaceFocusMode = focusOverride === "auto" ? resolveWorkspaceFocusMode(activeTool) : focusOverride;
  const mediaRef = resolveMediaRef(launchContext);
  const workspaceMapping = resolveWorkspaceMapping(launchContext);
  const mediaSourceLabel = launchContext.media.kind === "dev-tone"
    ? "Dev tone"
    : launchContext.media.label ?? mediaRef?.local_relpath ?? null;

  const selectedSegment = editableTranscriptSegments.find((segment) => segment.segment_id === selectedSegmentId) ?? null;
  const playheadSegment = resolvePlayheadSegment(editableTranscriptSegments, playheadSec);
  const transcriptDurationSec = Math.max(
    editableTranscriptSegments.reduce((maxEndSec, segment) => Math.max(maxEndSec, segment.end_sec), 0),
    32,
  );

  useEffect(() => {
    setEditableTranscriptSegments(transcriptSegments);
    setSelectedSegmentId((current) => {
      if (!transcriptSegments.length) return null;
      if (current && transcriptSegments.some((segment) => segment.segment_id === current)) {
        return current;
      }
      return transcriptSegments[0]?.segment_id ?? null;
    });
  }, [transcriptSegments, transcriptSourceId]);

  function updateSegmentTiming(
    segmentId: string,
    updater: (segment: HammerTranscriptSegment) => HammerTranscriptSegment,
  ): void {
    setEditableTranscriptSegments((current) => updateSegmentInTimeline(current, segmentId, updater));
  }

  function moveSegment(segmentId: string, deltaSec: number): void {
    updateSegmentTiming(segmentId, (segment) => moveSegmentTiming(segment, deltaSec));
    setPlayheadSec((current) => Math.max(0, roundToTenth(current + deltaSec)));
  }

  function trimSegmentStart(segmentId: string, deltaSec: number): void {
    updateSegmentTiming(segmentId, (segment) => trimSegmentStartTiming(segment, deltaSec));
    setPlayheadSec((current) => Math.max(0, roundToTenth(current + deltaSec)));
  }

  function trimSegmentEnd(segmentId: string, deltaSec: number): void {
    updateSegmentTiming(segmentId, (segment) => trimSegmentEndTiming(segment, deltaSec));
  }

  useEffect(() => {
    if (!props.prepHandoffAction) return;
    if (props.prepHandoffAction.token === lastHandledHandoffTokenRef.current) return;

    lastHandledHandoffTokenRef.current = props.prepHandoffAction.token;

    switch (props.prepHandoffAction.id) {
      case "review_transcript":
      case "begin_manual_editing":
        setSelectedSourceTab("transcript");
        setFocusOverride("source-focus");
        break;
      case "review_visuals":
        setSelectedSourceTab("images");
        setActiveTool("video");
        setFocusOverride("tool-focus");
        break;
      case "review_audio":
        setActiveTool("audio");
        setFocusOverride("tool-focus");
        break;
      case "review_macros":
        setActiveTool("finishing");
        setFocusOverride("tool-focus");
        break;
      default:
        break;
    }
  }, [props.prepHandoffAction]);

  useEffect(() => {
    if (!props.onWorkspaceSnapshotChange) return;

    const editPlan = launchContext.edit_plan
      ? {
        ...launchContext.edit_plan,
        instructions: launchContext.edit_plan.instructions.map((instruction) => ({ ...instruction })),
      }
      : createFallbackEditPlan(launchContext, transcriptSourceId, previewMode);

    const snapshot: HammerWorkspaceSnapshot = {
      workspaceId: launchContext.workspace_id,
      workpieceId: launchContext.workpiece_id,
      sessionId: launchContext.session_id ?? editPlan.session_id ?? `${launchContext.workpiece_id}:session`,
      sourceMode: launchContext.source_mode,
      previewMode,
      editPlanStatus: "clean",
      editPlanSignature: createSemanticEditPlanSignature(transcriptSourceId, previewMode, editPlan.instructions),
      transcriptSourceId: transcriptSourceId,
      transcriptSegments: editableTranscriptSegments,
      selectedSegmentId,
      selectedOverlayRowId: selectedSegmentId,
      mediaRef,
      workspaceMapping,
      mediaSourceLabel,
      selectedMacroRecipeRef: props.selectedMacroRecipeRef ?? null,
      lastMacroRunRef: props.lastMacroRunRef ?? null,
      structuredTranscript: props.structuredTranscript ?? null,
      editPlan,
      visualPlacements: props.visualPlacements ?? null,
      audioPolish: props.audioPolish ?? null,
    };

    props.onWorkspaceSnapshotChange(snapshot);
  }, [
    launchContext,
    mediaRef,
    mediaSourceLabel,
    previewMode,
    props.audioPolish,
    props.lastMacroRunRef,
    props.onWorkspaceSnapshotChange,
    props.selectedMacroRecipeRef,
    props.structuredTranscript,
    props.visualPlacements,
    selectedSegmentId,
    editableTranscriptSegments,
    transcriptSourceId,
    workspaceMapping,
  ]);

  return (
    <section
      className={[
        "hammer-workspace-shell",
        workspaceFocusMode === "source-focus" ? "is-source-focus" : "",
        workspaceFocusMode === "tool-focus" ? "is-tool-focus" : "",
        workspaceFocusMode === "time-focus" ? "is-time-focus" : "",
        workspaceFocusMode === "balanced" ? "is-balanced" : "",
      ].filter(Boolean).join(" ")}
      style={{
        ["--hammer-shell-toolbar-width" as string]: `${TOOLBAR_WIDTH_PX}px`,
        ["--hammer-shell-preview-width" as string]: `${PREVIEW_BAY_MAX_WIDTH_PX}px`,
        ["--hammer-shell-timeline-height" as string]: `${TIMELINE_DOCK_BASELINE_HEIGHT_PX}px`,
        ["--hammer-shell-timeline-time-focus-height" as string]: `${TIMELINE_DOCK_TIME_FOCUS_HEIGHT_PX}px`,
      }}
    >
      <div className="hammer-workspace-shell__main">
        <div className="hammer-workspace-shell__top">
          <section className="hammer-source-bay">
            <header className="hammer-bay-head">
              <strong>Source Desk</strong>
              <div className="hammer-bay-tabs">
                {SOURCE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={selectedSourceTab === tab.id ? "is-active" : ""}
                    onClick={() => setSelectedSourceTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </header>
            <div className="hammer-bay-body">
              {selectedSourceTab === "transcript" ? (
                editableTranscriptSegments.length > 0 ? (
                  <>
                    {selectedSegment ? (
                      <section className="hammer-transcript-editor" aria-label="Selected transcript segment editor">
                        <div className="hammer-transcript-editor__meta">
                          <span>{selectedSegment.start_sec.toFixed(1)}s - {selectedSegment.end_sec.toFixed(1)}s</span>
                          <span>{selectedSegment.segment_id}</span>
                        </div>
                        <label className="hammer-transcript-editor__field">
                          <span>Speaker</span>
                          <input
                            type="text"
                            value={selectedSegment.speaker}
                            onFocus={() => setFocusOverride("source-focus")}
                            onChange={(event) => {
                              setFocusOverride("source-focus");
                              setEditableTranscriptSegments((current) => current.map((segment) => (
                                segment.segment_id === selectedSegment.segment_id
                                  ? { ...segment, speaker: event.target.value }
                                  : segment
                              )));
                            }}
                          />
                        </label>
                        <label className="hammer-transcript-editor__field">
                          <span>Text</span>
                          <textarea
                            value={selectedSegment.text}
                            onFocus={() => setFocusOverride("source-focus")}
                            onChange={(event) => {
                              setFocusOverride("source-focus");
                              setEditableTranscriptSegments((current) => current.map((segment) => (
                                segment.segment_id === selectedSegment.segment_id
                                  ? { ...segment, text: event.target.value }
                                  : segment
                              )));
                            }}
                          />
                        </label>
                      </section>
                    ) : null}
                    {editableTranscriptSegments.map((segment) => (
                      <button
                        key={segment.segment_id}
                        type="button"
                        className={segment.segment_id === selectedSegmentId ? "hammer-transcript-row is-active" : "hammer-transcript-row"}
                        onClick={() => {
                          setFocusOverride("source-focus");
                          setSelectedSegmentId(segment.segment_id);
                          setPlayheadSec(segment.start_sec);
                        }}
                      >
                        <span>{segment.speaker}</span>
                        <span>{segment.text}</span>
                      </button>
                    ))}
                  </>
                ) : <div className="hammer-empty-state">Transcript is not loaded yet.</div>
              ) : (
                <div className="hammer-empty-state">{selectedSourceTab} panel is ready for content transplant.</div>
              )}
            </div>
          </section>

          <section className="hammer-preview-bay">
            <header className="hammer-bay-head">
              <strong>Preview Monitors</strong>
              <span>{previewMode}</span>
            </header>
            <div className="hammer-bay-body hammer-preview-bay__body">
              <div className="hammer-preview-surface">
                {playheadSegment ? (
                  <div className="hammer-preview-surface__label">
                    {resolvePreviewLabel(playheadSegment, playheadSec)}
                  </div>
                ) : (
                  <div className="hammer-preview-surface__label">{resolvePreviewLabel(playheadSegment, playheadSec)}</div>
                )}
              </div>
              <div className="hammer-preview-meta">
                <span>Playhead {playheadSec.toFixed(1)}s</span>
                <span>{mediaSourceLabel ?? "No media source"}</span>
              </div>
            </div>
          </section>

          <section className="hammer-tool-bay">
            <header className="hammer-bay-head">
              <strong>Tool Rack</strong>
              <span>{TOOL_ORDER.find((tool) => tool.id === activeTool)?.label}</span>
            </header>
            <div className="hammer-bay-body">
              {activeTool === "polish" ? (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Transcript Polish</header>
                  <label className="hammer-tool-field">
                    <span>Cleanup Strength: {polishStrength}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={polishStrength}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setPolishStrength(Number(event.target.value));
                      }}
                    />
                  </label>
                  <div className="hammer-tool-hint">Applies cleanup suggestions without altering original media.</div>
                </section>
              ) : null}

              {activeTool === "audio" ? (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Audio Adjustments</header>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={audioLevelingEnabled}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setAudioLevelingEnabled(event.target.checked);
                      }}
                    />
                    <span>Level dialogue track</span>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={audioNoiseReductionEnabled}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setAudioNoiseReductionEnabled(event.target.checked);
                      }}
                    />
                    <span>Reduce background noise</span>
                  </label>
                  <div className="hammer-tool-hint">Current prep status: {props.audioPolish?.status ?? "not_started"}</div>
                </section>
              ) : null}

              {activeTool === "video" ? (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Visual Placement</header>
                  <label className="hammer-tool-field">
                    <span>Snap Mode</span>
                    <select
                      value={videoSnapMode}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setVideoSnapMode(event.target.value as "timeline" | "segment");
                      }}
                    >
                      <option value="timeline">Timeline grid</option>
                      <option value="segment">Segment boundaries</option>
                    </select>
                  </label>
                  <div className="hammer-tool-hint">Placed visuals: {props.visualPlacements?.placements.length ?? 0}</div>
                </section>
              ) : null}

              {activeTool === "captions" ? (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Caption Output</header>
                  <label className="hammer-tool-field">
                    <span>Caption Style</span>
                    <select
                      value={captionStyle}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setCaptionStyle(event.target.value as "sentence" | "title" | "upper");
                      }}
                    >
                      <option value="sentence">Sentence case</option>
                      <option value="title">Title case</option>
                      <option value="upper">UPPERCASE</option>
                    </select>
                  </label>
                </section>
              ) : null}

              {activeTool === "details" ? (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Edit Metadata</header>
                  <label className="hammer-tool-field">
                    <span>Tag</span>
                    <input
                      type="text"
                      value={detailTag}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setDetailTag(event.target.value);
                      }}
                    />
                  </label>
                </section>
              ) : null}

              {activeTool === "finishing" ? (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Finishing Checklist</header>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.transcriptReviewed}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setFinishingChecklist((current) => ({
                          ...current,
                          transcriptReviewed: event.target.checked,
                        }));
                      }}
                    />
                    <span>Transcript reviewed</span>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.visualsReviewed}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setFinishingChecklist((current) => ({
                          ...current,
                          visualsReviewed: event.target.checked,
                        }));
                      }}
                    />
                    <span>Visuals reviewed</span>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.audioReviewed}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setFinishingChecklist((current) => ({
                          ...current,
                          audioReviewed: event.target.checked,
                        }));
                      }}
                    />
                    <span>Audio reviewed</span>
                  </label>
                </section>
              ) : null}

              {activeTool === "export" ? (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Quench Handoff</header>
                  <div className="hammer-tool-hint">
                    {props.releasePrepHref ? "Handoff path available." : "Handoff path unavailable."}
                  </div>
                </section>
              ) : null}

              <div className="hammer-tool-state-grid">
                <div>Workspace mode: {workspaceFocusMode}</div>
                <div>Macro: {props.selectedMacroRecipeRef ?? "none"}</div>
                <div>Last run: {props.lastMacroRunRef ?? "none"}</div>
                <div>Release prep: {props.releasePrepHref ? "available" : "unavailable"}</div>
              </div>
            </div>
          </section>
        </div>

        <section className="hammer-timeline-dock">
            <header className="hammer-bay-head">
              <strong>Timeline Dock</strong>
              <div className="hammer-timeline-tools">
                <button type="button" onClick={() => setFocusOverride("auto")}>Auto</button>
                <button type="button" onClick={() => setFocusOverride("source-focus")}>Source</button>
                <button type="button" onClick={() => setFocusOverride("tool-focus")}>Tool</button>
                <button type="button" onClick={() => setFocusOverride("time-focus")}>Time</button>
              </div>
            </header>
          <div className="hammer-bay-body hammer-timeline-dock__body">
            <input
              type="range"
              min={0}
              max={transcriptDurationSec}
              step={0.1}
              value={playheadSec}
              onChange={(event) => {
                setPlayheadSec(Number(event.target.value));
                setFocusOverride(resolveFocusAfterPlayheadChange(focusOverride));
              }}
              aria-label="Timeline playhead"
            />
            {selectedSegment ? (
              <section className="hammer-timeline-editor" aria-label="Timeline segment editor">
                <div className="hammer-timeline-editor__meta">
                  <span>{selectedSegment.speaker}</span>
                  <span>{selectedSegment.start_sec.toFixed(1)}s - {selectedSegment.end_sec.toFixed(1)}s</span>
                </div>
                <div className="hammer-timeline-editor__controls">
                  <button
                    type="button"
                    onClick={() => {
                      setFocusOverride("time-focus");
                      moveSegment(selectedSegment.segment_id, -0.5);
                    }}
                  >
                    Move -0.5s
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFocusOverride("time-focus");
                      moveSegment(selectedSegment.segment_id, 0.5);
                    }}
                  >
                    Move +0.5s
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFocusOverride("time-focus");
                      trimSegmentStart(selectedSegment.segment_id, -0.1);
                    }}
                  >
                    Trim In -0.1s
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFocusOverride("time-focus");
                      trimSegmentStart(selectedSegment.segment_id, 0.1);
                    }}
                  >
                    Trim In +0.1s
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFocusOverride("time-focus");
                      trimSegmentEnd(selectedSegment.segment_id, -0.1);
                    }}
                  >
                    Trim Out -0.1s
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFocusOverride("time-focus");
                      trimSegmentEnd(selectedSegment.segment_id, 0.1);
                    }}
                  >
                    Trim Out +0.1s
                  </button>
                </div>
              </section>
            ) : null}
            <div className="hammer-timeline-track-scroll">
              {editableTranscriptSegments.length > 0 ? editableTranscriptSegments.map((segment) => (
                <button
                  key={segment.segment_id}
                  type="button"
                  className={segment.segment_id === selectedSegmentId ? "hammer-timeline-row is-active" : "hammer-timeline-row"}
                  onClick={() => {
                    setFocusOverride("time-focus");
                    setSelectedSegmentId(segment.segment_id);
                    setPlayheadSec(segment.start_sec);
                  }}
                >
                  <span>{segment.speaker}</span>
                  <span>{segment.start_sec.toFixed(1)} - {segment.end_sec.toFixed(1)}</span>
                </button>
              )) : (
                <div className="hammer-empty-state">Timeline content transplant pending.</div>
              )}
            </div>
          </div>
        </section>
      </div>

      <nav className="hammer-toolbar" aria-label="Patch Bay Toolbar">
        <div className="hammer-toolbar__title">Tools</div>
        {TOOL_ORDER.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={activeTool === tool.id ? "hammer-toolbar__tool is-active" : "hammer-toolbar__tool"}
            onClick={() => setActiveTool(tool.id)}
            title={tool.label}
          >
            <strong>{tool.shortLabel}</strong>
            <span>{tool.label}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}
