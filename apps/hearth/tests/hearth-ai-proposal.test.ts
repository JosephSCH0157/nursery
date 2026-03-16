import assert from "node:assert/strict";
import test from "node:test";
import type { HearthOp } from "../src/lib/hearth-ai-ops";
import {
  cloneHearthProposalOps,
  isHearthProposalBodyOpDirty,
  resetHearthProposalBodyOp,
  updateHearthProposalBodyOp,
} from "../src/lib/hearth-ai-proposal";

test("updateHearthProposalBodyOp only rewrites the targeted staged draft body op", () => {
  const ops: HearthOp[] = [
    { op: "set_title", value: "Title" },
    { op: "set_body", value: "[s1]\nFirst draft\n[/s1]" },
    { op: "add_source", source: { title: "Source" } },
  ];

  const next = updateHearthProposalBodyOp(ops, 1, "[s1]\nEdited draft\n[/s1]");

  assert.deepEqual(next, [
    { op: "set_title", value: "Title" },
    { op: "set_body", value: "[s1]\nEdited draft\n[/s1]" },
    { op: "add_source", source: { title: "Source" } },
  ]);
  assert.notEqual(next, ops);
});

test("updateHearthProposalBodyOp leaves non-body ops unchanged", () => {
  const ops: HearthOp[] = [
    { op: "set_title", value: "Title" },
    { op: "set_outline", value: "Outline" },
  ];

  const next = updateHearthProposalBodyOp(ops, 0, "ignored");

  assert.deepEqual(next, ops);
});

test("cloneHearthProposalOps preserves an immutable proposal baseline", () => {
  const ops: HearthOp[] = [
    { op: "set_body", value: "[s1]\nFirst draft\n[/s1]" },
    { op: "add_source", source: { title: "Source", note: "Original" } },
  ];

  const cloned = cloneHearthProposalOps(ops);
  (cloned[1] as Extract<HearthOp, { op: "add_source" }>).source.note = "Edited";

  assert.deepEqual(ops, [
    { op: "set_body", value: "[s1]\nFirst draft\n[/s1]" },
    { op: "add_source", source: { title: "Source", note: "Original" } },
  ]);
});

test("isHearthProposalBodyOpDirty detects manual edits against the original AI suggestion", () => {
  const originalOps: HearthOp[] = [
    { op: "set_title", value: "Title" },
    { op: "set_body", value: "[s1]\nFirst draft\n[/s1]" },
  ];
  const editedOps = updateHearthProposalBodyOp(originalOps, 1, "[s1]\nEdited draft\n[/s1]");

  assert.equal(isHearthProposalBodyOpDirty(editedOps, originalOps, 1), true);
  assert.equal(isHearthProposalBodyOpDirty(editedOps, originalOps, 0), false);
});

test("resetHearthProposalBodyOp restores the original AI draft body", () => {
  const originalOps: HearthOp[] = [
    { op: "set_body", value: "[s1]\nFirst draft\n[/s1]" },
  ];
  const editedOps = updateHearthProposalBodyOp(originalOps, 0, "[s1]\nEdited draft\n[/s1]");

  const reset = resetHearthProposalBodyOp(editedOps, originalOps, 0);

  assert.deepEqual(reset, originalOps);
});
