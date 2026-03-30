import assert from "node:assert/strict";
import test from "node:test";
import { getHearthAnvilStepModeHint } from "../src/lib/hearth-anvil-handoff";

test("hearthAnvilHandoff: bullet scripts get a Step mode hint", () => {
  const hint = getHearthAnvilStepModeHint({
    composeSetup: {
      speakerCount: 1,
      speakers: ["s1"],
      mode: "outline_by_speaker",
      targetSpeaker: "s1",
      usesProductionDefault: false,
      isOverrideFromProductionDefault: true,
    },
    hasScriptText: true,
  });

  assert.equal(
    hint,
    "This draft is structured as a bullet script. It'll probably read best in Step mode in Anvil.",
  );
});

test("hearthAnvilHandoff: full scripts skip the Step mode hint", () => {
  const hint = getHearthAnvilStepModeHint({
    composeSetup: {
      speakerCount: 1,
      speakers: ["s1"],
      mode: "full_script_single_speaker",
      targetSpeaker: "s1",
      usesProductionDefault: false,
      isOverrideFromProductionDefault: true,
    },
    hasScriptText: true,
  });

  assert.equal(hint, null);
});

test("hearthAnvilHandoff: empty drafts skip the Step mode hint", () => {
  const hint = getHearthAnvilStepModeHint({
    composeSetup: {
      speakerCount: 1,
      speakers: ["s1"],
      mode: "outline_by_speaker",
      targetSpeaker: "s1",
      usesProductionDefault: false,
      isOverrideFromProductionDefault: true,
    },
    hasScriptText: false,
  });

  assert.equal(hint, null);
});
