import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@forge/tongs";
import {
  encryptUserAiKey,
  getUserAiKeyCiphertextVersion,
} from "../../../../packages/tongs/src/server/ai-key-crypto";

export type SupportedAiProvider = "openai";
export type ValidationMode = "strict" | "lazy";

export type UserAiKeyStatusRecord = {
  provider: SupportedAiProvider;
  provider_account_id: string | null;
  key_label: string | null;
  key_version: number;
  validation_mode: ValidationMode;
  status: string;
  connected: boolean;
  created_at: string;
  updated_at: string;
  last_validated_at: string | null;
  last_validation_status: string | null;
  last_used_at?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeProvider(value: unknown): SupportedAiProvider | null {
  const normalized = readOptionalString(value)?.toLowerCase();
  if (normalized === "openai") return "openai";
  return null;
}

function normalizeValidationMode(value: unknown): ValidationMode {
  return value === "strict" ? "strict" : "lazy";
}

function isLikelyOpenAiKey(raw: string): boolean {
  return /^sk-(proj-)?[A-Za-z0-9\-_]{16,}$/.test(raw.trim());
}

function normalizeStatusRecord(value: unknown): UserAiKeyStatusRecord | null {
  if (!isRecord(value)) return null;
  const provider = normalizeProvider(value.provider);
  if (!provider) return null;
  const keyVersionRaw = value.key_version;
  const keyVersion = typeof keyVersionRaw === "number" && Number.isFinite(keyVersionRaw)
    ? Math.max(1, Math.floor(keyVersionRaw))
    : 1;
  const validationMode = normalizeValidationMode(value.validation_mode);
  return {
    provider,
    provider_account_id: readOptionalString(value.provider_account_id),
    key_label: readOptionalString(value.key_label),
    key_version: keyVersion,
    validation_mode: validationMode,
    status: readOptionalString(value.status) ?? "unknown",
    connected: value.connected === true || readOptionalString(value.status) === "active",
    created_at: readOptionalString(value.created_at) ?? new Date(0).toISOString(),
    updated_at: readOptionalString(value.updated_at) ?? new Date(0).toISOString(),
    last_validated_at: readOptionalString(value.last_validated_at),
    last_validation_status: readOptionalString(value.last_validation_status),
    last_used_at: readOptionalString(value.last_used_at),
  };
}

export async function connectUserAiKey(args: {
  supabaseService: SupabaseClient<Database>;
  provider: unknown;
  rawKey: unknown;
  keyLabel?: unknown;
  providerAccountId?: unknown;
  validationMode?: unknown;
}): Promise<{ ok: true; status: UserAiKeyStatusRecord } | { ok: false; statusCode: number; error: string }> {
  const provider = normalizeProvider(args.provider);
  if (!provider) {
    return { ok: false, statusCode: 400, error: "Unsupported provider." };
  }

  const rawKey = readOptionalString(args.rawKey);
  if (!rawKey) {
    return { ok: false, statusCode: 400, error: "API key is required." };
  }
  if (provider === "openai" && !isLikelyOpenAiKey(rawKey)) {
    return { ok: false, statusCode: 400, error: "Invalid OpenAI key format." };
  }

  const encryptedApiKey = encryptUserAiKey(rawKey);
  const validationMode = normalizeValidationMode(args.validationMode);
  const rpcClient = args.supabaseService.schema("tongs") as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };

  const { data, error } = await rpcClient.rpc("connect_user_ai_key", {
    p_provider: provider,
    p_encrypted_api_key: encryptedApiKey,
    p_key_label: readOptionalString(args.keyLabel),
    p_provider_account_id: readOptionalString(args.providerAccountId),
    p_key_version: Number(getUserAiKeyCiphertextVersion().replace(/[^\d]/g, "")) || 1,
    p_validation_mode: validationMode,
    p_last_validated_at: null,
    p_last_validation_status: "unvalidated",
  });

  if (error) {
    return { ok: false, statusCode: 500, error: "Failed to connect AI key." };
  }

  const row = Array.isArray(data) ? data[0] : null;
  const normalized = normalizeStatusRecord(row);
  if (!normalized) {
    return { ok: false, statusCode: 500, error: "Connected key metadata was unavailable." };
  }

  return {
    ok: true,
    status: normalized,
  };
}

export async function disconnectUserAiKey(args: {
  supabaseService: SupabaseClient<Database>;
  provider: unknown;
  providerAccountId?: unknown;
}): Promise<{ ok: true; status: UserAiKeyStatusRecord | null } | { ok: false; statusCode: number; error: string }> {
  const provider = normalizeProvider(args.provider);
  if (!provider) {
    return { ok: false, statusCode: 400, error: "Unsupported provider." };
  }

  const rpcClient = args.supabaseService.schema("tongs") as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };

  const { data, error } = await rpcClient.rpc("disconnect_user_ai_key", {
    p_provider: provider,
    p_provider_account_id: readOptionalString(args.providerAccountId),
  });
  if (error) {
    return { ok: false, statusCode: 500, error: "Failed to disconnect AI key." };
  }

  const row = Array.isArray(data) ? data[0] : null;
  const normalized = normalizeStatusRecord(row);
  return { ok: true, status: normalized };
}

export async function getUserAiKeyStatus(args: {
  supabaseService: SupabaseClient<Database>;
  provider?: unknown;
}): Promise<{ ok: true; statuses: UserAiKeyStatusRecord[] } | { ok: false; statusCode: number; error: string }> {
  const normalizedProvider = args.provider == null ? null : normalizeProvider(args.provider);
  if (args.provider != null && !normalizedProvider) {
    return { ok: false, statusCode: 400, error: "Unsupported provider." };
  }

  const rpcClient = args.supabaseService.schema("tongs") as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };

  const { data, error } = await rpcClient.rpc("get_my_ai_key_status", {
    p_provider: normalizedProvider,
  });
  if (error) {
    return { ok: false, statusCode: 500, error: "Failed to fetch AI key status." };
  }

  const rows = Array.isArray(data) ? data : [];
  const statuses = rows
    .map((row) => normalizeStatusRecord(row))
    .filter((row): row is UserAiKeyStatusRecord => !!row);
  return { ok: true, statuses };
}
