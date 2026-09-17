import type { EpisodeContext, HearthOp } from "./hearth-ai-ops";
import {
  normalizeHearthResearchResult,
  type HearthResearchResult,
} from "./hearth-research-contract";
import type {
  HearthExplicitUiAction,
  HearthOutputPreference,
  HearthProductionAction,
  HearthTurnDecision,
  HearthTurnFailureKind,
  HearthTurnResult,
  HearthValidatedArtifact,
} from "./hearth-turn-contract";

export const HEARTH_AI_ROUTES = {
  chat: "/api/hearth/chat",
  chatStatus: "/api/hearth/chat/status",
  researchReadiness: "/api/hearth/research/readiness",
  stt: "/api/hearth/stt",
  costAudit: "/api/hearth/cost-audit",
  aiKeysConnect: "/api/ai-keys/connect",
  aiKeysDisconnect: "/api/ai-keys/disconnect",
  aiKeysStatus: "/api/ai-keys/status",
} as const;

export type { EpisodeContext, HearthOp } from "./hearth-ai-ops";
export type {
  HearthExplicitUiAction,
  HearthOutputPreference,
  HearthProductionAction,
  HearthTurnDecision,
  HearthTurnFailureKind,
  HearthTurnMode,
  HearthTurnResult,
  HearthValidatedArtifact,
} from "./hearth-turn-contract";

export type HearthAiLane = "forge" | "byo";
export type HearthAiBehavior = "fast" | "careful" | "deterministic" | "creative";
export type HearthChatRole = "system" | "user" | "assistant";

export type HearthOwnerChatCapabilityStatus =
  | "checking"
  | "not_required"
  | "available"
  | "unavailable"
  | "unknown";

export type HearthOwnerChatCapabilityReasonCode =
  | "owner_runtime_unavailable"
  | "owner_controls_unavailable"
  | null;

export type HearthOwnerChatCapability = {
  status: HearthOwnerChatCapabilityStatus;
  reasonCode: HearthOwnerChatCapabilityReasonCode;
};

export type HearthChatMessage = {
  role: HearthChatRole;
  content: string;
};

export type HearthAttachmentContextRequest = {
  include_episode_attachments?: boolean;
  attachment_ids?: string[];
};

export type HearthChatRequest = {
  /** Stable creator operation identity, reused across quote acceptance and recovery. */
  action_id?: string;
  messages: HearthChatMessage[];
  episode_context: EpisodeContext;
  /** Exact creator-authored text. UI instructions and preferences are never appended here. */
  user_authored_text?: string;
  explicit_action?: HearthExplicitUiAction;
  output_preference?: HearthOutputPreference;
  behavior?: HearthAiBehavior;
  lane?: HearthAiLane;
  attachment_context?: HearthAttachmentContextRequest;
  production_action?: HearthProductionAction;
  production_script_version?: number;
  /** Opaque accepted-funding handle; all monetary terms are resolved server-side. */
  paid_execution?: {
    operation_id: string;
    reservation_id: string;
    request_fingerprint: string;
  };
  /** Exact customer acceptance of the server-issued price and request fingerprint. */
  spending_acceptance?: {
    operation_id: string;
    quote_id: string;
    quote_hash: string;
    request_fingerprint: string;
  };
};

export type HearthSttRequest = {
  workpiece_id: string;
  storage_key: string;
  mime_type?: string;
  lane?: HearthAiLane;
};

export type HearthAiRuntimeSnapshot = {
  tokenBalance: number | null;
  billingMode: HearthAiLane;
  ownerChatCapability?: HearthOwnerChatCapability;
};

export type HearthAiStatusResponse = {
  billing_mode: HearthAiLane;
  token_balance: number | null;
  owner_chat_capability?: {
    status: Exclude<HearthOwnerChatCapabilityStatus, "checking">;
    reason_code: HearthOwnerChatCapabilityReasonCode;
  };
};

