import assert from "node:assert/strict";
import type { HammerLaunchContext } from "../../../packages/contracts/hammer/launch-context.contract";
import {
  getHammerDevLaunchPreset,
  resolveHammerDevLaunchContext,
} from "../src/dev/hammerLaunchPresets";
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
}

console.log("Hammer launch context tests passed.");
