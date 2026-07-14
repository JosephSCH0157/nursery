import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildEpisodeContextResearchQuery,
  composeGroundedResearchAnswer,
  enforceHearthEditorialHonesty,
  enforceResearchOutcomeReply,
} from "../server/hearth/create-hearth-ai-handler";
import {
  createHearthResearchRuntime,
  dedupeHearthResearchSources,
  getHearthEvidenceLedger,
} from "../server/hearth/hearth-research-runtime";
import type { EpisodeContext } from "../../hearth/src/lib/hearth-ai-ops";
import type { HearthResearchResult, HearthResearchSource } from "../../hearth/src/lib/hearth-research-contract";

function context(overrides: Partial<EpisodeContext> = {}): EpisodeContext {
  return {
    episodeId: "workpiece-florida",
    workspaceId: "workspace-a",
    title: "Florida Oranges",
    titleVariants: { A: "", B: "", C: "" },
    outline: "Draft intro goes here. Untitled. Explain citrus greening and the collapse of Florida groves.",
    body: "[s1]\nFlorida citrus production and greening disease reshaped the state.\n[/s1]",
    tonePreset: null,
    sources: [],
    sparks: [],
    ...overrides,
  };
}

test("research query strips scaffolding and selects Florida citrus source families", () => {
  const query = buildEpisodeContextResearchQuery({
    requestText: "Find strong sources I should cite for this Episode.",
    episodeContext: context(),
  });

  assert.ok(query);
  assert.match(query, /Florida Oranges/i);
  assert.match(query, /citrus greening/i);
  assert.match(query, /FDACS/i);
  assert.match(query, /USDA NASS/i);
  assert.match(query, /UF IFAS/i);
  assert.doesNotMatch(query, /Draft intro goes here|Untitled/i);
  assert.doesNotMatch(query, /\bCRS\b|\bGAO\b/i);
});

test("research query selects CRS and GAO only for applicable federal oversight topics", () => {
  const query = buildEpisodeContextResearchQuery({
    requestText: "Find strong sources for this episode.",
    episodeContext: context({
      title: "Federal Lobbying Oversight",
      outline: "Congressional oversight and the Lobbying Disclosure Act.",
      body: "",
    }),
  });

  assert.match(String(query), /\bCRS\b/);
  assert.match(String(query), /\bGAO\b/);
});

test("duplicate FDACS variants collapse to one normalized source identity", () => {
  const base: HearthResearchSource = {
    sourceId: "one",
    title: "Florida Department of Agriculture and Consumer Services",
    publisher: "FDACS",
    url: "https://fdacs.gov/citrus/report?utm_source=test",
    canonicalUrl: "https://fdacs.gov/citrus/report",
    domain: "fdacs.gov",
    publishedAt: null,
    snippet: "Citrus report",
    extractedText: "Useful finding.",
    extractionStatus: "extracted",
    extractionError: null,
  };
  const deduped = dedupeHearthResearchSources([
    base,
    {
      ...base,
      sourceId: "two",
      title: "Florida Dept. of Agriculture & Consumer Services (FDACS)",
      url: "https://fdacs.gov/citrus/report#summary",
      canonicalUrl: null,
    },
  ]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.sourceId, "retrieval-1");
});

