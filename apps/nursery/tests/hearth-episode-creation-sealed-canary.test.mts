import assert from "node:assert/strict";
import test from "node:test";
import { buildHearthEditorialPreflightReport } from "../../hearth/src/lib/hearth-editorial-preflight";
import { validateHearthCompositionArtifact } from "../../hearth/src/lib/hearth-composition-output";
import { parseCreatorSuppliedResearch } from "../server/hearth/hearth-creator-research-ingest";
import { buildSystemPrompt } from "../server/hearth/create-hearth-ai-handler";
import { filterHearthOperationsForDecision, resolveHearthTurnDecision } from "../server/hearth/hearth-turn-decision";

const lifecycle = { hasDraft: true, hasApprovedScript: false, isReady: false };
const episodeContext = {
  episodeId: "sealed-canary-workpiece",
  workspaceId: "sealed-canary-workspace",
  title: "The Victorian Ice Wells Beneath London",
  titleVariants: { A: "", B: "", C: "" },
  outline: "",
  body: "",
  tonePreset: null,
  sources: [],
  sparks: [],
};

test("sealed unseen-domain canary traverses the deterministic episode-creation contracts", () => {
  const listening = resolveHearthTurnDecision({
    creatorText: "I want to begin with a block of imported ice descending beneath a crowded street, then explain the wells, the workers who supplied them, why mechanical refrigeration displaced them, and what survives. Are you with me so far?",
    explicitAction: null,
    lifecycle,
  });
  assert.equal(listening.mode, "listening");
  assert.deepEqual(filterHearthOperationsForDecision(listening, [{ op: "set_body", value: "Do not apply this." }]), []);
  assert.doesNotMatch(buildSystemPrompt(episodeContext, "The creator prefers sensory openings.", { decision: listening, listeningTurn: true, outputPreference: "full_script" }), /ANVIL SCRIPT ARTIFACT CONTRACT|forward motion/i);

  const research = resolveHearthTurnDecision({
    creatorText: "Research when the commercial ice wells were built, how imported ice reached them, who operated them, why refrigeration displaced them, and the present status of surviving chambers. Cite current and archival sources.",
    explicitAction: null,
    lifecycle,
  });
  assert.equal(research.mode, "research");
  assert.equal(research.retrievalScope, "active_episode_only");

  const creatorEvidence = parseCreatorSuppliedResearch("Storage ChambersEast Wharf Ice Well (22 Basin Road)Former commercial store.North Market Vault (7 Cart Lane)Preserved underground site.[archive](https://example.invalid/ice-wells)NextThe restoration completion date is 2022.The surviving chamber is currently operating for tours.The complete restoration is expected to");
  assert.deepEqual(creatorEvidence.entities.map((entity) => entity.name), ["East Wharf Ice Well", "North Market Vault"]);
  assert.equal(creatorEvidence.citations[0]?.normalizedUrl, "https://example.invalid/ice-wells");
  assert.equal(creatorEvidence.appearsTruncated, true);
  assert.ok(creatorEvidence.claims.every((claim) => claim.provenanceStatus === "creator_supplied_unverified"));

  const outlineDecision = resolveHearthTurnDecision({ creatorText: "Give me a bullet outline.", explicitAction: null, lifecycle });
  assert.equal(outlineDecision.mode, "outline_generate");
  assert.equal(validateHearthCompositionArtifact({ requestKind: "outline", assistantText: "Outline follows.", ops: [{ op: "set_outline", value: "- Ice beneath the street\n- The import chain\n- Refrigeration takes over\n- What survives" }] }).ok, true);

  const scriptDecision = resolveHearthTurnDecision({ creatorText: "Write the full script now.", explicitAction: null, lifecycle });
  assert.equal(scriptDecision.mode, "script_generate");
  const script = "[s1]\nA block of imported ice descends beneath a crowded street into a chamber cut from brick. The wells, the people who supplied them, and the refrigeration systems that displaced them form the spine of this story.\n[/s1]";
  assert.equal(validateHearthCompositionArtifact({ requestKind: "script", assistantText: "Drafted.", ops: [{ op: "set_body", value: script }] }).ok, true);

  const discussion = resolveHearthTurnDecision({ creatorText: "How could we make the transition from imported ice to refrigeration stronger without editing it yet?", explicitAction: null, lifecycle });
  assert.equal(discussion.mode, "conversation");
  assert.equal(discussion.allowsMutation, false);
  const mutation = resolveHearthTurnDecision({ creatorText: "Edit the final paragraph to make that contrast clearer.", explicitAction: null, lifecycle });
  assert.equal(mutation.mode, "script_mutate");
  assert.equal(mutation.allowsMutation, true);

  const preflight = buildHearthEditorialPreflightReport({ scriptText: script, researchResult: null });
  assert.equal(preflight.usedPaidAi, false);
  assert.equal(preflight.findings.some((finding) => finding.severity === "blocker"), false);

  const readiness = resolveHearthTurnDecision({ creatorText: "Are we ready to record?", explicitAction: null, lifecycle: { ...lifecycle, hasApprovedScript: true } });
  assert.equal(readiness.mode, "readiness_review");
  const production = resolveHearthTurnDecision({ creatorText: "Prepare the image beat sheet.", explicitAction: { kind: "production", action: "image_beat_sheet" }, lifecycle: { hasDraft: true, hasApprovedScript: true, isReady: true } });
  assert.equal(production.mode, "production_action");
});
