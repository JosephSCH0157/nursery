import assert from "node:assert/strict";
import test from "node:test";
import { resolveComposeConflicts } from "../src/lib/compose-conflicts";
import { buildSetupFromDefaults, resolveProductionDefaultsUpdate } from "../src/lib/compose-defaults";
import type { ProductionDefaults } from "../src/domain/compose";

const defaults: ProductionDefaults = {
  defaultSpeakerCount: 2,
  defaultSpeakers: ["s1", "s2"],
  defaultMode: "outline_by_speaker",
  defaultTargetSpeaker: null,
  assumeStandardUnlessOverridden: true,
};

test("composeFlowCustomSetup: guest/special episode prompts customization", () => {
  const result = resolveComposeConflicts({
    defaults,
    userRequestedCustomize: false,
    isSpecialEpisode: true,
    importedImpliedSpeakers: ["s1", "s2", "g1"],
  });
  assert.equal(result.shouldPrompt, true);
});

test("composeFlowCustomSetup: unchanged setup does not promote defaults", () => {
  const setup = buildSetupFromDefaults(defaults);
  const nextDefaults = resolveProductionDefaultsUpdate({
    setup,
    currentDefaults: defaults,
    promoteToDefault: true,
  });
  assert.equal(nextDefaults, null);
});
