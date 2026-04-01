import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveFullScriptAuthoringMeta,
  deriveOutlineScriptAuthoringMeta,
} from "../src/lib/hearth-script-authoring-meta";

test("hearthScriptAuthoringMeta: outline proposals infer speakers from the script body", () => {
  const meta = deriveOutlineScriptAuthoringMeta({
    scriptText: "[s1]\n- Hook\n[/s1]\n[s2]\n- Counterpoint\n[/s2]\n",
    currentMeta: null,
  });

  assert.equal(meta.composeMode, "outline_by_speaker");
  assert.deepEqual(meta.speakers, ["s1", "s2"]);
  assert.equal(meta.speakerCount, 2);
  assert.equal(meta.targetSpeaker, null);
  assert.equal(typeof meta.lastComposedAt, "string");
});

test("hearthScriptAuthoringMeta: outline proposals fall back to the current draft speaker set", () => {
  const meta = deriveOutlineScriptAuthoringMeta({
    scriptText: "",
    currentMeta: {
      composeMode: "full_script_single_speaker",
      targetSpeaker: "g1",
      speakers: ["g1"],
      speakerCount: 1,
      isOverrideFromProductionDefault: false,
      lastComposedAt: null,
    },
  });

  assert.equal(meta.composeMode, "outline_by_speaker");
  assert.deepEqual(meta.speakers, ["g1"]);
  assert.equal(meta.speakerCount, 1);
  assert.equal(meta.targetSpeaker, "g1");
  assert.equal(meta.isOverrideFromProductionDefault, false);
});

test("hearthScriptAuthoringMeta: full script proposals promote the draft out of outline mode", () => {
  const meta = deriveFullScriptAuthoringMeta({
    scriptText: "[s1]\nFull narration.\n[/s1]\n",
    currentMeta: {
      composeMode: "outline_by_speaker",
      targetSpeaker: "s1",
      speakers: ["s1"],
      speakerCount: 1,
      isOverrideFromProductionDefault: true,
      lastComposedAt: null,
    },
  });

  assert.equal(meta.composeMode, "full_script_single_speaker");
  assert.deepEqual(meta.speakers, ["s1"]);
  assert.equal(meta.targetSpeaker, "s1");
});