test("partial retrieval produces readable attributed findings without raw HTML or internal query", () => {
  const result: HearthResearchResult = {
    mode: "partial_retrieval",
    runtimeStatus: "partial",
    sources: [{
      sourceId: "one",
      title: "FDACS Citrus Report",
      url: "https://fdacs.gov/citrus",
      domain: "fdacs.gov",
      publishedAt: null,
      snippet: "Production declined.",
      extractedText: "Production declined.",
      extractionStatus: "extracted",
      extractionError: null,
    }],
    synthesis: {
      summary: "One useful source was recovered.",
      keyPoints: ["FDACS Citrus Report. Production declined."],
      uncertainties: ["Historical acreage remains unsupported."],
      coverageNote: "Extraction coverage: 1/2 sources extracted.",
    },
  };
  const reply = enforceResearchOutcomeReply({
    assistantText: "<div><strong>Finding:</strong> Production declined.</div><script>bad()</script>",
    request: {
      query: "Florida Oranges Draft intro goes here primary sources official reports data",
      intent: "mixed",
      recencyPreference: "none",
      maxSources: 6,
      requireDates: false,
      requireFullExtraction: false,
    },
    result,
  });

  assert.match(reply, /Retrieval was partial/i);
  assert.match(reply, /FDACS Citrus Report/i);
  assert.match(reply, /Historical acreage remains unsupported/i);
  assert.doesNotMatch(reply, /<[^>]+>|bad\(\)|Draft intro goes here/i);
});

test("representative scenes cannot be presented as personal memories", () => {
  const guarded = enforceHearthEditorialHonesty({
    requestText: "Give me a representative grower scene for the opening.",
    assistantText: "Open with: I remember walking those rows and seeing bitter fruit.",
  });
  assert.doesNotMatch(guarded, /I remember/i);
  assert.match(guarded, /Picture the scene/i);

  const suppliedMemory = enforceHearthEditorialHonesty({
    requestText: "I remember walking my grandfather's grove. Help me develop that real memory.",
    assistantText: "Start with: I remember walking my grandfather's grove.",
  });
  assert.match(suppliedMemory, /I remember/i);
});

