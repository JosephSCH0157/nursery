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
import "./HammerWorkspaceShell.css";

const TOOLBAR_WIDTH_PX = 72;
const LEFT_BAY_WIDTH_PX = 360;
const PREVIEW_BAY_WIDTH_PX = 520;
const RIGHT_BAY_WIDTH_PX = 360;
const TIMELINE_DOCK_HEIGHT_PX = 320;

type HammerToolId = "polish" | "audio" | "video" | "captions" | "details" | "finishing" | "export";
type HammerSourceTabId = "transcript" | "images" | "assets" | "broll";
type HammerWorkspaceFocusMode = "balanced" | "source-focus" | "tool-focus";

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

function resolveWorkspaceFocusMode(activeTool: HammerToolId): HammerWorkspaceFocusMode {
  switch (activeTool) {
    case "polish":
      return "source-focus";
    case "audio":
    case "video":
    case "captions":
    case "finishing":
    case "export":
      return "tool-focus";
    case "details":
    default:
      return "balanced";
  }
}

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
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(transcriptSegments[0]?.segment_id ?? null);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [focusOverride, setFocusOverride] = useState<HammerWorkspaceFocusMode | "auto">("auto");
  const lastHandledHandoffTokenRef = useRef<number | null>(null);

  const previewMode: HammerPreviewMode = launchContext.preview_mode ?? launchContext.edit_plan?.preview_mode ?? "edit-aware";
  const workspaceFocusMode = focusOverride === "auto" ? resolveWorkspaceFocusMode(activeTool) : focusOverride;
  const mediaRef = resolveMediaRef(launchContext);
  const workspaceMapping = resolveWorkspaceMapping(launchContext);
  const mediaSourceLabel = launchContext.media.kind === "dev-tone"
    ? "Dev tone"
    : launchContext.media.label ?? mediaRef?.local_relpath ?? null;

  const selectedSegment = transcriptSegments.find((segment) => segment.segment_id === selectedSegmentId) ?? null;
  const transcriptDurationSec = Math.max(
    transcriptSegments.reduce((maxEndSec, segment) => Math.max(maxEndSec, segment.end_sec), 0),
    32,
  );

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
      transcriptSegments,
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
    transcriptSegments,
    transcriptSourceId,
    workspaceMapping,
  ]);

  return (
    <section
      className={[
        "hammer-workspace-shell",
        workspaceFocusMode === "source-focus" ? "is-source-focus" : "",
        workspaceFocusMode === "tool-focus" ? "is-tool-focus" : "",
        workspaceFocusMode === "balanced" ? "is-balanced" : "",
      ].filter(Boolean).join(" ")}
      style={{
        ["--hammer-shell-toolbar-width" as string]: `${TOOLBAR_WIDTH_PX}px`,
        ["--hammer-shell-left-width" as string]: `${LEFT_BAY_WIDTH_PX}px`,
        ["--hammer-shell-preview-width" as string]: `${PREVIEW_BAY_WIDTH_PX}px`,
        ["--hammer-shell-right-width" as string]: `${RIGHT_BAY_WIDTH_PX}px`,
        ["--hammer-shell-timeline-height" as string]: `${TIMELINE_DOCK_HEIGHT_PX}px`,
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
                transcriptSegments.length > 0 ? transcriptSegments.map((segment) => (
                  <button
                    key={segment.segment_id}
                    type="button"
                    className={segment.segment_id === selectedSegmentId ? "hammer-transcript-row is-active" : "hammer-transcript-row"}
                    onClick={() => {
                      setSelectedSegmentId(segment.segment_id);
                      setPlayheadSec(segment.start_sec);
                    }}
                  >
                    <span>{segment.speaker}</span>
                    <span>{segment.text}</span>
                  </button>
                )) : <div className="hammer-empty-state">Transcript is not loaded yet.</div>
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
                {selectedSegment ? (
                  <div className="hammer-preview-surface__label">
                    {selectedSegment.speaker}: {selectedSegment.text}
                  </div>
                ) : (
                  <div className="hammer-preview-surface__label">Select a transcript row to preview.</div>
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
              <div className="hammer-empty-state">Active tool controls render here.</div>
              <div className="hammer-tool-state-grid">
                <div>Audio polish: {props.audioPolish?.status ?? "not_started"}</div>
                <div>Visual placements: {props.visualPlacements?.placements.length ?? 0}</div>
                <div>Macro: {props.selectedMacroRecipeRef ?? "none"}</div>
                <div>Last run: {props.lastMacroRunRef ?? "none"}</div>
                <div>Workspace mode: {workspaceFocusMode}</div>
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
            </div>
          </header>
          <div className="hammer-bay-body hammer-timeline-dock__body">
            <input
              type="range"
              min={0}
              max={transcriptDurationSec}
              step={0.1}
              value={playheadSec}
              onChange={(event) => setPlayheadSec(Number(event.target.value))}
              aria-label="Timeline playhead"
            />
            <div className="hammer-timeline-track-scroll">
              {transcriptSegments.length > 0 ? transcriptSegments.map((segment) => (
                <div key={segment.segment_id} className="hammer-timeline-row">
                  <span>{segment.speaker}</span>
                  <span>{segment.start_sec.toFixed(1)} - {segment.end_sec.toFixed(1)}</span>
                </div>
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
