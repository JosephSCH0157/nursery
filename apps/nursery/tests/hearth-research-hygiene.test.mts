import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildHearthResearchBrief,
  composeGroundedResearchAnswer,
  enforceHearthEditorialHonesty,
  enforceResearchOutcomeReply,
} from "../server/hearth/create-hearth-ai-handler";
import {
  classifyResearchSourceAuthority,
  createHearthResearchRuntime,
  dedupeHearthResearchSources,
} from "../server/hearth/hearth-research-runtime";
import type { EpisodeContext } from "../../hearth/src/lib/hearth-ai-ops";
import type { HearthResearchArtifact, HearthResearchBrief, HearthResearchResult, HearthResearchSource } from "../../hearth/src/lib/hearth-research-contract";

function context(overrides: Partial<EpisodeContext> = {}): EpisodeContext {
  return {
    episodeId: "workpiece-church", workspaceId: "workspace-a", title: "Church Street Orlando",
    titleVariants: { A: "", B: "", C: "" }, outline: "Church Street Station heyday, decline, and current redevelopment.",
    body: "[s1]\nFlorida development changed this Orlando corridor.\n[/s1]", tonePreset: null, sources: [], sparks: [], ...overrides,
  };
}

function brief(workpieceId: string, creatorRequest: string, fingerprint = `fp-${workpieceId}`): HearthResearchBrief {
  return { schema: "forge.hearth.research-brief.v1", workspaceId: "workspace-a", workpieceId, briefFingerprint: fingerprint, creatorRequest, episodeTitle: workpieceId, goals: [creatorRequest], queries: [creatorRequest], sourcePriorities: ["primary records", "independent reporting"] };
}

function bindArtifact(result: HearthResearchResult, text: string, sourceId = "retrieval-1"): HearthResearchResult {
  const artifact: HearthResearchArtifact = { briefFingerprint: result.brief!.briefFingerprint, workpieceId: result.brief!.workpieceId, status: "complete", findings: [{ text, status: "reported_claim", sourceIds: [sourceId] }], uncertainties: [], editorialInterpretation: [] };
  return { ...result, artifact };
}

test("brief authority comes from the current creator request and rebuilds get a fresh fingerprint", () => {
  const episode = context({ outline: "Old citrus notes mention the Great Freeze and HLB.", body: "Old cultivars and production decline notes." });
  const request = "Research Church Street Station heyday, decline, current redevelopment, scope, budget, and timeline.";
  const first = buildHearthResearchBrief({ requestText: request, episodeContext: episode, requestAuthority: "operation-1" });
  const rebuilt = buildHearthResearchBrief({ requestText: request, episodeContext: episode, requestAuthority: "operation-2" });
  assert.ok(first && rebuilt);
  assert.deepEqual(first.goals, ["Church Street Station heyday, decline, current redevelopment, scope, budget, and timeline"]);
  assert.doesNotMatch(first.goals.join(" "), /Great Freeze|HLB|cultivar|production decline/i);
  assert.notEqual(first.briefFingerprint, rebuilt.briefFingerprint);
  assert.equal(first.workpieceId, "workpiece-church");
});

test("runtime inspects accessible sources and serializes current-request provenance and evidence", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.search.brave.com/")) return new Response(JSON.stringify({ web: { results: [{ title: "City Church Street Project", url: "https://orlando.gov/church-street", description: "Project scope, budget, timeline, and construction update." }] } }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(`<main>${"The city project page identifies the Festival Street scope, approved budget, timeline, and current construction phase. ".repeat(8)}</main>`, { status: 200, headers: { "content-type": "text/html" } });
  };
  try {
    const activeBrief = brief("workpiece-church", "Church Street redevelopment scope budget timeline");
    const result = await createHearthResearchRuntime({ braveApiKey: "test" }).run({ request: { query: activeBrief.queries[0], intent: "mixed", recencyPreference: "recent", maxSources: 4, requireDates: true, requireFullExtraction: false }, brief: activeBrief });
    assert.equal(result.sources[0]?.extractionStatus, "extracted");
    assert.equal(result.sources[0]?.provenance?.inspectionStatus, "inspected");
    assert.equal(result.sources[0]?.provenance?.verifiedInCurrentRequest, true);
    assert.equal(result.sources[0]?.provenance?.briefFingerprint, activeBrief.briefFingerprint);
    assert.match(result.evidence?.[0]?.excerpt ?? "", /Festival Street scope/i);
    assert.equal(result.evidence?.[0]?.workpieceId, activeBrief.workpieceId);
    assert.equal(result.evidence?.[0]?.authority, "primary_government");
  } finally { globalThis.fetch = originalFetch; }
});