export type HearthChatResponse = {
  turn_result: HearthTurnResult;
  assistant_text: string;
  ops: HearthOp[];
  script_text: string | null;
  tag_audit: Record<string, unknown> | null;
  proposal_id?: string;
  proposal_state?: "proposed";
  research_result?: HearthResearchResult;
  research_context?: {
    provider_status: HearthResearchResult["providerStatus"];
    source_count: number;
    model_context_injected: boolean;
  };
  gate?: "clarify";
  total_tokens: number | null;
  actual_cost_usd?: number;
  billable_tokens?: number;
  billing_mode: HearthAiLane;
  token_balance: number | null;
  credits_warning?: string;
  billing_receipt?: {
    operation_id: string;
    reservation_id: string;
    status: "settled" | "settled_replay" | "failed_released" | "submission_unknown" | "duplicate_in_progress";
    funding_source: "customer_deposit" | "paid_allowance" | "owner_budget" | "none";
    customer_charge_micros: number;
    provider_request_id?: string | null;
  };
};

export type HearthSttResponse = {
  text: string;
  total_tokens: number | null;
  provider_request_id: string | null;
  actual_cost_usd?: number;
  billable_tokens?: number;
  billing_mode: HearthAiLane;
  token_balance: number | null;
  credits_warning?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readTrimmedString(value: unknown): string | null {
  const raw = readString(value);
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function readStringField(payload: unknown, key: string): string | null {
  if (!isRecord(payload)) return null;
  return readString(payload[key]);
}

function readTrimmedField(payload: unknown, key: string): string | null {
  if (!isRecord(payload)) return null;
  return readTrimmedString(payload[key]);
}

function readNumberField(payload: unknown, key: string): number | null {
  if (!isRecord(payload)) return null;
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readUnknownField(payload: unknown, key: string): unknown {
  if (!isRecord(payload)) return null;
  return payload[key];
}

function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

function normalizeOpPatch(value: unknown): { title?: string; url?: string; note?: string } | null {
  if (!isRecord(value)) return null;
  const title = readTrimmedString(value.title) ?? undefined;
  const url = readTrimmedString(value.url) ?? undefined;
  const note = readTrimmedString(value.note) ?? undefined;
  if (!title && !url && !note) return null;
  return {
    ...(title ? { title } : {}),
    ...(url ? { url } : {}),
    ...(note ? { note } : {}),
  };
}

export function isHearthAiLane(value: unknown): value is HearthAiLane {
  return value === "forge" || value === "byo";
}

export function isHearthAiBehavior(value: unknown): value is HearthAiBehavior {
  return value === "fast" || value === "careful" || value === "deterministic" || value === "creative";
}

export function isHearthChatRole(value: unknown): value is HearthChatRole {
  return value === "system" || value === "user" || value === "assistant";
}

function isHearthProductionAction(value: unknown): value is HearthProductionAction {
  return value === "seo"
    || value === "tags"
    || value === "thumbnails"
    || value === "image_beat_sheet"
    || value === "release_prep_pack";
}

export function normalizeHearthExplicitUiAction(value: unknown): HearthExplicitUiAction | null {
  if (!isRecord(value)) return null;
  const kind = readTrimmedString(value.kind);
  if (kind === "production" && isHearthProductionAction(value.action)) {
    return { kind, action: value.action };
  }
  if (kind === "conversation"
    || kind === "listening"
    || kind === "research"
    || kind === "generate_outline"
    || kind === "generate_script"
    || kind === "mutate_script"
    || kind === "readiness_review") {
    return { kind };
  }
  return null;
}

export function normalizeHearthOutputPreference(value: unknown): HearthOutputPreference | null {
  return value === "explore_expand" || value === "full_script" || value === "bullet_outline" ? value : null;
}

export function normalizeHearthTurnDecision(value: unknown): HearthTurnDecision | null {
  if (!isRecord(value)) return null;
  const mode = readTrimmedString(value.mode);
  const requestedArtifact = value.requestedArtifact == null ? null : readTrimmedString(value.requestedArtifact);
  const retrievalScope = readTrimmedString(value.retrievalScope);
  if (!(mode === "conversation" || mode === "listening" || mode === "research"
    || mode === "outline_generate" || mode === "script_generate" || mode === "script_mutate"
    || mode === "readiness_review" || mode === "production_action")) return null;
  if (!(requestedArtifact == null || requestedArtifact === "research" || requestedArtifact === "outline"
    || requestedArtifact === "script" || requestedArtifact === "production")) return null;
  if (retrievalScope !== "active_episode_only" && retrievalScope !== "explicit_cross_episode") return null;
  const reasons = Array.isArray(value.reasons)
    ? value.reasons.map(readTrimmedString).filter((entry): entry is string => !!entry)
    : [];
  return {
    mode,
    requiresArtifact: value.requiresArtifact === true,
    allowsMutation: value.allowsMutation === true,
    retrievalScope,
    requestedArtifact,
    reasons,
  };
}

function normalizeHearthValidatedArtifact(value: unknown): HearthValidatedArtifact | null {
  if (!isRecord(value)) return null;
  const kind = readTrimmedString(value.kind);
  if (kind === "research") {
    const research = normalizeHearthResearchResult(value.value);
    return research ? { kind, value: research } : null;
  }
  if (kind === "outline" || kind === "script") {
    const text = readTrimmedString(value.text);
    return text ? { kind, text } : null;
  }
  if (kind === "production" && isHearthProductionAction(value.action) && value.value != null) {
    return { kind, action: value.action, value: value.value };
  }
  return null;
}

export function normalizeHearthTurnResult(value: unknown): HearthTurnResult | null {
  if (!isRecord(value)) return null;
  const decision = normalizeHearthTurnDecision(value.decision);
  const assistantMessage = readString(value.assistantMessage)?.trim() ?? "";
  const validationRaw = isRecord(value.validation) ? value.validation : null;
  const failureKind = validationRaw ? readTrimmedString(validationRaw.failureKind) : null;
  const persistence = readTrimmedString(value.persistence);
  if (!decision || !(failureKind === "none" || failureKind === "admission_failure"
    || failureKind === "provider_failure"
    || failureKind === "invalid_model_output" || failureKind === "identity_mismatch"
    || failureKind === "persistence_failure")) return null;
  if (!(persistence === "not_attempted" || persistence === "pending" || persistence === "saved" || persistence === "failed")) return null;
  return {
    decision,
    assistantMessage,
    artifact: normalizeHearthValidatedArtifact(value.artifact),
    operations: normalizeHearthOps(value.operations),
    validation: {
      ok: validationRaw?.ok === true && failureKind === "none",
      failureKind: failureKind as HearthTurnFailureKind,
      message: validationRaw ? readString(validationRaw.message) : null,
    },
    persistence,
  };
}

export function normalizeHearthChatMessage(value: unknown): HearthChatMessage | null {
  if (!isRecord(value)) return null;
  if (!isHearthChatRole(value.role)) return null;
  const content = readTrimmedString(value.content);
  if (!content) return null;
  return {
    role: value.role,
    content,
  };
}

export function normalizeHearthChatMessages(messages: readonly unknown[]): HearthChatMessage[] {
  return messages
    .map((message) => normalizeHearthChatMessage(message))
    .filter((message): message is HearthChatMessage => !!message)
    .slice(-24);
}

export function normalizeEpisodeContext(value: unknown): EpisodeContext | null {
  if (!isRecord(value)) return null;

  const episodeId = readTrimmedField(value, "episodeId");
  if (!episodeId) return null;

  const workspaceId = readTrimmedField(value, "workspaceId") ?? readTrimmedField(value, "workspace_id");
  const tonePreset = readTrimmedField(value, "tonePreset") ?? readTrimmedField(value, "tone_preset");

  const titleVariantsRaw = isRecord(value.titleVariants) ? value.titleVariants : {};
  const titleVariants = {
    A: readTrimmedString(titleVariantsRaw.A) ?? "",
    B: readTrimmedString(titleVariantsRaw.B) ?? "",
    C: readTrimmedString(titleVariantsRaw.C) ?? "",
  };

  const sourcesRaw = Array.isArray(value.sources) ? value.sources : [];
  const sources = sourcesRaw
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const id = readTrimmedString(entry.id);
      if (!id) return null;
      const citedInRaw = Array.isArray(entry.citedIn) ? entry.citedIn : [];
      const citedIn = citedInRaw
        .map((token) => readTrimmedString(token))
        .filter((token): token is string => !!token);
      return {
        id,
        title: readTrimmedString(entry.title) ?? "",
        url: readTrimmedString(entry.url) ?? "",
        note: readTrimmedString(entry.note) ?? "",
        citedIn,
      };
    })
    .filter((entry): entry is EpisodeContext["sources"][number] => !!entry);

  const sparksRaw = Array.isArray(value.sparks) ? value.sparks : [];
  const sparks = sparksRaw
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const id = readTrimmedString(entry.id);
      if (!id) return null;
      return {
        id,
        text: readTrimmedString(entry.text) ?? "",
      };
    })
    .filter((entry): entry is EpisodeContext["sparks"][number] => !!entry);

  return {
    episodeId,
    workspaceId: isUuid(workspaceId) ? workspaceId : null,
    title: readTrimmedField(value, "title") ?? "",
    titleVariants,
    outline: readTrimmedField(value, "outline") ?? "",
    body: readTrimmedField(value, "body") ?? "",
    tonePreset: tonePreset ? tonePreset.toLowerCase() : null,
    sources,
    sparks,
  };
}

