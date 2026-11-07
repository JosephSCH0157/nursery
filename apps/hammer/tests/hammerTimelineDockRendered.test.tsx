import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import HammerWorkspaceShellTimelineDock from "../src/editor/HammerWorkspaceShellTimelineDock";

const noop = () => {};

test("collapsed transcript dock keeps Brad-sized source ruler and playhead usable without waveform or visuals", async () => {
  const dom = new JSDOM('<style id="hammer-css"></style><div id="app"></div>', {
    url: "https://podcastersforge.com/app/hammer",
    pretendToBeVisual: true,
  });
  Object.defineProperty(dom.window, "innerWidth", { value: 1365, configurable: true });
  Object.defineProperty(dom.window, "innerHeight", { value: 768, configurable: true });
  dom.window.document.querySelector("#hammer-css")!.textContent = readFileSync(
    new URL("../src/editor/HammerWorkspaceShell.css", import.meta.url),
    "utf8",
  );
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    HTMLElement: globalThis.HTMLElement,
    SVGElement: globalThis.SVGElement,
    ResizeObserver: globalThis.ResizeObserver,
  };
  class TestResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    SVGElement: dom.window.SVGElement,
    ResizeObserver: TestResizeObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const seeks: number[] = [];
  const durationSec = 603.848;
  const sourceBlock = {
    id: "source:brad-media",
    label: "Canonical source",
    startSec: 0,
    endSec: durationSec,
    selected: false,
    tone: "source",
    onSelect: noop,
  };
  const dialogueBlock = {
    id: "dialogue:solo",
    label: "Speaker A",
    startSec: 5.32,
    endSec: 601.406,
    selected: false,
    tone: "dialogue",
    onSelect: noop,
  };
  const vm: any = {
    isScrubbing: false,
    setFocusOverride: noop,
    waveformProxy: null,
    playbackTransportDurationSec: durationSec,
    effectivePlaybackCutRegions: [],
    playheadSec: 5.32,
    seekPlayheadToTime: (value: number) => seeks.push(value),
    togglePlayback: noop,
    isPlaybackActive: false,
    toggleSelectionLoopPlayback: noop,
    isLoopPlaybackActive: false,
    playSelectionWithRoll: noop,
    selectedSegment: null,
    selectAdjacentSegment: noop,
    jumpToSelectionBoundary: noop,
    jumpToEditPoint: noop,
    sortedTimelineMarkers: [],
    jumpToMarker: noop,
    addMarkerAtPlayhead: noop,
    scrubRate: 1,
    scrubRateOptions: [0.5, 1, 2],
    setScrubRate: noop,
    zoomTimelineOut: noop,
    zoomTimelineIn: noop,
    resetTimelineZoom: noop,
    timelineZoomPercent: 100,
    nudgePlayhead: noop,
    smallPlayheadNudgeSec: 0.1,
    splitSelectedSegmentAtPlayhead: noop,
    deleteSelectedSegmentAndRipple: noop,
    toggleSelectedSegmentDisabled: noop,
    audioCutSelectionStatus: "No cut selection",
    persistedAudioCutCount: 0,
    canMarkAudioCutSelection: false,
    canApplyAudioCutSelection: false,
    hasPendingAudioCutSelection: false,
    markAudioCutBoundary: noop,
    applyAudioCutSelection: noop,
    clearAudioCutSelection: noop,
    jumpToMarkerById: noop,
    removeMarker: noop,
    moveSegment: noop,
    trimSegmentStart: noop,
    trimSegmentEnd: noop,
    adjustSelectedSegmentGain: noop,
    visualTimelineDock: { clips: [], playheadSec: 5.32, durationSec, selectedClipId: null, editable: false, focusToken: 0, onSelectClip: noop, onMoveClip: noop, onTrimClipStart: noop, onTrimClipEnd: noop },
    timelineTrackScrollRef: createRef<HTMLDivElement>(),
    handleTimelineTrackWheelZoom: noop,
    editableTranscriptSegmentsLength: 1,
    timelineBoardZoomClassName: "is-zoom-100",
    beginTimelineScrub: noop,
    timelineMinorTicks: [{ ratio: 0.5 }],
    timelineTicks: [{ ratio: 0, timeSec: 0 }, { ratio: 1, timeSec: durationSec }],
    timelineDurationSec: durationSec,
    playheadRatioPercent: (5.32 / durationSec) * 100,
    timelineLanes: [
      { id: "source", label: "Source", tone: "source", blocks: [sourceBlock] },
      { id: "dialogue", label: "Dialogue", tone: "dialogue", blocks: [dialogueBlock] },
      { id: "music", label: "Music", tone: "music", blocks: [] },
      { id: "broll", label: "B-roll", tone: "broll", blocks: [] },
      { id: "stills", label: "Stills", tone: "stills", blocks: [] },
    ],
    laneGapsById: new Map(),
    visualPlacementEditingEnabled: false,
    currentPass: "transcript_cleanup",
    resolvePlacementAnimationPreset: () => "none",
    visualPlacementsById: new Map(),
    beginTimelineImagePlacementDrag: noop,
    openImageAnimationContextMenu: noop,
  };
  const root = createRoot(dom.window.document.querySelector("#app")!);
  try {
    await act(async () => root.render(<HammerWorkspaceShellTimelineDock vm={vm} />));
    const body = dom.window.document.querySelector<HTMLElement>(".hammer-timeline-dock__body")!;
    const track = dom.window.document.querySelector<HTMLElement>(".hammer-timeline-track-scroll")!;
    const controls = dom.window.document.querySelector<HTMLElement>(".hammer-timeline-control-groups")!;
    const range = dom.window.document.querySelector<HTMLInputElement>('input[aria-label="Timeline playhead"]')!;
    const ruler = dom.window.document.querySelector<HTMLElement>('.hammer-timeline-ruler[aria-label="Timeline playhead"]')!;
    assert.ok(body.classList.contains("is-collapsed"));
    assert.equal(range.max, String(durationSec));
    assert.equal(ruler.getAttribute("aria-valuemax"), String(durationSec));
    assert.notEqual(dom.window.getComputedStyle(track).display, "none");
    assert.equal(dom.window.getComputedStyle(controls).display, "none");
    assert.match(track.textContent ?? "", /Source/);
    assert.equal(track.querySelectorAll(".hammer-timeline-lane--source").length, 1);
    assert.equal(track.querySelectorAll(".hammer-timeline-playhead").length, 1);
    assert.equal(dom.window.document.querySelectorAll(".hammer-visual-clip-block").length, 0);
    await act(async () => ruler.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "End", bubbles: true })));
    assert.deepEqual(seeks, [durationSec]);

    const expand = [...dom.window.document.querySelectorAll("button")].find((button) => button.textContent === "Expand")!;
    await act(async () => expand.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    assert.equal(body.classList.contains("is-collapsed"), false);
    assert.notEqual(dom.window.getComputedStyle(controls).display, "none");
    assert.notEqual(dom.window.getComputedStyle(track).display, "none");
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    dom.window.close();
  }
});
