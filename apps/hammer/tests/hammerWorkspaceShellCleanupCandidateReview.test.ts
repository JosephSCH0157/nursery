import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildCleanupCandidateQueue, clampActiveCleanupCandidateIndex } from "../src/editor/hammerCleanupCandidateQueue";

const segments = [
  { segment_id: "f1", speaker: "S1", text: "Um, this is useful.", start_sec: 0, end_sec: 2 },
  { segment_id: "r1", speaker: "S1", text: "I mean—", start_sec: 3, end_sec: 4 },
  { segment_id: "r2", speaker: "S1", text: "This is the final thought.", start_sec: 4.1, end_sec: 6 },
];
const fillerOptions = { aggressiveness: "medium" as const, protectIntentionalPhrasing: true };
const retakeOptions = { collapseRestartChains: true, minimumRestartGapMs: 120, preserveMeaningfulVariants: true };

test("filler and retake cleanup queues remain distinct and deterministic", () => {
  const fillers = buildCleanupCandidateQueue({ kind: "fillers", segments, fillerOptions, retakeOptions, handledCandidateIds: new Set() });
  const retakes = buildCleanupCandidateQueue({ kind: "retakes", segments, fillerOptions, retakeOptions, handledCandidateIds: new Set() });
  assert.ok(fillers.cards.every((card) => card.kind === "fillers"));
  assert.ok(retakes.cards.every((card) => card.kind === "retakes"));
  assert.deepEqual(fillers.cards.map((card) => card.id), buildCleanupCandidateQueue({ kind: "fillers", segments, fillerOptions, retakeOptions, handledCandidateIds: new Set() }).cards.map((card) => card.id));
});

test("handled candidates are excluded and active indices retain established clamping", () => {
  const initial = buildCleanupCandidateQueue({ kind: "fillers", segments, fillerOptions, retakeOptions, handledCandidateIds: new Set() });
  const handled = new Set(initial.cards.slice(0, 1).map((card) => card.id));
  const next = buildCleanupCandidateQueue({ kind: "fillers", segments, fillerOptions, retakeOptions, handledCandidateIds: handled });
  assert.equal(next.cards.some((card) => handled.has(card.id)), false);
  assert.equal(clampActiveCleanupCandidateIndex(4, 0), 0);
  assert.equal(clampActiveCleanupCandidateIndex(4, 2), 1);
});

test("controller preserves canonical cleanup history labels, persistence, guards, and receipts", async () => {
  const source = await readFile(new URL("../src/editor/useHammerWorkspaceShellCleanupCandidateReview.ts", import.meta.url), "utf8");
  assert.ok(source.includes('"Approve filler removal"'));
  assert.ok(source.includes('"Approve retake removal"'));
  assert.ok(source.includes('kind: "cleanup_tool"'));
  assert.ok(source.includes("immediatePersist: true"));
  assert.ok(source.includes("inFlightRef.current[kind]"));
  assert.ok(source.includes("lastHandledIdRef.current[card.kind]"));
  assert.ok(source.includes("Candidate discarded (no transcript or audio change)."));
});

test("cleanup review is explicitly isolated from future shorts and neighboring authorities", async () => {
  const source = await readFile(new URL("../src/editor/useHammerWorkspaceShellCleanupCandidateReview.ts", import.meta.url), "utf8");
  assert.ok(source.includes("not a short-candidate system"));
  assert.equal(source.includes("shortCandidate"), false);
  assert.equal(source.includes("StudioRack"), false);
  assert.equal(source.includes("Caption"), false);
  assert.equal(source.includes("AutomaticPlacement"), false);
});