test("inaccessible sources carry a normalized failure reason", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.search.brave.com/")) return new Response(JSON.stringify({ web: { results: [{ title: "Subscriber archive", url: "https://archive.example/paywalled", description: "Historic reporting" }] } }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response("Subscribe to continue", { status: 401, headers: { "content-type": "text/html" } });
  };
  try {
    const activeBrief = brief("workpiece-church", "Church Street heyday archive");
    const request = { query: activeBrief.creatorRequest, intent: "background" as const, recencyPreference: "none" as const, maxSources: 2, requireDates: false, requireFullExtraction: false };
    const result = await createHearthResearchRuntime({ braveApiKey: "test" }).run({ request, brief: activeBrief });
    assert.equal(result.sources[0]?.provenance?.inspectionStatus, "inaccessible");
    assert.equal(result.sources[0]?.provenance?.accessFailureReason, "authentication_required");
    assert.equal(result.evidence?.[0]?.state, "inaccessible");
    const reply = enforceResearchOutcomeReply({ assistantText: "Here is the research pack.", request, result });
    assert.match(reply, /No research pack was completed/i);
    assert.match(reply, /authentication_required/i);
  } finally { globalThis.fetch = originalFetch; }
});

test("announcement-only and mismatched artifacts are rejected", () => {
  const activeBrief = brief("workpiece-church", "Church Street budget timeline");
  const source: HearthResearchSource = { sourceId: "retrieval-1", title: "City project", url: "https://orlando.gov/project", domain: "orlando.gov", publishedAt: null, snippet: null, extractedText: "The adopted project budget is documented on the city project page.", extractionStatus: "extracted", extractionError: null, provenance: { origin: "search", briefFingerprint: activeBrief.briefFingerprint, inspectedAt: new Date().toISOString(), inspectionStatus: "inspected", accessFailureReason: null, verifiedInCurrentRequest: true } };
  const base: HearthResearchResult = { mode: "retrieval_first", runtimeStatus: "ok", providerStatus: "configured_and_operational", brief: activeBrief, sources: [source], evidence: [{ evidenceId: "e-1", briefFingerprint: activeBrief.briefFingerprint, workpieceId: activeBrief.workpieceId, sourceId: source.sourceId, excerpt: source.extractedText, authority: "primary_government", state: "inspected", uncertainty: null }], artifact: null, synthesis: { summary: "one", keyPoints: [], uncertainties: [], coverageNote: "1/1" } };
  assert.equal(composeGroundedResearchAnswer(bindArtifact(base, "Here is the research pack I rebuilt for you.")), null);
  const mismatched = bindArtifact(base, "The city page documents an adopted project budget and delivery timeline.");
  mismatched.artifact = { ...mismatched.artifact!, workpieceId: "workpiece-citrus" };
  assert.equal(composeGroundedResearchAnswer(mismatched), null);
  mismatched.artifact = { ...mismatched.artifact!, workpieceId: activeBrief.workpieceId, briefFingerprint: "stale-fingerprint" };
  assert.equal(composeGroundedResearchAnswer(mismatched), null);
});

