import assert from "node:assert/strict";
import test from "node:test";
import type { HearthOp } from "../src/lib/hearth-ai-ops";
import { updateHearthProposalBodyOp } from "../src/lib/hearth-ai-proposal";

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
