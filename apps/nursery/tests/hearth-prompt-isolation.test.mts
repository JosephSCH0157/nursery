import assert from "node:assert/strict";
import test from "node:test";
import type { EpisodeContext } from "../../hearth/src/lib/hearth-ai-ops";
import type { HearthTurnDecision, HearthTurnMode } from "../../hearth/src/lib/hearth-turn-contract";
import { buildSystemPrompt } from "../server/hearth/create-hearth-ai-handler";

const context: EpisodeContext = {
  episodeId: "unfamiliar-workpiece",
  workspaceId: "workspace-a",
  title: "Unfamiliar Episode",
  titleVariants: { A: "", B: "", C: "" },
  outline: "",
  body: "",
  tonePreset: null,
  sources: [],
  sparks: [],
};

function decision(mode: HearthTurnMode): HearthTurnDecision {
  const requestedArtifact = mode === "outline_generate" ? "outline"
    : mode === "script_generate" || mode === "script_mutate" ? "script"
      : mode === "research" ? "research"
        : mode === "production_action" ? "production" : null;
  return {
    mode,
    requiresArtifact: requestedArtifact !== null,
    allowsMutation: mode === "script_mutate",
    retrievalScope: "active_episode_only",
    requestedArtifact,
    reasons: ["test"],
  };
}

for (const mode of ["conversation", "listening"] as const) {
  test(`${mode} prompt excludes artifact and production contracts`, () => {
    const prompt = buildSystemPrompt(context, "Creator style: plainspoken.", {
      decision: decision(mode),
      listeningTurn: mode === "listening",
      outputPreference: "full_script",
    });
    assert.match(prompt, new RegExp(`Authoritative turn mode:\\s*${mode}`, "i"));
    assert.doesNotMatch(prompt, /ANVIL SCRIPT ARTIFACT CONTRACT/i);
    assert.doesNotMatch(prompt, /Outline generation mode/i);
    assert.doesNotMatch(prompt, /Production action mode/i);
    assert.doesNotMatch(prompt, /Creator output preference for this requested artifact/i);
    assert.doesNotMatch(prompt, /generate immediately/i);
    assert.doesNotMatch(prompt, /rewritten opening|draft seed|forward motion/i);
  });
}

test("script prompt receives only its artifact contract and explicit output preference", () => {
  const prompt = buildSystemPrompt(context, "Creator style: plainspoken.", {
    decision: decision("script_generate"),
    outputPreference: "full_script",
  });
  assert.match(prompt, /ANVIL SCRIPT ARTIFACT CONTRACT/i);
  assert.match(prompt, /Creator output preference for this requested artifact:\s*full_script/i);
  assert.doesNotMatch(prompt, /Outline generation mode/i);
  assert.doesNotMatch(prompt, /Production action mode/i);
});
