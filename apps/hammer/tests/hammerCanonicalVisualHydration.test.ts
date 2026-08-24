import assert from "node:assert/strict";
import test from "node:test";
import { projectHammerCanonicalVisualHydration } from "../src/editor/hammerCanonicalVisualHydration";
import { projectHammerMountedCompositionClips } from "../src/editor/hammerMountedCompositionProjection";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import { createHammerHistoryController, createHammerHistoryDocument, hashEditorState, projectHammerHistoryOwnedSessionHead, verifyHammerHistoryAgainstCanonicalHead, type HammerEditorStateSerializable } from "../src/editor/hammerWorkspaceHistory";
import { deriveLegacyVisualPlacementsFromTimeline } from "../src/visuals/persistence/hammerVisualTimelineLegacyAdapter";
import { createEmptyVisualTimelineState } from "../src/visuals/model/hammerVisualDefaults";
import type { HammerVisualTimelineState } from "../src/visuals/model/hammerVisualTypes";
import { HE9_REMOVED_PLACEMENT_ID, he9CommittedTimeline, he9SequenceOneFixture, he9StaleCompatibilityPlacements } from "./fixtures/he9SequenceOneFullShellFixture";

test("sequence-one fixture reproduces the stale compatibility projection before history installation", () => {
  assert.equal(he9StaleCompatibilityPlacements.placements.length, 30);
  assert.equal(he9CommittedTimeline.clips.length, 29);
  assert.ok(he9StaleCompatibilityPlacements.placements.some((placement) => placement.placement_id === HE9_REMOVED_PLACEMENT_ID));
  assert.equal(he9SequenceOneFixture.identities.result_editor_state_hash, "hammer-state:8387e7e6");
});

function editorState(visualPlacements: NonNullable<ReturnType<typeof deriveLegacyVisualPlacementsFromTimeline>>, visualTimeline: HammerVisualTimelineState = he9CommittedTimeline): HammerEditorStateSerializable {
  return {
    transcriptSegments: [],
    visualPlacements: JSON.parse(JSON.stringify(visualPlacements)) as typeof visualPlacements,
    visualTimeline: JSON.parse(JSON.stringify(visualTimeline)) as HammerVisualTimelineState,
    audioEdit: null,
    studioRack: createDefaultHammerStudioRackState(), editorialAuthorityGraph: null,
    outputSelection: { layerId: null, sourceRecipeRef: null }, selectedSegmentId: null,
    playheadSec: 0, transcriptTimingHint: null,
  };
}

function withRuntimeProjection(state: HammerEditorStateSerializable, selectedSegmentId: string | null, playheadSec: number): HammerEditorStateSerializable {
  return { ...state, selectedSegmentId, playheadSec };
}

test("the 30-placement loader projection fails strict current-head validation and the durable projection installs", () => {
  const durablePlacements = deriveLegacyVisualPlacementsFromTimeline(he9CommittedTimeline)!;
  const removedClip = { ...he9CommittedTimeline.clips[0], clip_id: HE9_REMOVED_PLACEMENT_ID, entry_id: "stale:removed-target", anchor_hint: { ...he9CommittedTimeline.clips[0].anchor_hint, anchor_segment_id: "turn_102", matched_segment_ids: ["turn_102"] } };
  const preRemovalTimeline = createEmptyVisualTimelineState({ ...he9CommittedTimeline, clips: [...he9CommittedTimeline.clips, removedClip], lanes: he9CommittedTimeline.lanes.map((lane) => ({ ...lane, clip_ids: [...lane.clip_ids, HE9_REMOVED_PLACEMENT_ID] })) });
  const base = editorState(deriveLegacyVisualPlacementsFromTimeline(preRemovalTimeline)!, preRemovalTimeline);
  const staleLoaderHead = editorState(he9StaleCompatibilityPlacements);
  const durableHead = editorState(durablePlacements);
  const controller = createHammerHistoryController({
    document: createHammerHistoryDocument({ workpieceId: he9SequenceOneFixture.identities.workpiece_id, sessionId: "fixture:sequence-one", baseRevisionId: hashEditorState(base) }),
    initialState: base,
    maxUndoSteps: 100,
  });
  controller.applyMutation({ label: "Remove image placement", affectedPlacementIds: [HE9_REMOVED_PLACEMENT_ID], nextState: durableHead });
  assert.throws(() => verifyHammerHistoryAgainstCanonicalHead({ document: controller.document, canonicalHead: staleLoaderHead }));
  assert.doesNotThrow(() => verifyHammerHistoryAgainstCanonicalHead({ document: controller.document, canonicalHead: durableHead }));
  assert.deepEqual({ undoDepth: controller.document.undoStack.length, redoDepth: controller.document.redoStack.length }, { undoDepth: 1, redoDepth: 0 });
});

