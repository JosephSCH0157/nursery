import assert from "node:assert/strict";
import test from "node:test";
import { buildBoundedPaidJsonOpenAiRequest } from "../server/billing/paid-json-openai-route";
import { buildPaidHearthScriptGenerationMessages } from "../server/hearth/hearth-paid-script-context";

const EPISODE = {
  episodeId: "21d16d6a-905b-491e-8761-028789612ae5",
  workspaceId: "cc5478ff-37be-403e-824c-467fa7da061e",
  title: "Why gasoline prices are high",
  titleVariants: { A: "", B: "", C: "" },
  outline: "Explain U.S. gasoline prices through crude oil, refining, inventories, taxes, and current world events.",
  body: "[s1]\nDraft intro goes here.\n[/s1]",
  tonePreset: "Neutral conversational",
  sources: [
    { id: "eia", title: "EIA gasoline price factors", url: "https://www.eia.gov/example", note: "Primary evidence", citedIn: [] },
  ],
  sparks: [{ id: "spark", text: "Focus on U.S. prices and world events affecting them." }],
};

const RETAINED = [{
  id: "research-result",
  result_json: {
    assistant_text: "U.S. pump prices reflect crude oil costs, refinery conditions, inventories, taxes, and current geopolitical supply risk.",
    research_result: {
      synthesis: {
        keyPoints: ["Crude oil is the largest variable component.", "Current conflict can raise supply-risk premiums."],
        uncertainties: ["The timing of retail pass-through varies by region."],
      },
      sources: [{
        title: "EIA factors affecting gasoline prices",
        canonicalUrl: "https://www.eia.gov/energyexplained/gasoline/factors-affecting-gasoline-prices.php",
        extractionStatus: "extracted",
        snippet: "Crude oil and refinery costs are major gasoline-price components.",
      }],
    },
  },
}];

test("script canary binds active episode, retained research, final decisions, and strict proposal semantics", async () => {
  const latest = { role: "user", content: "lets see the first draft of this script for a single presenter" };
  const messages = [
    { role: "user", content: "Should this cover other countries too?" },
    { role: "assistant", content: "We can keep the editorial frame domestic or compare markets." },
    { role: "user", content: "lets stick to home. USA prices and world events having effects on them" },
    latest,
  ];
  const providerMessages = buildPaidHearthScriptGenerationMessages({
    episodeContext: EPISODE,
    messages,
    latestUserMessage: latest,
    canonicalResearchRows: RETAINED,
  });
  const visible = providerMessages.map((message) => message.content).join("\n");

  assert.match(visible, /Why gasoline prices are high/);
  assert.match(visible, /Draft intro goes here/);
  assert.match(visible, /EIA factors affecting gasoline prices/);
  assert.match(visible, /current geopolitical supply risk/i);
  assert.match(visible, /stick to home\. USA prices and world events/i);
  assert.match(visible, /immutable script proposal/i);
  assert.match(visible, /Applying it to the canonical draft requires a later, separate creator action/i);
  assert.match(visible, /Do not browse, retrieve, call tools/i);
  assert.match(visible, /target length is unresolved for this canary/i);
  assert.doesNotMatch(visible, /planning board/i);
  assert.equal(providerMessages.at(-1), latest);

  const bounded = await buildBoundedPaidJsonOpenAiRequest({
    body: { model: "gpt-5.6-luna", messages: providerMessages },
    model: "gpt-5.6-luna",
    maximumOutputTokens: 8_000,
    maximumAttempts: 1,
  });
  assert.ok(bounded.boundedInputTokens <= 32_000, JSON.stringify({
    boundedInputTokens: bounded.boundedInputTokens,
    serializedBytes: bounded.serializedBytes,
  }));
  assert.equal(bounded.maximumOutputTokens, 8_000);
  assert.equal(bounded.maximumAttempts, 1);
});

test("script context is deterministic and cannot leak another episode", () => {
  const latest = { role: "user", content: "Draft it for one presenter." };
  const first = buildPaidHearthScriptGenerationMessages({
    episodeContext: EPISODE,
    messages: [latest],
    latestUserMessage: latest,
    canonicalResearchRows: RETAINED,
  });
  const second = buildPaidHearthScriptGenerationMessages({
    episodeContext: {
      ...EPISODE,
      episodeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "City parks",
      outline: "A local parks episode.",
      body: "",
      sources: [],
      sparks: [],
    },
    messages: [latest],
    latestUserMessage: latest,
    canonicalResearchRows: [],
  });
  assert.deepEqual(first, buildPaidHearthScriptGenerationMessages({
    episodeContext: EPISODE,
    messages: [latest],
    latestUserMessage: latest,
    canonicalResearchRows: RETAINED,
  }));
  const other = second.map((message) => message.content).join("\n");
  assert.match(other, /City parks/);
  assert.doesNotMatch(other, /gasoline|EIA|geopolitical/i);
});
