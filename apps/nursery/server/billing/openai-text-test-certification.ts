import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../packages/tongs/src/db.types";
import {
  estimateOpenAiTextDirectCostMicros,
  executePaidOpenAiTextRoute,
  type OpenAiTextPaidExecutionHandle,
} from "../../../../packages/tongs/src/providers/paid-openai-text-route-execution";
import {
  OpenAiTextProviderError,
  type OpenAiTextGateClient,
} from "../../../../packages/tongs/src/providers/paid-openai-text-execution-coordinator";
import type { OpenAiTextRouteCode } from "../../../../packages/tongs/src/providers/openai-text-paid-boundary";

type JsonObject = Record<string, unknown>;
type CertificationRoute = Exclude<OpenAiTextRouteCode, "hearth.chat_completion">;
type CertificationScenario = "success" | "provider_failure" | "validation_failure" | "persistence_failure";
type RpcResult = { data: unknown; error: { message: string } | null };
type SchemaRpc = { rpc(name: string, args?: JsonObject): Promise<RpcResult> };

const CERTIFICATION_ROUTES = new Set<CertificationRoute>([
  "hearth.research_synthesis",
  "visual.unified_plan",
  "visual.narrative_interpretation",
  "motion.broll_interpretation",
  "hammer.transcript_cleanup",
  "shorts.discovery",
  "quench.metadata",
]);

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function certificationResult(route: CertificationRoute, valid: boolean): JsonObject {
  if (!valid) return { malformed_test_result: true };
  switch (route) {
    case "hearth.research_synthesis":
      return {
        assistant_text: "Controlled Test synthesis grounded only in the supplied certification source.",
        research_result: { sources: [{ id: "test-source-1", supplied: true }] },
      };
    case "visual.unified_plan":
      return {
        images: [{ segment_id: "test-segment-1", prompt: "Neutral Test visual" }],
        broll: [], reference_clips: [], reference_visuals: [],
      };
    case "visual.narrative_interpretation":
      return {
        narrative_purpose: "Explain the supplied Test claim",
        primary_subjects: ["test host"],
        source_context: { focus: "supplied Test fixture" },
      };
    case "motion.broll_interpretation":
      return {
        action_over_time: "The simulated camera tracks slowly from a wide Test frame to a close frame.",
        start_frame: "wide Test frame", end_frame: "close Test frame",
      };
    case "hammer.transcript_cleanup":
      return {
        resultSegments: [{ segment_id: "test-segment-1", text: "This is the cleaned Test sentence." }],
        suggestions: [{ segmentId: "test-segment-1", type: "filler_remove" }],
      };
    case "shorts.discovery":
      return {
        data: { discovery_id: "test-discovery-1", canonical_test: true },
        resolution: { outcome: "candidates", rejected: [] },
      };
    case "quench.metadata":
      return {
        title: "Controlled Test Episode",
        description: "Synthetic metadata produced without a paid provider.",
        tags: ["test", "podcast"],
      };
  }
}

function validateRouteResult(route: CertificationRoute, value: JsonObject): void {
  switch (route) {
    case "hearth.research_synthesis": {
      const research = object(value.research_result);
      if (!string(value.assistant_text) || !Array.isArray(research.sources) || research.sources.length === 0) throw new Error("research_synthesis_invalid");
      return;
    }
    case "visual.unified_plan":
      if (!Array.isArray(value.images) || !Array.isArray(value.broll) || !Array.isArray(value.reference_clips) || !Array.isArray(value.reference_visuals)) throw new Error("unified_plan_invalid");
      return;
    case "visual.narrative_interpretation":
      if (!string(value.narrative_purpose) || !Array.isArray(value.primary_subjects) || !string(object(value.source_context).focus)) throw new Error("narrative_interpretation_invalid");
      return;
    case "motion.broll_interpretation":
      if (!/(track|camera|move|pan)/i.test(string(value.action_over_time)) || !string(value.start_frame) || !string(value.end_frame)) throw new Error("broll_interpretation_invalid");
      return;
    case "hammer.transcript_cleanup":
      if (!Array.isArray(value.resultSegments) || !Array.isArray(value.suggestions) || value.suggestions.length === 0) throw new Error("transcript_cleanup_invalid");
      return;
    case "shorts.discovery":
      if (!string(object(value.data).discovery_id) || !string(object(value.resolution).outcome)) throw new Error("shorts_discovery_invalid");
      return;
    case "quench.metadata":
      if (!string(value.title) || !string(value.description) || !Array.isArray(value.tags) || value.tags.length === 0) throw new Error("metadata_invalid");
  }
}

