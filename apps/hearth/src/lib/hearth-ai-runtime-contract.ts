import type { EpisodeContext, HearthOp } from "./hearth-ai-ops";

export const HEARTH_AI_ROUTES = {
  chat: "/api/hearth/chat",
  chatStatus: "/api/hearth/chat/status",
  stt: "/api/hearth/stt",
  costAudit: "/api/hearth/cost-audit",
} as const;

export type { EpisodeContext, HearthOp } from "./hearth-ai-ops";

export type HearthAiLane = "forge" | "byo";
export type HearthAiBehavior = "fast" | "careful" | "deterministic" | "creative";
export type HearthChatRole = "system" | "user" | "assistant";

export type HearthChatMessage = {
  role: HearthChatRole;
  content: string;
};

export type HearthChatRequest = {
  messages: HearthChatMessage[];
  episode_context: EpisodeContext;
  behavior?: HearthAiBehavior;
  lane?: HearthAiLane;
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
};

export type HearthAiStatusResponse = {
  billing_mode: HearthAiLane;
  token_balance: number | null;
};

export type HearthChatResponse = {
  assistant_text: string;
  ops: HearthOp[];
  script_text: string | null;
  tag_audit: Record<string, unknown> | null;
  gate?: "clarify";
  total_tokens: number | null;
  actual_cost_usd?: number;
  billable_tokens?: number;
  billing_mode: HearthAiLane;
  token_balance: number | null;
  credits_warning?: string;
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

  return {
    messages,
    episode_context: episodeContext,
    ...(behavior ? { behavior } : {}),
    ...(lane ? { lane } : {}),
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
  return {
    tokenBalance,
    billingMode,
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
  const creditsWarning = readTrimmedField(payload, "credits_warning") ?? undefined;
  const actualCostUsd = readNumberField(payload, "actual_cost_usd") ?? undefined;
  const billableTokens = readNumberField(payload, "billable_tokens") ?? undefined;

  return {
    assistant_text: assistantText,
    ops: normalizeHearthOps(readUnknownField(payload, "ops")),
    script_text: readStringField(payload, "script_text"),
    tag_audit: isRecord(tagAuditRaw) ? tagAuditRaw : null,
    ...(gateRaw === "clarify" ? { gate: "clarify" as const } : {}),
    total_tokens: readNumberField(payload, "total_tokens"),
    ...(typeof actualCostUsd === "number" ? { actual_cost_usd: actualCostUsd } : {}),
    ...(typeof billableTokens === "number" ? { billable_tokens: billableTokens } : {}),
    billing_mode: runtime.billingMode,
    token_balance: runtime.tokenBalance,
    ...(creditsWarning ? { credits_warning: creditsWarning } : {}),
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
