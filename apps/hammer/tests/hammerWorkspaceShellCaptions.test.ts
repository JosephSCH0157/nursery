import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHammerCaptionRequestLifecycle, projectHammerCaptionsForRelease } from "../src/editor/useHammerWorkspaceShellCaptions";
import { renderBuiltSrt, renderBuiltVtt, type HammerCaptionBuiltChunk } from "../src/editor/hammerWorkspaceShellCaptionUtils";

const chunks: HammerCaptionBuiltChunk[] = [{ id: "cue:1", speaker: "Renée", startSec: 1.2, endSec: 3.456, text: "Hello, 世界!\nSecond line.", lineCount: 2, charCount: 23, sourceSegmentIds: ["s1"], approximateTiming: false }];

test("caption request lifecycle rejects older builds and obsolete identities", () => {
  const lifecycle = createHammerCaptionRequestLifecycle("workpiece-a|transcript-a|srt");
  const first = lifecycle.begin();
  const second = lifecycle.begin();
  assert.equal(lifecycle.accepts(first), false);
  assert.equal(lifecycle.accepts(second), true);
  lifecycle.syncIdentity("workpiece-b|transcript-b|vtt");
  assert.equal(lifecycle.accepts(second), false);
});

test("SRT and VTT bytes preserve multiline Unicode and terminal behavior", () => {
  assert.equal(renderBuiltSrt(chunks), "1\n00:00:01,200 --> 00:00:03,456\nHello, 世界!\nSecond line.");
  assert.equal(renderBuiltVtt(chunks), "WEBVTT\n\n00:00:01.200 --> 00:00:03.456\nHello, 世界!\nSecond line.");
  assert.equal(renderBuiltSrt([]), "");
  assert.equal(renderBuiltVtt([]), "WEBVTT\n");
});

test("release projection installs current caption artifacts without changing transcript truth", () => {
  const transcript = { schema_version: 1, transcript_id: "t1", source: { kind: "tongs", source_id: "t1" }, language: "en", segments: [{ segment_id: "s1", speaker: "S1", text: "Canonical truth", start_sec: 0, end_sec: 2 }], derived_text_layers: null, subtitle_outputs: null } as never;
  const before = structuredClone(transcript);
  const projected = projectHammerCaptionsForRelease({ transcript, outputLayerId: null, outputRecipeRef: null, formatting: { style: "sentence", maxCharsPerLine: 42, maxLinesPerCaption: 2, includeSpeakerLabels: false, punctuationMode: "preserve", readingSpeed: "standard" }, selectedFormat: "srt", buildState: null, editedState: null });
  assert.deepEqual(projected, before);
  assert.deepEqual(transcript, before);
});

test("caption authority owns editing, invalidation, and release projection without transcript mutation", async () => {
  const source = await readFile(new URL("../src/editor/useHammerWorkspaceShellCaptions.ts", import.meta.url), "utf8");
  assert.ok(source.includes("Caption edits never rewrite transcript truth"));
  assert.ok(source.includes("buildCaptionBasisFingerprint"));
  assert.ok(source.includes("rebuildCaptionArtifactsFromChunks"));
  assert.ok(source.includes("projectHammerCaptionsForRelease"));
  assert.equal(source.includes("setEditableTranscriptSegments"), false);
  assert.equal(source.includes("applyHistoryMutation"), false);
});

test("caption state and editor refs retain their legacy shell registration order", async () => {
  const shell = await readFile(new URL("../src/editor/HammerWorkspaceShell.tsx", import.meta.url), "utf8");
  const state = shell.indexOf("useHammerCaptionState()");
  const editorRefs = shell.indexOf("useHammerCaptionEditorRefs()");
  const derived = shell.indexOf("useHammerCaptionDerivedState({");
  assert.ok(state >= 0 && editorRefs > state && derived > editorRefs);
  assert.equal(shell.includes("function handleRebuildCaptionArtifacts"), false);
  assert.equal(shell.includes("function handleEditCaptionChunkText"), false);
  assert.equal(shell.includes("renderBuiltSrt("), false);
  assert.equal(shell.includes("renderBuiltVtt("), false);
});