export function normalizeHearthOps(value: unknown): HearthOp[] {
  if (!Array.isArray(value)) return [];
  const out: HearthOp[] = [];

  for (const item of value) {
    if (!isRecord(item)) continue;
    const op = readTrimmedString(item.op);
    if (!op) continue;

    if (op === "set_title") {
      const next = readTrimmedString(item.value);
      if (next !== null) out.push({ op, value: next });
      continue;
    }

    if (op === "set_title_variant") {
      const slot = readTrimmedString(item.slot);
      const valueText = readTrimmedString(item.value);
      if ((slot === "A" || slot === "B" || slot === "C") && valueText !== null) {
        out.push({ op, slot, value: valueText });
      }
      continue;
    }

    if (op === "set_outline") {
      const next = readTrimmedString(item.value);
      if (next !== null) out.push({ op, value: next });
      continue;
    }

    if (op === "set_body") {
      const next = readTrimmedString(item.value);
      if (next !== null) out.push({ op, value: next });
      continue;
    }

    if (op === "add_source") {
      const source = normalizeOpPatch(item.source);
      if (source) out.push({ op, source });
      continue;
    }

    if (op === "update_source") {
      const id = readTrimmedString(item.id);
      const patch = normalizeOpPatch(item.patch);
      if (id && patch) out.push({ op, id, patch });
      continue;
    }

    if (op === "remove_source") {
      const id = readTrimmedString(item.id);
      if (id) out.push({ op, id });
      continue;
    }
  }

  return out;
}

