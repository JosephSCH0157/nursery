import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildBoundedHearthChatProviderRequest } from "../server/hearth/hearth-paid-chat-execution";
import {
  ownerHearthExecutionGate,
  prepareOwnerHearthOperation,
  readOwnerHearthExecutionRequirement,
} from "../server/hearth/owner-hearth-paid-execution";

const ownerId = "42c3de1d-bd24-41fe-abd9-640f17518b2c";
const workspaceId = "494c2ae5-9037-4208-b898-fab4898ab430";

test("owner authority is resolved server-side and exact serialized payload is bound", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const gate = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "read_owner_hearth_execution_requirement") {
        return { data: { mode: "enforce", owner_testing_effective: true }, error: null };
      }
      if (name === "resolve_owner_hearth_model_for_operation") {
        return { data: { provider_model_id: "gpt-5.6-luna", authorization_kind: "creator_session" }, error: null };
      }
      if (name === "prepare_owner_hearth_operation") {
        return {
          data: {
            operation_id: args.p_operation_id,
            reservation_id: args.p_reservation_id,
            request_fingerprint: args.p_request_fingerprint,
          },
          error: null,
        };
      }
      return { data: {}, error: null };
    },
  };
  const requirement = await readOwnerHearthExecutionRequirement({ gate, userId: ownerId, workspaceId });
  assert.equal(requirement.owner_testing_effective, true);
  const messages = [
    { role: "system", content: "private system instructions" },
    { role: "assistant", content: "history retained for complete request pricing" },
    { role: "user", content: "current creator request" },
  ];
  const prepared = await prepareOwnerHearthOperation({
    gate,
    userId: ownerId,
    workspaceId,
    workpieceId: "workpiece-one",
    requestedProviderModelId: "best_available",
    requestFingerprint: "a".repeat(64),
    buildRequest: (model, maximumOutputTokens, maximumAttempts) => buildBoundedHearthChatProviderRequest({
      messages,
      model,
      maximumOutputTokens,
      maximumAttempts,
    }),
  });
  assert.equal(prepared.model, "gpt-5.6-luna");
  assert.deepEqual(prepared.boundedRequest.body.messages, messages);
  assert.equal(
    prepared.boundedRequest.boundedInputTokens,
    Math.max(
      prepared.boundedRequest.tokenizerInputTokens + prepared.boundedRequest.protocolOverheadTokens,
      prepared.boundedRequest.serializedBytes,
    ),
  );
  const bound = calls.find((call) => call.name === "prepare_owner_hearth_operation")!;
  assert.equal(bound.args.p_serialized_body_sha256, prepared.boundedRequest.serializedBodySha256);
  assert.equal(bound.args.p_bounded_input_tokens, prepared.boundedRequest.boundedInputTokens);
  assert.match(prepared.handle.operationId, /^owner-hearth-[0-9a-f]{64}$/);
});

test("owner gate replaces authority and settlement gates but preserves evidence RPCs", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const base = { async rpc(name: string, args: Record<string, unknown>) { calls.push({ name, args }); return { data: {}, error: null }; } };
  const gate = ownerHearthExecutionGate(base);
  await gate.rpc("resolve_openai_text_paid_execution_context", { p_operation_id: "op", p_route_code: "hearth.chat_completion" });
  await gate.rpc("acquire_openai_text_aggregate_admission", {});
  await gate.rpc("authorize_openai_text_provider_attempt_with_aggregate", {});
  await gate.rpc("settle_owner_operation", {});
  await gate.rpc("record_openai_text_provider_capture", {});
  assert.deepEqual(calls.map((call) => call.name), [
    "resolve_owner_hearth_paid_execution_context",
    "acquire_owner_hearth_aggregate_admission",
    "authorize_owner_hearth_provider_attempt_with_aggregate",
    "settle_owner_hearth_operation",
    "record_openai_text_provider_capture",
  ]);
  assert.deepEqual(calls[0]?.args, { p_operation_id: "op" });
});

// Frozen historical wire evidence, deliberately independent of the current builder.
const HISTORICAL_ASTRA_BODY = "{\"max_completion_tokens\":512,\"messages\":[{\"content\":\"You are Hearth, a concise podcast writing collaborator. Answer only the creator's bounded request. Do not browse, call tools, purchase assets, or claim work you did not perform. Return plain text or the existing Hearth JSON reply shape.\",\"role\":\"system\"},{\"content\":\"Reply with exactly: Ready.\",\"role\":\"user\"}],\"model\":\"gpt-6-astra\"}";
const HISTORICAL_ASTRA_SHA256 = "a47a64df70bcccf38b7174d5829798f7a69e47c11f218857091f99b3b0f9cd43";
const CURRENT_ASTRA_SHA256 = "5782309a417f5970d78dfc57b6c42c717d771ce9bc1c6b88747c8c2ee2da2735";
const legacySql = readFileSync(new URL("../../../supabase/tests/owner_hearth_aggregate_admission_enforcement.sql", import.meta.url), "utf8");

