import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sanitizeHearthVisualPlanFailure } from "../src/lib/hearth-visual-plan-operation";

test("Visual Plan failure state retains only bounded sanitized fields", () => {
  const failure = sanitizeHearthVisualPlanFailure({
    status: 502,
    code: "provider failed <secret>",
    stage: "provider transport",
    message: "Safe user-facing failure".repeat(100),
  });
  assert.equal(failure.status, 502);
  assert.equal(failure.code, "provider_failed__secret_");
  assert.equal(failure.stage, "provider_transport");
  assert.equal(failure.message.length, 500);
  assert.equal(JSON.stringify(failure).includes("raw_provider_response"), false);
});

test("package refresh cannot clear the durable Visual Plan failure", async () => {
  const [workspace, loader, actions] = await Promise.all([
    readFile(new URL("../src/hooks/visuals/useMediaMapWorkspace.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/visuals/useEpisodePackageLoader.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/visuals/useMediaMapGenerationActions.ts", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /visualPlanFailure/);
  assert.doesNotMatch(loader, /setVisualPlanFailure/);
  assert.match(actions, /setVisualPlanFailure\(null\)/);
  assert.match(actions, /setVisualPlanFailure\(sanitizeHearthVisualPlanFailure/);
});
