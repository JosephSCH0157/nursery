import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import HammerShortsToolBay from "../src/editor/HammerShortsToolBay";
import { buildHammerShortsToolBayAuthority } from "../src/editor/hammerShortsToolBayAuthority";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import { useHammerShortMediaTimeMapping } from "../src/editor/useHammerShortMediaTimeMapping";
import { resolvePackagingTransport } from "../src/editor/hammerPackagingTransport";

const transcript = {
  schema_version: 1, transcript_id: "transcript", media_id: "media", media_signature: "signature", prepared_at: "2026-09-01T00:00:00.000Z",
  structure: "speaker_turns", source_media_ref: null, diarization: { label_scheme: "forge-neutral-speakers.v1", labels: ["S1"], raw_labels: ["S1"], version: "v1", provider: "openai", provider_request_id: null, model: "test" }, confidence_flags: [],
  segments: [{ segment_id: "a", start_sec: 18, end_sec: 20, speaker: "S1", text: "First" }, { segment_id: "b", start_sec: 40, end_sec: 50, speaker: "S1", text: "Second" }],
};

test("Shorts surface truthfully renders unavailable and saved-edit states", () => {
  const unavailable = renderToStaticMarkup(<HammerShortsToolBay authority={null} onPreview={() => undefined} />);
  assert.match(unavailable, /Save the current edit/);
  const authority = buildHammerShortsToolBayAuthority({
    workspaceId: "workspace", workpieceId: "workpiece", parentLabel: "Parent", canonicalRecordingId: "recording", recordingRevisionId: "revision",
    historyState: { pending: false, basis: { epochId: "epoch", headId: "head", sequence: 1, componentHashes: { transcript: "transcript-hash", visual_timeline: "timeline-hash", editorial_authority: "assembly-hash" } } },
    historyEpochPending: false, editorState: {}, structuredTranscript: transcript, transcriptSegments: transcript.segments, sourceMode: "tongs", sessionId: "session", previewMode: "edit-aware", transcriptSourceId: "transcript",
    mediaRef: null, workspaceMapping: null, mediaSourceLabel: "source", visualPreview: { white_balance: 0, color_amount: 1, background_blur: false }, visualTimeline: null, visualPlacements: null, audioPolish: null, studioRack: createDefaultHammerStudioRackState(),
  } as unknown as Parameters<typeof buildHammerShortsToolBayAuthority>[0]);
  assert.ok(authority);
  assert.equal(authority.timingMap.length, 2);
  assert.deepEqual(authority.timingMap.map((item) => item.output_start_sec), [0, 2]);
  const available = renderToStaticMarkup(<HammerShortsToolBay authority={authority} onPreview={() => undefined} />);
  assert.match(available, /Use this saved edit as the Shorts basis/);
  assert.match(available, /Find Short Moments/);
});

test("Short child timing hook maps both transport directions during render", () => {
  function Probe() {
    const transport = resolvePackagingTransport({ introDurationSec: 0, outroDurationSec: 0, compositionDurationSec: 12, playheadSec: 2.5 });
    const mapping = useHammerShortMediaTimeMapping(transport, { version: 1, intervals: [
      { segment_id: "a", source_start_sec: 18, source_end_sec: 20, output_start_sec: 0, output_end_sec: 2 },
      { segment_id: "b", source_start_sec: 40, source_end_sec: 50, output_start_sec: 2, output_end_sec: 12 },
    ] });
    return <output>{mapping.resolveMediaTimeForTransportTime(2.5)}:{mapping.resolveTransportTimeForMediaTime(45)}</output>;
  }
  assert.equal(renderToStaticMarkup(<Probe />), "<output>40.5:7</output>");
});

