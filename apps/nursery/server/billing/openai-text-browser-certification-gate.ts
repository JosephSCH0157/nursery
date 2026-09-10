import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../packages/tongs/src/db.types";
import type { OpenAiTextGateClient } from "../../../../packages/tongs/src/providers/paid-openai-text-execution-coordinator";
import { OpenAiTextTestCertificationGate } from "./openai-text-test-certification";

type JsonObject = Record<string, unknown>;
type RpcResult = { data: unknown; error: { message: string } | null };
type QueryResult = {
  data: JsonObject[] | null;
  error: { message: string } | null;
  count?: number | null;
};
type SingleQueryResult = {
  data: JsonObject | null;
  error: { message: string } | null;
};
type QueryBuilder = PromiseLike<QueryResult> & {
  select(columns: string, options?: { count?: "exact"; head?: boolean }): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  maybeSingle(): Promise<SingleQueryResult>;
};
type CertificationSchemaClient = {
  rpc(name: string, args?: JsonObject): Promise<RpcResult>;
  from(table: string): QueryBuilder;
};

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Isolated-browser adapter for the ordinary quote/accept/reserve contract.
 *
 * The application endpoints, route adapters, validators, canonical persistence,
 * and settlement are the production implementations. Only the OpenAI boundary
 * is synthetic. The constructor refuses non-local Supabase targets and the
 * resulting funding context always carries real_provider_authorized=false.
 */
export class OpenAiTextBrowserCertificationGate implements OpenAiTextGateClient {
  readonly client: SupabaseClient<Database>;
  readonly rpcClient: CertificationSchemaClient;
  readonly executionGate: OpenAiTextTestCertificationGate;
  readonly batchId: string;
  readonly operatorId: string;
  readonly pricingRevisionIds: Record<string, string>;

  constructor(args: {
    supabaseUrl: string;
    serviceRoleKey: string;
    batchId: string;
    operatorId: string;
    pricingRevisionIds: Record<string, string>;
  }) {
    if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/i.test(args.supabaseUrl)) {
      throw new Error("Browser certification requires an isolated local Supabase target");
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error("Browser certification cannot run in a production process");
    }
    this.client = createClient<Database>(args.supabaseUrl, args.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.rpcClient = this.client.schema("tongs") as unknown as CertificationSchemaClient;
    this.executionGate = new OpenAiTextTestCertificationGate(this.client);
    this.batchId = args.batchId;
    this.operatorId = args.operatorId;
    this.pricingRevisionIds = args.pricingRevisionIds;
  }

  private call(name: string, args: JsonObject): Promise<RpcResult> {
    return this.rpcClient.rpc(name, args);
  }

  private async activeBatchTerm(routeCode: string): Promise<JsonObject> {
    const batch = await this.rpcClient.from("openai_text_test_certification_batches")
      .select("id,user_id,workspace_id,deposit_id,expires_at")
      .eq("id", this.batchId)
      .maybeSingle();
    if (batch.error || !batch.data || new Date(String(batch.data.expires_at)).getTime() <= Date.now()) {
      throw new Error("Test certification authorization is missing or expired");
    }
    const state = await this.call("_openai_text_test_certification_batch_state", { p_batch_id: this.batchId });
    if (state.error || state.data !== "opened") throw new Error("Test certification authorization is closed");
    const term = await this.rpcClient.from("openai_text_test_certification_terms")
      .select("*")
      .eq("batch_id", this.batchId)
      .eq("route_code", routeCode)
      .maybeSingle();
    if (term.error || !term.data) throw new Error("Test route term is unavailable");
    return { ...object(batch.data), ...object(term.data) };
  }