export function readHearthBehaviorTemperature(value: unknown): number {
  const behavior = readTrimmedString(value);
  if (behavior === "deterministic") return 0.1;
  if (behavior === "careful") return 0.25;
  if (behavior === "creative") return 0.9;
  if (behavior === "fast") return 0.7;
  return 0.25;
}

export function normalizeHearthChatRequest(value: unknown): HearthChatRequest | null {
  if (!isRecord(value)) return null;

  const messagesRaw = Array.isArray(value.messages) ? value.messages : [];
  const messages = normalizeHearthChatMessages(messagesRaw);
  const episodeContext = normalizeEpisodeContext(value.episode_context);

  if (!messages.length || !episodeContext) return null;

  const behaviorRaw = readTrimmedString(value.behavior);
  const laneRaw = readTrimmedString(value.lane);
  const behavior = isHearthAiBehavior(behaviorRaw) ? behaviorRaw : undefined;
  const lane = isHearthAiLane(laneRaw) ? laneRaw : undefined;
  const explicitAction = normalizeHearthExplicitUiAction(value.explicit_action);
  const outputPreference = normalizeHearthOutputPreference(value.output_preference);
  const productionAction = isHearthProductionAction(value.production_action) ? value.production_action : undefined;
  if (value.explicit_action != null && !explicitAction) return null;
  if (value.output_preference != null && !outputPreference) return null;
  if (value.production_action != null && !productionAction) return null;
  const paidExecutionRaw = isRecord(value.paid_execution) ? value.paid_execution : null;
  const paidOperationId = paidExecutionRaw ? readTrimmedString(paidExecutionRaw.operation_id) : null;
  const paidReservationId = paidExecutionRaw ? readTrimmedString(paidExecutionRaw.reservation_id) : null;
  const paidRequestFingerprint = paidExecutionRaw ? readTrimmedString(paidExecutionRaw.request_fingerprint) : null;
  const paidExecution = paidOperationId && paidOperationId.length >= 8
    && paidReservationId && UUID_RE.test(paidReservationId)
    && paidRequestFingerprint && /^[0-9a-f]{64}$/i.test(paidRequestFingerprint)
    ? {
        operation_id: paidOperationId,
        reservation_id: paidReservationId,
        request_fingerprint: paidRequestFingerprint.toLowerCase(),
      }
    : undefined;
  if (value.paid_execution != null && !paidExecution) return null;
  const spendingAcceptanceRaw = isRecord(value.spending_acceptance) ? value.spending_acceptance : null;
  const acceptanceOperationId = spendingAcceptanceRaw ? readTrimmedString(spendingAcceptanceRaw.operation_id) : null;
  const acceptanceQuoteId = spendingAcceptanceRaw ? readTrimmedString(spendingAcceptanceRaw.quote_id) : null;
  const acceptanceQuoteHash = spendingAcceptanceRaw ? readTrimmedString(spendingAcceptanceRaw.quote_hash) : null;
  const acceptanceRequestFingerprint = spendingAcceptanceRaw
    ? readTrimmedString(spendingAcceptanceRaw.request_fingerprint)
    : null;
  const spendingAcceptance = acceptanceOperationId && acceptanceOperationId.length >= 8
    && acceptanceQuoteId && UUID_RE.test(acceptanceQuoteId)
    && acceptanceQuoteHash && /^[0-9a-f]{64}$/i.test(acceptanceQuoteHash)
    && acceptanceRequestFingerprint && /^[0-9a-f]{64}$/i.test(acceptanceRequestFingerprint)
    ? {
        operation_id: acceptanceOperationId,
        quote_id: acceptanceQuoteId,
        quote_hash: acceptanceQuoteHash.toLowerCase(),
        request_fingerprint: acceptanceRequestFingerprint.toLowerCase(),
      }
    : undefined;
  if (value.spending_acceptance != null && !spendingAcceptance) return null;
  if (paidExecution && spendingAcceptance) return null;

  return {
    messages,
    episode_context: episodeContext,
    ...(readTrimmedString(value.user_authored_text) ? { user_authored_text: readTrimmedString(value.user_authored_text)! } : {}),
    ...(explicitAction ? { explicit_action: explicitAction } : {}),
    ...(outputPreference ? { output_preference: outputPreference } : {}),
    ...(behavior ? { behavior } : {}),
    ...(lane ? { lane } : {}),
    ...(productionAction ? { production_action: productionAction } : {}),
    ...(typeof value.production_script_version === "number" && Number.isInteger(value.production_script_version)
      ? { production_script_version: value.production_script_version }
      : {}),
    ...(paidExecution ? { paid_execution: paidExecution } : {}),
    ...(spendingAcceptance ? { spending_acceptance: spendingAcceptance } : {}),
  };
}