test("research dispatch keeps workspace and workpiece identity explicit", () => {
  const handlerSource = readFileSync(new URL("../server/hearth/create-hearth-ai-handler.ts", import.meta.url), "utf8");
  assert.match(handlerSource, /researchRuntime\.run\(\{[\s\S]*workspaceId:\s*episodeContext\.workspaceId,[\s\S]*workpieceId:\s*episodeContext\.episodeId/);
});

test("weak tangelo retrieval triggers one focused refinement and cannot become verified cultivar history", async () => {
  const originalFetch = globalThis.fetch;
  const queries: string[] = [];
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.search.brave.com/res/v1/web/search")) {
      const query = new URL(url).searchParams.get("q") || "";
      queries.push(query);
      const refinement = queries.length === 2;
      return new Response(JSON.stringify({ web: { results: [{
        title: refinement ? "Florida Farm & Family Tangelo Notes" : "Visit Florida Citrus Facts",
        url: refinement ? "https://farmflorida.example/tangelo" : "https://visitflorida.example/citrus",
        description: refinement ? "Tangelos are popular citrus fruit." : "Tour Florida and enjoy citrus attractions.",
      }] } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(`<html><body><main>${"Florida citrus tourism and tangelos are popular with visitors. ".repeat(12)}</main></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
  };
  try {
    const runtime = createHearthResearchRuntime({ braveApiKey: "test" });
    const result = await runtime.run({
      request: { query: "Florida invented the tangelo to solve freezes because tangelos were weather resilient and similar to oranges.", intent: "background", recencyPreference: "none", maxSources: 6, requireDates: false, requireFullExtraction: false },
      workspaceId: "workspace-a",
      workpieceId: "workpiece-florida",
    });
    const ledger = getHearthEvidenceLedger(result);
    const answer = composeGroundedResearchAnswer(result) || "";
    const guardedReply = enforceResearchOutcomeReply({
      assistantText: "Verified: USDA released Minneola in 1931 and UF/IFAS says freezes motivated the breeding program.",
      request: { query: "Florida invented the tangelo to solve freezes.", intent: "background", recencyPreference: "none", maxSources: 6, requireDates: false, requireFullExtraction: false },
      result,
    });
    assert.equal(queries.length, 2);
    assert.match(queries[1] || "", /Orlando.*Minneola.*USDA.*GRIN.*breeding objective/i);
    assert.equal(ledger?.workspaceId, "workspace-a");
    assert.equal(ledger?.workpieceId, "workpiece-florida");
    assert.match(ledger?.refinementIdentity || "", /refinement-1$/);
    assert.ok(ledger?.findings.every((finding) => finding.state !== "supported"));
    assert.match(answer, /does not establish that Florida invented tangelos to solve freezes/i);
    assert.doesNotMatch(answer, /USDA:|UF\/IFAS:|release date/i);
    assert.match(answer, /No retrieved source met the support threshold/i);
    assert.doesNotMatch(guardedReply, /released Minneola in 1931|UF\/IFAS says/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authoritative tangelo evidence supports origin and cold tolerance without inventing breeding motive", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.search.brave.com/res/v1/web/search")) {
      return new Response(JSON.stringify({ web: { results: [{
        title: "USDA ARS Tangelo Cultivar Record",
        url: "https://ars.usda.gov/citrus/tangelo-record",
        description: "USDA cultivar record for Orlando tangelo.",
      }] } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(`<html><body><main>${"USDA developed the Orlando tangelo hybrid and released the cultivar in 1931. The Orlando tangelo is described as cold tolerant. ".repeat(8)}</main></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
  };
  try {
    const result = await createHearthResearchRuntime({ braveApiKey: "test" }).run({
      request: { query: "Fact-check Orlando tangelo cultivar origin, release date, cold tolerance, and whether freeze resistance was the breeding objective.", intent: "background", recencyPreference: "none", maxSources: 6, requireDates: true, requireFullExtraction: false },
      workspaceId: "workspace-a", workpieceId: "workpiece-florida",
    });
    const ledger = getHearthEvidenceLedger(result);
    const answer = composeGroundedResearchAnswer(result) || "";
    assert.equal(ledger?.findings.find((finding) => finding.findingId === "tangelo-origin")?.state, "supported");
    assert.equal(ledger?.findings.find((finding) => finding.findingId === "tangelo-cold-tolerance")?.state, "supported");
    assert.notEqual(ledger?.findings.find((finding) => finding.findingId === "tangelo-breeding-motive")?.state, "supported");
    assert.match(answer, /1931/);
    assert.match(answer, /cold tolerant/i);
    assert.match(answer, /does not establish freeze resistance as the original breeding motive/i);
    assert.match(answer, /ars\.usda\.gov\/citrus\/tangelo-record/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("conflicting authoritative cultivar evidence is surfaced rather than silently resolved", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.search.brave.com/res/v1/web/search")) {
      return new Response(JSON.stringify({ web: { results: [
        { title: "USDA Tangelo Record", url: "https://ars.usda.gov/record-a", description: "USDA developed the Orlando tangelo hybrid." },
        { title: "University Cultivar Review", url: "https://citrus.example.edu/record-b", description: "The review says USDA did not develop the Orlando tangelo hybrid." },
      ] } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const conflicting = url.includes("record-b");
    const statement = conflicting
      ? "The university review states USDA did not develop the Orlando tangelo hybrid."
      : "The USDA record states USDA developed the Orlando tangelo hybrid and released it in 1931.";
    return new Response(`<html><body><main>${`${statement} `.repeat(10)}</main></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
  };
  try {
    const result = await createHearthResearchRuntime({ braveApiKey: "test" }).run({
      request: { query: "Who developed the Orlando tangelo?", intent: "background", recencyPreference: "none", maxSources: 6, requireDates: false, requireFullExtraction: false },
      workspaceId: "workspace-a", workpieceId: "workpiece-florida",
    });
    const finding = getHearthEvidenceLedger(result)?.findings.find((entry) => entry.findingId === "tangelo-origin");
    const answer = composeGroundedResearchAnswer(result) || "";
    assert.equal(finding?.state, "contradicted");
    assert.match(finding?.uncertainty || "", /conflicts/i);
    assert.match(answer, /Conflicting\/contrary retrieved evidence/i);
    assert.match(answer, /did not develop/i);
    assert.match(answer, /developed the Orlando tangelo/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
