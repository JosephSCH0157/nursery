import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAnvilHandoffSearch,
  validateAnvilHandoffTarget,
  type HandoffEpisodeSummary,
} from "../src/lib/forge-handoff-validation.ts";

const WORKSPACE_ID = "2980fc39-8c8b-489a-a900-8d3bd3248432";
const WORKPIECE_ID = "cf464ad0-8745-43df-99ee-7bfca5dddcd8";

function createEpisode(overrides?: Partial<HandoffEpisodeSummary>): HandoffEpisodeSummary {
  return {
    id: WORKPIECE_ID,
    workspace_id: WORKSPACE_ID,
    archived_at: null,
    ...overrides,
  };
}

test("parseAnvilHandoffSearch normalizes a valid script path", () => {
  const parsed = parseAnvilHandoffSearch("?open=script&script_path=script%2Fscript.md");
  assert.equal(parsed.openTarget, "script");
  assert.equal(parsed.scriptPath, "script/script.md");
  assert.equal(parsed.hasInvalidScriptPath, false);
});

test("parseAnvilHandoffSearch flags invalid script paths", () => {
  const parsed = parseAnvilHandoffSearch("?open=script&script_path=..%2Fsecrets.txt");
  assert.equal(parsed.scriptPath, null);
  assert.equal(parsed.hasInvalidScriptPath, true);
});

test("validateAnvilHandoffTarget accepts a canonical workpiece and script", async () => {
  const result = await validateAnvilHandoffTarget({
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    scriptPath: "script/script.md",
    listEpisodes: async () => [createEpisode()],
    readTextFile: async () => ({ exists: true }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.equal(result.workpieceId, WORKPIECE_ID);
  assert.equal(result.scriptPath, "script/script.md");
});

test("validateAnvilHandoffTarget rejects archived workpieces", async () => {
  const result = await validateAnvilHandoffTarget({
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    scriptPath: "script/script.md",
    listEpisodes: async () => [createEpisode({ archived_at: "2026-03-11T12:00:00.000Z" })],
    readTextFile: async () => ({ exists: true }),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "archived");
});

test("validateAnvilHandoffTarget rejects workpieces missing from the requested workspace", async () => {
  const result = await validateAnvilHandoffTarget({
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    scriptPath: "script/script.md",
    listEpisodes: async () => [],
    readTextFile: async () => ({ exists: true }),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "workpiece_missing");
});

test("validateAnvilHandoffTarget rejects missing scripts", async () => {
  const result = await validateAnvilHandoffTarget({
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    scriptPath: "script/script.md",
    listEpisodes: async () => [createEpisode()],
    readTextFile: async () => ({ exists: false }),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "script_missing");
});
