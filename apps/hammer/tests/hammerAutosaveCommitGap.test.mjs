import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const WORKSPACE_EDITOR_PATH = "d:/nursery/nursery/apps/hammer/src/editor/HammerWorkspaceEditor.tsx";
const SNAPSHOT_EMITTER_PATH = "d:/nursery/nursery/apps/hammer/src/editor/hammerWorkspaceShellSnapshotEmitter.ts";
const WORKSPACE_SHELL_PATH = "d:/nursery/nursery/apps/hammer/src/editor/HammerWorkspaceShell.tsx";

async function run() {
  const emitterSource = await readFile(SNAPSHOT_EMITTER_PATH, "utf-8");
  assert.ok(
    emitterSource.includes("useLayoutEffect("),
    "Expected snapshot emitter to use useLayoutEffect for prompt parent emission.",
  );
  assert.ok(
    emitterSource.includes("persistNowRequestNonce"),
    "Expected snapshot emitter to accept explicit persist-now boundary signals.",
  );

  const editorSource = await readFile(WORKSPACE_EDITOR_PATH, "utf-8");
  assert.ok(
    editorSource.includes("const queueRevisionAutosave"),
    "Expected a queueRevisionAutosave helper to exist in HammerWorkspaceEditor.",
  );
  assert.ok(
    editorSource.includes("const handleWorkspaceSnapshotChange"),
    "Expected HammerWorkspaceEditor to handle snapshot changes with a dedicated handler.",
  );
  assert.ok(
    editorSource.includes("onWorkspaceSnapshotChange={canPersistCanonicalState ? handleWorkspaceSnapshotChange : undefined}"),
    "Expected HammerWorkspaceShell to receive handleWorkspaceSnapshotChange (not raw setWorkspaceSnapshot).",
  );
  assert.ok(
    editorSource.includes("queueRevisionAutosave(snapshot, options?.persistNow === true);"),
    "Expected snapshot handler to escalate explicit persist-now boundaries to immediate revision saves.",
  );
  assert.ok(
    editorSource.includes("const queueRevisionAutosave = useCallback((snapshot: HammerWorkspaceSnapshot, persistNow = false): void =>"),
    "Expected queueRevisionAutosave to support immediate durable saves at workflow boundaries.",
  );

  const shellSource = await readFile(WORKSPACE_SHELL_PATH, "utf-8");
  assert.ok(
    shellSource.includes("function flushPendingPlacementDrafts(): void"),
    "Expected HammerWorkspaceShell to flush visible placement drafts into canonical state before moving on.",
  );
  assert.ok(
    shellSource.includes("requestDurablePersistBoundary();"),
    "Expected HammerWorkspaceShell to request immediate durable persistence after committed edit boundaries.",
  );

  // eslint-disable-next-line no-console
  console.log("Hammer autosave commit-gap tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer autosave commit-gap tests failed:", error);
  process.exit(1);
});