test("Florida citrus Topic A cannot contaminate overlapping Church Street Topic B", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.search.brave.com/")) {
      const church = /Church Street/i.test(new URL(url).searchParams.get("q") ?? "");
      return new Response(JSON.stringify({ web: { results: [church ? { title: "City of Orlando Church Street", url: "https://orlando.gov/church-street", description: "Florida development reporting on project scope, budget, timeline, and decline." } : { title: "Florida Citrus History", url: "https://example.test/citrus", description: "Great Freeze, HLB, cultivars, production decline, and development pressure." }] } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const text = url.includes("church-street") ? "Church Street Station's heyday preceded decline. Orlando's current redevelopment page documents Festival Street scope, budget, and timeline." : "The Great Freeze, HLB citrus greening, cultivars, production decline, and development pressure reshaped Florida citrus.";
    return new Response(`<main>${`${text} `.repeat(8)}</main>`, { status: 200, headers: { "content-type": "text/html" } });
  };
  try {
    const runtime = createHearthResearchRuntime({ braveApiKey: "test" });
    const briefA = brief("workpiece-citrus", "Florida citrus Great Freeze HLB cultivars production decline development pressure", "fp-a");
    const briefB = brief("workpiece-church", "Church Street Orlando heyday decline current redevelopment scope budget timeline", "fp-b");
    const topicA = await runtime.run({ request: { query: briefA.creatorRequest, intent: "background", recencyPreference: "none", maxSources: 2, requireDates: false, requireFullExtraction: false }, brief: briefA });
    const topicB = await runtime.run({ request: { query: briefB.creatorRequest, intent: "mixed", recencyPreference: "recent", maxSources: 2, requireDates: true, requireFullExtraction: false }, brief: briefB });
    const answerA = composeGroundedResearchAnswer(bindArtifact(topicA, "The retrieved history connects the Great Freeze, HLB, cultivars, production decline, and development pressure.")) ?? "";
    const answerB = composeGroundedResearchAnswer(bindArtifact(topicB, "The city page documents Church Street's current Festival Street redevelopment scope, budget, and timeline.")) ?? "";
    assert.match(answerA, /Great Freeze|HLB/);
    assert.match(answerB, /Church Street|Festival Street/);
    assert.doesNotMatch(JSON.stringify(topicB) + answerB, /Great Freeze|HLB|citrus greening|cultivar|acreage loss|movement south|agricultural/i);
    assert.equal(topicB.evidence?.every((entry) => entry.briefFingerprint === "fp-b" && entry.workpieceId === "workpiece-church"), true);
  } finally { globalThis.fetch = originalFetch; }
});

test("failed Topic B retrieval cannot reuse successful Topic A evidence", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.search.brave.com/")) {
      const church = /Church Street/i.test(new URL(url).searchParams.get("q") ?? "");
      return new Response(JSON.stringify({ web: { results: church ? [] : [{ title: "Citrus archive", url: "https://example.test/a", description: "Great Freeze HLB" }] } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(`<main>${"Great Freeze and HLB evidence. ".repeat(20)}</main>`, { status: 200, headers: { "content-type": "text/html" } });
  };
  try {
    const runtime = createHearthResearchRuntime({ braveApiKey: "test" });
    const a = brief("workpiece-a", "Florida citrus Great Freeze HLB", "fp-a");
    const b = brief("workpiece-b", "Church Street budget timeline", "fp-b");
    await runtime.run({ request: { query: a.creatorRequest, intent: "background", recencyPreference: "none", maxSources: 1, requireDates: false, requireFullExtraction: false }, brief: a });
    const failedB = await runtime.run({ request: { query: b.creatorRequest, intent: "mixed", recencyPreference: "none", maxSources: 1, requireDates: false, requireFullExtraction: false }, brief: b });
    assert.deepEqual(failedB.sources, []);
    assert.deepEqual(failedB.evidence, []);
    assert.equal(failedB.brief?.briefFingerprint, "fp-b");
  } finally { globalThis.fetch = originalFetch; }
});

test("authority is domain-neutral and duplicate URLs collapse", () => {
  const base: HearthResearchSource = { sourceId: "one", title: "City project", url: "https://orlando.gov/project?utm_source=test", canonicalUrl: "https://orlando.gov/project", domain: "orlando.gov", publishedAt: null, snippet: null, extractedText: "Useful finding", extractionStatus: "extracted", extractionError: null };
  assert.equal(classifyResearchSourceAuthority(base), "primary_government");
  assert.equal(dedupeHearthResearchSources([base, { ...base, sourceId: "two", url: "https://orlando.gov/project#scope", canonicalUrl: null }]).length, 1);
});

test("representative scenes cannot be presented as personal memories", () => {
  const guarded = enforceHearthEditorialHonesty({ requestText: "Give me a representative worker scene.", assistantText: "I remember walking into the station." });
  assert.doesNotMatch(guarded, /I remember/i);
  assert.match(guarded, /Picture the scene/i);
});

test("production research implementation contains no citrus-specific rubric or process-local evidence sidecar", () => {
  const handler = readFileSync(new URL("../server/hearth/create-hearth-ai-handler.ts", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../server/hearth/hearth-research-runtime.ts", import.meta.url), "utf8");
  assert.doesNotMatch(handler + runtime, /EPISODE_CLAIM_AREAS|WeakMap|getHearthEvidenceLedger|tangelo|citrus greening|government_agricultural/i);
});
