import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../packages/tongs/src/db.types";

// Service-only infrastructure. Callers must pass the user id verified from the
// bearer token; payer/lane fields from a browser request are intentionally not
// represented anywhere in this API.

export type OwnerFinancialEnvironment = "test" | "live";
export type OwnerRuntimeEnvironment = "production" | "preview" | "development";
export type OwnerValuationBasis = "estimated" | "usage_calculated" | "provider_reported" | "invoice_reconciled";
export type OwnerRecognitionMode = "evidence_only" | "journal_recognized";

export type OwnerCostRpcGate = {
  rpc(name: string, args?: Record<string, unknown>): Promise<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
};

export type OwnerAuthorityReader = {
  readEnabledPrincipal(userId: string): Promise<{ revision: number } | null>;
  readWorkspaceMembership(userId: string, workspaceId: string): Promise<{ role: string } | null>;
};

export type OwnerRouteAuthorization =
  | { required: false }
  | {
      required: true;
      authorize(context: {
        authenticatedUserId: string;
        workspaceId: string;
        routeCode: string;
        principalRevision: number;
        membershipRole: string;
      }): Promise<{
        authorized: boolean;
        ownerOperatingBudgetId?: string | null;
        evidence?: Record<string, unknown>;
      }>;
    };

export type AuthorizedOwnerExecution = {
  authenticatedUserId: string;
  workspaceId: string;
  routeCode: string;
  principalRevision: number;
  membershipRole: string;
  ownerOperatingBudgetId: string | null;
  routeAuthorizationEvidence: Record<string, unknown>;
};

export type ForgeOwnerOperationIdentity = {
  operationId: string;
  operationKey: string;
  requestFingerprint: string;
  financialEnvironment: OwnerFinancialEnvironment;
  originatingTool: string;
  operationType: string;
};

export type ForgeOwnerAttemptIdentity = {
  attemptId: string;
  attemptKey: string;
  requestFingerprint: string;
  submittedEventId: string;
  responseEventId: string;
  terminalEventId: string;
};

export type ForgeOwnerOperationAttribution = {
  workspaceId: string;
  workpieceId?: string | null;
  recordingSessionId?: string | null;
  recordingCaptureAuthorityId?: string | null;
  anvilCaptureExecutionId?: string | null;
};

export type ForgeOwnerDirectValuation = {
  costComponent: string;
  basis: OwnerValuationBasis;
  amountMicros: number;
  currency: string;
  recognitionMode: OwnerRecognitionMode;
  normalizedUsage?: Record<string, unknown>;
  privateEvidence?: Record<string, unknown>;
  rateRevisionId?: string | null;
  providerMonetaryEvidenceReference?: string | null;
  reconciliationReference?: string | null;
  unresolvedReason?: string | null;
};

export type ForgeOwnerProviderCapture<TCapture> = {
  capture: TCapture;
  providerReferenceId: string | null;
  normalizedUsage: Record<string, unknown>;
  privateProviderEvidence: Record<string, unknown>;
  valuations: ForgeOwnerDirectValuation[];
};

export type OwnerAttemptSnapshot = Record<string, unknown> & {
  events?: Array<Record<string, unknown>>;
  valuations?: Array<Record<string, unknown>>;
};

type OwnerOperationSnapshot = {
  operation?: Record<string, unknown>;
  attempts?: OwnerAttemptSnapshot[];
};

export type ForgeOwnerExecutionInput<TCapture, TResult> = {
  authenticatedUserId: string;
  routeCode: string;
  routeAuthorization?: OwnerRouteAuthorization;
  operation: {
    identity: ForgeOwnerOperationIdentity;
    runtimeEnvironment: OwnerRuntimeEnvironment;
    originatingTool: string;
    operationType: string;
    attribution: ForgeOwnerOperationAttribution;
    creationEvidence?: Record<string, unknown>;
  };
  attempt: {
    attemptNumber: number;
    provider: string;
    service: string;
    model?: string | null;
    sku?: string | null;
    credentialIdentityHash: string;
    exactProviderRequest: unknown;
    defaultCostComponent: string;
    authorizationEvidence?: Record<string, unknown>;
    submissionEvidence?: Record<string, unknown>;
  };
  readPersistedResult(context: {
    operationId: string;
    requestFingerprint: string;
    attemptNumber: number;
  }): Promise<{ found: true; value: TResult } | { found: false }>;
  submitProvider(context: {
    operationId: string;
    attemptId: string;
    attemptKey: string;
    attemptNumber: number;
  }): Promise<ForgeOwnerProviderCapture<TCapture>>;
  parseResult(capture: TCapture): Promise<TResult> | TResult;
  validateResult(value: TResult): Promise<void> | void;
  persistResult(value: TResult, context: {
    operationId: string;
    requestFingerprint: string;
    attemptId: string;
    attemptNumber: number;
  }): Promise<void>;
  recoverCapturedResult?: (attempt: OwnerAttemptSnapshot) => Promise<{
    value: TResult;
    valuations?: ForgeOwnerDirectValuation[];
  } | null>;
};

