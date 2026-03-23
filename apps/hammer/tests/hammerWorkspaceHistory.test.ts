import assert from "node:assert/strict";
import {
  clearHammerHistory,
  createHammerHistoryState,
  pushHammerHistoryEntry,
  redoHammerHistory,
  undoHammerHistory,
} from "../src/editor/hammerWorkspaceHistory";

async function testPushAndStackLimits() {
  const history = createHammerHistoryState(2);
  const trace: string[] = [];

  for (let index = 0; index < 3; index += 1) {
    const id = `entry-${index}`;
    pushHammerHistoryEntry(history, {
      id,
      label: id,
      timestamp: index,
      undo: () => {
        trace.push(`undo:${id}`);
      },
      redo: () => {
        trace.push(`redo:${id}`);
      },
    });
  }

  assert.equal(history.undoStack.length, 2);
  assert.equal(history.undoStack[0]?.id, "entry-1");
  assert.equal(history.undoStack[1]?.id, "entry-2");
  assert.equal(history.redoStack.length, 0);
}

async function testUndoRedoFlow() {
  const history = createHammerHistoryState(10);
  const trace: string[] = [];

  pushHammerHistoryEntry(history, {
    id: "entry-a",
    label: "entry-a",
    timestamp: 1,
    undo: () => {
      trace.push("undo:a");
    },
    redo: () => {
      trace.push("redo:a");
    },
  });

  pushHammerHistoryEntry(history, {
    id: "entry-b",
    label: "entry-b",
    timestamp: 2,
    undo: () => {
      trace.push("undo:b");
    },
    redo: () => {
      trace.push("redo:b");
    },
  });

  assert.equal(undoHammerHistory(history), true);
  assert.deepEqual(trace, ["undo:b"]);
  assert.equal(history.undoStack.length, 1);
  assert.equal(history.redoStack.length, 1);

  assert.equal(redoHammerHistory(history), true);
  assert.deepEqual(trace, ["undo:b", "redo:b"]);
  assert.equal(history.undoStack.length, 2);
  assert.equal(history.redoStack.length, 0);
}

async function testRedoClearsOnNewPush() {
  const history = createHammerHistoryState(10);
  pushHammerHistoryEntry(history, {
    id: "first",
    label: "first",
    timestamp: 1,
    undo: () => {},
    redo: () => {},
  });
  assert.equal(undoHammerHistory(history), true);
  assert.equal(history.redoStack.length, 1);

  pushHammerHistoryEntry(history, {
    id: "second",
    label: "second",
    timestamp: 2,
    undo: () => {},
    redo: () => {},
  });
  assert.equal(history.redoStack.length, 0);
}

async function testFailureSafety() {
  const history = createHammerHistoryState(10);
  pushHammerHistoryEntry(history, {
    id: "bad-undo",
    label: "bad-undo",
    timestamp: 1,
    undo: () => {
      throw new Error("undo failed");
    },
    redo: () => {},
  });

  assert.equal(undoHammerHistory(history), false);
  assert.equal(history.undoStack.length, 1);
  assert.equal(history.redoStack.length, 0);

  clearHammerHistory(history);
  pushHammerHistoryEntry(history, {
    id: "bad-redo",
    label: "bad-redo",
    timestamp: 2,
    undo: () => {},
    redo: () => {
      throw new Error("redo failed");
    },
  });

  assert.equal(undoHammerHistory(history), true);
  assert.equal(redoHammerHistory(history), false);
  assert.equal(history.undoStack.length, 0);
  assert.equal(history.redoStack.length, 1);
}

async function run() {
  await testPushAndStackLimits();
  await testUndoRedoFlow();
  await testRedoClearsOnNewPush();
  await testFailureSafety();
  // eslint-disable-next-line no-console
  console.log("Hammer workspace history tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer workspace history tests failed:", error);
  process.exit(1);
});
