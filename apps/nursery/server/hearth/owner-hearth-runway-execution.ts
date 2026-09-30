import {
  ForgeOwnerAuthorizationError,
  deriveForgeOwnerAttemptIdentity,
  deriveForgeOwnerOperationIdentity,
  forgeOwnerCredentialIdentityHash,
  forgeOwnerDeterministicUuid,
  requireForgeOwnerExecutionAuthority,
  type OwnerAttemptSnapshot,
  type OwnerAuthorityReader,
  type OwnerCostRpcGate,
  type OwnerFinancialEnvironment,
} from "../accounting/forge-owner-execution-coordinator";
import { readOwnerRuntimeEnvironment } from "../accounting/owner-runtime-environment";
import type {
  OwnerRunwayExecutionBoundary,
  OwnerRunwayExecutionContext,
  OwnerRunwayExecutionInput,
} from "../../../../packages/tongs/src/workpiece-commit-api";

type Json = Record<string, unknown>;

export const HEARTH_OWNER_RUNWAY_RATE = Object.freeze({
  amountMicros: 600_000,
  revisionId: "19730000-0000-4000-8000-000000000001",
  source: "https://docs.dev.runwayml.com/guides/pricing/",
  pricingEvidenceSha256: "275da36ecddfa209869409c42a83255ebfad560675a0d76f6f9d05076fe0db86",
});

