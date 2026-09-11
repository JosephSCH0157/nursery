import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  buildBoundedHearthChatProviderRequest,
  executePaidHearthChatCompletion,
  fingerprintPaidHearthChatRequest,
} from "../apps/nursery/server/hearth/hearth-paid-chat-execution";
import {
  ownerHearthExecutionGate,
  prepareOwnerHearthOperation,
  recordOwnerCompatibilityOutcome,
} from "../apps/nursery/server/hearth/owner-hearth-paid-execution";

const OWNER_ID = "42c3de1d-bd24-41fe-abd9-640f17518b2c";
const WORKSPACE_ID = "494c2ae5-9037-4208-b898-fab4898ab430";
const RUNWAY_RESERVATION_ID = "544efbb5-7b76-4c2b-a5cd-d8846ff66fec";
const AUTHORIZATION_ID = "95d2e49d-4084-4f3a-a371-a65f5a1ff006";
const BUDGET_ID = "69b4dd4f-a4e5-4891-b1a7-6fbb5080f925";
const TAIL_AUTHORIZATION_ID = "45e583bd-df82-4a55-8f18-04bb79235747";
const SESSION_AUTHORIZATION_ID = "43712011-b8ba-4387-848f-0180cd16389d";
const SESSION_BUDGET_ID = "46eaf314-527e-4b9a-a62e-e2e7715c9051";
const EXACT_MODELS = [
  "gpt-6-astra",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.4-mini-2026-03-17",
  "gpt-5.6-luna",
] as const;
const SYSTEM_PROMPT = [
  "You are Hearth, a concise podcast writing collaborator.",
  "Answer only the creator's bounded request.",
  "Do not browse, call tools, purchase assets, or claim work you did not perform.",
  "Return plain text or the existing Hearth JSON reply shape.",
].join(" ");

function requiredEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing secure environment variable: ${names.join(" or ")}`);
}

function gateFrom(client: ReturnType<typeof createClient>) {
  return {
    async rpc(name: string, args: Record<string, unknown>) {
      const result = await client.schema("tongs").rpc(name as never, args as never);
      return { data: result.data, error: result.error ? { message: result.error.message } : null };
    },
  };
}

async function main() {
  const apiKey = requiredEnv("OPENAI_HEARTH_OWNER_API_KEY");
  const supabaseUrl = requiredEnv("TONGS_SUPABASE_URL", "SUPABASE_URL");
  const serviceRoleKey = requiredEnv("TONGS_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const gate = gateFrom(client);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await gate.rpc(name, args);
    if (result.error) throw new Error(`${name}: ${result.error.message}`);
    return result.data as Record<string, unknown>;
  };
  const readSupplierEvidence = async (reservationId: string) => {
    const [captures, expenses] = await Promise.all([
      client.schema("tongs").from("openai_text_provider_captures")
        .select("provider_request_id,input_units,output_units")
        .eq("reservation_id", reservationId),
      client.schema("tongs").from("supplier_expenses")
        .select("amount_micros,evidence_status,component_code")
        .eq("reservation_id", reservationId),
    ]);
    if (captures.error) throw new Error(`provider evidence: ${captures.error.message}`);
    if (expenses.error) throw new Error(`supplier evidence: ${expenses.error.message}`);
    const expenseRows = (expenses.data ?? []) as Array<{ amount_micros: number | null; evidence_status: string; component_code: string }>;
    return {
      capture: ((captures.data ?? [])[0] ?? null) as { provider_request_id: string | null; input_units: number; output_units: number } | null,
      expenseRows,
      estimatedExpenseMicros: expenseRows.reduce((sum, row) => sum + (row.amount_micros ?? 0), 0),
      hasUnresolvedExpense: expenseRows.some((row) => row.amount_micros === null || row.evidence_status === "unresolved"),
    };
  };

  await call("import_legacy_runway_opening_commitment", {
    p_reservation_id: RUNWAY_RESERVATION_ID,
    p_operator_user_id: OWNER_ID,
    p_amount_micros: 750_000,
    p_reason: "Preserve unresolved September 2026 owner Runway pilot ceiling without creating entitlement or duplicate expense.",
  });
  await call("activate_owner_hearth_compatibility_package", {
    p_owner_user_id: OWNER_ID,
    p_workspace_id: WORKSPACE_ID,
    p_operator_user_id: OWNER_ID,
    p_authorization_id: AUTHORIZATION_ID,
    p_budget_id: BUDGET_ID,
    p_tail_authorization_id: TAIL_AUTHORIZATION_ID,
    p_reason: "Approved five-model owner Hearth compatibility batch capped at $0.09 with separate 12-month tail allocation.",
  });

  const initialAudit = await call("read_owner_hearth_activation_audit", {});
  const initialOperations = Array.isArray(initialAudit.operations)
    ? initialAudit.operations as Array<Record<string, unknown>>
    : [];
  const initialResults = Array.isArray(initialAudit.compatibility_results)
    ? initialAudit.compatibility_results as Array<Record<string, unknown>>
    : [];
  const existingResultByModel = new Map<string, Record<string, unknown>>();
  for (const result of initialResults) {
    const operation = initialOperations.find((entry) => entry.id === result.operation_authorization_id);
    if (operation && typeof operation.provider_model_id === "string") {
      existingResultByModel.set(operation.provider_model_id, { ...result, operation });
    }
  }

  const visibility: Array<Record<string, unknown>> = [];
  for (const model of EXACT_MODELS) {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    visibility.push({ model, visible: response.ok, status: response.status, request_id: response.headers.get("x-request-id") });
  }

  const operations: Array<Record<string, unknown>> = [];
  const abort = new AbortController();
  for (const model of EXACT_MODELS) {
    const recorded = existingResultByModel.get(model);
    if (recorded) {
      const operation = recorded.operation as Record<string, unknown>;
      const correction = recorded.status === "billed_failure"
        ? await call("correct_owner_hearth_nonbillable_result", {
          p_reservation_id: operation.reservation_id,
          p_event_key: `${operation.operation_id}:definitive-nonbillable-correction`,
        })
        : null;
      operations.push({
        model,
        state: "recorded_replay",
        operation_id: operation.operation_id,
        reservation_id: operation.reservation_id,
        compatibility_status: correction?.effective_status ?? recorded.status,
        original_compatibility_status: recorded.status,
        correction_id: correction?.correction_id ?? null,
        provider_request_id: correction?.provider_request_id ?? recorded.provider_request_id,
        estimated_supplier_expense_micros: correction?.effective_status === "definitive_rejection"
          ? null
          : recorded.estimated_supplier_expense_micros,
        customer_charge_micros: 0,
        customer_revenue_micros: 0,
      });
      continue;
    }
    const visible = visibility.find((entry) => entry.model === model)?.visible === true;
    const priorModelOperations = initialOperations.filter((entry) => entry.provider_model_id === model);
    const workpieceId = priorModelOperations.length === 0
      ? `owner-hearth-compatibility:${model}`
      : `owner-hearth-compatibility:${model}:recovery-${priorModelOperations.length + 1}`;
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "Reply with exactly: Ready." },
    ];
    const requestFingerprint = fingerprintPaidHearthChatRequest({
      schema: "forge.owner-hearth.compatibility.v1",
      owner_user_id: OWNER_ID,
      workspace_id: WORKSPACE_ID,
      workpiece_id: workpieceId,
      route_code: "hearth.chat_completion",
      model,
      messages,
      supporting_paid_services: [],
    });
    const prepared = await prepareOwnerHearthOperation({
      gate,
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
      workpieceId,
      requestedProviderModelId: model,
      requestFingerprint,
      buildRequest: (acceptedModel, maximumOutputTokens, maximumAttempts) => buildBoundedHearthChatProviderRequest({
        messages,
        model: acceptedModel,
        maximumOutputTokens,
        maximumAttempts,
      }),
    });
    if (!visible) {
      await call("release_operation", {
        p_reservation_id: prepared.handle.reservationId,
        p_release_key: `${prepared.handle.operationId}:visibility-rejected`,
        p_reason: "Exact model was not visible to the restricted owner project credential.",
        p_evidence_json: { transmitted: false, model_visibility_only: true },
      });
      await recordOwnerCompatibilityOutcome({
        gate,
        reservationId: prepared.handle.reservationId,
        status: "definitive_rejection",
        providerRequestId: String(visibility.find((entry) => entry.model === model)?.request_id ?? "") || null,
        estimatedSupplierExpenseMicros: 0,
        evidence: { visibility_check_failed: true, provider_submission_count: 0 },
      });
      operations.push({ model, state: "visibility_rejected", operation_id: prepared.handle.operationId, reservation_id: prepared.handle.reservationId });
      continue;
    }
    const outcome = await executePaidHearthChatCompletion({
      gate: ownerHearthExecutionGate(gate),
      handle: prepared.handle,
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
      workpieceId,
      credentialSource: "forge_managed",
      apiKey,
      messages,
      signal: abort.signal,
      validateAndNormalize(rawReply) {
        if (rawReply.trim() !== "Ready.") throw new Error("compatibility response must be exactly Ready.");
        return { assistantText: "Ready.", ops: [], scriptText: null, tagAudit: null };
      },
    });
    const settled = outcome.state === "settled" || outcome.state === "settled_replay";
    const ambiguous = outcome.state === "submission_unknown";
    const supplierEvidence = await readSupplierEvidence(prepared.handle.reservationId);
    const definitiveRelease = !settled && !ambiguous
      ? await call("release_owner_hearth_definitive_nonbillable_rejection", {
        p_reservation_id: prepared.handle.reservationId,
        p_event_key: `${prepared.handle.operationId}:definitive-nonbillable-rejection`,
      })
      : null;
    const definitiveRejection = definitiveRelease?.released === true;
    const billedFailure = !settled && !ambiguous && !definitiveRejection
      && (supplierEvidence.capture !== null || supplierEvidence.expenseRows.length > 0);
    const estimatedSupplierExpenseMicros = supplierEvidence.expenseRows.length > 0
      ? supplierEvidence.estimatedExpenseMicros
      : null;
    const compatibilityStatus = settled
      ? "passed"
      : ambiguous
        ? "ambiguous"
        : definitiveRejection
          ? "definitive_rejection"
          : billedFailure
          ? "billed_failure"
          : "definitive_rejection";
    await recordOwnerCompatibilityOutcome({
      gate,
      reservationId: prepared.handle.reservationId,
      status: compatibilityStatus,
      providerRequestId: settled ? outcome.requestId : String(definitiveRelease?.provider_request_id ?? supplierEvidence.capture?.provider_request_id ?? "") || null,
      estimatedSupplierExpenseMicros: definitiveRejection ? null : estimatedSupplierExpenseMicros,
      evidence: {
        model_visibility_confirmed: true,
        exact_ready_validated: settled,
        canonical_persistence_confirmed: settled,
        operation_settled_estimated: settled,
        provider_cost_reconciled_authoritative: false,
        billed_provider_failure: billedFailure,
        definitive_nonbillable_rejection: definitiveRejection,
        provider_cost_reconciled_authoritative: false,
        supplier_evidence_incomplete: supplierEvidence.hasUnresolvedExpense,
        supplier_expense_components: supplierEvidence.expenseRows.map((row) => row.component_code),
        serialized_body_sha256: prepared.boundedRequest.serializedBodySha256,
        bounded_input_tokens: prepared.boundedRequest.boundedInputTokens,
      },
    });
    operations.push({
      model,
      state: outcome.state,
      operation_id: prepared.handle.operationId,
      reservation_id: prepared.handle.reservationId,
      compatibility_status: compatibilityStatus,
      provider_request_id: settled ? outcome.requestId : String(definitiveRelease?.provider_request_id ?? supplierEvidence.capture?.provider_request_id ?? "") || null,
      input_units: settled ? outcome.inputUnits : null,
      output_units: settled ? outcome.outputUnits : null,
      estimated_supplier_expense_micros: definitiveRejection ? null : estimatedSupplierExpenseMicros,
      customer_charge_micros: 0,
      customer_revenue_micros: 0,
    });
    if (ambiguous) break;
  }

  const allPassed = operations.length === 5 && operations.every((operation) => operation.compatibility_status === "passed");
  let session: Record<string, unknown> | null = null;
  if (allPassed) {
    session = await call("finalize_owner_hearth_compatibility_batch", {
      p_authorization_id: AUTHORIZATION_ID,
      p_operator_user_id: OWNER_ID,
      p_session_authorization_id: SESSION_AUTHORIZATION_ID,
      p_session_budget_id: SESSION_BUDGET_ID,
      p_reason: "All five exact models passed the approved coordinated compatibility batch; create dormant no-renewal owner session.",
    });
  } else if (operations.length === 5 && operations.every((operation) => operation.compatibility_status !== "ambiguous")) {
    session = await call("close_owner_hearth_unsuccessful_compatibility_batch", {
      p_authorization_id: AUTHORIZATION_ID,
      p_operator_user_id: OWNER_ID,
      p_reason: "The five-model compatibility authorization completed without five successful compatible results; close new admission without creating an owner session.",
    });
  }
  const audit = await call("read_owner_hearth_activation_audit", {});
  process.stdout.write(`${JSON.stringify({
    run_id: crypto.createHash("sha256").update(AUTHORIZATION_ID).digest("hex").slice(0, 16),
    visibility,
    operations,
    compatibility_all_passed: allPassed,
    session,
    audit,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
