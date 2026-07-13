import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

type FailureContext = {
  title: string;
  setup: string;
  action: string;
  observed: string;
  expected: string;
  likelyDriftPoint: string;
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

async function run() {
  const source = await readFile(
    new URL("../src/editor/HammerWorkspaceEditor.tsx", import.meta.url),
    "utf-8",
  );

  caseAssert(
    source.includes("applyHostLoopState(resolveHammerReloadSuccess(")
      && source.includes("setHydrationReady(true);"),
    {
      title: "reload success clears rail only on successful hydrate path",
      setup: "Operator clicks `Reload latest` while recovery/conflict rail state is active.",
      action: "Inspect canonical hydration success path in HammerWorkspaceEditor.",
      observed: "Reload success helper was not found in the successful hydrate branch.",
      expected: "The host loop should clear recovery/conflict state only after successful canonical hydrate.",
      likelyDriftPoint: "Reload success branch in HammerWorkspaceEditor hydration effect.",
    },
  );

  caseAssert(
    source.includes("applyHostLoopState(resolveHammerReloadFailure(")
      && source.includes(".catch(async (error) => {"),
    {
      title: "reload failure preserves harder truth in host loop",
      setup: "Operator clicks `Reload latest` but canonical hydration fails.",
      action: "Inspect canonical hydration failure path in HammerWorkspaceEditor.",
      observed: "Reload failure helper was not found in the hydrate failure branch.",
      expected: "The host loop should preserve recovery/conflict truth when canonical hydrate fails.",
      likelyDriftPoint: "Reload failure branch in HammerWorkspaceEditor hydration effect.",
    },
  );

  caseAssert(
    source.includes("applyHostLoopState(resolveHammerSaveSuccess(")
      && source.includes("if (!result.ok) {")
      && source.includes("lastSavedPayloadRef.current = payloadKey;"),
    {
      title: "save success clears unhealthy state only after canonical save result",
      setup: "Operator clicks `Retry save` and persistence save succeeds.",
      action: "Inspect save success branch in HammerWorkspaceEditor autosave effect.",
      observed: "Save success helper was not found in the canonical save success branch.",
      expected: "The host loop should clear save failure and pending state only after canonical save succeeds.",
      likelyDriftPoint: "Save success branch in HammerWorkspaceEditor autosave effect.",
    },
  );

  caseAssert(
    source.includes("applyHostLoopState(resolveHammerSaveFailure(")
      && source.includes("setSaveInFlight(true);"),
    {
      title: "save failure leaves rail unhealthy in host loop",
      setup: "Operator clicks `Retry save` but persistence save fails again.",
      action: "Inspect save failure branch in HammerWorkspaceEditor autosave effect.",
      observed: "Save failure helper was not found in the canonical save failure branch.",
      expected: "The host loop should preserve unhealthy rail state after real save failure.",
      likelyDriftPoint: "Save failure branch in HammerWorkspaceEditor autosave effect.",
    },
  );

  caseAssert(
    source.includes("\"hammer-prep-shell__session-state\"")
      && !source.includes("Recovery available")
      && !source.includes("Reload required"),
    {
      title: "session rail remains the only top-level narrator",
      setup: "Editor host renders the canonical session rail.",
      action: "Inspect top-level host render path for competing hard-coded session language.",
      observed: "Found direct top-level session-language strings outside the derived rail surface.",
      expected: "The host should render the derived rail, not hard-code competing recovery/conflict narration.",
      likelyDriftPoint: "Top-level host JSX in HammerWorkspaceEditor.",
    },
  );

  console.log("Hammer session host integration tests passed.");
}

run().catch((error) => {
  console.error("Hammer session host integration tests failed:", error);
  process.exit(1);
});