  private async createCustomerQuote(args: JsonObject): Promise<RpcResult> {
    try {
      const routeCode = text(args.p_route_code);
      const term = await this.activeBatchTerm(routeCode);
      if (text(args.p_user_id) !== text(term.user_id) || text(args.p_workspace_id) !== text(term.workspace_id)) {
        return { data: null, error: { message: "Test quote identity does not match the bounded authorization" } };
      }
      if (text(args.p_model) !== text(term.model)) {
        return { data: null, error: { message: "Selected Test model does not match the exact route term" } };
      }
      const pricingRevisionId = this.pricingRevisionIds[routeCode];
      if (!pricingRevisionId) return { data: null, error: { message: "pricing_not_configured: missing synthetic Test revision" } };
      const existing = await this.rpcClient.from("customer_spending_quotes")
        .select("id,user_id,workspace_id,operation_id,request_fingerprint,pricing_revision_id")
        .eq("id", args.p_quote_id)
        .maybeSingle();
      if (existing.error) return { data: null, error: { message: existing.error.message } };
      if (existing.data) {
        if (String(existing.data.user_id) !== text(args.p_user_id)
          || String(existing.data.workspace_id) !== text(args.p_workspace_id)
          || String(existing.data.operation_id) !== text(args.p_operation_id)
          || String(existing.data.request_fingerprint) !== text(args.p_request_fingerprint)
          || String(existing.data.pricing_revision_id) !== pricingRevisionId) {
          return { data: null, error: { message: "Existing Test quote does not match this exact request" } };
        }
      } else {
        const created = await this.call("create_shadow_spending_quote", {
          p_quote_id: args.p_quote_id,
          p_user_id: args.p_user_id,
          p_operation_id: args.p_operation_id,
          p_tool: routeCode,
          p_workspace_id: args.p_workspace_id,
          p_pricing_revision_id: pricingRevisionId,
          p_request_fingerprint: args.p_request_fingerprint,
          p_provider_funding_summary: [{
            component: "openai_text",
            provider_label: "Simulated OpenAI Test boundary",
            credential_source: "forge",
            execution_kind: "simulated_test",
            real_provider_authorized: false,
          }],
          p_expires_at: args.p_expires_at,
        });
        if (created.error) return created;
      }
      const quote = await this.rpcClient.from("customer_spending_quotes")
        .select("quote_hash,expires_at,normal_maximum_charge_micros,request_fingerprint")
        .eq("id", args.p_quote_id)
        .maybeSingle();
      if (quote.error || !quote.data) return { data: null, error: { message: quote.error?.message ?? "Test quote was not persisted" } };
      const accepted = await this.rpcClient.from("customer_spending_quote_acceptances")
        .select("id")
        .eq("quote_id", args.p_quote_id)
        .maybeSingle();
      return {
        data: {
          quote_id: args.p_quote_id,
          operation_id: args.p_operation_id,
          quote_hash: quote.data.quote_hash,
          request_fingerprint: quote.data.request_fingerprint,
          currency: "USD",
          maximum_customer_charge_micros: Number(term.customer_price_ceiling_micros),
          failure_customer_charge_micros: 0,
          failure_terms: "Forge, provider, validation, and persistence failures cost you $0. Simulated Test funds are restored.",
          funding_eligible: true,
          funding_source: "customer_deposit",
          funding_label: "Stripe Test AI credits · simulated provider only",
          expires_at: quote.data.expires_at,
          accepted: Boolean(accepted.data),
          execution_kind: "simulated_test",
          real_provider_authorized: false,
        },
        error: null,
      };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : String(error) } };
    }
  }

  private async reserveCustomerQuote(args: JsonObject): Promise<RpcResult> {
    try {
      const routeCode = text(args.p_route_code);
      const term = await this.activeBatchTerm(routeCode);
      const quote = await this.rpcClient.from("customer_spending_quotes")
        .select("id,user_id,workspace_id,operation_id,request_fingerprint,pricing_revision_id,expires_at")
        .eq("id", args.p_quote_id)
        .maybeSingle();
      if (quote.error || !quote.data) throw new Error("Accepted Test quote was not found");
      const acceptance = await this.rpcClient.from("customer_spending_quote_acceptances")
        .select("id,accepted_quote_hash")
        .eq("quote_id", args.p_quote_id)
        .maybeSingle();
      if (acceptance.error || !acceptance.data) throw new Error("Explicit customer Test acceptance is required");
      if (String(quote.data.user_id) !== text(args.p_user_id)
        || String(quote.data.workspace_id) !== text(args.p_workspace_id)
        || String(quote.data.operation_id) !== text(args.p_operation_id)
        || String(quote.data.request_fingerprint) !== text(args.p_request_fingerprint)
        || String(quote.data.pricing_revision_id) !== this.pricingRevisionIds[routeCode]
        || text(args.p_model) !== text(term.model)) {
        throw new Error("Accepted Test quote no longer matches the creator request");
      }
      const existing = await this.rpcClient.from("openai_text_test_certification_operations")
        .select("id")
        .eq("operation_id", args.p_operation_id)
        .maybeSingle();
      const operationRecordId = existing.data?.id ? String(existing.data.id) : text(args.p_quote_id);
      if (!existing.data) {
        const prior = await this.rpcClient.from("openai_text_test_certification_operations")
          .select("id", { count: "exact", head: true })
          .eq("batch_id", this.batchId)
          .eq("route_code", routeCode);
        if (prior.error) throw new Error(prior.error.message);
        const scenario = Number(prior.count ?? 0) === 0 ? "success" : "validation_failure";
        const prepared = await this.call("prepare_openai_text_test_certification_operation", {
          p_operation_record_id: operationRecordId,
          p_batch_id: this.batchId,
          p_route_code: routeCode,
          p_scenario: scenario,
          p_operation_id: args.p_operation_id,
          p_workpiece_id: args.p_workpiece_id,
          p_request_fingerprint: args.p_request_fingerprint,
          p_request_json: {
            contract: "forge.openai-text-browser-certification.v1",
            quote_id: args.p_quote_id,
            model: args.p_model,
            request_fingerprint: args.p_request_fingerprint,
            customer_acceptance_id: acceptance.data.id,
          },
          p_actor_id: this.operatorId,
        });
        if (prepared.error) return prepared;
      }
      const reserved = await this.call("reserve_openai_text_test_certification_operation", {
        p_reservation_id: args.p_reservation_id,
        p_operation_record_id: operationRecordId,
        p_idempotency_key: args.p_idempotency_key,
      });
      if (reserved.error) return reserved;
      return {
        data: {
          paid_execution: {
            operation_id: args.p_operation_id,
            reservation_id: args.p_reservation_id,
            request_fingerprint: args.p_request_fingerprint,
          },
          reservation_state: object(reserved.data).state,
          funding_source: "test_customer_deposit",
          execution_kind: "simulated_test",
          real_provider_authorized: false,
          replay: object(reserved.data).replay === true,
        },
        error: null,
      };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : String(error) } };
    }
  }

  rpc(name: string, args: JsonObject): Promise<RpcResult> {
    switch (name) {
      case "resolve_openai_text_model_for_funding_quote":
        return this.call("resolve_openai_text_model_for_quote", {
          p_user_id: args.p_user_id,
          p_route_code: args.p_route_code,
          p_credential_funding: args.p_credential_funding,
        });
      case "create_customer_openai_text_quote":
        return this.createCustomerQuote(args);
      case "reserve_customer_openai_text_quote":
        return this.reserveCustomerQuote(args);
      default:
        return this.executionGate.rpc(name, args);
    }
  }
}