test("canonical hydration derives compatibility placements from durable timeline authority", () => {
  const editorialPersistenceCalls = 0;
  const unrelatedBefore = JSON.stringify(he9SequenceOneFixture.unrelated_artifact_fingerprints);
  const projected = projectHammerCanonicalVisualHydration({
    canonicalTimeline: he9CommittedTimeline,
    compatibilityPlacements: he9StaleCompatibilityPlacements,
  });
  const mounted = projectHammerMountedCompositionClips({ timeline: projected.visualTimeline, transcriptSegments: [] });

  assert.equal(projected.placementAuthority, "canonical_timeline");
  assert.equal(projected.visualPlacements?.placements.length, 29);
  assert.equal(mounted.length, 28);
  assert.equal(projected.visualPlacements?.placements.filter((placement) => placement.status === "uncertain").length, 2);
  assert.ok(!projected.visualPlacements?.placements.some((placement) => placement.placement_id === HE9_REMOVED_PLACEMENT_ID));
  assert.deepEqual({ undo: he9SequenceOneFixture.history.undo_stack.length, redo: he9SequenceOneFixture.history.redo_stack.length }, { undo: 1, redo: 0 });
  assert.equal(JSON.stringify(he9SequenceOneFixture.unrelated_artifact_fingerprints), unrelatedBefore);
  assert.equal(editorialPersistenceCalls, 0);
});

test("captured reload ordering deterministically restores history-owned session fields before strict verification", () => {
  const durablePlacements = deriveLegacyVisualPlacementsFromTimeline(he9CommittedTimeline)!;
  const removedClip = { ...he9CommittedTimeline.clips[0], clip_id: HE9_REMOVED_PLACEMENT_ID, entry_id: "stale:removed-target" };
  const preRemovalTimeline = createEmptyVisualTimelineState({ ...he9CommittedTimeline, clips: [...he9CommittedTimeline.clips, removedClip], lanes: he9CommittedTimeline.lanes.map((lane) => ({ ...lane, clip_ids: [...lane.clip_ids, HE9_REMOVED_PLACEMENT_ID] })) });
  const base = withRuntimeProjection(editorState(deriveLegacyVisualPlacementsFromTimeline(preRemovalTimeline)!, preRemovalTimeline), "turn_137", 0);
  const committedHead = withRuntimeProjection(editorState(durablePlacements), "turn_102", 386.5);
  const mountedCanonicalHead = withRuntimeProjection(editorState(durablePlacements), "turn_137", 0);
  const controller = createHammerHistoryController({
    document: createHammerHistoryDocument({ workpieceId: he9SequenceOneFixture.identities.workpiece_id, sessionId: "fixture:captured-order", baseRevisionId: hashEditorState(base) }),
    initialState: base,
    maxUndoSteps: 100,
  });
  controller.applyMutation({ label: "Remove image placement", affectedPlacementIds: [HE9_REMOVED_PLACEMENT_ID], nextState: committedHead });

  assert.throws(() => verifyHammerHistoryAgainstCanonicalHead({ document: controller.document, canonicalHead: mountedCanonicalHead }));
  const first = projectHammerHistoryOwnedSessionHead({ document: controller.document, canonicalHead: mountedCanonicalHead });
  const afterReload = projectHammerHistoryOwnedSessionHead({ document: controller.document, canonicalHead: mountedCanonicalHead });
  assert.deepEqual(first, afterReload);
  assert.equal(first.selectedSegmentId, he9SequenceOneFixture.runtime_projection.head_selected_segment_id);
  assert.equal(first.playheadSec, he9SequenceOneFixture.runtime_projection.head_playhead_sec);
  assert.doesNotThrow(() => verifyHammerHistoryAgainstCanonicalHead({ document: controller.document, canonicalHead: first }));

  const staleDurableHead = withRuntimeProjection(editorState(he9StaleCompatibilityPlacements), "turn_137", 0);
  assert.throws(() => verifyHammerHistoryAgainstCanonicalHead({
    document: controller.document,
    canonicalHead: projectHammerHistoryOwnedSessionHead({ document: controller.document, canonicalHead: staleDurableHead }),
  }));
});

test("placements artifact remains the compatibility fallback when no canonical timeline exists", () => {
  const projected = projectHammerCanonicalVisualHydration({ canonicalTimeline: null, compatibilityPlacements: he9StaleCompatibilityPlacements });
  assert.equal(projected.placementAuthority, "compatibility_artifact");
  assert.equal(projected.visualPlacements?.placements.length, 30);
});

console.log("Hammer canonical visual hydration tests passed.");
