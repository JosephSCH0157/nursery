import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSetupFromDefaults,
  resolveProductionDefaultsUpdate,
} from "../src/lib/compose-defaults";
import type { ComposeSetup, ProductionDefaults } from "../src/domain/compose";

const defaults: ProductionDefaults = {
  defaultSpeakerCount: 2,
  defaultSpeakers: ["s1", "s2"],
  defaultMode: "outline_by_speaker",
  defaultTargetSpeaker: null,
  assumeStandardUnlessOverridden: true,
};

test("composeFlowDefaults: defaults build standard setup", () => {
  const setup = buildSetupFromDefaults(defaults);
  assert.equal(setup.usesProductionDefault, true);
  assert.equal(setup.mode, "outline_by_speaker");
});

test("composeFlowDefaults: defaults are not updated when promote flag is false", () => {
  const setup: ComposeSetup = {
    speakerCount: 3,
    speakers: ["s1", "s2", "g1"],
    mode: "full_script_all_speakers",
    targetSpeaker: null,
    usesProductionDefault: false,
    isOverrideFromProductionDefault: true,
  };
  const nextDefaults = resolveProductionDefaultsUpdate({
    setup,
    currentDefaults: defaults,
    promoteToDefault: false,
  });
  assert.equal(nextDefaults, null);
});

test("composeFlowDefaults: defaults update when promote flag is true", () => {
  const setup: ComposeSetup = {
    speakerCount: 3,
    speakers: ["s1", "s2", "g1"],
    mode: "full_script_all_speakers",
    targetSpeaker: null,
    usesProductionDefault: false,
    isOverrideFromProductionDefault: true,
  };
  const nextDefaults = resolveProductionDefaultsUpdate({
    setup,
    currentDefaults: defaults,
    promoteToDefault: true,
  });
  assert.ok(nextDefaults);
  assert.equal(nextDefaults.defaultSpeakerCount, 3);
  assert.deepEqual(nextDefaults.defaultSpeakers, ["s1", "s2", "g1"]);
  assert.equal(nextDefaults.defaultMode, "full_script_all_speakers");
});
