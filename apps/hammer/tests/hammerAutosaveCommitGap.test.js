import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const WORKSPACE_EDITOR_PATH = "d:/nursery/nursery/apps/hammer/src/editor/HammerWorkspaceEditor.tsx";
const SNAPSHOT_EMITTER_PATH = "d:/nursery/nursery/apps/hammer/src/editor/hammerWorkspaceShellSnapshotEmitter.ts";

async function run() {
  const emitterSource = await readFile(SNAPSHOT_EMITTER_PATH, "utf-8");
  assert.ok(
    emitterSource.includes("useLayoutEffect("),
    "Expected snapshot emitter to use useLayoutEffect for prompt parent emission.",
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
    editorSource.includes("queueRevisionAutosave(snapshot);"),
    "Expected snapshot handler to queue autosave for committed canonical changes.",
  );

  // eslint-disable-next-line no-console
  console.log("Hammer autosave commit-gap tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer autosave commit-gap tests failed:", error);
  process.exit(1);
});