export function isValidHearthChatRequest(value: unknown): value is HearthChatRequest {
  return normalizeHearthChatRequest(value) !== null;
}

export function normalizeHearthSttRequest(value: unknown): HearthSttRequest | null {
  if (!isRecord(value)) return null;

  const workpieceId = readTrimmedField(value, "workpiece_id");
  const storageKey = readTrimmedField(value, "storage_key");
  if (!workpieceId || !storageKey) return null;

  const mimeType = readTrimmedField(value, "mime_type") ?? undefined;
  const laneRaw = readTrimmedField(value, "lane");
  const lane = isHearthAiLane(laneRaw) ? laneRaw : undefined;

  return {
    workpiece_id: workpieceId,
    storage_key: storageKey,
    ...(mimeType ? { mime_type: mimeType } : {}),
    ...(lane ? { lane } : {}),
  };
}

export function isValidHearthSttRequest(value: unknown): value is HearthSttRequest {
  return normalizeHearthSttRequest(value) !== null;
}

export function readHearthAiRuntimeSnapshot(
  payload: unknown,
  fallbackLane: HearthAiLane,
): HearthAiRuntimeSnapshot {
  const billingModeRaw = readStringField(payload, "billing_mode");
  const billingMode = isHearthAiLane(billingModeRaw) ? billingModeRaw : fallbackLane;
  const tokenBalanceRaw = readNumberField(payload, "token_balance");
  const tokenBalance = billingMode === "forge" ? tokenBalanceRaw : null;
  const ownerChatCapabilityRaw = readUnknownField(payload, "owner_chat_capability");
  const ownerChatCapabilityRecord = isRecord(ownerChatCapabilityRaw) ? ownerChatCapabilityRaw : null;
  const ownerChatStatus = ownerChatCapabilityRecord
    ? readTrimmedField(ownerChatCapabilityRecord, "status")
    : null;
  const ownerChatReasonCode = ownerChatCapabilityRecord
    ? readTrimmedField(ownerChatCapabilityRecord, "reason_code")
    : null;
  const ownerChatCapability = (
    ownerChatStatus === "not_required"
    || ownerChatStatus === "available"
    || ownerChatStatus === "unavailable"
    || ownerChatStatus === "unknown"
  ) ? {
      status: ownerChatStatus,
      reasonCode: ownerChatReasonCode === "owner_runtime_unavailable"
        || ownerChatReasonCode === "owner_controls_unavailable"
        ? ownerChatReasonCode
        : null,
    } satisfies HearthOwnerChatCapability : undefined;

  return {
    tokenBalance,
    billingMode,
    ...(ownerChatCapability ? { ownerChatCapability } : {}),
  };
}

