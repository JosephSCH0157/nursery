import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildEpisodeContextResearchQuery,
  enforceHearthEditorialHonesty,
  enforceResearchOutcomeReply,
} from "../server/hearth/create-hearth-ai-handler";
import { dedupeHearthResearchSources } from "../server/hearth/hearth-research-runtime";
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
