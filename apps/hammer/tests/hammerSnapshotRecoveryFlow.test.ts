import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

type FailureContext = {
  action: string;
  expected: string;
  likelyDriftPoint: string;
  observed: string;
  setup: string;
  title: string;
};

function caseFailure(context: FailureContext): string {
  return [
    `Case: ${context.title}`,
    `Setup: ${context.setup}`,
    `Action: ${context.action}`,
    `Observed: ${context.observed}`,
    `Expected: ${context.expected}`,
    `Likely drift point: ${context.likelyDriftPoint}`,
  ].join("\n");
}

function caseAssert(condition: boolean, context: FailureContext): void {
  assert.ok(condition, caseFailure(context));
}

async function testSnapshotAssistedOpenFlowIsPresent() {
  const source = await readFile(
    "d:/nursery/nursery/apps/hammer/src/editor/HammerWorkspaceShell.tsx",
    "utf-8",
  );

  caseAssert(
    source.includes("loadHammerSnapshotManifest(launchContext.workpiece_id)")
      && source.includes("loadHammerSnapshotPayload({"),
    {
      title: "snapshot artifacts load during bootstrap",
      setup: "Hammer opens editor workspace for a persisted workpiece.",
      action: "Inspect bootstrap sequence in workspace shell.",
      observed: "Snapshot artifact reads were not found in bootstrap sequence.",
      expected: "Bootstrap should load snapshot manifest and snapshot payload.",
      likelyDriftPoint: "History/snapshot bootstrap orchestration in HammerWorkspaceShell.",
    },
  );

  caseAssert(
    source.includes("controller.getReplayStateFromBaseline(")
      && source.includes("snapshot.editorState,")
      && source.includes("snapshot.headEntryId,"),
    {
      title: "snapshot tail replay path",
      setup: "Snapshot payload passes validation against baseline and ledger.",
      action: "Inspect replay invocation for snapshot-assisted recovery.",
      observed: "Snapshot tail replay call not detected.",
      expected: "Recovery should replay only ledger tail after snapshot head entry.",
      likelyDriftPoint: "Snapshot-assisted replay invocation in HammerWorkspaceShell.",
    },
  );
}

async function testFallbackStatusMessagingIsExplicit() {
  const source = await readFile(
    "d:/nursery/nursery/apps/hammer/src/editor/HammerWorkspaceShell.tsx",
    "utf-8",
  );

  caseAssert(
    source.includes("Snapshot fallback:"),
    {
      title: "explicit fallback status prefix",
      setup: "Snapshot recovery fails due to missing/corrupt/stale artifacts.",
      action: "Inspect status messages in recovery path.",
      observed: "Fallback status prefix not found.",
      expected: "Fallback path should publish explicit snapshot fallback status.",
      likelyDriftPoint: "History status assignment in snapshot recovery flow.",
    },
  );

  caseAssert(
    source.includes("snapshot head not found in ledger")
      && source.includes("base revision mismatch"),
    {
      title: "staleness guard reasons",
      setup: "Snapshot payload may be stale relative to current baseline or ledger.",
      action: "Inspect fallback reason branches.",
      observed: "Expected staleness guard reason(s) missing.",
      expected: "Recovery must guard on ledger-head existence and base revision match.",
      likelyDriftPoint: "Snapshot validation branch in HammerWorkspaceShell.",
    },
  );
}

async function run() {
  await testSnapshotAssistedOpenFlowIsPresent();
  await testFallbackStatusMessagingIsExplicit();
  // eslint-disable-next-line no-console
  console.log("Hammer snapshot recovery flow tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer snapshot recovery flow tests failed:", error);
  process.exit(1);
});
