import assert from "node:assert/strict";
import test from "node:test";
import { buildHearthEditorialPreflightReport } from "../../hearth/src/lib/hearth-editorial-preflight";
import { validateHearthCompositionArtifact } from "../../hearth/src/lib/hearth-composition-output";
import { buildHearthTurnResult } from "../../hearth/src/lib/hearth-turn-contract";
import { parseCreatorSuppliedResearch } from "../server/hearth/hearth-creator-research-ingest";
import { buildSystemPrompt } from "../server/hearth/create-hearth-ai-handler";
import { filterHearthOperationsForDecision, resolveHearthTurnDecision } from "../server/hearth/hearth-turn-decision";

const lifecycle = { hasDraft: true, hasApprovedScript: false, isReady: false };
const context = (title: string) => ({
  episodeId: `fixture-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  workspaceId: "certification-workspace",
  title,
  titleVariants: { A: "", B: "", C: "" },
  outline: "",
  body: "",
  tonePreset: null,
  sources: [],
  sparks: [],
});

test("permanent corpus — Florida Oranges research remains scoped to the current Episode", () => {
  const creatorText = "Research how freezes, citrus greening, land development, and changing varieties reshaped Florida oranges. Verify the chronology and give me sources.";
  const decision = resolveHearthTurnDecision({ creatorText, explicitAction: null, lifecycle });
  assert.equal(decision.mode, "research");
  assert.equal(decision.retrievalScope, "active_episode_only");
  const prompt = buildSystemPrompt(context("Florida Oranges"), "Creator prefers narrative history.", { decision, outputPreference: "full_script" });
  assert.match(prompt, /Authoritative turn mode:\s*research/i);
  assert.doesNotMatch(prompt, /ANVIL SCRIPT ARTIFACT CONTRACT|Creator output preference for this requested artifact/i);
});

test("permanent corpus — Big Boy 4014 explanation ends in listening, not production management", () => {
  const creatorText = "all right I would like to write a podcast about big boy number 4014 and the reason I'd like to do this is because that particular locomotive got completely rebuilt by Union Pacific at a significant expense and is now running the main line and actually going on tours and visiting places and showing itself off which is really cool so here's the structure I want to start by just explaining what Big Boy 4014 is the size of it in comparison to something that everybody knows what it is like a let's say a semi with a sleeper and a 53 ft trailer is around what 73 or so feet long and big boy is 132 ft with a standard tender a semi is 80,000 lb and big boy is 1.2 million pounds this kind of things then talk about what happened to Big Boy you'll wear it ran first of all where it ran and then what happened to it when it was retired and then we'll talk about the resurrection are you with me so far";
  const decision = resolveHearthTurnDecision({ creatorText, explicitAction: null, lifecycle });
  assert.equal(decision.mode, "listening");
  assert.equal(decision.requiresArtifact, false);
  assert.equal(decision.retrievalScope, "active_episode_only");
  assert.deepEqual(filterHearthOperationsForDecision(decision, [{ op: "set_outline", value: "- Premature outline" }, { op: "set_body", value: "Premature script mutation." }]), []);
  const prompt = buildSystemPrompt(context("Big Boy 4014"), "Creator likes concrete comparisons.", { decision, listeningTurn: true, outputPreference: "full_script" });
  assert.doesNotMatch(prompt, /ANVIL SCRIPT ARTIFACT CONTRACT|Outline generation mode|Production action mode|forward motion/i);
});

test("permanent corpus — Church Street discussion never becomes a failed mutation transaction", () => {
  const turns = [
    "We still don't have the number for the actual budget for this project and the other thing is if they're going to do the canopy work under I-4 to bring people to Church Street there's no businesses at Church Street to bring them to... my point is they're spending a lot of money on a part of Orlando that is already in the past so how do we update the script to get that point across",
    "okay I mean I didn't ask you to actually update the script I'm having a conversation with you about how we can update the script what changes can we make to get those points across",
  ];
  for (const creatorText of turns) {
    const decision = resolveHearthTurnDecision({ creatorText, explicitAction: null, lifecycle: { ...lifecycle, hasApprovedScript: true } });
    assert.equal(decision.mode, "conversation");
    const result = buildHearthTurnResult({ decision, assistantMessage: "Frame the unresolved budget as an accountability question, then contrast investment with what a rider actually finds there." });
    assert.equal(result.validation.ok, true);
    assert.equal(result.artifact, null);
    assert.deepEqual(result.operations, []);
    assert.doesNotMatch(result.assistantMessage, /No script changes were created/i);
  }
});

test("permanent corpus — ugly Church Street citation and dense entity boundaries survive intact", () => {
  const pasted = [
    "🍽️ Restaurants, Cafes & BarsKres Chophouse (17 W. Church St.): The iconic upscale steakhouse anchoring the block.",
    "Cucina Pizza & Bar (54 W. Church St. #151): Serving up standard Italian fare right in the heart of the construction zone.",
    "The Bao Spot (54 W. Church St.): Handcrafted bao buns and rice bowls.Coffee For The Soul (54 W. Church St. Ste 150): Casual Colombian cafe.",
    "Birria1983 (54 W. Church St. Suite 141): Casual Mexican bar and grill.Crepe Delicious Urban Cafe (Church St.): Holding down the fort.",
    "Jenny's Downtown Orlando (595 W. Church St.): Southern comfort food.The District GastroBar (534 W. Church St.): Southern-inspired fare.",
    "[3] (https://jennysdowntown.com/), [6] (https://www.google.com/searchviewer/10?svid=restaurant-results)🏢 ",
    "Corporate & Professional HubsChurch Street Exchange4.6(12)Business centerClosedCentral Business District4.3 miDirectionsOperating as an office and tech event venue.",
    "Hawkers Corporate Office4.0(5)Corporate officeClosedCentral Business District4.3 miCallDirectionsWebsiteHeadquarters on the street.",
    "Travel + Leisure Co.3.6(168)Corporate campusClosedParramore4.3 miCallDirectionsWebsiteCorporate hub here.",
    "[1] (https://m.yelp.com/biz/church-street-exchange-orlando), [3] (https://www.google.com/searchviewer/10?svid=attraction-results)🏟️ ",
    "Attractions & EntertainmentKia Center4.6(16.9K)ArenaParramore4.2 miCallDirectionsWebsiteSports and entertainment venue.",
    "American Ghost Adventures4.9(802)Tour agencyClosedCentral Business District4.4 miCallDirectionsWebsiteNightly tours.",
    "Empty storefronts and available business spaces remain numerous while existing businesses remain hopeful that the cities renovations can revitalize the area",
  ].join("");
  const parsed = parseCreatorSuppliedResearch(pasted);
  assert.deepEqual(parsed.claims.filter((claim) => claim.claimKind === "business_status").map((claim) => claim.businessName), [
    "Kres Chophouse", "Cucina Pizza & Bar", "The Bao Spot", "Coffee For The Soul", "Birria1983", "Crepe Delicious Urban Cafe",
    "Jenny's Downtown Orlando", "The District GastroBar", "Church Street Exchange", "Hawkers Corporate Office", "Travel + Leisure Co.", "Kia Center", "American Ghost Adventures",
  ]);
  assert.ok(parsed.claims.every((claim) => claim.provenanceStatus === "creator_supplied_unverified"));
  assert.ok(parsed.citations.some((citation) => citation.normalizedUrl === "https://www.google.com/searchviewer/10?svid=restaurant-results"));
  assert.ok(parsed.claims.some((claim) => /^Empty storefronts/i.test(claim.text)));
});

test("permanent corpus — failed sealed-canary heading boundary remains a generic regression", () => {
  const parsed = parseCreatorSuppliedResearch(
    "Network SitesOld Exchange Hall (12 Copper Lane)Historic dispatch room.River Pump House (8 Quay Road)Maintenance site.",
  );
  assert.deepEqual(parsed.entities.map((entity) => entity.name), ["Old Exchange Hall", "River Pump House"]);
});

test("permanent corpus — artifact generation cannot pass with announcement-only output", () => {
  assert.equal(validateHearthCompositionArtifact({ requestKind: "outline", assistantText: "Here's a clean first-draft bullet set…", ops: [] }).ok, false);
  assert.equal(validateHearthCompositionArtifact({ requestKind: "outline", assistantText: "Here is the outline.", ops: [{ op: "set_outline", value: "- Hook\n- Evidence\n- Close" }] }).ok, true);
  assert.equal(validateHearthCompositionArtifact({ requestKind: "script", assistantText: "Here is the script.", ops: [] }).ok, false);
  assert.equal(validateHearthCompositionArtifact({ requestKind: "script", assistantText: "Drafted.", ops: [{ op: "set_body", value: "[s1]\nA substantive opening establishes the subject and why it matters now.\n[/s1]" }] }).ok, true);
});

test("permanent corpus — producer preflight is deterministic and catches evidence/recordability risks", () => {
  const report = buildHearthEditorialPreflightReport({
    scriptText: "[s1]\nThis is the biggest project ever. It definitely costs $12 million because of the plan. [TODO: verify quote]\n[/s1]",
    researchResult: null,
  });
  assert.equal(report.usedPaidAi, false);
  for (const code of ["placeholder_or_todo", "unsupported_number_or_date", "causal_assertion", "superlative_claim", "wording_stronger_than_evidence"]) {
    assert.ok(report.findings.some((finding) => finding.code === code), code);
  }
});

test("permanent corpus — explicit artifact, review, and production actions retain distinct modes", () => {
  const cases = [
    ["Give me a bullet outline.", null, "outline_generate"],
    ["Write the full script now.", null, "script_generate"],
    ["Apply those changes.", null, "script_mutate"],
    ["Apply that transition to the script.", null, "script_mutate"],
    ["Put that transition into the script.", null, "script_mutate"],
    ["Rewrite the closing around that contrast.", null, "script_mutate"],
    ["Are we ready to record?", null, "readiness_review"],
    ["Generate the tags.", { kind: "production", action: "tags" }, "production_action"],
  ] as const;
  for (const [creatorText, explicitAction, expected] of cases) {
    assert.equal(resolveHearthTurnDecision({ creatorText, explicitAction, lifecycle }).mode, expected);
  }
});
