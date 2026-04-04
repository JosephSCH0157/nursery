import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildHammerPrepAiNoticeModel,
  shouldShowHammerPrepAiNotice,
} from "../src/prep/hammerPrepAiNotice";

test("buildHammerPrepAiNoticeModel returns Forge lane copy", () => {
  const model = buildHammerPrepAiNoticeModel("forge-managed");
  assert.equal(model.title, "Preparing this episode");
  assert.equal(
    model.body,
    "This step may use AI to generate a transcript and prepare your editing workspace. AI usage may consume credits depending on your settings.",
  );
  assert.equal(model.laneDetail, "Uses Forge-managed AI.");
  assert.equal(model.prepAllowed, true);
  assert.equal(model.laneSignature, "forge-managed");
});

test("buildHammerPrepAiNoticeModel returns BYO lane copy", () => {
  const model = buildHammerPrepAiNoticeModel("personal-byo");
  assert.equal(model.title, "Preparing this episode");
  assert.equal(
    model.body,
    "This step may use AI to generate a transcript and prepare your editing workspace.",
  );
  assert.equal(model.laneDetail, "Uses your personal AI provider.");
  assert.equal(model.prepAllowed, true);
  assert.equal(model.laneSignature, "personal-byo");
});

test("buildHammerPrepAiNoticeModel returns disabled lane copy", () => {
  const model = buildHammerPrepAiNoticeModel("ai-disabled");
  assert.equal(model.title, "Preparing this episode");
  assert.equal(
    model.body,
    "AI is currently disabled. Episode prep will only continue if reusable prep artifacts or an existing transcript are available.",
  );
  assert.equal(model.laneDetail, "No new AI transcription will be started.");
  assert.equal(model.prepAllowed, false);
  assert.equal(model.laneSignature, "ai-disabled");
});

test("shouldShowHammerPrepAiNotice gates by lane signature", () => {
  assert.equal(
    shouldShowHammerPrepAiNotice({
      effectiveLane: "forge-managed",
      acknowledgedLaneSignature: null,
    }),
    true,
  );

  assert.equal(
    shouldShowHammerPrepAiNotice({
      effectiveLane: "forge-managed",
      acknowledgedLaneSignature: "forge-managed",
    }),
    false,
  );

  assert.equal(
    shouldShowHammerPrepAiNotice({
      effectiveLane: "personal-byo",
      acknowledgedLaneSignature: "forge-managed",
    }),
    true,
  );
});
