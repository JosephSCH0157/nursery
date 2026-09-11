import test from "node:test";
import assert from "node:assert/strict";

import {
  boundedProviderRequestEvidence,
  buildBoundedOpenAiProviderRequest,
} from "../dist/providers/bounded-provider-request.js";

function body(system = "Follow the canonical Hearth contract.") {
  return {
    model: "gpt-5.6-luna",
    messages: [
      { role: "system", content: system },
      { role: "assistant", content: "Earlier context" },
      { role: "user", content: "Use the injected source context." },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "hearth_result", strict: true, schema: { type: "object" } },
    },
    max_completion_tokens: 512,
  };
}

test("bounds the complete canonical serialized request and preserves its exact bytes", async () => {
  const request = await buildBoundedOpenAiProviderRequest({
    body: body(),
    model: "gpt-5.6-luna",
    maximumOutputTokens: 512,
    maximumAttempts: 1,
  });
  assert.deepEqual(JSON.parse(request.serializedBody), request.body);
  assert.equal(new TextEncoder().encode(request.serializedBody).byteLength, request.serializedBytes);
  assert.equal(request.utf8ByteTokenUpperBound, request.serializedBytes);
  assert.equal(
    request.boundedInputTokens,
    Math.max(request.tokenizerInputTokens + request.protocolOverheadTokens, request.serializedBytes),
  );
  assert.equal(request.maximumOutputTokens, 512);
  assert.equal(request.maximumAttempts, 1);
  assert.match(request.serializedBodySha256, /^[0-9a-f]{64}$/);
  assert.match(request.serializedBody, /canonical Hearth contract/);
  assert.match(request.serializedBody, /Earlier context/);
  assert.match(request.serializedBody, /injected source context/);
  assert.match(request.serializedBody, /json_schema/);
});

test("system, history, context, and protocol changes invalidate the request binding", async () => {
  const original = await buildBoundedOpenAiProviderRequest({
    body: body(), model: "gpt-5.6-luna", maximumOutputTokens: 512, maximumAttempts: 1,
  });
  const changed = await buildBoundedOpenAiProviderRequest({
    body: body("A revised system contract."), model: "gpt-5.6-luna", maximumOutputTokens: 512, maximumAttempts: 1,
  });
  assert.notEqual(original.serializedBodySha256, changed.serializedBodySha256);
  assert.notEqual(original.serializedBody, changed.serializedBody);
});

test("rejects unpriceable or internally inconsistent provider envelopes", async () => {
  await assert.rejects(() => buildBoundedOpenAiProviderRequest({
    body: { ...body(), temperature: Number.NaN },
    model: "gpt-5.6-luna",
    maximumOutputTokens: 512,
    maximumAttempts: 1,
  }), /non_finite/);
  await assert.rejects(() => buildBoundedOpenAiProviderRequest({
    body: body(), model: "gpt-5.6-terra", maximumOutputTokens: 512, maximumAttempts: 1,
  }), /model_mismatch/);
});

test("customer-safe evidence contains bounds but not request content", async () => {
  const request = await buildBoundedOpenAiProviderRequest({
    body: body(), model: "gpt-5.6-luna", maximumOutputTokens: 512, maximumAttempts: 1,
  });
  const evidence = boundedProviderRequestEvidence(request);
  assert.equal(evidence.bounded_input_tokens, request.boundedInputTokens);
  assert.equal(evidence.serialized_body_sha256, request.serializedBodySha256);
  assert.equal(JSON.stringify(evidence).includes("Earlier context"), false);
});
