import assert from "node:assert/strict";
import test from "node:test";
import type { HearthOp } from "../src/lib/hearth-ai-ops";
import {
  cloneHearthProposalOps,
  isHearthProposalBodyOpDirty,
  normalizeHearthProposalOpsForScriptIngress,
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

test("normalizeHearthProposalOpsForScriptIngress makes approval display body match approved body", () => {
  const blobBody = [
    "[s1]",
    "Alright. Today we are talking voting rights. This needs pacing. Validation check: All speaker tags are standalone lines with proper closes.",
    "[/s1]",
  ].join("\n");
  const rawOps: HearthOp[] = [
    { op: "set_title", value: "Voting Rights" },
    { op: "set_body", value: blobBody },
  ];

  const proposalDisplayOps = normalizeHearthProposalOpsForScriptIngress(rawOps);
  const approvedOps = normalizeHearthProposalOpsForScriptIngress(
    proposalDisplayOps.filter((op) => op.op === "set_body"),
  );
  const displayedBody = proposalDisplayOps.find((op) => op.op === "set_body")?.value ?? "";
  const approvedBody = approvedOps.find((op) => op.op === "set_body")?.value ?? "";

  assert.equal(displayedBody, approvedBody);
  assert.notEqual(displayedBody, blobBody);
  assert.match(displayedBody, /\[(?:beat|pause|reflective pause)\]/);
  assert.doesNotMatch(displayedBody, /Validation check/i);
});
