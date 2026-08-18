import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { deriveHammerBrollSuggestionItems, deriveHammerMediaMapBeats, deriveHammerResolvedBrollBindings } from "../src/editor/useHammerWorkspaceShellMediaMap";

test("identical transcript inputs produce deterministic ordered media-map beats without mutation", () => {
  const segments = [
    { segment_id: "s1", text: "Show the product on screen." },
    { segment_id: "s2", text: "According to the cited report." },
  ] as never;
  const before = structuredClone(segments);
  const args = { current: [], segments, removedSegmentIds: ["s2"], placementsBySegmentId: new Map([["s1", { id: "p1", kind: "broll" }]]) };
  const first = deriveHammerMediaMapBeats(args);
  const second = deriveHammerMediaMapBeats(args);
  assert.deepEqual(first, second);
  assert.deepEqual(segments, before);
  assert.equal(first[0]?.id, "map:s1");
  assert.equal(first[0]?.linkedPlacementId, "p1");
});

test("B-roll suggestions remain distinct by resolved state and preserve binding identity", () => {
  const graph = { operations: [{ operation_id: "op1", lifecycle: "active", instruction: {
    type: "insert_broll", segment_id: "s1", start_sec: 1, end_sec: 3, asset_ref: "asset.png",
    asset_binding_state: "resolved", duck_preference: "auto",
  } }] } as never;
  const suggestions = deriveHammerBrollSuggestionItems(graph);
  assert.equal(suggestions.length, 1);
  const bindings = deriveHammerResolvedBrollBindings(suggestions, { placements: [{
    authority_operation_id: "op1", placement_id: "p1", asset_ref: "bound.png",
  }] } as never);
  assert.equal(bindings[0]?.assetRef, "bound.png");
  assert.equal(bindings[0]?.linkedPlacementId, "p1");
});

test("media-map authority excludes loading, placement mutation, view models, persistence, and shorts", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const authority = fs.readFileSync(path.join(root, "src/editor/useHammerWorkspaceShellMediaMap.ts"), "utf8");
  const shell = fs.readFileSync(path.join(root, "src/editor/HammerWorkspaceShell.tsx"), "utf8");
  assert.match(authority, /Media-map authority derives beats, suggestions, removal state/);
  assert.doesNotMatch(authority, /loadWorkpiece|uploadWorkpiece|resolveHammerAutomaticPlacementCommand|buildSourceBayVM|onWorkspaceSnapshotChange|shortCandidate/i);
  assert.doesNotMatch(authority, /setEditableVisualTimeline|applyVisualTimelineAction/);
  assert.doesNotMatch(shell, /const \[mediaMapBeats|const \[removedMediaMapSegmentIds|operations\.flatMap\(\(operation\)/);
  assert.doesNotMatch(shell, /deriveHammerBoundObjects|deriveHammerBoundAttentionQueue|boundObjectById = useMemo/);
});
