import assert from "node:assert/strict";
import test from "node:test";
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
  const names: string[] = [];
  const base = { async rpc(name: string) { names.push(name); return { data: {}, error: null }; } };
  const gate = ownerHearthExecutionGate(base);
  await gate.rpc("resolve_openai_text_paid_execution_context", {});
  await gate.rpc("acquire_openai_text_aggregate_admission", {});
  await gate.rpc("authorize_openai_text_provider_attempt_with_aggregate", {});
  await gate.rpc("settle_owner_operation", {});
  await gate.rpc("record_openai_text_provider_capture", {});
  assert.deepEqual(names, [
    "resolve_owner_hearth_paid_execution_context",
    "acquire_owner_hearth_aggregate_admission",
    "authorize_owner_hearth_provider_attempt_with_aggregate",
    "settle_owner_hearth_operation",
    "record_openai_text_provider_capture",
  ]);
});

test("approved compatibility requests retain the exact complete-request byte ceilings", async () => {
  const system = [
    "You are Hearth, a concise podcast writing collaborator.",
    "Answer only the creator's bounded request.",
    "Do not browse, call tools, purchase assets, or claim work you did not perform.",
    "Return plain text or the existing Hearth JSON reply shape.",
  ].join(" ");
  const expected = new Map([
    ["gpt-6-astra", 386],
    ["gpt-5.6-sol", 386],
    ["gpt-5.6-terra", 388],
    ["gpt-5.4-mini-2026-03-17", 398],
    ["gpt-5.6-luna", 387],
  ]);
  for (const [model, boundedInputTokens] of expected) {
    const request = await buildBoundedHearthChatProviderRequest({
      messages: [{ role: "system", content: system }, { role: "user", content: "Reply with exactly: Ready." }],
      model,
      maximumOutputTokens: 512,
      maximumAttempts: 1,
    });
    assert.equal(request.boundedInputTokens, boundedInputTokens, model);
    assert.equal(request.boundedInputTokens, request.serializedBytes, model);
  }
});