test("Shorts surface executes lock, discovery, preview, rejection, projection, and child-link callbacks", async () => {
  const dom = new JSDOM("<div id=app></div>", { url: "http://localhost" });
  dom.window.localStorage.setItem("forge-auth", "test-only-access-token");
  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  const calls: string[] = [];
  const basis = { id: "basis", history_head_id: "head", basis_fingerprint: "basis-fingerprint" };
  const candidate = (id: string, rank: number, start: number, end: number) => ({ candidate_id: id, discovery_id: "discovery", basis_lock_id: "basis", rank, core_output_start_sec: start, core_output_end_sec: end, envelope_output_start_sec: start, envelope_output_end_sec: end, duration_sec: end - start, canonical_segment_ids: [rank === 1 ? "a" : "b"], source_intervals: [], transcript_excerpt: `Candidate ${rank}`, rationale: "Strong opening", goal_fit: "standalone", candidate_fingerprint: `${id}-fingerprint` });
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push(`${init?.method ?? "GET"} ${url}`);
    const payload = url.includes("/basis?") ? []
      : url.includes("/discoveries?") ? []
      : url.endsWith("/basis/lock") ? basis
      : url.endsWith("/api/hammer/shorts/discover") ? { discovery: { id: "discovery", state: "completed", outcome: "partial", created_at: "2026-09-01T00:00:00.000Z" }, candidates: [candidate("one", 1, 0, 2), candidate("two", 2, 2, 12)] }
      : url.endsWith("/candidate/reject") ? { rejected_at: "2026-09-01T00:00:00.000Z" }
      : url.endsWith("/derivative/reserve") ? { id: "derivative", child_workpiece_id: "child", child_recording_revision_id: "child-revision" }
      : url.endsWith("/derivative/artifacts") ? { child_workpiece_id: "child", state: "ready" }
      : {};
    return new Response(JSON.stringify({ ok: true, data: payload }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const authority = buildHammerShortsToolBayAuthority({ workspaceId: "workspace", workpieceId: "workpiece", parentLabel: "Parent", canonicalRecordingId: "recording", recordingRevisionId: "revision", historyState: { pending: false, basis: { epochId: "epoch", headId: "head", sequence: 1, componentHashes: { transcript: "transcript-hash", visual_timeline: "timeline-hash", editorial_authority: "assembly-hash" } } }, historyEpochPending: false, editorState: {}, structuredTranscript: transcript, transcriptSegments: transcript.segments, sourceMode: "tongs", sessionId: "session", previewMode: "edit-aware", transcriptSourceId: "transcript", mediaRef: null, workspaceMapping: null, mediaSourceLabel: "source", visualPreview: { white_balance: 0, color_amount: 1, background_blur: false }, visualTimeline: null, visualPlacements: null, audioPolish: null, studioRack: createDefaultHammerStudioRackState() } as unknown as Parameters<typeof buildHammerShortsToolBayAuthority>[0]);
    assert.ok(authority);
    const previews: number[][] = [];
    const root = createRoot(dom.window.document.querySelector("#app")!);
    await act(async () => { root.render(<HammerShortsToolBay authority={authority} onPreview={(start, end) => previews.push([start, end])} />); await new Promise((resolve) => setTimeout(resolve, 0)); });
    const click = async (label: string) => { const button = [...dom.window.document.querySelectorAll("button")].find((item) => item.textContent?.includes(label)); assert.ok(button, label); await act(async () => { button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 25)); }); };
    await click("Use this saved edit");
    const selects = dom.window.document.querySelectorAll("select");
    selects[0]!.value = "standalone";
    selects[0]!.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    selects[1]!.value = "about_30s";
    selects[1]!.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await click("Find Short Moments");
    await click("Preview");
    assert.deepEqual(previews, [[0, 2]]);
    await click("Reject");
    await click("Create Short");
    assert.match(dom.window.document.body.textContent ?? "", /Short prepared and ready/);
    assert.match(dom.window.document.querySelector("a")?.getAttribute("href") ?? "", /workpiece_id=child/);
    assert.ok(calls.some((call) => call.includes("/derivative/artifacts")));
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    dom.window.close();
  }
});