export function readHearthAiErrorText(payload: unknown, fallback: string): string {
  const errorText = readTrimmedField(payload, "error") ?? readTrimmedField(payload, "message");
  return errorText ?? fallback;
}

export function parseHearthAiStatusResponse(
  payload: unknown,
  fallbackLane: HearthAiLane,
): HearthAiStatusResponse {
  const runtime = readHearthAiRuntimeSnapshot(payload, fallbackLane);
  return {
    billing_mode: runtime.billingMode,
    token_balance: runtime.tokenBalance,
    ...(runtime.ownerChatCapability ? {
      owner_chat_capability: {
        status: runtime.ownerChatCapability.status as Exclude<HearthOwnerChatCapabilityStatus, "checking">,
        reason_code: runtime.ownerChatCapability.reasonCode,
      },
    } : {}),
  };
}

export function parseHearthChatResponse(
  payload: unknown,
  fallbackLane: HearthAiLane,
): HearthChatResponse | null {
  if (!isRecord(payload)) return null;

  const runtime = readHearthAiRuntimeSnapshot(payload, fallbackLane);
  const assistantText = (
    readStringField(payload, "assistant_text")
    ?? readStringField(payload, "reply")
    ?? ""
  ).trim();
  const gateRaw = readTrimmedField(payload, "gate");
  const tagAuditRaw = readUnknownField(payload, "tag_audit");
  const researchResult = normalizeHearthResearchResult(readUnknownField(payload, "research_result"));
  const turnResult = normalizeHearthTurnResult(readUnknownField(payload, "turn_result"));
  const creditsWarning = readTrimmedField(payload, "credits_warning") ?? undefined;
  const actualCostUsd = readNumberField(payload, "actual_cost_usd") ?? undefined;
  const billableTokens = readNumberField(payload, "billable_tokens") ?? undefined;
  const receiptRaw = readUnknownField(payload, "billing_receipt");
  const receipt = isRecord(receiptRaw) ? receiptRaw : null;
  const receiptStatus = receipt ? readTrimmedField(receipt, "status") : null;
  const receiptFunding = receipt ? readTrimmedField(receipt, "funding_source") : null;
  const normalizedReceipt = receipt
    && readTrimmedField(receipt, "operation_id")
    && isUuid(readTrimmedField(receipt, "reservation_id"))
    && ["settled", "settled_replay", "failed_released", "submission_unknown", "duplicate_in_progress"].includes(receiptStatus ?? "")
    && ["customer_deposit", "paid_allowance", "owner_budget", "none"].includes(receiptFunding ?? "")
    && readNumberField(receipt, "customer_charge_micros") != null
    ? {
        operation_id: readTrimmedField(receipt, "operation_id")!,
        reservation_id: readTrimmedField(receipt, "reservation_id")!,
        status: receiptStatus as NonNullable<HearthChatResponse["billing_receipt"]>["status"],
        funding_source: receiptFunding as NonNullable<HearthChatResponse["billing_receipt"]>["funding_source"],
        customer_charge_micros: readNumberField(receipt, "customer_charge_micros")!,
        provider_request_id: readStringField(receipt, "provider_request_id"),
      }
    : null;

  if (!turnResult) return null;
  return {
    turn_result: turnResult,
    assistant_text: assistantText,
    ops: normalizeHearthOps(readUnknownField(payload, "ops")),
    script_text: readStringField(payload, "script_text"),
    tag_audit: isRecord(tagAuditRaw) ? tagAuditRaw : null,
    ...(isUuid(readTrimmedField(payload, "proposal_id")) && readTrimmedField(payload, "proposal_state") === "proposed"
      ? { proposal_id: readTrimmedField(payload, "proposal_id")!, proposal_state: "proposed" as const }
      : {}),
    ...(researchResult ? { research_result: researchResult } : {}),
    ...(gateRaw === "clarify" ? { gate: "clarify" as const } : {}),
    total_tokens: readNumberField(payload, "total_tokens"),
    ...(typeof actualCostUsd === "number" ? { actual_cost_usd: actualCostUsd } : {}),
    ...(typeof billableTokens === "number" ? { billable_tokens: billableTokens } : {}),
    billing_mode: runtime.billingMode,
    token_balance: runtime.tokenBalance,
    ...(creditsWarning ? { credits_warning: creditsWarning } : {}),
    ...(normalizedReceipt ? { billing_receipt: normalizedReceipt } : {}),
  };
}

export function parseHearthSttResponse(
  payload: unknown,
  fallbackLane: HearthAiLane,
): HearthSttResponse | null {
  if (!isRecord(payload)) return null;

  const runtime = readHearthAiRuntimeSnapshot(payload, fallbackLane);
  const creditsWarning = readTrimmedField(payload, "credits_warning") ?? undefined;
  const actualCostUsd = readNumberField(payload, "actual_cost_usd") ?? undefined;
  const billableTokens = readNumberField(payload, "billable_tokens") ?? undefined;

  return {
    text: (readStringField(payload, "text") ?? "").trim(),
    total_tokens: readNumberField(payload, "total_tokens"),
    provider_request_id: readStringField(payload, "provider_request_id"),
    ...(typeof actualCostUsd === "number" ? { actual_cost_usd: actualCostUsd } : {}),
    ...(typeof billableTokens === "number" ? { billable_tokens: billableTokens } : {}),
    billing_mode: runtime.billingMode,
    token_balance: runtime.tokenBalance,
    ...(creditsWarning ? { credits_warning: creditsWarning } : {}),
  };
}
