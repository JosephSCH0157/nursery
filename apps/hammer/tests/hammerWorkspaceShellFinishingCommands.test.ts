import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { HammerEditInstruction } from "../../../packages/contracts/hammer/edit-instruction.contract";
import { appendHammerAuthorityInstructionForHistory } from "../src/editor/hammerCompositionHistoryCommands";
import { projectEditorialAuthorityGraphFromEditPlan } from "../src/editor/hammerRenderAssembly";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import type { HammerEditorStateSerializable, HammerHistoryEntry } from "../src/editor/hammerWorkspaceHistory";
import type { HammerHistoryMutationArgs } from "../src/editor/hammerWorkspaceShellHistoryController";
import { createHammerTransitionCommands } from "../src/editor/hammerWorkspaceShellTransitionCommands";
import { createHammerPodcastMasterCommands } from "../src/editor/useHammerWorkspaceShellAudioFinishing";
import { createHammerVisualLookExposureCommands } from "../src/editor/useHammerWorkspaceShellVisualPreview";

function baseState(): HammerEditorStateSerializable {
  return {
    transcriptSegments: [
      { segment_id: "s1", speaker: "Host", text: "One", start_sec: 0, end_sec: 2 },
      { segment_id: "s2", speaker: "Host", text: "Two", start_sec: 2, end_sec: 5 },
    ],
    visualPlacements: null,
    visualTimeline: null,
    audioEdit: null,
    studioRack: createDefaultHammerStudioRackState(),
    editorialAuthorityGraph: projectEditorialAuthorityGraphFromEditPlan({
      editPlan: { edit_plan_id: "plan", version: "1", created_at: "2026-08-18T00:00:00.000Z",
        updated_at: "2026-08-18T00:00:00.000Z", source_transcript_id: "tx", instructions: [] },
      workspaceId: "ws", workpieceId: "wp", sessionId: "session",
    }),
    outputSelection: { layerId: null, sourceRecipeRef: null },
    selectedSegmentId: "s1",
    playheadSec: 1.2,
    transcriptTimingHint: null,
  };
}

function fixture() {
  let state = baseState();
  const mutations: HammerHistoryMutationArgs[] = [];
  const applyHistoryMutation = (mutation: HammerHistoryMutationArgs): HammerHistoryEntry => {
    mutations.push(mutation);
    state = mutation.computeAfter(state);
    return { id: `e${mutations.length}`, parentEntryId: null, timestamp: "2026-08-18T00:00:00.000Z",
      kind: mutation.kind ?? "editor_state_change", label: mutation.label, forwardPatch: [], inversePatch: [] };
  };
  const appendAuthorityInstruction = (current: HammerEditorStateSerializable, instruction: HammerEditInstruction) => (
    appendHammerAuthorityInstructionForHistory({
      state: current,
      instruction,
      fallback: { graphId: "g", workspaceId: "ws", workpieceId: "wp", sessionId: "session", sourceTranscriptId: "tx" },
    })
  );
  return { applyHistoryMutation, appendAuthorityInstruction, mutations, getState: () => state };
}

test("transition commands preserve types, timing defaults, neighboring identity, and history intent", () => {
  const expected = [
    ["hard_cut", 1.2, 1.3],
    ["crossfade", 1.2, 1.8],
    ["dip_to_black", 1.2, 1.7],
    ["fade_audio", 1.2, 1.7],
  ] as const;
  for (const [type, start, end] of expected) {
    const current = fixture();
    createHammerTransitionCommands({ transcriptDurationSec: 5, ...current }).addMinimalTransition(type);
    const instruction = current.getState().editorialAuthorityGraph?.operations.at(-1)?.instruction;
    assert.deepEqual([instruction?.type, instruction?.start_sec, instruction?.end_sec], [type, start, end]);
    if (instruction?.type === "crossfade") assert.equal(instruction.next_segment_id, "s2");
    assert.deepEqual({ label: current.mutations[0]?.label, kind: current.mutations[0]?.kind,
      tool: current.mutations[0]?.toolId, immediate: current.mutations[0]?.immediatePersist },
    { label: `Add ${type.replace("_", " ")}`, kind: "visual_adjustment", tool: "video", immediate: true });
  }
});

