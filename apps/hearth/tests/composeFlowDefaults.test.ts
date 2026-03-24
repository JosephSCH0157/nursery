import assert from "node:assert/strict";
import test from "node:test";
import { buildSetupFromDefaults } from "../src/lib/compose-defaults";

test("composeFlowDefaults: defaults build standard setup", () => {
  const setup = buildSetupFromDefaults({
    defaultSpeakerCount: 2,
    defaultSpeakers: ["s1", "s2"],
    defaultMode: "outline_by_speaker",
    defaultTargetSpeaker: null,
    assumeStandardUnlessOverridden: true,
  });
  assert.equal(setup.usesProductionDefault, true);
  assert.equal(setup.mode, "outline_by_speaker");
});
