import test from "node:test";
import assert from "node:assert/strict";
import { effectiveOpenAiMode, executeOpenAiTextTransport } from "../dist/providers/openai-text-paid-boundary.js";
import { openAiProviderHeaders } from "../dist/providers/openai-forge-project.js";

test("mode precedence: environment tightens, cannot weaken database controls", () => {
  const modes = ["inactive", "shadow", "enforce", "halt_new"];
  for (const db of modes) for (const env of modes) {
    const expected = db === "halt_new" || env === "halt_new" ? "halt_new"
      : db === "enforce" || env === "enforce" ? "enforce"
        : db === "shadow" || env === "shadow" ? "shadow" : "inactive";
    assert.equal(effectiveOpenAiMode(db, env), expected, `${db}/${env}`);
  }
  assert.equal(effectiveOpenAiMode("corrupt", "inactive"), "halt_new");
});

test("all text provider boundaries reject absent funding under enforcement, including explicit inactive override", async () => {
  const before = process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE;
  process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE = "enforce";
  let calls = 0;
  try {
    for (const routeCode of ["hearth.research_synthesis", "visual.unified_plan", "visual.narrative_interpretation", "motion.broll_interpretation", "hammer.transcript_cleanup", "shorts.discovery", "quench.metadata"]) {
      await assert.rejects(executeOpenAiTextTransport({ routeCode, mode: "inactive", executeLegacy: async () => ++calls }), /funding_context_required/);
    }
    assert.equal(calls, 0);
  } finally {
    if (before == null) delete process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE;
    else process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE = before;
  }
});

test("Forge project is pinned; BYO never inherits Forge organization headers", () => {
  const forge = openAiProviderHeaders("fake-only", "forge");
  assert.equal(forge["openai-project"], "proj_ZuYi36uhWk4Xu8zEYs0PmI2H");
  assert.equal(forge["openai-organization"], "org-M9AuhWvVFuGxXTGTsv33dc7X");
  assert.deepEqual(openAiProviderHeaders("fake-byo", "byo_customer"), { authorization: "Bearer fake-byo" });
});