export type ForgeOwnerExecutionResult<TResult> =
  | { state: "succeeded"; value: TResult; operationId: string; attemptId: string; replay: boolean; recovered: boolean }
  | { state: "definitively_rejected"; operationId: string; attemptId: string; replay: boolean }
  | { state: "submission_unknown"; operationId: string; attemptId: string; replay: boolean };

export class ForgeOwnerAuthorizationError extends Error {
  readonly code = "owner_execution_not_authorized";
}

export class ForgeOwnerExecutionFailure extends Error {
  readonly phase: "replay" | "capture" | "valuation" | "parse" | "validation" | "persistence";
  readonly operationId: string;
  readonly attemptId: string;

  constructor(
    message: string,
    phase: "replay" | "capture" | "valuation" | "parse" | "validation" | "persistence",
    operationId: string,
    attemptId: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ForgeOwnerExecutionFailure";
    this.phase = phase;
    this.operationId = operationId;
    this.attemptId = attemptId;
  }
}

export class ForgeOwnerProviderBoundaryError extends Error {
  constructor(args: {
    message: string;
    outcome: "definitively_rejected" | "submission_unknown";
    providerReferenceId?: string | null;
    normalizedUsage?: Record<string, unknown>;
    privateProviderEvidence?: Record<string, unknown>;
    valuations?: ForgeOwnerDirectValuation[];
    cause?: unknown;
  }) {
    super(args.message, { cause: args.cause });
    this.name = "ForgeOwnerProviderBoundaryError";
    this.outcome = args.outcome;
    this.providerReferenceId = args.providerReferenceId ?? null;
    this.normalizedUsage = args.normalizedUsage ?? {};
    this.privateProviderEvidence = args.privateProviderEvidence ?? {};
    this.valuations = args.valuations ?? [];
  }

  readonly outcome: "definitively_rejected" | "submission_unknown";
  readonly providerReferenceId: string | null;
  readonly normalizedUsage: Record<string, unknown>;
  readonly privateProviderEvidence: Record<string, unknown>;
  readonly valuations: ForgeOwnerDirectValuation[];
}

type OwnerAuthorityQueryResult = {
  data: unknown;
  error: { message?: string; code?: string } | null;
};

type OwnerAuthorityFilter = {
  eq(column: string, value: string): OwnerAuthorityFilter;
  maybeSingle(): Promise<OwnerAuthorityQueryResult>;
};

