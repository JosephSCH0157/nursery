import assert from "node:assert/strict";
import test from "node:test";
import {
  HEARTH_THUMBNAIL_DIRECTION_CONTRACT,
  HEARTH_THUMBNAIL_DIRECTION_MAX_ATTEMPTS,
  HEARTH_THUMBNAIL_DIRECTION_MAX_INPUT_TOKENS,
  HEARTH_THUMBNAIL_DIRECTION_MAX_OUTPUT_TOKENS,
  HEARTH_THUMBNAIL_DIRECTION_MAX_RESPONSE_BYTES,
  HEARTH_THUMBNAIL_DIRECTION_MODEL,
  HEARTH_THUMBNAIL_DIRECTION_OUTPUT_CONTRACT,
  HEARTH_THUMBNAIL_DIRECTION_ROUTE,
  HEARTH_THUMBNAIL_DIRECTION_STYLE_FALLBACK,
  buildPaidThumbnailDirectionMessages,
  paidThumbnailDirectionFingerprintPayload,
} from "../server/hearth/hearth-paid-thumbnail-direction-generation";
import { validatePaidThumbnailDirectionOutput } from "../../hearth/src/lib/hearth-thumbnail-direction-contract";
import {
  buildBoundedPaidJsonOpenAiRequest,
  executePaidJsonOpenAiRoute,
  PaidJsonOpenAiRouteError,
} from "../server/billing/paid-json-openai-route";
import { fingerprintOpenAiTextPaidRequest } from "../../../packages/tongs/src/providers/paid-openai-text-route-execution";
import { createHearthAiHandler } from "../server/hearth/create-hearth-ai-handler";
import type { HearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";
import { buildProductionPrompt } from "../../hearth/src/lib/hearth-production-actions";
import { hashApprovedTitleScript } from "../server/hearth/hearth-paid-title-generation";
import { buildPaidThumbnailDirectionMutation } from "../../hearth/src/lib/hearth-paid-thumbnail-direction-persistence";
import { canonicalContentHash, hydrateEpisodePackageV3 } from "../../hearth/src/lib/episode-package-v3";

const strategy = [
  "THUMBNAIL_STRATEGY",
  "Episode promise: Trace the real forces that move gasoline prices.",
  "Intended viewer: Drivers who want a practical explanation of pump prices.",
  "Curiosity mechanism: Reveal why crude prices and pump prices can move differently.",
  "Editorial positioning: A clear supply-chain explanation rather than a political slogan.",
  "Truthful connection: The approved script explains crude oil, refining, taxes, and distribution.",
  "Prohibited exaggerations: secret price fixing, instant price collapse",
].join("\n");

const direction = (key: "A" | "B" | "C", values: {
  subject: string; action: string; composition: string; render: string; colors: string;
}) => [
  `THUMBNAIL_${key}`,
  `Headline: ${key} concept`,
  `Subject direction: ${values.subject}`,
  `Focal action: ${values.action}`,
  `Composition direction: ${values.composition}`,
  "Emotional tone: Curious and grounded",
  "Visual hierarchy: Subject first, price context second, negative space last",
  `Title compatibility: TITLE_${key} fits the negative space without repeating the subject.`,
  "Integrity rationale: Every visual element maps to an explanation in the approved script.",
  `Render direction: ${values.render}`,
  "Mood/style: Editorial documentary photography",
  `Subject classification: ${values.subject}`,
  `Composition classification: ${values.composition}`,
  `Dominant colors: ${values.colors}`,
].join("\n");

const A = direction("A", {
  subject: "gasoline pump and driver", action: "driver studies the changing price display",
  composition: "tight foreground pump on the left with open sky on the right",
  render: "Photograph a driver beside a fuel pump, studying the price display, with restrained roadside depth and clean right-side negative space; no text, marks, or logos.",
  colors: "charcoal, amber, pale blue",
});
const B = direction("B", {
  subject: "oil barrel and refinery towers", action: "refinery flare lights the industrial chain",
  composition: "wide layered refinery landscape with a barrel in the near foreground",
  render: "Create a wide refinery landscape with a single unbranded barrel in the foreground and layered industrial depth; reserve the upper-left sky; no text, marks, or logos.",
  colors: "steel blue, orange, black",
});
const C = direction("C", {
  subject: "four physical cost tokens", action: "tokens converge toward a simple fuel nozzle",
  composition: "overhead radial arrangement around a centered nozzle",
  render: "Arrange four distinct material tokens around a centered unbranded fuel nozzle in an overhead editorial still life; preserve outer negative space; no text, marks, or logos.",
  colors: "cream, crimson, graphite, teal",
});
const validOutput = [strategy, A, B, C].join("\n\n");

const canonicalInput = () => ({
  approved: {
    approvalId: "be87d40f-516b-4dcf-bd25-094b922cc682", approvalRevision: 7,
    scriptHash: "a".repeat(64), scriptText: "Approved gasoline script.", episodeTitle: "What Really Moves Gas Prices?",
  },
  titles: (["A", "B", "C"] as const).map((key, index) => ({
    key, id: `title-${index + 1}`, revision: 1, text: `Canonical title ${key}`, thumbnailText: `PUMP ${key}`,
  })) as [{ key: "A"; id: string; revision: number; text: string; thumbnailText: string },
    { key: "B"; id: string; revision: number; text: string; thumbnailText: string },
    { key: "C"; id: string; revision: number; text: string; thumbnailText: string }],
  style: {
    resolvedSource: "forge_standard" as const, authorityRevision: HEARTH_THUMBNAIL_DIRECTION_STYLE_FALLBACK,
    bindingId: null, bindingRevision: null, profileRevisionId: null, profileContentHash: null, planningRules: null,
  },
  authority: {
    thumbnailAuthorityVersion: "forge.thumbnail-authority.v3", activeStrategyId: null,
    activeConceptSetId: "set-existing", planningSubtreeHash: "b".repeat(64),
  },
});

test("paid Thumbnail Directions accepts exact A/B/C and only harmless newline normalization", () => {
  const canonical = validatePaidThumbnailDirectionOutput(validOutput);
  assert.equal(canonical.ok, true);
  const crlf = validatePaidThumbnailDirectionOutput(`\r\n${validOutput.replaceAll("\n", "\r\n")}  \r\n`);
  assert.equal(crlf.ok, true);
  if (canonical.ok && crlf.ok) {
    assert.equal(canonical.output.text, crlf.output.text);
    assert.deepEqual(canonical.output.directions.map((entry) => entry.key), ["A", "B", "C"]);
  }
});

test("paid Thumbnail Directions rejects two, four, legacy five, reordered, incomplete, and wrapped output", () => {
  const D = C.replaceAll("THUMBNAIL_C", "THUMBNAIL_D").replaceAll("C concept", "D concept");
  const E = C.replaceAll("THUMBNAIL_C", "THUMBNAIL_E").replaceAll("C concept", "E concept");
  const invalid = [
    [strategy, A, B].join("\n\n"),
    [strategy, A, B, C, D].join("\n\n"),
    [strategy, A, B, C, D, E].join("\n\n"),
    [strategy, B, A, C].join("\n\n"),
    validOutput.replace(/^Dominant colors:.*$/m, ""),
    validOutput.replace("Headline: A concept", "Headline: TBD"),
    `Here are the directions:\n${validOutput}`,
    `\`\`\`\n${validOutput}\n\`\`\``,
  ];
  for (const candidate of invalid) assert.equal(validatePaidThumbnailDirectionOutput(candidate).ok, false);
});

test("paid Thumbnail Directions rejects duplicate and superficial subject/action/composition rewrites", () => {
  const duplicate = [strategy, A, A.replaceAll("THUMBNAIL_A", "THUMBNAIL_B").replaceAll("TITLE_A", "TITLE_B"), C].join("\n\n");
  assert.equal(validatePaidThumbnailDirectionOutput(duplicate).ok, false);
  const superficialB = A
    .replaceAll("THUMBNAIL_A", "THUMBNAIL_B")
    .replaceAll("TITLE_A", "TITLE_B")
    .replace("Headline: A concept", "Headline: Pump price concept")
    .replace("gasoline pump and driver", "driver with a gasoline pump")
    .replace("driver studies the changing price display", "driver examines the changing display price")
    .replace("tight foreground pump on the left with open sky on the right", "close foreground pump at left and open sky at right");
  assert.equal(validatePaidThumbnailDirectionOutput([strategy, A, superficialB, C].join("\n\n")).ok, false);
});

test("canonical request binds script, three titles, Forge Standard fallback, V3 authority, and one Luna attempt", async () => {
  const input = canonicalInput();
  const messages = buildPaidThumbnailDirectionMessages(input);
  assert.match(messages[1].content, /RESOLVED_STYLE_SOURCE: forge_standard/);
  assert.ok(messages[1].content.endsWith(input.approved.scriptText));
  const identity = paidThumbnailDirectionFingerprintPayload({
    userId: "44444444-4444-4444-8444-444444444444",
    workspaceId: "cc5478ff-37be-403e-824c-467fa7da061e",
    workpieceId: "21d16d6a-905b-491e-8761-028789612ae5",
    operationIntentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", input,
  });
  assert.equal(identity.schema, HEARTH_THUMBNAIL_DIRECTION_CONTRACT);
  assert.equal(identity.route_code, HEARTH_THUMBNAIL_DIRECTION_ROUTE);
  assert.equal(identity.output_contract, HEARTH_THUMBNAIL_DIRECTION_OUTPUT_CONTRACT);
  assert.deepEqual([
    identity.maximum_input_tokens, identity.maximum_output_tokens, identity.maximum_attempts,
    identity.maximum_response_bytes, identity.browsing_requests, identity.retrieval_requests,
    identity.tools, identity.attachments, identity.image_provider_calls,
  ], [16_000, 2_048, 1, 24_576, 0, 0, 0, 0, 0]);
  const bounded = await buildBoundedPaidJsonOpenAiRequest({
    body: { model: HEARTH_THUMBNAIL_DIRECTION_MODEL, reasoning_effort: "none", messages },
    model: HEARTH_THUMBNAIL_DIRECTION_MODEL,
    maximumOutputTokens: HEARTH_THUMBNAIL_DIRECTION_MAX_OUTPUT_TOKENS,
    maximumAttempts: HEARTH_THUMBNAIL_DIRECTION_MAX_ATTEMPTS,
  });
  assert.ok(bounded.boundedInputTokens <= HEARTH_THUMBNAIL_DIRECTION_MAX_INPUT_TOKENS);
  const body = JSON.parse(bounded.serializedBody);
  assert.equal(body.max_completion_tokens, 2_048);
  assert.equal(body.tools, undefined);
});

test("Thumbnail Directions economics are the approved two-credit direct-only product", () => {
  const inputMicros = Math.ceil(16_000 * 200_000 / 1_000_000);
  const outputMicros = Math.ceil(2_048 * 1_200_000 / 1_000_000);
  const direct = inputMicros + outputMicros;
  const target = Math.ceil(direct * 133 / 100);
  assert.deepEqual({ inputMicros, outputMicros, direct, target, credits: Math.ceil(target / 5_000) }, {
    inputMicros: 3_200, outputMicros: 2_458, direct: 5_658, target: 7_526, credits: 2,
  });
});

test("paid output persists one strategy, three briefs, three concepts, and one replay-safe set", async () => {
  const episodePackage = hydrateEpisodePackageV3({});
  const thumbnail = episodePackage.thumbnail;
  const expectedAuthorityHash = canonicalContentHash({
    authority_version: thumbnail.authority_version,
    active_creative_strategy_id: thumbnail.active_creative_strategy_id,
    active_concept_set_id: thumbnail.active_concept_set_id,
    creative_strategies: thumbnail.creative_strategies,
    creative_briefs: thumbnail.creative_briefs,
    concept_sets: thumbnail.concept_sets,
    concept_revisions: thumbnail.concept_revisions,
  });
  const identity = {
    resultId: "11111111-1111-4111-8111-111111111111",
    operationId: "thumbnail-directions-operation",
    approvalId: "22222222-2222-4222-8222-222222222222",
    approvalRevision: 7,
    scriptHash: "a".repeat(64),
    generatedAt: "2026-09-23T12:00:00.000Z",
    styleAuthority: { resolved_source: "forge_standard" },
    titleInputs: canonicalInput().titles,
    expectedAuthorityHash,
    expectedStrategyId: thumbnail.active_creative_strategy_id,
    expectedSetId: thumbnail.active_concept_set_id,
  };
  const created = await buildPaidThumbnailDirectionMutation({ episodePackage, rawText: validOutput, identity });
  assert.equal(created.disposition, "created");
  assert.equal(created.nextEpisodePackage.thumbnail.creative_strategies.length - thumbnail.creative_strategies.length, 1);
  assert.equal(created.nextEpisodePackage.thumbnail.creative_briefs.length - thumbnail.creative_briefs.length, 3);
  assert.equal(created.nextEpisodePackage.thumbnail.concept_revisions.length - thumbnail.concept_revisions.length, 3);
  assert.equal(created.nextEpisodePackage.thumbnail.concept_sets.length - thumbnail.concept_sets.length, 1);
  assert.equal(created.nextEpisodePackage.thumbnail.concept_sets.at(-1)?.concept_revision_ids.length, 3);
  const replay = await buildPaidThumbnailDirectionMutation({ episodePackage: created.nextEpisodePackage, rawText: validOutput, identity });
  assert.equal(replay.disposition, "existing");
  assert.equal(replay.nextEpisodePackage.thumbnail.concept_sets.length, created.nextEpisodePackage.thumbnail.concept_sets.length);
  await assert.rejects(
    buildPaidThumbnailDirectionMutation({ episodePackage, rawText: validOutput, identity: { ...identity, expectedAuthorityHash: "f".repeat(64) } }),
    /authority changed/,
  );
});

test("Create thumbnail directions prepares one two-credit quote and makes no provider or image call", async () => {
  const scriptText = "Approved gasoline script.";
  const input = canonicalInput();
  input.approved.scriptHash = await hashApprovedTitleScript(scriptText);
  let providerCalls = 0;
  let imageCalls = 0;
  const rpcCalls: string[] = [];
  const gate = { async rpc(name: string, args: Record<string, unknown>) {
    rpcCalls.push(name);
    if (name === "read_openai_execution_requirement") return { data: { mode: "enforce", funding_context_required: true }, error: null };
    if (name === "resolve_openai_text_model_for_funding_quote") return { data: {
      catalog_revision_id: "18000000-0000-4000-8000-000000000005", catalog_revision: 12,
      model_catalog_entry_id: "88888888-8888-4888-8888-888888888888",
      runtime_model_id: HEARTH_THUMBNAIL_DIRECTION_MODEL, provider_model_id: HEARTH_THUMBNAIL_DIRECTION_MODEL,
      display_name: "GPT-5.6 Luna", tradeoff_summary: "Bounded three-direction planning.",
    }, error: null };
    if (name === "create_customer_openai_text_quote") {
      assert.equal(args.p_route_code, HEARTH_THUMBNAIL_DIRECTION_ROUTE);
      return { data: {
        quote_id: args.p_quote_id, operation_id: args.p_operation_id, quote_hash: "b".repeat(64),
        request_fingerprint: args.p_request_fingerprint, currency: "USD",
        maximum_customer_charge_micros: 10_000, customer_credit_units: 2,
        failure_customer_charge_micros: 0, funding_eligible: true,
        funding_source: "customer_deposit", funding_environment: "test", payer_kind: "personal",
        funding_label: "Forge Credits", expires_at: args.p_expires_at,
      }, error: null };
    }
    if (name === "read_openai_text_quote_bounding_context") return { data: {
      model: HEARTH_THUMBNAIL_DIRECTION_MODEL, maximum_input_units: 16_000,
      maximum_output_units: 2_048, maximum_attempts: 1,
    }, error: null };
    if (name === "bind_bounded_provider_quote_request") {
      assert.equal(args.p_route_code, HEARTH_THUMBNAIL_DIRECTION_ROUTE);
      assert.ok(Number(args.p_bounded_input_tokens) <= 16_000);
      assert.equal(args.p_maximum_output_tokens, 2_048);
      assert.equal(args.p_maximum_attempts, 1);
      return { data: { replay: false }, error: null };
    }
    return { data: {}, error: null };
  } };
  const config: HearthRuntimeConfig = {
    textApiKey: "fake-forge-key", imageApiKey: null, researchApiKey: null,
    apiKey: "fake-forge-key", model: HEARTH_THUMBNAIL_DIRECTION_MODEL,
    sttModel: "gpt-4o-mini-transcribe", configuredBillingMode: "forge", initialTokenBalance: 10_000,
    supabaseUrl: null, supabaseServiceRoleKey: null, supabaseRpcKey: null,
    sttBucket: "forge-workpieces", disableForgeLaneAi: false, disableUserKeys: false,
    disableExpensiveAiActions: false, disableCdcGeneration: false,
    openAiTextGate: gate,
    resolveUserIdForAccessToken: async () => "44444444-4444-4444-8444-444444444444",
    readApprovedTitleScript: async () => input.approved,
    readThumbnailDirectionInput: async () => input,
    openAiProviderFetch: async () => { providerCalls += 1; return new Response(null, { status: 500 }); },
  };
  const handler = createHearthAiHandler(config);
  const requestContent = buildProductionPrompt({ action: "thumbnails", scriptVersion: 7, episodeTitle: input.approved.episodeTitle });
  const response = await handler(new Request("http://localhost/api/hearth/chat", {
    method: "POST",
    headers: { authorization: "Bearer fake-user-token", "content-type": "application/json" },
    body: JSON.stringify({
      lane: "forge", action_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      messages: [{ role: "user", content: requestContent }], user_authored_text: requestContent,
      explicit_action: { kind: "production", action: "thumbnails" }, production_action: "thumbnails",
      production_script_version: 7,
      attachment_context: { include_episode_attachments: false, attachment_ids: [] },
      episode_context: {
        episodeId: "21d16d6a-905b-491e-8761-028789612ae5",
        workspaceId: "cc5478ff-37be-403e-824c-467fa7da061e",
        title: "Untrusted browser title", titleVariants: { A: "", B: "", C: "" },
        outline: "", body: scriptText, tonePreset: null, sources: [], sparks: [],
      },
    }),
  }));
  const payload = await response.json() as Record<string, any>;
  assert.equal(response.status, 409, JSON.stringify(payload));
  assert.equal(payload.code, "hearth_spending_confirmation_required");
  assert.equal(payload.billing_quote.credit_charge, 2);
  assert.equal(providerCalls, 0);
  assert.equal(imageCalls, 0);
  assert.equal(rpcCalls.filter((name) => name === "create_customer_openai_text_quote").length, 1);
  assert.ok(rpcCalls.includes("bind_bounded_provider_quote_request"));
});

test("malformed paid output makes one provider attempt, records raw evidence, and never persists or retries", async () => {
  const operationId = "operation-thumbnail-direction-validation-v1";
  const reservationId = "11111111-1111-4111-8111-111111111111";
  const fingerprintPayload = { schema: HEARTH_THUMBNAIL_DIRECTION_CONTRACT, output_contract: HEARTH_THUMBNAIL_DIRECTION_OUTPUT_CONTRACT };
  const requestFingerprint = await fingerprintOpenAiTextPaidRequest(fingerprintPayload);
  const rawBody = JSON.stringify({
    id: "chatcmpl_thumbnail_invalid",
    choices: [{ message: { content: [strategy, A, B].join("\n\n") } }],
    usage: { prompt_tokens: 2811, completion_tokens: 300 },
  });
  const calls: string[] = [];
  let state = "reserved";
  let providerCalls = 0;
  let persistenceCalls = 0;
  const evidence: Array<Record<string, unknown>> = [];
  const gate = { async rpc(name: string, args: Record<string, unknown>) {
    calls.push(name);
    if (name === "resolve_openai_text_paid_execution_context") return { data: {
      operation_id: operationId, reservation_id: reservationId,
      quote_id: "22222222-2222-4222-8222-222222222222", route_code: HEARTH_THUMBNAIL_DIRECTION_ROUTE,
      funding_source_type: "customer_deposit", funding_source_id: "33333333-3333-4333-8333-333333333333",
      funding_environment: "test", credential_funding: "forge", model: HEARTH_THUMBNAIL_DIRECTION_MODEL,
      maximum_input_units: 16000, maximum_output_units: 2048, maximum_attempts: 1,
      maximum_failure_exposure_micros: 5658, direct_provider_ceiling_micros: 5658,
      supporting_cost_ceiling_micros: 0, input_micros_per_million_tokens: 200000,
      output_micros_per_million_tokens: 1200000, reservation_state: state,
    }, error: null };
    if (name === "acquire_openai_text_aggregate_admission") return { data: { enforcement_enabled: true, authorized: true, hold_id: "thumbnail-hold" }, error: null };
    if (name === "authorize_openai_text_provider_attempt_with_aggregate") return { data: { provider_execution_authorized: true }, error: null };
    if (name === "record_openai_text_validation_failure_evidence") {
      evidence.push(args);
      return { data: { evidence_id: "44444444-4444-4444-8444-444444444444" }, error: null };
    }
    if (name === "settle_openai_customer_failure_without_duplicate_expense") { state = "released"; return { data: {}, error: null }; }
    return { data: {}, error: null };
  } };
  const run = () => executePaidJsonOpenAiRoute({
    gate, routeCode: HEARTH_THUMBNAIL_DIRECTION_ROUTE,
    handle: { operationId, reservationId, requestFingerprint, fundingEnvironment: "test" },
    userId: "44444444-4444-4444-8444-444444444444",
    workspaceId: "cc5478ff-37be-403e-824c-467fa7da061e",
    workpieceId: "21d16d6a-905b-491e-8761-028789612ae5",
    credentialSource: "forge_managed", apiKey: "fake-key", requestFingerprintPayload: fingerprintPayload,
    providerRequestBody: (model) => ({ model, messages: [{ role: "user", content: "directions" }] }),
    fetchImpl: async () => { providerCalls += 1; return new Response(rawBody, { status: 200 }); },
    validationEvidence: {
      contractRevision: HEARTH_THUMBNAIL_DIRECTION_OUTPUT_CONTRACT,
      recordFailure: async (failure) => {
        const recorded = await gate.rpc("record_openai_text_validation_failure_evidence", failure);
        if (recorded.error) throw new Error(recorded.error.message);
      },
    },
    validate: (payload) => {
      const content = (payload.choices as Array<{ message: { content: string } }>)[0]!.message.content;
      const output = validatePaidThumbnailDirectionOutput(content);
      if (!output.ok) throw new Error(output.error);
      return output.output;
    },
    persist: async (result) => { persistenceCalls += 1; return result; },
  });
  await assert.rejects(run, (error: unknown) => error instanceof PaidJsonOpenAiRouteError && error.state === "failed_released");
  await assert.rejects(run, (error: unknown) => error instanceof PaidJsonOpenAiRouteError && error.state === "failed_released");
  assert.equal(providerCalls, 1);
  assert.equal(persistenceCalls, 0);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0]?.rawProviderResponseText, rawBody);
  assert.equal(calls.filter((name) => name === "settle_openai_customer_failure_without_duplicate_expense").length, 1);
});

test("response byte ceiling is fail-closed", () => {
  assert.ok(HEARTH_THUMBNAIL_DIRECTION_MAX_RESPONSE_BYTES < new TextEncoder().encode(`${validOutput}${"x".repeat(25_000)}`).byteLength);
  assert.equal(validatePaidThumbnailDirectionOutput(`${validOutput}${"x".repeat(25_000)}`).ok, false);
});