test("historical compatibility serialization retains its reviewed byte and financial bounds", () => {
  assert.equal(Buffer.byteLength(HISTORICAL_ASTRA_BODY), 386);
  assert.equal(createHash("sha256").update(HISTORICAL_ASTRA_BODY).digest("hex"), HISTORICAL_ASTRA_SHA256);
  // o200k_base-js-tiktoken-1.0.21 historical evidence: 85 tokens + 16 protocol.
  assert.equal(Math.max(85 + 16, Buffer.byteLength(HISTORICAL_ASTRA_BODY)), 386);
  assert.ok(legacySql.includes("$historical_request$" + HISTORICAL_ASTRA_BODY + "$historical_request$"));
  assert.ok(legacySql.includes(HISTORICAL_ASTRA_SHA256));
  const expected = new Map([
    ["gpt-6-astra", 386], ["gpt-5.6-sol", 386], ["gpt-5.6-terra", 388],
    ["gpt-5.4-mini-2026-03-17", 398], ["gpt-5.6-luna", 387],
  ]);
  for (const [model, bytes] of expected) {
    const historicalBody = HISTORICAL_ASTRA_BODY.replace('"model":"gpt-6-astra"', '"model":"' + model + '"');
    assert.equal(Buffer.byteLength(historicalBody), bytes, model);
  }
});

test("current Astra serialization is distinct and exceeds unchanged historical authority", async () => {
  const historical = JSON.parse(HISTORICAL_ASTRA_BODY);
  const request = await buildBoundedHearthChatProviderRequest({
    messages: historical.messages, model: historical.model, maximumOutputTokens: 512, maximumAttempts: 1,
  });
  assert.deepEqual(request.body, { ...historical, prompt_cache_options: { ttl: "30m" }, service_tier: "default" });
  assert.equal(request.serializedBytes, 448);
  assert.equal(Buffer.byteLength(request.serializedBody), 448);
  assert.equal(request.serializedBodySha256, CURRENT_ASTRA_SHA256);
  assert.equal(createHash("sha256").update(request.serializedBody).digest("hex"), CURRENT_ASTRA_SHA256);
  assert.notEqual(request.serializedBodySha256, HISTORICAL_ASTRA_SHA256);
  assert.equal(request.tokenizerInputTokens, 101);
  assert.equal(request.protocolOverheadTokens, 16);
  assert.equal(request.boundedInputTokens, Math.max(101 + 16, 448));
  assert.ok(request.boundedInputTokens > 386);
  // The same exact builder output is submitted to the real SQL admission gate
  // in both canonical certification privilege modes, never to a provider.
  assert.ok(legacySql.includes("$current_request$" + request.serializedBody + "$current_request$"));
  assert.ok(legacySql.includes(CURRENT_ASTRA_SHA256));
});

for (const reason of [
  "owner Hearth authorization halted or expired",
  "compatibility model already attempted",
  "owner Hearth authorization is not active",
  "owner Hearth amount cap exhausted",
]) {
  test("owner preparation propagates financial denial: " + reason, async () => {
    const calls: string[] = [];
    const gate = { async rpc(name: string) {
      calls.push(name);
      if (name === "resolve_owner_hearth_model_for_operation") return {
        data: { provider_model_id: "gpt-6-astra", authorization_kind: "compatibility_batch" }, error: null,
      };
      assert.equal(name, "prepare_owner_hearth_operation");
      return { data: null, error: { message: reason } };
    } };
    await assert.rejects(() => prepareOwnerHearthOperation({
      gate, userId: ownerId, workspaceId, workpieceId: "denied-workpiece",
      requestedProviderModelId: "gpt-6-astra", requestFingerprint: "a".repeat(64),
      buildRequest: (model, maximumOutputTokens, maximumAttempts) =>
        buildBoundedHearthChatProviderRequest({ messages: JSON.parse(HISTORICAL_ASTRA_BODY).messages, model, maximumOutputTokens, maximumAttempts }),
    }), { message: "prepare_owner_hearth_operation: " + reason });
    assert.deepEqual(calls, ["resolve_owner_hearth_model_for_operation", "prepare_owner_hearth_operation"]);
  });
}

test("missing owner financial metadata cannot reach request preparation", async () => {
  let built = false;
  const calls: string[] = [];
  const gate = { async rpc(name: string) { calls.push(name); return { data: {}, error: null }; } };
  await assert.rejects(() => prepareOwnerHearthOperation({
    gate, userId: ownerId, workspaceId, workpieceId: "missing-metadata",
    requestedProviderModelId: "gpt-6-astra", requestFingerprint: "a".repeat(64),
    buildRequest: async () => { built = true; throw new Error("must not build"); },
  }), { message: "owner Hearth model authority is incomplete" });
  assert.equal(built, false);
  assert.deepEqual(calls, ["resolve_owner_hearth_model_for_operation"]);
});
