import type { JSX, RefObject, WheelEvent as ReactWheelEvent } from "react";
import VisualTimelineDock from "../visuals/components/VisualTimelineDock";
import { HammerWaveformLane } from "./HammerWaveformLane";

export type HammerWorkspaceShellTimelineDockVM = {
  isScrubbing: boolean;
  setFocusOverride: (mode: "auto" | "source-focus" | "tool-focus" | "time-focus") => void;

  waveformProxy: any;
  playbackTransportDurationSec: number;
  effectivePlaybackCutRegions: any[];
  playheadSec: number;
  seekPlayheadToTime: (nextTimeSec: number, origin: "timeline" | "playhead", options?: { snapToBoundary?: boolean }) => void;

  togglePlayback: () => void;
  isPlaybackActive: boolean;
  toggleSelectionLoopPlayback: () => void;
  isLoopPlaybackActive: boolean;
  playSelectionWithRoll: () => void;
  selectedSegment: any | null;
  selectAdjacentSegment: (direction: "previous" | "next") => void;
  jumpToSelectionBoundary: (edge: "start" | "end") => void;
  jumpToEditPoint: (direction: "previous" | "next") => void;
  sortedTimelineMarkers: Array<{ id: string; label: string; timeSec: number }>;
  jumpToMarker: (direction: "previous" | "next") => void;
  addMarkerAtPlayhead: () => void;
  scrubRate: number;
  scrubRateOptions: readonly number[];
  setScrubRate: (rate: number) => void;
  zoomTimelineOut: () => void;
  zoomTimelineIn: () => void;
  resetTimelineZoom: () => void;
  timelineZoomPercent: number;
  nudgePlayhead: (deltaSec: number) => void;
  smallPlayheadNudgeSec: number;
  splitSelectedSegmentAtPlayhead: () => void;
  deleteSelectedSegmentAndRipple: () => void;
  toggleSelectedSegmentDisabled: () => void;

  transcriptDurationSec: number;

  audioCutSelectionStatus: string;
  persistedAudioCutCount: number;
  canMarkAudioCutSelection: boolean;
  canApplyAudioCutSelection: boolean;
  hasPendingAudioCutSelection: boolean;
  markAudioCutBoundary: (boundary: "start" | "end") => void;
  applyAudioCutSelection: () => void;
  clearAudioCutSelection: () => void;

  hasSilenceSuggestionAnalysis: boolean;
  silenceSuggestionCount: number;
  silenceCutSuggestions: any[];
  visibleSilenceCutSuggestions: Array<{
    id: string;
    startSec: number;
    endSec: number;
    durationSec: number;
    reason: string;
  }>;
  acceptSilenceCutSuggestion: (id: string) => void;
  dismissSilenceCutSuggestion: (id: string) => void;

  jumpToMarkerById: (id: string) => void;
  removeMarker: (id: string) => void;

  moveSegment: (segmentId: string, deltaSec: number) => void;
  trimSegmentStart: (segmentId: string, deltaSec: number) => void;
  trimSegmentEnd: (segmentId: string, deltaSec: number) => void;
  adjustSelectedSegmentGain: (deltaDb: number) => void;

  visualTimelineDock: {
    clips: any[];
    playheadSec: number;
    durationSec: number;
    selectedClipId: string | null;
    editable: boolean;
    focusToken: number;
    onSelectClip: (clipId: string) => void;
    onMoveClip: (event: any, clip: any) => void;
    onTrimClipStart: (event: any, clip: any) => void;
    onTrimClipEnd: (event: any, clip: any) => void;
  };

  timelineTrackScrollRef: RefObject<HTMLDivElement | null>;
  handleTimelineTrackWheelZoom: (event: ReactWheelEvent<HTMLDivElement>) => void;
  editableTranscriptSegmentsLength: number;
  timelineBoardZoomClassName: string;
  beginTimelineScrub: (event: any) => void;
  timelineMinorTicks: Array<{ ratio: number }>;
  timelineTicks: Array<{ ratio: number; timeSec: number }>;
  timelineDurationSec: number;
  playheadRatioPercent: number;
  timelineLanes: Array<{ id: string; label: string; tone: string; blocks: any[] }>;
  laneGapsById: Map<string, Array<{ id: string; startSec: number; endSec: number }>>;
  visualPlacementEditingEnabled: boolean;
  currentPass: string;
  resolvePlacementAnimationPreset: (value: any) => string;
  visualPlacementsById: Map<string, any>;
  beginTimelineImagePlacementDrag: (event: any, args: any) => void;
  openImageAnimationContextMenu: (event: any, placementId: string) => void;
};

