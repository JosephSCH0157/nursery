import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import HammerWorkspaceShellTimelineDock from "../../hammer/src/editor/HammerWorkspaceShellTimelineDock";

const noop = () => {};
const durationSec = 603.848;
const lane = (id: string, label: string, tone: string, blocks: unknown[] = []) => ({ id, label, tone, blocks });

test("production dock geometry exposes the source ruler in collapsed and expanded layouts", async () => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  const vm: any = {
    isScrubbing: false, setFocusOverride: noop, waveformProxy: null,
    playbackTransportDurationSec: durationSec, effectivePlaybackCutRegions: [], playheadSec: 5.32,
    seekPlayheadToTime: noop, togglePlayback: noop, isPlaybackActive: false,
    toggleSelectionLoopPlayback: noop, isLoopPlaybackActive: false, playSelectionWithRoll: noop,
    selectedSegment: null, selectAdjacentSegment: noop, jumpToSelectionBoundary: noop,
    jumpToEditPoint: noop, sortedTimelineMarkers: [], jumpToMarker: noop, addMarkerAtPlayhead: noop,
    scrubRate: 1, scrubRateOptions: [0.5, 1, 2], setScrubRate: noop,
    zoomTimelineOut: noop, zoomTimelineIn: noop, resetTimelineZoom: noop, timelineZoomPercent: 100,
    nudgePlayhead: noop, smallPlayheadNudgeSec: 0.1, splitSelectedSegmentAtPlayhead: noop,
    deleteSelectedSegmentAndRipple: noop, toggleSelectedSegmentDisabled: noop,
    audioCutSelectionStatus: "No cut selection", persistedAudioCutCount: 0,
    canMarkAudioCutSelection: false, canApplyAudioCutSelection: false, hasPendingAudioCutSelection: false,
    markAudioCutBoundary: noop, applyAudioCutSelection: noop, clearAudioCutSelection: noop,
    jumpToMarkerById: noop, removeMarker: noop, moveSegment: noop, trimSegmentStart: noop,
    trimSegmentEnd: noop, adjustSelectedSegmentGain: noop,
    visualTimelineDock: { clips: [], playheadSec: 5.32, durationSec, selectedClipId: null, editable: false, focusToken: 0, onSelectClip: noop },
    timelineTrackScrollRef: { current: null }, handleTimelineTrackWheelZoom: noop,
    editableTranscriptSegmentsLength: 1, timelineBoardZoomClassName: "is-zoom-100", beginTimelineScrub: noop,
    timelineMinorTicks: [{ ratio: 0.5 }], timelineTicks: [{ ratio: 0, timeSec: 0 }, { ratio: 1, timeSec: durationSec }],
    timelineDurationSec: durationSec, playheadRatioPercent: (5.32 / durationSec) * 100,
    timelineLanes: [
      lane("source", "Source", "source", [{ id: "source:brad", label: "Canonical source", startSec: 0, endSec: durationSec, selected: false, tone: "source", onSelect: noop }]),
      lane("dialogue", "Dialogue", "dialogue", [{ id: "dialogue:solo", label: "Speaker A", startSec: 5.32, endSec: 601.406, selected: false, tone: "dialogue", onSelect: noop }]),
      lane("music", "Music", "music"), lane("broll", "B-roll", "broll"), lane("stills", "Stills", "stills"),
    ],
    laneGapsById: new Map(), visualPlacementEditingEnabled: false, currentPass: "transcript_cleanup",
    resolvePlacementAnimationPreset: () => "none", visualPlacementsById: new Map(),
    beginTimelineImagePlacementDrag: noop, openImageAnimationContextMenu: noop,
  };
  const css = await readFile(new URL("../../hammer/src/editor/HammerWorkspaceShell.css", import.meta.url), "utf8");
  const markup = renderToStaticMarkup(React.createElement(HammerWorkspaceShellTimelineDock, { vm }));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  try {
    await page.setContent(`<style>${css}</style><main class="hammer-workspace-shell is-transcript-pass"><section class="hammer-timeline-dock">${markup}</section></main>`);
    await page.$eval(".hammer-workspace-shell", (element) => {
      Object.assign((element as HTMLElement).style, { width: "1365px", height: "768px", display: "block" });
    });
    await page.$eval(".hammer-timeline-dock", (element) => {
      Object.assign((element as HTMLElement).style, { height: "238px", display: "flex", flexDirection: "column" });
    });
    const collapsed = await page.evaluate(() => {
      const dock = document.querySelector(".hammer-timeline-dock")!.getBoundingClientRect();
      const track = document.querySelector(".hammer-timeline-track-scroll")!.getBoundingClientRect();
      const range = document.querySelector('input[aria-label="Timeline playhead"]')!.getBoundingClientRect();
      const controls = getComputedStyle(document.querySelector(".hammer-timeline-control-groups")!).display;
      const transport = document.querySelector(".hammer-timeline-transport-primary")!.getBoundingClientRect();
      return {
        dock: { top: dock.top, bottom: dock.bottom }, track: { top: track.top, bottom: track.bottom, height: track.height },
        range: { top: range.top, bottom: range.bottom, height: range.height }, controls,
        sourceLanes: document.querySelectorAll(".hammer-timeline-lane--source").length,
        rulers: document.querySelectorAll(".hammer-timeline-ruler").length,
        playheads: document.querySelectorAll(".hammer-timeline-playhead").length,
        max: (document.querySelector('input[aria-label="Timeline playhead"]') as HTMLInputElement).max,
        transport: { width: transport.width, height: transport.height },
      };
    });
    assert.equal(collapsed.controls, "none");
    assert.equal(collapsed.sourceLanes, 1);
    assert.equal(collapsed.rulers, 1);
    assert.equal(collapsed.playheads, 1);
    assert.equal(collapsed.max, String(durationSec));
    assert.ok(collapsed.transport.width >= 64 && collapsed.transport.height > 0);
    assert.ok(collapsed.range.height > 0 && collapsed.track.height >= 140);
    assert.ok(collapsed.range.top >= collapsed.dock.top && collapsed.track.bottom <= collapsed.dock.bottom);

    await page.$eval(".hammer-timeline-dock__body", (body) => body.classList.remove("is-collapsed"));
    const expanded = await page.evaluate(() => {
      const track = document.querySelector(".hammer-timeline-track-scroll")!.getBoundingClientRect();
      const controls = document.querySelector(".hammer-timeline-control-groups")!.getBoundingClientRect();
      const transport = document.querySelector(".hammer-timeline-transport-primary")!.getBoundingClientRect();
      return { trackDisplay: getComputedStyle(document.querySelector(".hammer-timeline-track-scroll")!).display, controlsDisplay: getComputedStyle(document.querySelector(".hammer-timeline-control-groups")!).display, trackTop: track.top, controlsTop: controls.top, transportHeight: transport.height };
    });
    assert.notEqual(expanded.trackDisplay, "none");
    assert.notEqual(expanded.controlsDisplay, "none");
    assert.ok(expanded.trackTop < expanded.controlsTop);
    assert.ok(expanded.transportHeight > 0);
  } finally {
    await page.close();
    await browser.close();
  }
});
