import assert from "node:assert/strict";
import test from "node:test";
import { validateScriptTags } from "@forge/shared/script-tags";
import { coalesceScriptTextIntoOps, resolveScriptTextFromChatPayload } from "../src/lib/hearth-chat-api";
import type { HearthOp } from "../src/lib/hearth-ai-runtime-contract";

function assertMaxSpeakerSpokenLines(script: string, maxLines: number): void {
  let insideSpeaker = false;
  let count = 0;
  for (const line of script.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[(?:s1|s2|g1|g2)\]$/i.test(trimmed)) {
      insideSpeaker = true;
      count = 0;
      continue;
    }
    if (/^\[\/(?:s1|s2|g1|g2)\]$/i.test(trimmed)) {
      assert.ok(count <= maxLines, `speaker block had ${count} spoken lines:\n${script}`);
      insideSpeaker = false;
      count = 0;
      continue;
    }
    if (insideSpeaker && trimmed && !/^\[(?:beat|pause|reflective pause)\]$/i.test(trimmed)) count += 1;
  }
}

test("resolveScriptTextFromChatPayload promotes canonical assistant text into script text", () => {
  const ops: HearthOp[] = [];
  const assistantText = [
    "[s1]",
    "- Open with the basic fact.",
    "- Frame the episode as a media-framing comparison.",
    "[/s1]",
    "",
    "[s2]",
    "- Close with the practical takeaway.",
    "[/s2]",
  ].join("\n");

  const result = resolveScriptTextFromChatPayload({
    assistantText,
    ops,
    scriptText: undefined,
  });

  assert.equal(result, assistantText);
});

test("resolveScriptTextFromChatPayload extracts canonical script from wrapped assistant prose", () => {
  const ops: HearthOp[] = [];
  const result = resolveScriptTextFromChatPayload({
    assistantText: [
      "Here is the panel-ready bullet script:",
      "",
      "[s1]",
      "- Hook.",
      "[/s1]",
      "",
      "[s2]",
      "- Close.",
      "[/s2]",
      "",
      "Use Step mode in Anvil.",
    ].join("\n"),
    ops,
    scriptText: undefined,
  });

  assert.equal(result, ["[s1]", "- Hook.", "[/s1]", "", "[s2]", "- Close.", "[/s2]"].join("\n"));
});

test("resolveScriptTextFromChatPayload does not promote ordinary assistant prose", () => {
  const result = resolveScriptTextFromChatPayload({
    assistantText: "This is a great angle. Want me to turn it into a bullet script?",
    ops: [],
    scriptText: undefined,
  });

  assert.equal(result, undefined);
});

test("resolveScriptTextFromChatPayload respects an existing body op", () => {
  const result = resolveScriptTextFromChatPayload({
    assistantText: "[s1]\n- Alternate draft\n[/s1]",
    ops: [{ op: "set_body", value: "[s1]\nExisting draft\n[/s1]" }],
    scriptText: undefined,
  });

  assert.equal(result, undefined);
});

test("coalesceScriptTextIntoOps shapes set_body proposals before review display", () => {
  const blobScript = [
    "[s1]",
    "Alright. I want to talk about voting rights. And I want to talk about racism. Here is the thesis. If we actually want to end racism, we have to stop governing through race. Not stop noticing reality. Not stop enforcing fairness. But stop using race as the steering wheel for public policy.",
    "[/s1]",
  ].join("\n");

  const ops = coalesceScriptTextIntoOps([{ op: "set_body", value: blobScript }], undefined);
  const body = ops.find((op) => op.op === "set_body")?.value ?? "";

  assert.notEqual(body, blobScript);
  assert.equal(validateScriptTags(body).ok, true);
  assert.match(body, /\[(?:pause|beat|reflective pause)\]/);
  assert.ok((body.match(/\[s1\]/g) ?? []).length > 1);
  assertMaxSpeakerSpokenLines(body, 3);
  assert.equal(body.split(/\r?\n/).some((line) => line.trim() === ""), true);
});

test("coalesceScriptTextIntoOps shapes script_text before adding a body proposal", () => {
  const blobScript = [
    "[s1]",
    "This is the point. It lands hard. Then the next idea needs room. The audience needs to breathe before the argument turns.",
    "[/s1]",
  ].join("\n");

  const ops = coalesceScriptTextIntoOps([], blobScript);
  const body = ops.find((op) => op.op === "set_body")?.value ?? "";

  assert.notEqual(body, blobScript);
  assert.equal(validateScriptTags(body).ok, true);
  assert.match(body, /\[(?:pause|beat|reflective pause)\]/);
  assertMaxSpeakerSpokenLines(body, 3);
});
