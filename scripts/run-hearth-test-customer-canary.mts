import crypto, { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { executePaidHearthChatCompletion } from "../apps/nursery/server/hearth/hearth-paid-chat-execution.ts";

function arg(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : "";
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.TONGS_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Supabase service configuration is required");

const operatorId = arg("operator-id");
const userId = arg("user-id");
const workspaceId = arg("workspace-id");
const depositId = arg("deposit-id");
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const tongs = supabase.schema("tongs") as any;

async function rpc(name: string, args: Record<string, unknown>): Promise<any> {
  const result = await tongs.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  return result.data;
}

function ids(label: string) {
  const fingerprint = crypto.createHash("sha256").update(`forge-test-canary:${label}:${randomUUID()}`).digest("hex");
  return {
    operationId: `hearth-test-${label}-${randomUUID()}`,
    quoteId: randomUUID(),
    acceptanceId: randomUUID(),
    reservationId: randomUUID(),
    fingerprint,
  };
}

function testGate() {
  return {
    async rpc(name: string, args: Record<string, unknown>) {
      try {
        if (name === "resolve_hearth_chat_paid_execution_context") {
          return { data: await rpc("resolve_hearth_chat_test_execution_context", args), error: null };
        }
        if (name === "authorize_openai_text_provider_attempt") {
          return { data: await rpc("authorize_hearth_chat_test_attempt", {
            p_reservation_id: args.p_reservation_id,
            p_attempt_key: args.p_attempt_key,
            p_evidence_json: { ...(args.p_evidence_json as object ?? {}), simulated_test: true },
          }), error: null };
        }
        if (name === "persist_hearth_chat_paid_result") {
          return { data: await rpc("persist_hearth_chat_test_result", args), error: null };
        }
        if (name === "read_hearth_chat_paid_result") {
          return { data: await rpc("read_hearth_chat_test_result", args), error: null };
        }
        if (name === "settle_operation") {
          return { data: await rpc("settle_hearth_chat_test_operation", {
            p_reservation_id: args.p_reservation_id,
            p_settlement_id: args.p_settlement_id,
            p_settlement_key: args.p_settlement_key,
            p_outcome: args.p_outcome,
            p_failure_class: args.p_failure_class,
            p_evidence_json: { ...(args.p_evidence_json as object ?? {}), simulated_test: true },
          }), error: null };
        }
        if (name === "mark_submission_unknown") {
          return { data: await rpc("mark_hearth_chat_test_submission_unknown", {
            p_reservation_id: args.p_reservation_id,
            p_event_key: args.p_event_key,
            p_evidence_json: { ...(args.p_evidence_json as object ?? {}), simulated_test: true },
          }), error: null };
        }
        const evidenceKey = String(args.p_evidence_key ?? args.p_expense_key ?? args.p_event_key
          ?? `${args.p_attempt_key}:${name}`);
        return { data: await rpc("record_hearth_chat_test_evidence", {
          p_reservation_id: args.p_reservation_id,
          p_evidence_key: evidenceKey,
          p_evidence_kind: name,
          p_evidence_json: { ...args, simulated_test: true, real_provider_called: false },
        }), error: null };
      } catch (error) {
        return { data: null, error: { message: error instanceof Error ? error.message : String(error) } };
      }
    },
  };
}

async function quoteAcceptReserve(authorizationId: string, value: ReturnType<typeof ids>) {
  const quote = await rpc("create_hearth_chat_test_quote", {
    p_quote_id: value.quoteId,
    p_authorization_id: authorizationId,
    p_operation_id: value.operationId,
    p_request_fingerprint: value.fingerprint,
    p_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  const acceptance = await rpc("accept_hearth_chat_test_quote", {
    p_acceptance_id: value.acceptanceId,
    p_quote_id: value.quoteId,
    p_acceptance_key: `test-acceptance:${value.operationId}`,
    p_quote_hash: quote.quote_hash,
    p_actor_id: operatorId,
  });
  const reservation = await rpc("reserve_hearth_chat_test_quote", {
    p_reservation_id: value.reservationId,
    p_quote_id: value.quoteId,
    p_idempotency_key: `test-reservation:${value.operationId}`,
  });
  if (reservation.real_provider_authorized !== false || reservation.execution_kind !== "simulated_test") {
    throw new Error("Test reservation did not fail closed at the real-provider boundary");
  }
  return { quote, acceptance, reservation };
}

const before = await rpc("read_customer_test_billing", { p_user_id: userId });
const authorizationId = randomUUID();
await rpc("open_hearth_test_execution_authorization", {
  p_authorization_id: authorizationId,
  p_actor_id: operatorId,
  p_user_id: userId,
  p_workspace_id: workspaceId,
  p_deposit_id: depositId,
  p_maximum_operations: 2,
  p_maximum_aggregate_charge_micros: 40000,
  p_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
  p_reason: "Approved Stripe Test success, replay, and nonbillable failure canary",
});

let closed = false;
try {
  const success = ids("success");
  const successSetup = await quoteAcceptReserve(authorizationId, success);
  let successProviderCalls = 0;
  const executeSuccess = () => executePaidHearthChatCompletion({
    gate: testGate(),
    handle: { operationId: success.operationId, reservationId: success.reservationId, requestFingerprint: success.fingerprint },
    userId,
    workspaceId,
    workpieceId: "hearth-test-canonical-result",
    credentialSource: "forge_managed",
    apiKey: "simulated-test-no-provider-key",
    messages: [{ role: "user", content: "Return one neutral sentence for the isolated billing test." }],
    signal: new AbortController().signal,
    providerFetch: async () => {
      successProviderCalls += 1;
      return new Response(JSON.stringify({
        id: "chatcmpl_simulated_test",
        choices: [{ message: { content: "The simulated Hearth result was persisted without contacting a paid provider." } }],
        usage: { prompt_tokens: 30, completion_tokens: 9 },
      }), { status: 200, headers: { "x-request-id": "req_simulated_test_success" } });
    },
    validateAndNormalize: (reply) => ({ assistantText: reply, ops: [], scriptText: null, tagAudit: null }),
  });
  const first = await executeSuccess();
  const replay = await executeSuccess();

  const failure = ids("failure");
  const failureSetup = await quoteAcceptReserve(authorizationId, failure);
  let failureProviderCalls = 0;
  const failed = await executePaidHearthChatCompletion({
    gate: testGate(),
    handle: { operationId: failure.operationId, reservationId: failure.reservationId, requestFingerprint: failure.fingerprint },
    userId,
    workspaceId,
    workpieceId: "hearth-test-failure",
    credentialSource: "forge_managed",
    apiKey: "simulated-test-no-provider-key",
    messages: [{ role: "user", content: "Exercise a simulated provider failure." }],
    signal: new AbortController().signal,
    providerFetch: async () => {
      failureProviderCalls += 1;
      return new Response("simulated provider rejection", { status: 503, headers: { "x-request-id": "req_simulated_test_failure" } });
    },
    validateAndNormalize: (reply) => ({ assistantText: reply, ops: [], scriptText: null, tagAudit: null }),
  });

  await rpc("close_hearth_test_execution_authorization", {
    p_authorization_id: authorizationId,
    p_actor_id: operatorId,
    p_reason: "Stripe Test canary complete; close all new simulated reservations",
  });
  closed = true;
  const after = await rpc("read_customer_test_billing", { p_user_id: userId });
  console.log(JSON.stringify({
    authorization_id: authorizationId,
    authorization_state: "closed",
    before_test_credit_balance: before.test_credit_balance,
    after_test_credit_balance: after.test_credit_balance,
    success: {
      operation_id: success.operationId,
      quote_id: success.quoteId,
      acceptance_id: success.acceptanceId,
      reservation_id: success.reservationId,
      maximum_customer_charge_micros: successSetup.quote.normal_maximum_charge_micros,
      failure_customer_charge_micros: successSetup.quote.billable_failure_maximum_charge_micros,
      acceptance_replay: successSetup.acceptance.replay,
      settlement_state: first.state,
      replay_state: replay.state,
      customer_charge_micros: first.customerChargeMicros,
      simulated_provider_calls: successProviderCalls,
      persisted_result: first.result.assistantText,
    },
    failure: {
      operation_id: failure.operationId,
      quote_id: failure.quoteId,
      reservation_id: failure.reservationId,
      reservation_kind: failureSetup.reservation.execution_kind,
      state: failed.state,
      customer_charge_micros: failed.customerChargeMicros,
      simulated_provider_calls: failureProviderCalls,
    },
    real_provider_calls: 0,
    live_revenue_changed: false,
    receipts: after.receipts,
  }, null, 2));
} finally {
  if (!closed) {
    await rpc("close_hearth_test_execution_authorization", {
      p_authorization_id: authorizationId,
      p_actor_id: operatorId,
      p_reason: "Close Test authorization after interrupted canary",
    }).catch(() => undefined);
  }
}
