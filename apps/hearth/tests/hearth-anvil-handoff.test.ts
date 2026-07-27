import assert from "node:assert/strict";
import test from "node:test";
import { getHearthAnvilStepModeHint } from "../src/lib/hearth-anvil-handoff";

test("hearthAnvilHandoff: bullet scripts get a Step mode hint", () => {
  const hint = getHearthAnvilStepModeHint({
    scriptText: "[s1]\n- Opening beat\n- First point\n- Second point\n- Closing beat\n[/s1]",
  });

  assert.equal(
    hint,
    "This draft is structured as a bullet script. It'll probably read best in Step mode in Anvil.",
  );
});

test("hearthAnvilHandoff: current full-script content overrides stale outline metadata", () => {
  const hint = getHearthAnvilStepModeHint({
    scriptText: "[s1]\nThis is a complete spoken paragraph, written for the current approved script.\n[/s1]",
  });

  assert.equal(hint, null);
});

test("hearthAnvilHandoff: empty drafts skip the Step mode hint", () => {
  const hint = getHearthAnvilStepModeHint({
    scriptText: "",
  });

  assert.equal(hint, null);
});
