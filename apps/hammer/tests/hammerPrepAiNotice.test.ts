import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildHammerPrepAiNoticeApprovalKey,
  buildHammerPrepAiNoticeModel,
  continueHammerPrepAiNotice,
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

test("Continue approves the same preparation attempt without rekeying it", async () => {
  const runKey = "workspace:workpiece:media-signature:7";
  const transition = await continueHammerPrepAiNotice({
    pendingRunKey: runKey,
    effectiveLane: "forge-managed",
    dontShowAgain: false,
  });

  assert.deepEqual(transition, {
    ok: true,
    runKey,
    approvalKey: buildHammerPrepAiNoticeApprovalKey(runKey, "forge-managed"),
  });
  assert.equal(
    transition.ok && transition.approvalKey === buildHammerPrepAiNoticeApprovalKey(runKey, "forge-managed"),
    true,
  );
});

test("a changed media run or funding lane requires fresh approval", async () => {
  const transition = await continueHammerPrepAiNotice({
    pendingRunKey: "workspace:workpiece:media-a:1",
    effectiveLane: "forge-managed",
    dontShowAgain: false,
  });
  assert.equal(transition.ok, true);
  if (!transition.ok) return;

  assert.notEqual(
    transition.approvalKey,
    buildHammerPrepAiNoticeApprovalKey("workspace:workpiece:media-b:1", "forge-managed"),
  );
  assert.notEqual(
    transition.approvalKey,
    buildHammerPrepAiNoticeApprovalKey(transition.runKey, "personal-byo"),
  );
});

test("Don't show this again persists before authorizing Continue", async () => {
  const calls: string[] = [];
  const transition = await continueHammerPrepAiNotice({
    pendingRunKey: "workspace:workpiece:media:1",
    effectiveLane: "forge-managed",
    dontShowAgain: true,
    persistAcknowledgedLane: async (lane) => {
      calls.push(lane);
    },
  });

  assert.equal(transition.ok, true);
  assert.deepEqual(calls, ["forge-managed"]);
});

test("failed acknowledgement persistence surfaces an error and grants no approval", async () => {
  const transition = await continueHammerPrepAiNotice({
    pendingRunKey: "workspace:workpiece:media:1",
    effectiveLane: "forge-managed",
    dontShowAgain: true,
    persistAcknowledgedLane: async () => {
      throw new Error("write failed");
    },
  });

  assert.deepEqual(transition, {
    ok: false,
    reason: "acknowledgement_persistence_failed",
    message: "Hammer could not save this AI notice preference. Try again or clear Don't show this again.",
  });
});

test("Cancel during acknowledgement persistence cannot authorize the pending attempt", async () => {
  let finishPersistence: (() => void) | null = null;
  let pendingRunKey: string | null = "workspace:workpiece:media:1";
  const transitionPromise = continueHammerPrepAiNotice({
    pendingRunKey,
    effectiveLane: "forge-managed",
    dontShowAgain: true,
    persistAcknowledgedLane: () => new Promise<void>((resolve) => {
      finishPersistence = resolve;
    }),
    isPendingRunKeyCurrent: (runKey) => pendingRunKey === runKey,
  });

  pendingRunKey = null;
  assert.ok(finishPersistence);
  finishPersistence();

  assert.deepEqual(await transitionPromise, {
    ok: false,
    reason: "pending_attempt_changed",
    message: "The preparation attempt changed before Hammer could continue.",
  });
});

test("Continue without a pending attempt fails closed", async () => {
  const transition = await continueHammerPrepAiNotice({
    pendingRunKey: null,
    effectiveLane: "forge-managed",
    dontShowAgain: false,
  });
  assert.equal(transition.ok, false);
  assert.equal(transition.ok ? null : transition.reason, "missing_pending_attempt");
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