test("Podcast Master command preserves canonical defaults and duplicate no-op", () => {
  const current = fixture();
  const commands = createHammerPodcastMasterCommands(current);
  commands.applyPodcastMasterPass();
  commands.applyPodcastMasterPass();
  const active = current.getState().editorialAuthorityGraph?.operations.filter(
    (operation) => operation.lifecycle === "active" && operation.instruction.type === "podcast_master_pass",
  ) ?? [];
  assert.equal(active.length, 1);
  const instruction = active[0]?.instruction;
  if (instruction?.type !== "podcast_master_pass") assert.fail("expected Podcast Master instruction");
  assert.deepEqual({ cleanup: instruction.noise_cleanup, lufs: instruction.normalization_lufs,
    compression: instruction.compression_amount, ceiling: instruction.limiter_ceiling_dbtp },
  { cleanup: "light", lufs: -16, compression: "medium", ceiling: -1 });
  assert.deepEqual({ label: current.mutations[0]?.label, kind: current.mutations[0]?.kind,
    tool: current.mutations[0]?.toolId, immediate: current.mutations[0]?.immediatePersist },
  { label: "Apply Podcast Master pass", kind: "editor_state_change", tool: "audio", immediate: true });
});

test("look and exposure commands preserve replacement, clamp, units, and history metadata", () => {
  const current = fixture();
  const commands = createHammerVisualLookExposureCommands({
    activeLookPreset: null,
    activeExposureAdjustment: null,
    applyHistoryMutation: current.applyHistoryMutation,
    appendAuthorityInstruction: current.appendAuthorityInstruction,
  });
  commands.applyLookPresetSelection("warm_studio");
  commands.applyExposureAdjustment(140.4);
  const operations = current.getState().editorialAuthorityGraph?.operations ?? [];
  const look = operations.find((operation) => operation.instruction.type === "apply_look")?.instruction;
  const exposure = operations.find((operation) => operation.instruction.type === "apply_exposure")?.instruction;
  if (look?.type !== "apply_look" || exposure?.type !== "apply_exposure") assert.fail("expected visual finishing instructions");
  assert.equal(look.preset, "warm_studio");
  assert.equal(exposure.exposure, 100);
  assert.deepEqual(current.mutations.map((mutation) => ({ label: mutation.label, kind: mutation.kind,
    tool: mutation.toolId, immediate: mutation.immediatePersist })), [
    { label: "Apply warm studio look", kind: "editor_state_change", tool: "video", immediate: true },
    { label: "Set exposure to +100", kind: "editor_state_change", tool: "video", immediate: true },
  ]);
});

test("shell delegates finishing construction to three separately named owners", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const shell = fs.readFileSync(path.join(root, "src/editor/HammerWorkspaceShell.tsx"), "utf8");
  const transition = fs.readFileSync(path.join(root, "src/editor/hammerWorkspaceShellTransitionCommands.ts"), "utf8");
  const audio = fs.readFileSync(path.join(root, "src/editor/useHammerWorkspaceShellAudioFinishing.ts"), "utf8");
  const visual = fs.readFileSync(path.join(root, "src/editor/useHammerWorkspaceShellVisualPreview.ts"), "utf8");
  assert.doesNotMatch(shell, /create(?:HardCut|Crossfade|DipToBlack|FadeAudio|PodcastMasterPass|ApplyLook|ApplyExposure)Instruction/);
  assert.match(transition, /Transition command authority/);
  assert.match(audio, /createHammerPodcastMasterCommands/);
  assert.match(visual, /createHammerVisualLookExposureCommands/);
  assert.doesNotMatch(visual, /resolveHammerAutomaticPlacementCommand|CREATE_CLIP|UPSERT_ASSETS/);
});
