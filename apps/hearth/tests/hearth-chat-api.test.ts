import assert from "node:assert/strict";
import test from "node:test";
import { resolveScriptTextFromChatPayload } from "../src/lib/hearth-chat-api";
import type { HearthOp } from "../src/lib/hearth-ai-runtime-contract";

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