type OwnerAuthoritySchemaClient = {
  from(table: string): { select(columns: string): OwnerAuthorityFilter };
};

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function forgeOwnerSha256(value: string | Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function forgeOwnerDeterministicUuid(value: string): string {
  const bytes = Buffer.from(forgeOwnerSha256(value).slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizedCode(value: string, label: string, minimum = 2, maximum = 100): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.length < minimum || normalized.length > maximum || !/^[a-z0-9][a-z0-9._:/-]*$/.test(normalized)) {
    throw new Error(`Invalid ${label}`);
  }
  return normalized;
}

function requireSha256(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error(`Invalid ${label}`);
  return normalized;
}

export function deriveForgeOwnerOperationIdentity(args: {
  financialEnvironment: OwnerFinancialEnvironment;
  originatingTool: string;
  operationType: string;
  stableOperationInput: unknown;
  exactRequestInput: unknown;
}): ForgeOwnerOperationIdentity {
  const originatingTool = normalizedCode(args.originatingTool, "originating tool", 2, 80);
  const operationType = normalizedCode(args.operationType, "operation type");
  const stable = {
    financial_environment: args.financialEnvironment,
    originating_tool: originatingTool,
    operation_type: operationType,
    stable_operation_input: args.stableOperationInput,
  };
  const digest = forgeOwnerSha256(canonicalJson(stable));
  const operationKey = `${originatingTool}:${operationType}:${args.financialEnvironment}:${digest}`;
  return {
    financialEnvironment: args.financialEnvironment,
    originatingTool,
    operationType,
    operationKey,
    operationId: forgeOwnerDeterministicUuid(`owner-cost-operation:${operationKey}`),
    requestFingerprint: forgeOwnerSha256(canonicalJson({ ...stable, exact_request_input: args.exactRequestInput })),
  };
}

export function deriveForgeOwnerAttemptIdentity(args: {
  operation: ForgeOwnerOperationIdentity;
  attemptNumber: number;
  provider: string;
  service: string;
  model?: string | null;
  sku?: string | null;
  credentialIdentityHash: string;
  exactProviderRequest: unknown;
}): ForgeOwnerAttemptIdentity {
  if (!Number.isSafeInteger(args.attemptNumber) || args.attemptNumber <= 0) throw new Error("Invalid owner attempt number");
  const provider = normalizedCode(args.provider, "provider", 2, 80);
  const service = normalizedCode(args.service, "service");
  const credentialIdentityHash = requireSha256(args.credentialIdentityHash, "credential identity hash");
  const attemptId = forgeOwnerDeterministicUuid(
    `owner-cost-attempt:${args.operation.operationId}:${args.attemptNumber}`,
  );
  return {
    attemptId,
    attemptKey: `${provider}:${service}:${args.operation.operationId}:${args.attemptNumber}`,
    requestFingerprint: forgeOwnerSha256(canonicalJson({
      operation_request_fingerprint: args.operation.requestFingerprint,
      attempt_number: args.attemptNumber,
      provider,
      service,
      model: args.model?.trim() || null,
      sku: args.sku?.trim() || null,
      credential_identity_hash: credentialIdentityHash,
      exact_provider_request: args.exactProviderRequest,
    })),
    submittedEventId: forgeOwnerDeterministicUuid(`owner-cost-attempt-event:${attemptId}:submitted`),
    responseEventId: forgeOwnerDeterministicUuid(`owner-cost-attempt-event:${attemptId}:response`),
    terminalEventId: forgeOwnerDeterministicUuid(`owner-cost-attempt-event:${attemptId}:terminal`),
  };
}

export function forgeOwnerCredentialIdentityHash(secret: string): string {
  if (!secret) throw new Error("Forge credential is required");
  return forgeOwnerSha256(secret);
}

export function createSupabaseOwnerAuthorityReader(
  serviceClient: SupabaseClient<Database>,
): OwnerAuthorityReader {
  const tongs = serviceClient.schema("tongs") as unknown as OwnerAuthoritySchemaClient;
  return {
    async readEnabledPrincipal(userId) {
      const result = await tongs.from("owner_testing_principals")
        .select("revision,status")
        .eq("user_id", userId)
        .eq("status", "enabled")
        .maybeSingle();
      if (result.error) throw new Error(`owner_testing_principals lookup failed: ${result.error.message ?? "unknown error"}`);
      const row = readObject(result.data);
      const revision = Number(row?.revision);
      return Number.isSafeInteger(revision) && revision > 0 ? { revision } : null;
    },
    async readWorkspaceMembership(userId, workspaceId) {
      const result = await tongs.from("workspace_members")
        .select("role")
        .eq("user_id", userId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (result.error) throw new Error(`workspace membership lookup failed: ${result.error.message ?? "unknown error"}`);
      const role = readString(readObject(result.data)?.role);
      return role ? { role } : null;
    },
  };
}

export async function requireForgeOwnerExecutionAuthority(args: {
  reader: OwnerAuthorityReader;
  authenticatedUserId: string;
  workspaceId: string;
  routeCode: string;
  routeAuthorization?: OwnerRouteAuthorization;
}): Promise<AuthorizedOwnerExecution> {
  const authenticatedUserId = readString(args.authenticatedUserId);
  const workspaceId = readString(args.workspaceId);
  const routeCode = readString(args.routeCode)?.toLowerCase() ?? null;
  if (!authenticatedUserId || !workspaceId || !routeCode) {
    throw new ForgeOwnerAuthorizationError("Authenticated owner, Workspace, and route are required");
  }
  const [principal, membership] = await Promise.all([
    args.reader.readEnabledPrincipal(authenticatedUserId),
    args.reader.readWorkspaceMembership(authenticatedUserId, workspaceId),
  ]);
  if (!principal || !membership) {
    throw new ForgeOwnerAuthorizationError("Explicit owner principal and Workspace membership are required");
  }

  let ownerOperatingBudgetId: string | null = null;
  let routeAuthorizationEvidence: Record<string, unknown> = {};
  if (args.routeAuthorization?.required) {
    const decision = await args.routeAuthorization.authorize({
      authenticatedUserId,
      workspaceId,
      routeCode,
      principalRevision: principal.revision,
      membershipRole: membership.role,
    });
    if (!decision.authorized) throw new ForgeOwnerAuthorizationError("Owner route authorization is required");
    ownerOperatingBudgetId = readString(decision.ownerOperatingBudgetId);
    routeAuthorizationEvidence = decision.evidence ?? {};
  }

  return {
    authenticatedUserId,
    workspaceId,
    routeCode,
    principalRevision: principal.revision,
    membershipRole: membership.role,
    ownerOperatingBudgetId,
    routeAuthorizationEvidence,
  };
}

function stableTimestamp(createdAt: string, attemptNumber: number, sequence: number): string {
  const epoch = new Date(createdAt).getTime();
  if (!Number.isFinite(epoch)) throw new Error("Invalid owner operation creation time");
  return new Date(epoch + attemptNumber * 100 + sequence).toISOString();
}

function attemptState(attempt: OwnerAttemptSnapshot | null): string | null {
  const events = attempt?.events ?? [];
  return readString(events.at(-1)?.lifecycle_state)?.toLowerCase() ?? null;
}

function attemptByNumber(snapshot: OwnerOperationSnapshot | null, attemptNumber: number): OwnerAttemptSnapshot | null {
  return snapshot?.attempts?.find((attempt) => Number(attempt.attempt_number) === attemptNumber) ?? null;
}

function hasValuation(attempt: OwnerAttemptSnapshot | null, costComponent: string): boolean {
  return (attempt?.valuations ?? []).some((valuation) => readString(valuation.cost_component) === costComponent);
}

function unresolvedValuation(costComponent: string, reason: string): ForgeOwnerDirectValuation {
  return {
    costComponent,
    basis: "estimated",
    amountMicros: 0,
    currency: "USD",
    recognitionMode: "evidence_only",
    unresolvedReason: reason,
    privateEvidence: {
      monetary_amount_unresolved: true,
      zero_is_not_asserted_provider_cost: true,
    },
  };
}

function validateValuation(valuation: ForgeOwnerDirectValuation): ForgeOwnerDirectValuation {
  const costComponent = normalizedCode(valuation.costComponent, "cost component");
  const currency = valuation.currency.trim().toUpperCase();
  if (!Number.isSafeInteger(valuation.amountMicros) || valuation.amountMicros < 0) {
    throw new Error("Owner direct-cost valuation must be a non-negative safe integer");
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Owner direct-cost valuation requires ISO currency");
  if (valuation.recognitionMode === "journal_recognized" && valuation.basis === "estimated") {
    throw new Error("Estimated owner cost cannot be journal recognized");
  }
  if (valuation.basis === "usage_calculated" && !readString(valuation.rateRevisionId)) {
    throw new Error("Usage-calculated owner cost requires an immutable rate revision");
  }
  if (valuation.basis === "provider_reported" && !readString(valuation.providerMonetaryEvidenceReference)) {
    throw new Error("Provider-reported owner cost requires authoritative monetary evidence");
  }
  if (valuation.basis === "invoice_reconciled" && !readString(valuation.reconciliationReference)) {
    throw new Error("Invoice-reconciled owner cost requires a reconciliation reference");
  }
  if (valuation.recognitionMode === "evidence_only" && !readString(valuation.unresolvedReason)
    && valuation.basis === "estimated") {
    throw new Error("Unresolved owner cost requires an evidence-only reason");
  }
  return { ...valuation, costComponent, currency };
}

export class ForgeOwnerExecutionCoordinator {
  private readonly dependencies: {
    gate: OwnerCostRpcGate;
    authorityReader: OwnerAuthorityReader;
    now?: () => Date;
  };

  constructor(dependencies: {
    gate: OwnerCostRpcGate;
    authorityReader: OwnerAuthorityReader;
    now?: () => Date;
  }) {
    this.dependencies = dependencies;
  }

  private async rpc(name: string, args?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.dependencies.gate.rpc(name, args);
    if (result.error) {
      const error = new Error(`${name} failed: ${result.error.message ?? "unknown owner-cost error"}`) as Error & { code?: string };
      error.code = result.error.code;
      throw error;
    }
    return readObject(result.data) ?? {};
  }

  private async readOperation(operationId: string): Promise<OwnerOperationSnapshot | null> {
    const result = await this.dependencies.gate.rpc("read_owner_cost_operation", { p_operation_id: operationId });
    if (result.error) throw new Error(`read_owner_cost_operation failed: ${result.error.message ?? "unknown owner-cost error"}`);
    return readObject(result.data) as OwnerOperationSnapshot | null;
  }

  private async assertFinancialEnvironment(expected: OwnerFinancialEnvironment): Promise<void> {
    const result = await this.rpc("read_financial_runtime_environment");
    if (result.financial_environment !== expected) {
      throw new Error("Owner execution financial environment mismatch");
    }
  }

  private assertNoAmbiguousEarlierAttempt(snapshot: OwnerOperationSnapshot | null, attemptNumber: number): void {
    for (const attempt of snapshot?.attempts ?? []) {
      if (Number(attempt.attempt_number) >= attemptNumber) continue;
      const state = attemptState(attempt);
      if (state === "submission_unknown" || state === "submitted" || state === "authorized") {
        throw new ForgeOwnerExecutionFailure(
          "An earlier owner provider attempt is unresolved and cannot be retried automatically",
          "replay",
          readString(snapshot?.operation?.operation_id) ?? "unknown",
          readString(attempt.attempt_id) ?? "unknown",
        );
      }
    }
  }

  private async appendEvent(args: {
    eventId: string;
    attemptId: string;
    sequence: number;
    state: "submitted" | "response_captured" | "succeeded" | "definitively_rejected" | "failed" | "submission_unknown";
    providerReferenceId: string | null;
    normalizedUsage: Record<string, unknown>;
    privateEvidence: Record<string, unknown>;
    occurredAt: string;
  }): Promise<Record<string, unknown>> {
    return this.rpc("append_owner_cost_attempt_event", {
      p_attempt_event_id: args.eventId,
      p_attempt_id: args.attemptId,
      p_event_sequence: args.sequence,
      p_lifecycle_state: args.state,
      p_provider_reference_id: args.providerReferenceId,
      p_normalized_usage_evidence: args.normalizedUsage,
      p_private_provider_evidence: args.privateEvidence,
      p_occurred_at: args.occurredAt,
    });
  }

  private async recordValuations(args: {
    attemptId: string;
    attemptNumber: number;
    createdAt: string;
    valuations: ForgeOwnerDirectValuation[];
    existingAttempt?: OwnerAttemptSnapshot | null;
  }): Promise<void> {
    const valuations = args.valuations.map(validateValuation);
    const components = new Set<string>();
    for (const valuation of valuations) {
      if (components.has(valuation.costComponent)) {
        throw new Error("Owner provider capture contains duplicate cost components");
      }
      components.add(valuation.costComponent);
    }
    for (const valuation of valuations) {
      if (hasValuation(args.existingAttempt ?? null, valuation.costComponent)) continue;
      const valuationId = forgeOwnerDeterministicUuid(
        `owner-cost-valuation:${args.attemptId}:${valuation.costComponent}:1`,
      );
      await this.rpc("record_owner_cost_valuation", {
        p_valuation_id: valuationId,
        p_valuation_key: `owner-cost:${args.attemptId}:${valuation.costComponent}:1`,
        p_attempt_id: args.attemptId,
        p_cost_component: valuation.costComponent,
        p_prior_valuation_id: null,
        p_valuation_basis: valuation.basis,
        p_amount_micros: valuation.amountMicros,
        p_currency: valuation.currency,
        p_recognition_mode: valuation.recognitionMode,
        p_reconciliation_reference: valuation.reconciliationReference ?? null,
        p_normalized_usage_evidence: valuation.normalizedUsage ?? {},
        p_private_valuation_evidence: {
          ...(valuation.privateEvidence ?? {}),
          provider_rate_revision_id: valuation.rateRevisionId ?? null,
          provider_monetary_evidence_reference: valuation.providerMonetaryEvidenceReference ?? null,
          monetary_amount_unresolved: valuation.recognitionMode === "evidence_only",
          unresolved_reason: valuation.unresolvedReason ?? null,
          customer_finance_involved: false,
        },
        p_valued_at: stableTimestamp(args.createdAt, args.attemptNumber, 3),
      });
    }
  }

  private async recoverExisting<TResult>(args: {
    input: ForgeOwnerExecutionInput<unknown, TResult>;
    identity: ForgeOwnerAttemptIdentity;
    attempt: OwnerAttemptSnapshot;
    createdAt: string;
  }): Promise<ForgeOwnerExecutionResult<TResult>> {
    const currentState = attemptState(args.attempt);
    if (currentState === "submission_unknown") {
      return { state: "submission_unknown", operationId: args.input.operation.identity.operationId, attemptId: args.identity.attemptId, replay: true };
    }
    if (currentState === "definitively_rejected") {
      return { state: "definitively_rejected", operationId: args.input.operation.identity.operationId, attemptId: args.identity.attemptId, replay: true };
    }
    if (!args.input.recoverCapturedResult || !["response_captured", "succeeded", "failed"].includes(currentState ?? "")) {
      throw new ForgeOwnerExecutionFailure(
        "Owner provider submission already exists and cannot be repeated safely",
        "replay",
        args.input.operation.identity.operationId,
        args.identity.attemptId,
      );
    }
    const recovered = await args.input.recoverCapturedResult(args.attempt);
    if (!recovered) {
      throw new ForgeOwnerExecutionFailure(
        "Captured owner provider result requires reconciliation before replay",
        "replay",
        args.input.operation.identity.operationId,
        args.identity.attemptId,
      );
    }
    await args.input.validateResult(recovered.value);
    await this.recordValuations({
      attemptId: args.identity.attemptId,
      attemptNumber: args.input.attempt.attemptNumber,
      createdAt: args.createdAt,
      valuations: recovered.valuations?.length
        ? recovered.valuations
        : [unresolvedValuation(args.input.attempt.defaultCostComponent, "recovered_provider_capture_without_monetary_valuation")],
      existingAttempt: args.attempt,
    });
    await args.input.persistResult(recovered.value, {
      operationId: args.input.operation.identity.operationId,
      requestFingerprint: args.input.operation.identity.requestFingerprint,
      attemptId: args.identity.attemptId,
      attemptNumber: args.input.attempt.attemptNumber,
    });
    if (currentState === "response_captured") {
      const response = (args.attempt.events ?? []).find((event) => event.lifecycle_state === "response_captured");
      await this.appendEvent({
        eventId: args.identity.terminalEventId,
        attemptId: args.identity.attemptId,
        sequence: 4,
        state: "succeeded",
        providerReferenceId: readString(response?.provider_reference_id),
        normalizedUsage: readObject(response?.normalized_usage_evidence) ?? {},
        privateEvidence: { schema: "forge.owner-execution-terminal.v1", recovered: true },
        occurredAt: stableTimestamp(args.createdAt, args.input.attempt.attemptNumber, 4),
      });
    }
    return {
      state: "succeeded",
      value: recovered.value,
      operationId: args.input.operation.identity.operationId,
      attemptId: args.identity.attemptId,
      replay: true,
      recovered: true,
    };
  }

  async executeAttempt<TCapture, TResult>(
    input: ForgeOwnerExecutionInput<TCapture, TResult>,
  ): Promise<ForgeOwnerExecutionResult<TResult>> {
    const authority = await requireForgeOwnerExecutionAuthority({
      reader: this.dependencies.authorityReader,
      authenticatedUserId: input.authenticatedUserId,
      workspaceId: input.operation.attribution.workspaceId,
      routeCode: input.routeCode,
      routeAuthorization: input.routeAuthorization,
    });
    await this.assertFinancialEnvironment(input.operation.identity.financialEnvironment);
    requireSha256(input.operation.identity.requestFingerprint, "owner operation request fingerprint");
    const originatingTool = normalizedCode(input.operation.originatingTool, "originating tool", 2, 80);
    const operationType = normalizedCode(input.operation.operationType, "operation type");
    if (input.operation.identity.originatingTool !== originatingTool
      || input.operation.identity.operationType !== operationType) {
      throw new Error("Owner operation identity does not match its tool and operation type");
    }
    const attemptIdentity = deriveForgeOwnerAttemptIdentity({
      operation: input.operation.identity,
      attemptNumber: input.attempt.attemptNumber,
      provider: input.attempt.provider,
      service: input.attempt.service,
      model: input.attempt.model,
      sku: input.attempt.sku,
      credentialIdentityHash: input.attempt.credentialIdentityHash,
      exactProviderRequest: input.attempt.exactProviderRequest,
    });

    const before = await this.readOperation(input.operation.identity.operationId);
    const createdAt = readString(before?.operation?.created_at)
      ?? (this.dependencies.now?.() ?? new Date()).toISOString();
    await this.rpc("establish_owner_cost_operation", {
      p_operation_id: input.operation.identity.operationId,
      p_operation_key: input.operation.identity.operationKey,
      p_request_fingerprint: input.operation.identity.requestFingerprint,
      p_financial_environment: input.operation.identity.financialEnvironment,
      p_runtime_environment: input.operation.runtimeEnvironment,
      p_originating_tool: originatingTool,
      p_operation_type: operationType,
      p_workspace_id: input.operation.attribution.workspaceId,
      p_workpiece_id: input.operation.attribution.workpieceId ?? null,
      p_recording_session_id: input.operation.attribution.recordingSessionId ?? null,
      p_recording_capture_authority_id: input.operation.attribution.recordingCaptureAuthorityId ?? null,
      p_anvil_capture_execution_id: input.operation.attribution.anvilCaptureExecutionId ?? null,
      p_owner_operating_budget_id: authority.ownerOperatingBudgetId,
      p_creation_evidence: {
        ...(input.operation.creationEvidence ?? {}),
        schema: "forge.owner-execution-operation.v1",
        route_code: authority.routeCode,
        owner_principal_revision: authority.principalRevision,
        workspace_membership_role: authority.membershipRole,
        route_authorization: authority.routeAuthorizationEvidence,
        customer_finance_involved: false,
      },
      p_created_at: createdAt,
    });

    const persistedContext = {
      operationId: input.operation.identity.operationId,
      requestFingerprint: input.operation.identity.requestFingerprint,
      attemptNumber: input.attempt.attemptNumber,
    };
    const persisted = await input.readPersistedResult(persistedContext);
    if (persisted.found) {
      return {
        state: "succeeded",
        value: persisted.value,
        operationId: input.operation.identity.operationId,
        attemptId: attemptIdentity.attemptId,
        replay: true,
        recovered: false,
      };
    }

    const established = await this.readOperation(input.operation.identity.operationId);
    this.assertNoAmbiguousEarlierAttempt(established, input.attempt.attemptNumber);
    await this.rpc("authorize_owner_cost_provider_attempt", {
      p_attempt_id: attemptIdentity.attemptId,
      p_operation_id: input.operation.identity.operationId,
      p_attempt_number: input.attempt.attemptNumber,
      p_attempt_key: attemptIdentity.attemptKey,
      p_request_fingerprint: attemptIdentity.requestFingerprint,
      p_provider: normalizedCode(input.attempt.provider, "provider", 2, 80),
      p_service: normalizedCode(input.attempt.service, "service"),
      p_model: input.attempt.model?.trim() || null,
      p_sku: input.attempt.sku?.trim() || null,
      p_credential_identity_hash: requireSha256(input.attempt.credentialIdentityHash, "credential identity hash"),
      p_private_authorization_evidence: {
        ...(input.attempt.authorizationEvidence ?? {}),
        schema: "forge.owner-execution-attempt-authorization.v1",
        route_code: authority.routeCode,
        credential_source: "forge_managed",
        customer_finance_involved: false,
      },
      p_authorized_at: stableTimestamp(createdAt, input.attempt.attemptNumber, 0),
    });
    const submitted = await this.appendEvent({
      eventId: attemptIdentity.submittedEventId,
      attemptId: attemptIdentity.attemptId,
      sequence: 2,
      state: "submitted",
      providerReferenceId: null,
      normalizedUsage: {},
      privateEvidence: {
        ...(input.attempt.submissionEvidence ?? {}),
        schema: "forge.owner-execution-provider-submission.v1",
        provider: input.attempt.provider,
        service: input.attempt.service,
      },
      occurredAt: stableTimestamp(createdAt, input.attempt.attemptNumber, 2),
    });

    if (submitted.provider_submission_created !== true) {
      const replayed = await input.readPersistedResult(persistedContext);
      if (replayed.found) {
        return {
          state: "succeeded",
          value: replayed.value,
          operationId: input.operation.identity.operationId,
          attemptId: attemptIdentity.attemptId,
          replay: true,
          recovered: false,
        };
      }
      const snapshot = await this.readOperation(input.operation.identity.operationId);
      const attempt = attemptByNumber(snapshot, input.attempt.attemptNumber);
      if (!attempt) throw new Error("Owner provider attempt replay is missing");
      return this.recoverExisting({
        input: input as ForgeOwnerExecutionInput<unknown, TResult>,
        identity: attemptIdentity,
        attempt,
        createdAt,
      });
    }

    let capture: ForgeOwnerProviderCapture<TCapture>;
    try {
      capture = await input.submitProvider({
        operationId: input.operation.identity.operationId,
        attemptId: attemptIdentity.attemptId,
        attemptKey: attemptIdentity.attemptKey,
        attemptNumber: input.attempt.attemptNumber,
      });
    } catch (caught) {
      const providerError = caught instanceof ForgeOwnerProviderBoundaryError
        ? caught
        : new ForgeOwnerProviderBoundaryError({
            message: "Owner provider submission outcome is unknown",
            outcome: "submission_unknown",
            privateProviderEvidence: { unexpected_transport_error: true },
            cause: caught,
          });
      await this.appendEvent({
        eventId: attemptIdentity.responseEventId,
        attemptId: attemptIdentity.attemptId,
        sequence: 3,
        state: providerError.outcome,
        providerReferenceId: providerError.providerReferenceId,
        normalizedUsage: providerError.normalizedUsage,
        privateEvidence: {
          ...providerError.privateProviderEvidence,
          schema: "forge.owner-execution-provider-boundary-failure.v1",
          outcome: providerError.outcome,
          error_kind: providerError.name,
        },
        occurredAt: stableTimestamp(createdAt, input.attempt.attemptNumber, 3),
      });
      await this.recordValuations({
        attemptId: attemptIdentity.attemptId,
        attemptNumber: input.attempt.attemptNumber,
        createdAt,
        valuations: providerError.valuations.length
          ? providerError.valuations
          : [unresolvedValuation(input.attempt.defaultCostComponent, providerError.outcome)],
      });
      return {
        state: providerError.outcome,
        operationId: input.operation.identity.operationId,
        attemptId: attemptIdentity.attemptId,
        replay: false,
      };
    }

    if (!capture || !Array.isArray(capture.valuations)
      || !readObject(capture.normalizedUsage) || !readObject(capture.privateProviderEvidence)) {
      await this.appendEvent({
        eventId: attemptIdentity.responseEventId,
        attemptId: attemptIdentity.attemptId,
        sequence: 3,
        state: "submission_unknown",
        providerReferenceId: null,
        normalizedUsage: {},
        privateEvidence: {
          schema: "forge.owner-execution-provider-boundary-failure.v1",
          outcome: "submission_unknown",
          invalid_provider_capture: true,
        },
        occurredAt: stableTimestamp(createdAt, input.attempt.attemptNumber, 3),
      });
      await this.recordValuations({
        attemptId: attemptIdentity.attemptId,
        attemptNumber: input.attempt.attemptNumber,
        createdAt,
        valuations: [unresolvedValuation(input.attempt.defaultCostComponent, "invalid_provider_capture")],
      });
      throw new ForgeOwnerExecutionFailure(
        "Owner provider capture is invalid and its submission outcome requires reconciliation",
        "capture",
        input.operation.identity.operationId,
        attemptIdentity.attemptId,
      );
    }
    await this.appendEvent({
      eventId: attemptIdentity.responseEventId,
      attemptId: attemptIdentity.attemptId,
      sequence: 3,
      state: "response_captured",
      providerReferenceId: capture.providerReferenceId,
      normalizedUsage: capture.normalizedUsage,
      privateEvidence: {
        ...capture.privateProviderEvidence,
        schema: "forge.owner-execution-provider-response.v1",
      },
      occurredAt: stableTimestamp(createdAt, input.attempt.attemptNumber, 3),
    });
    try {
      await this.recordValuations({
        attemptId: attemptIdentity.attemptId,
        attemptNumber: input.attempt.attemptNumber,
        createdAt,
        valuations: capture.valuations.length
          ? capture.valuations
          : [unresolvedValuation(input.attempt.defaultCostComponent, "provider_response_without_monetary_valuation")],
      });
    } catch (error) {
      await this.recordValuations({
        attemptId: attemptIdentity.attemptId,
        attemptNumber: input.attempt.attemptNumber,
        createdAt,
        valuations: [unresolvedValuation(input.attempt.defaultCostComponent, "provider_valuation_not_defensible")],
      });
      await this.failAfterCapture(input, attemptIdentity, createdAt, capture, "valuation", error);
      throw new ForgeOwnerExecutionFailure(
        "Owner provider valuation failed closed with evidence-only cost",
        "valuation",
        input.operation.identity.operationId,
        attemptIdentity.attemptId,
        { cause: error },
      );
    }

    let value: TResult;
    try {
      value = await input.parseResult(capture.capture);
    } catch (error) {
      await this.failAfterCapture(input, attemptIdentity, createdAt, capture, "parse", error);
      throw new ForgeOwnerExecutionFailure("Owner provider response parsing failed", "parse", input.operation.identity.operationId, attemptIdentity.attemptId, { cause: error });
    }
    try {
      await input.validateResult(value);
    } catch (error) {
      await this.failAfterCapture(input, attemptIdentity, createdAt, capture, "validation", error);
      throw new ForgeOwnerExecutionFailure("Owner provider result validation failed", "validation", input.operation.identity.operationId, attemptIdentity.attemptId, { cause: error });
    }
    try {
      await input.persistResult(value, {
        operationId: input.operation.identity.operationId,
        requestFingerprint: input.operation.identity.requestFingerprint,
        attemptId: attemptIdentity.attemptId,
        attemptNumber: input.attempt.attemptNumber,
      });
    } catch (error) {
      await this.failAfterCapture(input, attemptIdentity, createdAt, capture, "persistence", error);
      throw new ForgeOwnerExecutionFailure("Owner product result persistence failed", "persistence", input.operation.identity.operationId, attemptIdentity.attemptId, { cause: error });
    }
    await this.appendEvent({
      eventId: attemptIdentity.terminalEventId,
      attemptId: attemptIdentity.attemptId,
      sequence: 4,
      state: "succeeded",
      providerReferenceId: capture.providerReferenceId,
      normalizedUsage: capture.normalizedUsage,
      privateEvidence: { schema: "forge.owner-execution-terminal.v1" },
      occurredAt: stableTimestamp(createdAt, input.attempt.attemptNumber, 4),
    });
    return {
      state: "succeeded",
      value,
      operationId: input.operation.identity.operationId,
      attemptId: attemptIdentity.attemptId,
      replay: false,
      recovered: false,
    };
  }

  private async failAfterCapture<TCapture, TResult>(
    input: ForgeOwnerExecutionInput<TCapture, TResult>,
    identity: ForgeOwnerAttemptIdentity,
    createdAt: string,
    capture: ForgeOwnerProviderCapture<TCapture>,
    phase: "valuation" | "parse" | "validation" | "persistence",
    error: unknown,
  ): Promise<void> {
    await this.appendEvent({
      eventId: identity.terminalEventId,
      attemptId: identity.attemptId,
      sequence: 4,
      state: "failed",
      providerReferenceId: capture.providerReferenceId,
      normalizedUsage: capture.normalizedUsage,
      privateEvidence: {
        schema: "forge.owner-execution-terminal.v1",
        forge_failure_phase: phase,
        message: error instanceof Error ? error.message : String(error),
      },
      occurredAt: stableTimestamp(createdAt, input.attempt.attemptNumber, 4),
    });
  }
}
