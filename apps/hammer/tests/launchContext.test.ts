import assert from "node:assert/strict";
import type { HammerLaunchContext } from "../../../packages/contracts/hammer/launch-context.contract";
import {
  getHammerDevLaunchPreset,
  resolveHammerDevLaunchContext,
} from "../src/dev/hammerLaunchPresets";
import {
  getHammerStubLaunchScenario,
  readHammerStubLaunchScenarioId,
} from "../src/dev/hammerStubLaunches";
import { DEFAULT_TRANSCRIPT_FIXTURE_ID, getDevTranscriptSegments } from "../src/dev/transcriptFixtures";
import {
  loadHammerLaunchWorkspaceMapping,
  resolveHammerLaunchContext,
} from "../src/lib/launchContext";

const resolverDeps = {
  getFixtureSegments: getDevTranscriptSegments,
  defaultFixtureId: DEFAULT_TRANSCRIPT_FIXTURE_ID,
};

{
  const devContext = getHammerDevLaunchPreset("dev-tone-basic");
  const resolved = resolveHammerLaunchContext(devContext, resolverDeps);

  assert.equal(resolved.launch_context.source_mode, "dev");
  assert.equal(resolved.transcript.kind, "fixture");
  assert.equal(resolved.transcript.source_label, `fixture:${DEFAULT_TRANSCRIPT_FIXTURE_ID}`);
  assert.equal(resolved.transcript.segments.length > 0, true);
  assert.equal(resolved.media.kind, "dev-tone");
  assert.equal(resolved.media.requires_resolution, false);
  assert.equal(resolved.initial_edit_plan, null);
  assert.equal(resolved.initial_preview_mode, "edit-aware");
  assert.equal(resolved.launch_context.visual_package?.workspace_id, devContext.workspace_id);
  assert.equal(resolved.launch_context.visual_package?.workpiece_id, devContext.workpiece_id);
  assert.equal(
    resolved.launch_context.visual_package?.visuals[0]?.selected_asset?.storage_key.includes(devContext.workpiece_id),
    true,
  );
}

{
  const tongsContext = getHammerDevLaunchPreset("tongs-stub-with-edit-plan");
  const resolved = resolveHammerLaunchContext(tongsContext, resolverDeps);

  assert.equal(resolved.launch_context.source_mode, "tongs");
  assert.equal(resolved.initial_edit_plan?.edit_plan_id, "plan_tongs_stub_v1");
  assert.equal(resolved.initial_edit_plan?.instructions.length, 2);
  assert.equal(resolved.initial_preview_mode, "raw");
  assert.equal(
    resolved.initial_edit_plan?.source_transcript_id,
    resolved.transcript.source_label,
  );
}

{
  const overrideContext: HammerLaunchContext = {
    ...getHammerDevLaunchPreset("tongs-stub-clean"),
    preview_mode: "raw",
  };
  const resolved = resolveHammerLaunchContext(overrideContext, resolverDeps);

  assert.equal(resolved.initial_edit_plan, null);
  assert.equal(resolved.initial_preview_mode, "raw");
}

{
  const mappedMissing = getHammerDevLaunchPreset("mapped-media-missing");
  const resolved = resolveHammerLaunchContext(mappedMissing, resolverDeps);
  const workspaceMapping = await loadHammerLaunchWorkspaceMapping(resolved);

  assert.equal(resolved.launch_context.source_mode, "mapped");
  assert.equal(resolved.media.kind, "mapped-local");
  assert.equal(resolved.media.requires_resolution, true);
  assert.equal(workspaceMapping, null);
}

{
  const derived = resolveHammerDevLaunchContext("?launch_preset=tongs-stub-with-edit-plan&preview_mode=raw");

  assert.equal(derived.source_mode, "tongs");
  assert.equal(derived.transcript.kind, "tongs-stub");
  assert.equal(derived.media.kind, "tongs-stub");
  assert.equal(derived.preview_mode, "raw");
  assert.equal(derived.visual_package?.workspace_id, derived.workspace_id);
  assert.equal(derived.visual_package?.workpiece_id, derived.workpiece_id);
}

{
  const scenario = getHammerStubLaunchScenario("existing-edit-plan");
  const resolved = resolveHammerLaunchContext(scenario.launchContext, resolverDeps);

  assert.equal(scenario.launchContext.workspace_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(scenario.launchContext.workpiece_id, "33333333-3333-4333-8333-333333333333");
  assert.equal(scenario.launchContext.edit_plan?.workpiece_id, "33333333-3333-4333-8333-333333333333");
  assert.equal(scenario.launchContext.visual_package?.workspace_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(scenario.launchContext.visual_package?.workpiece_id, "33333333-3333-4333-8333-333333333333");
  assert.equal(
    scenario.launchContext.visual_package?.visuals[0]?.selected_asset?.path.includes("33333333-3333-4333-8333-333333333333"),
    true,
  );
  assert.equal(resolved.initial_edit_plan?.edit_plan_id, "plan_tongs_stub_v1");
  assert.equal(resolved.initial_preview_mode, "raw");
}

{
  const scenario = getHammerStubLaunchScenario("mapped-media-missing");
  const resolved = resolveHammerLaunchContext(scenario.launchContext, resolverDeps);

  assert.equal(resolved.launch_context.source_mode, "mapped");
  assert.equal(resolved.media.kind, "mapped-local");
  assert.equal(resolved.initial_edit_plan, null);
  assert.equal(readHammerStubLaunchScenarioId("?hammer_stub=mapped-media-missing"), "mapped-media-missing");
  assert.equal(readHammerStubLaunchScenarioId("?hammer_stub=unknown"), null);
}

{
  const overridden = resolveHammerDevLaunchContext(
    "?launch_preset=dev-tone-basic&workspace_id=ws_override&workpiece_id=wp_override&transcript_fixture=podcast_b",
  );

  assert.equal(overridden.workspace_id, "ws_override");
  assert.equal(overridden.workpiece_id, "wp_override");
  assert.equal(overridden.transcript.kind, "fixture");
  assert.equal(overridden.transcript.fixture_id, "podcast_b");
  assert.equal(overridden.visual_package?.workspace_id, "ws_override");
  assert.equal(overridden.visual_package?.workpiece_id, "wp_override");
  assert.equal(overridden.visual_package?.visuals.length, 3);
  assert.equal(
    overridden.visual_package?.visuals.every((visual) => (
      visual.selected_asset?.storage_key.includes("wp_override") ?? false
    )),
    true,
  );
}

{
  const presetA = getHammerDevLaunchPreset("dev-tone-basic");
  const presetB = getHammerDevLaunchPreset("dev-tone-basic");

  if (presetA.visual_package?.visuals[0]) {
    presetA.visual_package.visuals[0].selected_asset_id = "mutated";
  }

  assert.notEqual(presetA.visual_package?.visuals[0]?.selected_asset_id, presetB.visual_package?.visuals[0]?.selected_asset_id);
}

console.log("Hammer launch context tests passed.");