function object(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function rpc(gate: OwnerCostRpcGate, name: string, args?: Json): Promise<unknown> {
  const result = await gate.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message ?? "unknown error"}`);
  return result.data;
}

async function financialEnvironment(gate: OwnerCostRpcGate): Promise<OwnerFinancialEnvironment> {
  const data = object(await rpc(gate, "read_financial_runtime_environment"));
  const value = data?.financial_environment;
  if (value !== "test" && value !== "live") throw new Error("Owner financial environment is unavailable");
  return value;
}

function timestamp(createdAt: string, sequence: number): string {
  const epoch = new Date(createdAt).getTime();
  if (!Number.isFinite(epoch)) throw new Error("Invalid owner Runway operation creation time");
  return new Date(epoch + 100 + sequence).toISOString();
}

function attemptFromSnapshot(data: unknown, attemptId: string): OwnerAttemptSnapshot | null {
  const row = object(data);
  const attempts = Array.isArray(row?.attempts) ? row.attempts : [];
  return (attempts.map(object).find((attempt) => text(attempt?.attempt_id) === attemptId)
    ?? null) as OwnerAttemptSnapshot | null;
}

function latestState(attempt: OwnerAttemptSnapshot | null): string | null {
  return text(attempt?.events?.at(-1)?.lifecycle_state)?.toLowerCase() ?? null;
}

function capturedTaskId(attempt: OwnerAttemptSnapshot | null): string | null {
  const response = attempt?.events?.find((event) => event.lifecycle_state === "response_captured");
  return text(response?.provider_reference_id)
    ?? text(object(response?.private_provider_evidence)?.provider_task_id);
}

export function createOwnerHearthRunwayExecutionBoundary(args: {
  gate: OwnerCostRpcGate;
  authorityReader: OwnerAuthorityReader;
  credential?: string;
}): OwnerRunwayExecutionBoundary {
  const append = async (context: OwnerRunwayExecutionContext, sequence: number, state: string,
    providerReferenceId: string | null, normalizedUsage: Json, privateEvidence: Json) => rpc(args.gate, "append_owner_cost_attempt_event", {
      p_attempt_event_id: sequence === 3 ? context.responseEventId : context.terminalEventId,
      p_attempt_id: context.attemptId,
      p_event_sequence: sequence,
      p_lifecycle_state: state,
      p_provider_reference_id: providerReferenceId,
      p_normalized_usage_evidence: normalizedUsage,
      p_private_provider_evidence: privateEvidence,
      p_occurred_at: timestamp(context.createdAt, sequence),
    });

  const recordEvidenceOnly = async (context: OwnerRunwayExecutionContext, reason: string) => rpc(args.gate, "record_owner_cost_valuation", {
    p_valuation_id: forgeOwnerDeterministicUuid(`owner-cost-valuation:${context.attemptId}:runway_video:1`),
    p_valuation_key: `owner-cost:${context.attemptId}:runway_video:1`,
    p_attempt_id: context.attemptId,
    p_cost_component: "runway_video",
    p_prior_valuation_id: null,
    p_valuation_basis: "estimated",
    p_amount_micros: 0,
    p_currency: "USD",
    p_recognition_mode: "evidence_only",
    p_reconciliation_reference: null,
    p_normalized_usage_evidence: {},
    p_private_valuation_evidence: {
      monetary_amount_unresolved: true,
      zero_is_not_asserted_provider_cost: true,
      unresolved_reason: reason,
      customer_finance_involved: false,
    },
    p_valued_at: timestamp(context.createdAt, 3),
  });

  return {
    async prepare(input: OwnerRunwayExecutionInput) {
      try {
        await requireForgeOwnerExecutionAuthority({
          reader: args.authorityReader,
          authenticatedUserId: input.authenticatedUserId,
          workspaceId: input.workspaceId,
          routeCode: "hearth.runway_broll_generation",
        });
      } catch (error) {
        if (error instanceof ForgeOwnerAuthorizationError) return null;
        throw error;
      }
      const credential = args.credential?.trim();
      if (!credential) throw new Error("The isolated Hearth owner Runway credential is unavailable");
      if (input.model !== "gen4.5" || input.durationSeconds !== 5 || input.ratio !== "1280:720"
        || input.referenceImageCount !== 0) {
        throw new Error("Owner Runway execution is restricted to one reference-free Gen-4.5 5-second 1280x720 generation");
      }
      const financial = await financialEnvironment(args.gate);
      const runtime = readOwnerRuntimeEnvironment();
      const lifecycle = object(await rpc(args.gate, "read_credential_lifecycle_execution_gate", {
        p_configuration_variable_name: "HEARTH_OWNER_RUNWAY_API_KEY",
        p_financial_environment: financial,
        p_runtime_environment: runtime,
      }));
      if (lifecycle?.tracked === true && lifecycle.allowed !== true) {
        throw new Error(`The isolated Hearth owner Runway credential is ${text(lifecycle.status) ?? "not active"}; the route remains fail-closed`);
      }
      const operation = deriveForgeOwnerOperationIdentity({
        financialEnvironment: financial,
        runtimeEnvironment: runtime,
        originatingTool: "hearth",
        operationType: "hearth.runway_broll_generation",
        stableOperationInput: {
          workspace_id: input.workspaceId,
          workpiece_id: input.workpieceId,
          beat_id: input.beatId,
          product_operation_id: input.productOperationId,
          prompt_revision_id: input.promptRevisionId,
          prompt_revision: input.promptRevision,
          prompt_content_hash: input.promptContentHash,
          model: input.model,
          duration_seconds: input.durationSeconds,
          ratio: input.ratio,
        },
        exactRequestInput: input.exactProviderRequest,
      });
      const credentialIdentityHash = forgeOwnerCredentialIdentityHash(credential);
      const attempt = deriveForgeOwnerAttemptIdentity({
        operation,
        attemptNumber: 1,
        provider: "runway",
        service: "video_generation",
        model: input.model,
        sku: "gen4.5:5s:1280:720",
        credentialIdentityHash,
        exactProviderRequest: input.exactProviderRequest,
      });
      const prior = object(await rpc(args.gate, "read_owner_cost_operation", {
        p_operation_id: operation.operationId,
      }));
      const createdAt = text(object(prior?.operation)?.created_at) ?? new Date().toISOString();
      await rpc(args.gate, "establish_owner_cost_operation", {
        p_operation_id: operation.operationId,
        p_operation_key: operation.operationKey,
        p_request_fingerprint: operation.requestFingerprint,
        p_financial_environment: operation.financialEnvironment,
        p_runtime_environment: runtime,
        p_originating_tool: "hearth",
        p_operation_type: "hearth.runway_broll_generation",
        p_workspace_id: input.workspaceId,
        p_workpiece_id: input.workpieceId,
        p_recording_session_id: null,
        p_recording_capture_authority_id: null,
        p_anvil_capture_execution_id: null,
        p_owner_operating_budget_id: null,
        p_creation_evidence: {
          schema: "forge.hearth.owner-runway-operation.v1",
          beat_id: input.beatId,
          product_operation_id: input.productOperationId,
          customer_finance_involved: false,
        },
        p_created_at: createdAt,
      });
      await rpc(args.gate, "authorize_owner_cost_provider_attempt", {
        p_attempt_id: attempt.attemptId,
        p_operation_id: operation.operationId,
        p_attempt_number: 1,
        p_attempt_key: attempt.attemptKey,
        p_request_fingerprint: attempt.requestFingerprint,
        p_provider: "runway",
        p_service: "video_generation",
        p_model: input.model,
        p_sku: "gen4.5:5s:1280:720",
        p_credential_identity_hash: credentialIdentityHash,
        p_private_authorization_evidence: {
          schema: "forge.hearth.owner-runway-authorization.v1",
          credential_source: "forge_managed_isolated_owner",
          customer_finance_involved: false,
        },
        p_authorized_at: timestamp(createdAt, 0),
      });
      const submitted = object(await rpc(args.gate, "append_owner_cost_attempt_event", {
        p_attempt_event_id: attempt.submittedEventId,
        p_attempt_id: attempt.attemptId,
        p_event_sequence: 2,
        p_lifecycle_state: "submitted",
        p_provider_reference_id: null,
        p_normalized_usage_evidence: {},
        p_private_provider_evidence: {
          schema: "forge.hearth.owner-runway-submission.v1",
          model: input.model,
          duration_seconds: input.durationSeconds,
          ratio: input.ratio,
          reference_image_count: input.referenceImageCount,
        },
        p_occurred_at: timestamp(createdAt, 2),
      }));
      const context: OwnerRunwayExecutionContext = {
        ownerOperationId: operation.operationId,
        ownerRequestFingerprint: operation.requestFingerprint,
        attemptId: attempt.attemptId,
        responseEventId: attempt.responseEventId,
        terminalEventId: attempt.terminalEventId,
        createdAt,
      };
      if (submitted?.provider_submission_created === true) {
        return { context, disposition: "submit" as const, providerTaskId: null };
      }
      const snapshot = await rpc(args.gate, "read_owner_cost_operation", { p_operation_id: operation.operationId });
      const existing = attemptFromSnapshot(snapshot, attempt.attemptId);
      const state = latestState(existing);
      const taskId = capturedTaskId(existing);
      if ((state === "response_captured" || state === "succeeded" || state === "failed") && taskId) {
        return { context, disposition: "recover_task" as const, providerTaskId: taskId };
      }
      if (state === "submission_unknown") return { context, disposition: "submission_unknown" as const, providerTaskId: null };
      if (state === "definitively_rejected") return { context, disposition: "definitively_rejected" as const, providerTaskId: null };
      return { context, disposition: "submission_in_progress" as const, providerTaskId: null };
    },

    async recordAccepted(context, taskId, acceptedResponse) {
      await append(context, 3, "response_captured", taskId,
        { model: "gen4.5", duration_seconds: 5, ratio: "1280:720", runway_credits: 60 },
        { schema: "forge.hearth.owner-runway-task.v1", provider_task_id: taskId, accepted_response: acceptedResponse });
      await rpc(args.gate, "record_owner_cost_valuation", {
        p_valuation_id: forgeOwnerDeterministicUuid(`owner-cost-valuation:${context.attemptId}:runway_video:1`),
        p_valuation_key: `owner-cost:${context.attemptId}:runway_video:1`,
        p_attempt_id: context.attemptId,
        p_cost_component: "runway_video",
        p_prior_valuation_id: null,
        p_valuation_basis: "usage_calculated",
        p_amount_micros: HEARTH_OWNER_RUNWAY_RATE.amountMicros,
        p_currency: "USD",
        p_recognition_mode: "journal_recognized",
        p_reconciliation_reference: null,
        p_normalized_usage_evidence: { duration_seconds: 5, credits_per_second: 12, runway_credits: 60 },
        p_private_valuation_evidence: {
          provider_rate_revision_id: HEARTH_OWNER_RUNWAY_RATE.revisionId,
          rate_source: HEARTH_OWNER_RUNWAY_RATE.source,
          pricing_evidence_sha256: HEARTH_OWNER_RUNWAY_RATE.pricingEvidenceSha256,
          usd_per_credit: "0.01",
          customer_markup_applied: false,
          customer_finance_involved: false,
        },
        p_valued_at: timestamp(context.createdAt, 3),
      });
    },

    async recordSubmissionUnknown(context, evidence) {
      await append(context, 3, "submission_unknown", null, {}, {
        schema: "forge.hearth.owner-runway-submission-unknown.v1", ...evidence,
      });
      await recordEvidenceOnly(context, "runway_submission_unknown");
    },

    async recordDefinitiveRejection(context, evidence) {
      await append(context, 3, "definitively_rejected", null, {}, {
        schema: "forge.hearth.owner-runway-definitive-rejection.v1", ...evidence,
      });
      await recordEvidenceOnly(context, "runway_definitively_rejected_without_authoritative_cost");
    },

    async recordProviderFailure(context, taskId, evidence) {
      await append(context, 4, "failed", taskId,
        { model: "gen4.5", duration_seconds: 5, ratio: "1280:720", runway_credits: 60 },
        { schema: "forge.hearth.owner-runway-terminal.v1", provider_state: "failed", ...evidence });
    },

    async recordCanonicalSuccess(context, taskId, evidence) {
      await append(context, 4, "succeeded", taskId,
        { model: "gen4.5", duration_seconds: 5, ratio: "1280:720", runway_credits: 60 },
        { schema: "forge.hearth.owner-runway-terminal.v1", provider_state: "succeeded", canonical_persistence: true, ...evidence });
    },
  };
}