export default function HammerWorkspaceShellTimelineDock(props: { vm: HammerWorkspaceShellTimelineDockVM }): JSX.Element {
  const vm = props.vm;
  const {
    isScrubbing,
    setFocusOverride,
    waveformProxy,
    playbackTransportDurationSec,
    effectivePlaybackCutRegions,
    playheadSec,
    seekPlayheadToTime,
    togglePlayback,
    isPlaybackActive,
    toggleSelectionLoopPlayback,
    isLoopPlaybackActive,
    playSelectionWithRoll,
    selectedSegment,
    selectAdjacentSegment,
    jumpToSelectionBoundary,
    jumpToEditPoint,
    sortedTimelineMarkers,
    jumpToMarker,
    addMarkerAtPlayhead,
    scrubRate,
    scrubRateOptions,
    setScrubRate,
    zoomTimelineOut,
    zoomTimelineIn,
    resetTimelineZoom,
    timelineZoomPercent,
    nudgePlayhead,
    smallPlayheadNudgeSec,
    splitSelectedSegmentAtPlayhead,
    deleteSelectedSegmentAndRipple,
    toggleSelectedSegmentDisabled,
    transcriptDurationSec,
    audioCutSelectionStatus,
    persistedAudioCutCount,
    canMarkAudioCutSelection,
    canApplyAudioCutSelection,
    hasPendingAudioCutSelection,
    markAudioCutBoundary,
    applyAudioCutSelection,
    clearAudioCutSelection,
    hasSilenceSuggestionAnalysis,
    silenceSuggestionCount,
    silenceCutSuggestions,
    visibleSilenceCutSuggestions,
    acceptSilenceCutSuggestion,
    dismissSilenceCutSuggestion,
    jumpToMarkerById,
    removeMarker,
    moveSegment,
    trimSegmentStart,
    trimSegmentEnd,
    adjustSelectedSegmentGain,
    visualTimelineDock,
    timelineTrackScrollRef,
    handleTimelineTrackWheelZoom,
    editableTranscriptSegmentsLength,
    timelineBoardZoomClassName,
    beginTimelineScrub,
    timelineMinorTicks,
    timelineTicks,
    timelineDurationSec,
    playheadRatioPercent,
    timelineLanes,
    laneGapsById,
    visualPlacementEditingEnabled,
    currentPass,
    resolvePlacementAnimationPreset,
    visualPlacementsById,
    beginTimelineImagePlacementDrag,
    openImageAnimationContextMenu,
  } = vm;

  return (
    <>
      <header className="hammer-bay-head">
        <strong>Timeline Dock</strong>
        <div className="hammer-timeline-tools">
          <button type="button" onClick={() => setFocusOverride("auto")}>Auto</button>
          <button type="button" onClick={() => setFocusOverride("source-focus")}>Source</button>
          <button type="button" onClick={() => setFocusOverride("tool-focus")}>Tool</button>
          <button type="button" onClick={() => setFocusOverride("time-focus")}>Time</button>
        </div>
      </header>
      <div className={`hammer-bay-body hammer-timeline-dock__body${isScrubbing ? " is-scrubbing" : ""}`}>
        <HammerWaveformLane
          waveformProxy={waveformProxy}
          durationSec={playbackTransportDurationSec}
          cutRegions={effectivePlaybackCutRegions}
          playheadSec={playheadSec}
          onSeekRequest={(targetSec) => {
            seekPlayheadToTime(targetSec, "timeline", { snapToBoundary: false });
          }}
        />
        <div className="hammer-timeline-tools">
          <button type="button" onClick={togglePlayback}>
            {isPlaybackActive ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={toggleSelectionLoopPlayback}>
            {isLoopPlaybackActive ? "Stop Loop (L)" : "Loop Selection (L)"}
          </button>
          <button type="button" onClick={playSelectionWithRoll}>
            Audition Roll (P)
          </button>
          <button type="button" onClick={() => selectAdjacentSegment("previous")} disabled={!selectedSegment}>
            Prev (↑)
          </button>
          <button type="button" onClick={() => selectAdjacentSegment("next")} disabled={!selectedSegment}>
            Next (↓)
          </button>
          <button type="button" onClick={() => jumpToSelectionBoundary("start")}>
            Sel In (Home)
          </button>
          <button type="button" onClick={() => jumpToSelectionBoundary("end")}>
            Sel Out (End)
          </button>
          <button type="button" onClick={() => jumpToEditPoint("previous")}>
            Prev Edit (,)
          </button>
          <button type="button" onClick={() => jumpToEditPoint("next")}>
            Next Edit (.)
          </button>
          <button type="button" onClick={() => jumpToMarker("previous")} disabled={sortedTimelineMarkers.length === 0}>
            Prev Marker (PgUp)
          </button>
          <button type="button" onClick={() => jumpToMarker("next")} disabled={sortedTimelineMarkers.length === 0}>
            Next Marker (PgDn)
          </button>
          <button type="button" onClick={addMarkerAtPlayhead}>
            Add Marker (K)
          </button>
          <label className="hammer-timeline-tools__field" aria-label="Scrub rate control">
            <span>Scrub</span>
            <select
              value={String(scrubRate)}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!scrubRateOptions.includes(parsed)) return;
                setScrubRate(parsed);
              }}
            >
              {scrubRateOptions.map((rate) => (
                <option key={`scrub-rate-${rate}`} value={String(rate)}>
                  {rate}x
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={zoomTimelineOut} title="Zoom out (-)">
            Zoom -
          </button>
          <button type="button" onClick={zoomTimelineIn} title="Zoom in (+)">
            Zoom +
          </button>
          <button type="button" onClick={resetTimelineZoom} title="Reset timeline zoom">
            Fit ({timelineZoomPercent}%)
          </button>
          <button type="button" onClick={() => nudgePlayhead(-smallPlayheadNudgeSec)}>
            -0.1s (←)
          </button>
          <button type="button" onClick={() => nudgePlayhead(smallPlayheadNudgeSec)}>
            +0.1s (→)
          </button>
          <button type="button" onClick={splitSelectedSegmentAtPlayhead} disabled={!selectedSegment}>
            Split (S)
          </button>
          <button type="button" onClick={deleteSelectedSegmentAndRipple} disabled={!selectedSegment}>
            Delete (Del)
          </button>
          <button type="button" onClick={toggleSelectedSegmentDisabled} disabled={!selectedSegment}>
            {selectedSegment?.is_disabled ? "Enable (M)" : "Disable (M)"}
          </button>
        </div>
        <section className="hammer-timeline-cut-actions" aria-label="Audio cut selection">
          <div className="hammer-timeline-cut-actions__meta">
            <span>{audioCutSelectionStatus}</span>
            <span>
              Persisted cuts: {persistedAudioCutCount} raw
              {` · ${effectivePlaybackCutRegions.length} effective playback region${effectivePlaybackCutRegions.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="hammer-timeline-cut-actions__buttons">
            <button type="button" onClick={() => markAudioCutBoundary("start")} disabled={!canMarkAudioCutSelection}>
              Mark In
            </button>
            <button type="button" onClick={() => markAudioCutBoundary("end")} disabled={!canMarkAudioCutSelection}>
              Mark Out
            </button>
            <button type="button" onClick={applyAudioCutSelection} disabled={!canApplyAudioCutSelection}>
              Cut Selection
            </button>
            <button type="button" onClick={clearAudioCutSelection} disabled={!hasPendingAudioCutSelection}>
              Clear Selection
            </button>
          </div>
        </section>
        {hasSilenceSuggestionAnalysis ? (
          <section className="hammer-timeline-suggestion-list" aria-label="Silence cut suggestions">
            <div className="hammer-timeline-suggestion-list__meta">
              <span>
                Silence suggestions: {silenceSuggestionCount} visible
                {` · ${silenceCutSuggestions.length} total from segmentation`}
              </span>
              <span>Conservative only. Accept creates a real cut. Dismiss hides it for this session.</span>
            </div>
            {visibleSilenceCutSuggestions.length > 0 ? (
              <div className="hammer-timeline-suggestion-list__items">
                {visibleSilenceCutSuggestions.map((suggestion) => (
                  <article key={suggestion.id} className="hammer-timeline-suggestion-card">
                    <div className="hammer-timeline-suggestion-card__copy">
                      <strong>
                        Cut silence {suggestion.startSec.toFixed(1)}s-{suggestion.endSec.toFixed(1)}s
                      </strong>
                      <span>
                        {suggestion.durationSec.toFixed(1)}s pause · {suggestion.reason === "long_silence" ? "long silence" : suggestion.reason}
                      </span>
                    </div>
                    <div className="hammer-timeline-suggestion-card__actions">
                      <button type="button" onClick={() => acceptSilenceCutSuggestion(suggestion.id)}>
                        Accept
                      </button>
                      <button type="button" onClick={() => dismissSilenceCutSuggestion(suggestion.id)}>
                        Dismiss
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="hammer-timeline-suggestion-list__empty">
                No long silence suggestions remain above the threshold.
              </div>
            )}
          </section>
        ) : null}
        <input
          type="range"
          min={0}
          max={transcriptDurationSec}
          step={0.1}
          value={playheadSec}
          onChange={(event) => {
            seekPlayheadToTime(Number(event.target.value), "playhead");
          }}
          aria-label="Timeline playhead"
        />
        {sortedTimelineMarkers.length > 0 ? (
          <div className="hammer-timeline-markers" role="group" aria-label="Timeline markers">
            {sortedTimelineMarkers.map((marker) => (
              <div key={marker.id} className="hammer-timeline-marker-pill">
                <button
                  type="button"
                  onClick={() => jumpToMarkerById(marker.id)}
                >
                  {marker.label} {marker.timeSec.toFixed(1)}s
                </button>
                <button
                  type="button"
                  className="hammer-timeline-marker-pill__remove"
                  onClick={() => removeMarker(marker.id)}
                  aria-label={`Remove ${marker.label}`}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {selectedSegment ? (
          <section className="hammer-timeline-editor" aria-label="Selected segment timing inspector">
            <div className="hammer-timeline-editor__meta">
              <span>{selectedSegment.speaker}</span>
              <span>{selectedSegment.start_sec.toFixed(1)}s - {selectedSegment.end_sec.toFixed(1)}s</span>
              <span>{selectedSegment.is_disabled ? "Disabled" : "Enabled"}</span>
              <span>Gain {(selectedSegment.gain_db ?? 0).toFixed(1)} dB</span>
            </div>
            <div className="hammer-timeline-editor__meta">
              <span>Split/Delete target: {selectedSegment.segment_id}</span>
            </div>
            <div className="hammer-timeline-editor__controls">
              <div className="hammer-timeline-editor__control-group">
                <span>Move</span>
                <button
                  type="button"
                  onClick={() => {
                    setFocusOverride("time-focus");
                    moveSegment(selectedSegment.segment_id, -0.5);
                  }}
                >
                  -0.5s
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFocusOverride("time-focus");
                    moveSegment(selectedSegment.segment_id, 0.5);
                  }}
                >
                  +0.5s
                </button>
              </div>
              <div className="hammer-timeline-editor__control-group">
                <span>Trim In</span>
                <button
                  type="button"
                  onClick={() => {
                    setFocusOverride("time-focus");
                    trimSegmentStart(selectedSegment.segment_id, -0.1);
                  }}
                >
                  -0.1s
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFocusOverride("time-focus");
                    trimSegmentStart(selectedSegment.segment_id, 0.1);
                  }}
                >
                  +0.1s
                </button>
              </div>
              <div className="hammer-timeline-editor__control-group">
                <span>Trim Out</span>
                <button
                  type="button"
                  onClick={() => {
                    setFocusOverride("time-focus");
                    trimSegmentEnd(selectedSegment.segment_id, -0.1);
                  }}
                >
                  -0.1s
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFocusOverride("time-focus");
                    trimSegmentEnd(selectedSegment.segment_id, 0.1);
                  }}
                >
                  +0.1s
                </button>
              </div>
              <div className="hammer-timeline-editor__control-group">
                <span>Segment</span>
                <button
                  type="button"
                  onClick={() => {
                    setFocusOverride("time-focus");
                    toggleSelectedSegmentDisabled();
                  }}
                >
                  {selectedSegment.is_disabled ? "Enable" : "Disable"}
                </button>
              </div>
              <div className="hammer-timeline-editor__control-group">
                <span>Gain</span>
                <button
                  type="button"
                  onClick={() => {
                    setFocusOverride("time-focus");
                    adjustSelectedSegmentGain(-1);
                  }}
                >
                  -1dB
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFocusOverride("time-focus");
                    adjustSelectedSegmentGain(1);
                  }}
                >
                  +1dB
                </button>
              </div>
            </div>
          </section>
        ) : null}
        <VisualTimelineDock
          clips={visualTimelineDock.clips}
          playheadSec={visualTimelineDock.playheadSec}
          durationSec={visualTimelineDock.durationSec}
          selectedClipId={visualTimelineDock.selectedClipId}
          editable={visualTimelineDock.editable}
          focusToken={visualTimelineDock.focusToken}
          onSelectClip={visualTimelineDock.onSelectClip}
          onMoveClip={visualTimelineDock.onMoveClip}
          onTrimClipStart={visualTimelineDock.onTrimClipStart}
          onTrimClipEnd={visualTimelineDock.onTrimClipEnd}
        />
        <div
          className="hammer-timeline-track-scroll"
          ref={timelineTrackScrollRef}
          onWheel={handleTimelineTrackWheelZoom}
        >
          {editableTranscriptSegmentsLength > 0 ? (
            <section
              className={`hammer-timeline-board ${timelineBoardZoomClassName}`}
              aria-label="Track-based timeline"
            >
              <div
                className="hammer-timeline-ruler"
                onMouseDown={(event) => {
                  beginTimelineScrub(event);
                }}
              >
                <svg className="hammer-timeline-ruler__canvas" viewBox="0 0 1000 28" preserveAspectRatio="none" aria-hidden="true">
                  {timelineMinorTicks.map((tick) => {
                    const x = tick.ratio * 1000;
                    return (
                      <line
                        key={`minor-tick-${tick.ratio}`}
                        className="hammer-timeline-ruler__tick hammer-timeline-ruler__tick--minor"
                        x1={x}
                        y1={13}
                        x2={x}
                        y2={28}
                      />
                    );
                  })}
                  {timelineTicks.map((tick) => {
                    const x = tick.ratio * 1000;
                    return (
                      <g key={`tick-${tick.ratio}`}>
                        <line
                          className="hammer-timeline-ruler__tick"
                          x1={x}
                          y1={7}
                          x2={x}
                          y2={28}
                        />
                        <text className="hammer-timeline-ruler__tick-label" x={Math.min(995, x + 3)} y={7}>
                          {tick.timeSec.toFixed(0)}s
                        </text>
                      </g>
                    );
                  })}
                  {sortedTimelineMarkers.map((marker) => {
                    const x = (marker.timeSec / timelineDurationSec) * 1000;
                    return (
                      <line
                        key={marker.id}
                        className="hammer-timeline-ruler__marker"
                        x1={x}
                        y1={0}
                        x2={x}
                        y2={28}
                      >
                        <title>{`${marker.label} ${marker.timeSec.toFixed(1)}s`}</title>
                      </line>
                    );
                  })}
                  <g transform={`translate(${playheadRatioPercent * 10} 0)`}>
                    <line className="hammer-timeline-playhead" x1={0} y1={0} x2={0} y2={28} />
                    <rect className="hammer-timeline-playhead-cap" x={-3.5} y={0} width={7} height={3} rx={1} ry={1} />
                    <g transform="translate(0 2)">
                      <rect className="hammer-timeline-ruler__time-readout" x={-20} y={0} width={40} height={13} rx={6} ry={6} />
                      <text className="hammer-timeline-ruler__time-readout-text" x={0} y={9} textAnchor="middle">
                        {playheadSec.toFixed(1)}s
                      </text>
                    </g>
                  </g>
                </svg>
              </div>

              {timelineLanes.map((lane) => (
                <div key={lane.id} className={`hammer-timeline-lane hammer-timeline-lane--${lane.tone}`}>
                  <div className="hammer-timeline-lane__label">
                    <strong>{lane.label}</strong>
                    <span>{lane.blocks.length} clips</span>
                  </div>
                  <div
                    className={`hammer-timeline-lane__track hammer-timeline-lane__track--${lane.tone}`}
                    onMouseDown={(event) => {
                      const target = event.target as Element | null;
                      if (target?.closest?.(".hammer-timeline-block.is-image-placement-editable")) {
                        return;
                      }
                      beginTimelineScrub(event);
                    }}
                  >
                    <svg className="hammer-timeline-lane__canvas" viewBox="0 0 1000 34" preserveAspectRatio="none" aria-label={`${lane.label} lane`}>
                      {(laneGapsById.get(lane.id) ?? []).map((gap) => {
                        const x = (gap.startSec / timelineDurationSec) * 1000;
                        const width = Math.max(8, ((gap.endSec - gap.startSec) / timelineDurationSec) * 1000);
                        return (
                          <rect
                            key={gap.id}
                            className="hammer-timeline-gap"
                            x={x}
                            y={4}
                            width={width}
                            height={26}
                            rx={6}
                            ry={6}
                          />
                        );
                      })}
                      <line
                        className="hammer-timeline-lane__playhead"
                        x1={playheadRatioPercent * 10}
                        y1={0}
                        x2={playheadRatioPercent * 10}
                        y2={34}
                      />
                      {lane.blocks.map((block: any) => {
                        const x = (block.startSec / timelineDurationSec) * 1000;
                        const width = Math.max(14, ((block.endSec - block.startSec) / timelineDurationSec) * 1000);
                        const hideBlockLabel = lane.id === "stills" || lane.id === "broll";
                        const imagePlacementEditable = visualPlacementEditingEnabled
                          && (lane.id === "stills" || lane.id === "broll")
                          && (block.tone === "image" || block.tone === "broll")
                          && Boolean(block.placementId);
                        const imageAnimationMenuEnabled = currentPass === "image_animation"
                          && lane.id === "stills"
                          && block.tone === "image"
                          && Boolean(block.placementId);
                        const hasImageAnimationPreset = block.placementId
                          ? resolvePlacementAnimationPreset(visualPlacementsById.get(block.placementId)) !== "none"
                          : false;
                        return (
                          <g
                            key={block.id}
                            role="button"
                            tabIndex={0}
                            className={`hammer-timeline-block hammer-timeline-block--${block.tone}${block.selected ? " is-active" : ""}${block.inRange ? " is-range" : ""}${block.disabled ? " is-disabled" : ""}${imagePlacementEditable ? " is-image-placement-editable" : ""}${hasImageAnimationPreset ? " has-animation-preset" : ""}`}
                            transform={`translate(${x} 5)`}
                            onMouseDown={(event) => {
                              event.stopPropagation();
                              if (imagePlacementEditable && block.placementId) {
                                beginTimelineImagePlacementDrag(event, {
                                  placementId: block.placementId,
                                  mode: "move",
                                  startSec: block.startSec,
                                  endSec: block.endSec,
                                });
                              }
                            }}
                            onContextMenu={(event) => {
                              if (!imageAnimationMenuEnabled || !block.placementId) return;
                              openImageAnimationContextMenu(event, block.placementId);
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              block.onSelect();
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              event.stopPropagation();
                              block.onSelect();
                            }}
                            aria-label={hideBlockLabel
                              ? `Visual clip ${block.startSec.toFixed(1)}-${block.endSec.toFixed(1)}s`
                              : `${block.label} ${block.startSec.toFixed(1)}-${block.endSec.toFixed(1)}s`}
                          >
                            {hideBlockLabel ? null : (
                              <title>{`${block.label} ${block.startSec.toFixed(1)}-${block.endSec.toFixed(1)}s`}</title>
                            )}
                            <rect className="hammer-timeline-block__rect" width={width} height={22} rx={3} ry={3} />
                            {imagePlacementEditable ? (
                              <>
                                <rect
                                  className="hammer-timeline-block__resize hammer-timeline-block__resize--start"
                                  x={0}
                                  y={2}
                                  width={6}
                                  height={18}
                                  rx={2}
                                  ry={2}
                                  onMouseDown={(event) => {
                                    if (!block.placementId) return;
                                    beginTimelineImagePlacementDrag(event, {
                                      placementId: block.placementId,
                                      mode: "resize_start",
                                      startSec: block.startSec,
                                      endSec: block.endSec,
                                    });
                                  }}
                                />
                                <rect
                                  className="hammer-timeline-block__resize hammer-timeline-block__resize--end"
                                  x={Math.max(0, width - 6)}
                                  y={2}
                                  width={6}
                                  height={18}
                                  rx={2}
                                  ry={2}
                                  onMouseDown={(event) => {
                                    if (!block.placementId) return;
                                    beginTimelineImagePlacementDrag(event, {
                                      placementId: block.placementId,
                                      mode: "resize_end",
                                      startSec: block.startSec,
                                      endSec: block.endSec,
                                    });
                                  }}
                                />
                              </>
                            ) : null}
                            {hideBlockLabel ? null : (
                              <text className="hammer-timeline-block__text" x={5} y={14}>
                                {block.label}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              ))}
            </section>
          ) : (
            <div className="hammer-empty-state">Transcript is not loaded yet.</div>
          )}
        </div>
      </div>
    </>
  );
}