/**
 * Server-side adapter that maps the production billing coordinator contract to
 * the finite Stripe Test certification ledger. It never grants real-provider
 * authority; callers must still inject a simulated provider at the external
 * boundary.
 */
export class OpenAiTextTestCertificationGate implements OpenAiTextGateClient {
  readonly rpcClient: SchemaRpc;
  constructor(client: SupabaseClient<Database>) {
    this.rpcClient = client.schema("tongs") as unknown as SchemaRpc;
  }

  private call(name: string, args: JsonObject): Promise<RpcResult> {
    return this.rpcClient.rpc(name, args);
  }

  rpc(name: string, args: JsonObject): Promise<RpcResult> {
    switch (name) {
      case "read_openai_text_route_execution_requirement":
        return Promise.resolve({
          data: {
            mode: "enforce",
            funding_context_required: true,
            execution_kind: "simulated_test",
            real_provider_authorized: false,
          },
          error: null,
        });
      case "read_existing_openai_text_funding_handle":
        return this.call("read_existing_openai_text_test_certification_funding_handle", args);
      case "resolve_openai_text_paid_execution_context":
        return this.call("resolve_openai_text_test_certification_context", args);
      case "authorize_openai_text_provider_attempt":
        return this.call("authorize_openai_text_test_certification_attempt", {
          p_reservation_id: args.p_reservation_id,
          p_attempt_key: args.p_attempt_key,
          p_attempt_number: args.p_attempt_number,
          p_failure_exposure_micros: args.p_failure_exposure_micros,
          p_evidence_json: args.p_evidence_json,
        });
      case "record_openai_text_provider_capture":
        return this.call("record_openai_text_test_certification_capture", args);
      case "record_openai_text_supplier_attempt_expense":
        return this.call("record_openai_text_test_certification_expense", {
          p_reservation_id: args.p_reservation_id,
          p_expense_key: `${String(args.p_attempt_key)}:direct-expense`,
          p_component_kind: "direct_provider",
          p_amount_micros: args.p_amount_micros,
          p_evidence_json: args.p_evidence_json,
        });
      case "record_supplier_expense":
        return this.call("record_openai_text_test_certification_expense", {
          p_reservation_id: args.p_reservation_id,
          p_expense_key: args.p_expense_key,
          p_component_kind: "supporting",
          p_amount_micros: args.p_amount_micros,
          p_evidence_json: args.p_evidence_json,
        });
      case "record_openai_text_usage":
        return this.call("record_openai_text_test_certification_evidence", {
          p_reservation_id: args.p_reservation_id,
          p_evidence_key: args.p_evidence_key,
          p_evidence_kind: "usage",
          p_evidence_json: args.p_evidence_json,
        });
      case "close_openai_text_failure_exposure":
        return this.call("record_openai_text_test_certification_evidence", {
          p_reservation_id: args.p_reservation_id,
          p_evidence_key: `${String(args.p_attempt_key)}:loss-closure`,
          p_evidence_kind: "failure_exposure",
          p_evidence_json: { outcome: args.p_outcome, amount_micros: args.p_actual_supplier_cost_micros, ...object(args.p_evidence_json) },
        });
      case "record_provider_failure":
        return this.call("record_openai_text_test_certification_evidence", {
          p_reservation_id: args.p_reservation_id,
          p_evidence_key: args.p_event_key,
          p_evidence_kind: String(args.p_failure_class ?? "forge_failure"),
          p_evidence_json: args.p_evidence_json,
        });
      case "persist_openai_text_paid_result":
        return this.call("persist_openai_text_test_certification_result", args);
      case "read_openai_text_paid_result":
        return this.call("read_openai_text_test_certification_result", args);
      case "settle_operation":
        return this.call("settle_openai_text_test_certification_operation", args);
      case "mark_submission_unknown":
        return this.call("mark_openai_text_test_certification_unknown", {
          p_reservation_id: args.p_reservation_id,
          p_event_key: args.p_event_key,
          p_evidence_json: args.p_evidence_json,
        });
      default:
        return Promise.resolve({ data: null, error: { message: `unsupported Test gate RPC: ${name}` } });
    }
  }
}

