import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyHearthDeterministicCleanup,
  parseHearthDeterministicCommand,
  type HearthDeterministicAction,
} from "../src/lib/hearth-deterministic-cleanup";
import { evaluateHearthFormatOnlyPreservation } from "../src/lib/hearth-format-only";
import { requestHearthChatReply } from "../src/lib/hearth-chat-api";

const SOURCE = [
  "[s1]",
  "i'm ready  , but this line is deliberately long enough to need recording-ready shaping while every original word stays present for the speaker.",
  "Repeat this exact line.",
  "Repeat this exact line.",
  "[/s1]",
].join("\n");

const ACTIONS: HearthDeterministicAction[] = [
  "format_only",
  "punctuation_cleanup",
  "grammar_cleanup",
  "deduplicate",
  "rambling_cleanup",
  "structural_cleanup",
];

test("only exact whole-message cleanup commands enter deterministic mode", () => {
  assert.equal(parseHearthDeterministicCommand("format only"), "format_only");
  assert.equal(parseHearthDeterministicCommand("  /grammar-cleanup  "), "grammar_cleanup");
  assert.equal(parseHearthDeterministicCommand("deduplicate"), "deduplicate");
  assert.equal(parseHearthDeterministicCommand("Please format only and rewrite the hook"), null);
  assert.equal(parseHearthDeterministicCommand("Can you clean up the grammar and make it warmer?"), null);
  assert.equal(parseHearthDeterministicCommand("Rewrite this script"), null);
});

test("deterministic cleanups are bounded, preserve speaker tags, and only exact deduplication deletes text", () => {
  const punctuation = applyHearthDeterministicCleanup("punctuation_cleanup", SOURCE);
  assert.match(punctuation.result, /ready, but/);
  assert.match(punctuation.result, /^\[s1\]/);
  assert.match(punctuation.result, /\[\/s1\]$/);

  const grammar = applyHearthDeterministicCleanup("grammar_cleanup", SOURCE);
  assert.match(grammar.result, /I'm ready/);
  assert.equal(grammar.result.replace("I'm", "i'm").replace(/ {2}/g, " "), SOURCE.replace(/ {2}/g, " "));

  const deduplicated = applyHearthDeterministicCleanup("deduplicate", SOURCE);
  assert.equal(deduplicated.result.match(/Repeat this exact line\./g)?.length, 1);
  assert.match(deduplicated.result, /every original word stays present/);
  assert.match(deduplicated.result, /^\[s1\]/);
  assert.match(deduplicated.result, /\[\/s1\]$/);

  for (const action of ["format_only", "rambling_cleanup", "structural_cleanup"] as const) {
    const result = applyHearthDeterministicCleanup(action, SOURCE);
    assert.deepEqual(evaluateHearthFormatOnlyPreservation(SOURCE, result.result), {
      preserved: true,
      changes: [],
    });
  }
});

test("the chat API executes every structured deterministic action without preflight, fetch, or funding lane dependence", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("deterministic action crossed the network boundary");
  };
  try {
    for (const action of ACTIONS) {
      const result = await requestHearthChatReply(
        [{ role: "user", content: action }],
        {
          episodeId: "episode-deterministic",
          workspaceId: null,
          title: "Boundary",
          titleVariants: { A: "", B: "", C: "" },
          outline: "",
          body: SOURCE,
          tonePreset: null,
          sources: [],
          sparks: [],
        },
        { explicitAction: { kind: "deterministic", action } },
      );
      assert.equal(result.ok, true, action);
      if (result.ok) {
        assert.equal(result.turnResult.decision.mode, "deterministic_cleanup");
        assert.equal(result.totalTokens, null);
      }
    }
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the runtime short-circuit precedes capability, credits, quote, and chat transport", () => {
  const runtime = readFileSync(new URL("../src/hooks/useChatWorkspace.ts", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../src/routes/HearthShell.tsx", import.meta.url), "utf8");
  const boundary = runtime.indexOf("if (deterministicAction)");
  assert.ok(boundary > 0);
  for (const paidBoundary of [
    "resolveOwnerChatCapabilityMessage",
    "resolveAiLaneFromStorage()",
    "requestCustomerSpendingAcceptance",
    "requestHearthChatReply(requestMessages",
    "refreshMyAiCredits()",
  ]) {
    assert.ok(runtime.indexOf(paidBoundary, boundary) > boundary, paidBoundary);
  }
  assert.match(runtime.slice(boundary), /createDeterministicProposal/);
  assert.match(shell, /autosaveReasonCode: action === "format_only" \? "format_only" : "deterministic_cleanup"/);
  assert.match(shell, /queueAiAutosave\(/);
});