export function createOpenAiTextTestCertificationHandler(args: {
  supabaseUrl: string;
  serviceRoleKey: string;
}) {
  const client = createClient<Database>(args.supabaseUrl, args.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const rpc = client.schema("tongs") as unknown as SchemaRpc;
  const gate = new OpenAiTextTestCertificationGate(client);

  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST") return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
    const token = string(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ ok: false, error: "certification_authorization_required" }, { status: 401 });
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > 32_768) {
      return Response.json({ ok: false, error: "request_too_large" }, { status: 413 });
    }
    const body = object(await request.json().catch(() => null));
    const batchId = string(body.batch_id);
    const operationId = string(body.operation_id);
    const reservationId = string(body.reservation_id);
    if (!batchId || !operationId || !reservationId) return Response.json({ ok: false, error: "certification_authorization_required" }, { status: 401 });
    const invocation = await rpc.rpc("read_openai_text_test_certification_invocation", {
      p_batch_id: batchId, p_operation_id: operationId, p_reservation_id: reservationId, p_invocation_token: token,
    });
    if (invocation.error) return Response.json({ ok: false, error: "certification_authorization_denied" }, { status: 403 });
    const context = object(invocation.data);
    const route = string(context.route_code) as CertificationRoute;
    const scenario = string(context.scenario) as CertificationScenario;
    if (!CERTIFICATION_ROUTES.has(route) || !["success", "provider_failure", "validation_failure", "persistence_failure"].includes(scenario) || context.real_provider_authorized !== false) {
      return Response.json({ ok: false, error: "invalid_certification_context" }, { status: 403 });
    }
    const requestPayload = object(context.request_json);
    const handle: OpenAiTextPaidExecutionHandle = {
      operationId,
      reservationId,
      requestFingerprint: string(context.request_fingerprint),
    };
    try {
      const outcome = await executePaidOpenAiTextRoute<JsonObject, JsonObject>({
        gate, routeCode: route, handle,
        userId: string(context.user_id), workspaceId: string(context.workspace_id), workpieceId: string(context.workpiece_id),
        credentialSource: "forge_managed",
        inputUnitUpperBound: new TextEncoder().encode(JSON.stringify(requestPayload)).byteLength,
        requestFingerprintPayload: requestPayload,
        executeProvider: async (accepted) => {
          const syntheticDirectCost = estimateOpenAiTextDirectCostMicros(accepted, 100, 50);
          if (scenario === "provider_failure") {
            throw new OpenAiTextProviderError("Injected simulated provider failure", false, syntheticDirectCost, {
              provider_reference: `simulated-test:${operationId}`,
              evidence_status: "synthetic_test", real_provider_called: false,
            });
          }
          return {
            value: certificationResult(route, scenario !== "validation_failure"),
            requestId: `simulated-test:${operationId}`,
            inputUnits: 100, outputUnits: 50,
            supplierCostMicros: syntheticDirectCost,
            supplierCostAuthoritative: false,
            supportingCostMicros: accepted.supportingCostCeilingMicros,
            supportingCostAuthoritative: false,
            supportingCostEvidence: { evidence_status: "synthetic_test", scope: "validation_and_tongs_persistence_only" },
            costCoverageComplete: true,
            evidence: { evidence_status: "synthetic_test", real_provider_called: false, route_code: route },
          };
        },
        validateResult: (value) => validateRouteResult(route, value),
        persistCanonical: async (value) => {
          if (scenario === "persistence_failure") {
            throw new Error("injected_test_persistence_failure");
          }
          return {
            certification_contract: "forge.openai-text-test-certification.v1",
            test_workpiece_id: string(context.workpiece_id), route_code: route,
            synthetic: true, result: value,
          };
        },
      });
      return Response.json({ ok: true, route_code: route, scenario, outcome, real_provider_called: false });
    } catch (error) {
      return Response.json({ ok: false, route_code: route, scenario, error: error instanceof Error ? error.message : String(error), real_provider_called: false }, { status: 502 });
    }
  };
}
