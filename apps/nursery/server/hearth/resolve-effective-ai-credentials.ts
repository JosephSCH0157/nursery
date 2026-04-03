import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@forge/tongs";
import { decryptUserAiKey } from "../../../../packages/tongs/src/server/ai-key-crypto";
import type { BillingMode } from "../ai-usage-accounting";
import type { AiDecisionType, AiFundingSource, AiReasonCode, EffectiveAiKeySource, KeyResolutionStatus } from "../../../../packages/tongs/src/ai-policy";

export type PolicyDecisionSnapshot = {
  decisionType: AiDecisionType;
  reasonCode: AiReasonCode | null;
  selectedFundingSource: AiFundingSource | null;
  effectiveAiKeySource: EffectiveAiKeySource;
  keyResolutionStatus: KeyResolutionStatus;
};

export class MissingUserKeyError extends Error {
  constructor(message = "A connected BYO key is required for this request.") {
    super(message);
    this.name = "MissingUserKeyError";
  }
}

export class MissingForgeKeyError extends Error {
  constructor(message = "Missing OPENAI_TEXT_API_KEY (or OPENAI_API_KEY) in server env") {
    super(message);
    this.name = "MissingForgeKeyError";
  }
}

export class PolicyDeniedError extends Error {
  readonly keyResolutionStatus: KeyResolutionStatus;
  readonly reasonCode: AiReasonCode | null;

  constructor(args: {
    message: string;
    keyResolutionStatus: KeyResolutionStatus;
    reasonCode: AiReasonCode | null;
  }) {
    super(args.message);
    this.name = "PolicyDeniedError";
    this.keyResolutionStatus = args.keyResolutionStatus;
    this.reasonCode = args.reasonCode;
  }
}

type UserAiKeyResolutionRow = {
  encrypted_api_key?: unknown;
  status?: unknown;
};

export type EffectiveAiCredentials = {
  provider: "openai";
  keySource: EffectiveAiKeySource;
  keyResolutionStatus: KeyResolutionStatus;
  apiKey: string;
  billingLane: BillingMode;
  attribution: {
    requestedLane: BillingMode;
    effectiveLane: BillingMode;
  };
};

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function fetchUserKeyCiphertext(args: {
  supabaseService: SupabaseClient<Database>;
  userId: string;
  provider: "openai";
}): Promise<string | null> {
  const rpcClient = args.supabaseService.schema("tongs") as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await rpcClient.rpc("get_user_ai_key_for_resolution", {
    p_user_id: args.userId,
    p_provider: args.provider,
    p_provider_account_id: null,
  });
  if (error) {
    throw new Error("Failed resolving BYO key for request.");
  }
  const row = (Array.isArray(data) ? data[0] : null) as UserAiKeyResolutionRow | null;
  if (!row) return null;
  const status = readOptionalString(row.status);
  if (status !== "active") return null;
  return readOptionalString(row.encrypted_api_key);
}

export async function resolveEffectiveAiCredentials(args: {
  requestedLane: BillingMode;
  provider: "openai";
  forgeManagedApiKey: string | null;
  userId: string | null;
  supabaseService: SupabaseClient<Database> | null;
  disableUserKeys: boolean;
  policyDecision?: PolicyDecisionSnapshot | null;
}): Promise<EffectiveAiCredentials> {
  if (args.provider !== "openai") {
    return Promise.reject(new Error("Unsupported AI provider."));
  }

  const forceForgeLane = args.disableUserKeys;
  const requiredKeySource: EffectiveAiKeySource = forceForgeLane
    ? "forge_managed"
    : (args.policyDecision?.effectiveAiKeySource ?? (args.requestedLane === "byo" ? "user_byo" : "forge_managed"));

  if (args.policyDecision && args.policyDecision.decisionType !== "ALLOW") {
    throw new PolicyDeniedError({
      message: "AI policy denied this request.",
      keyResolutionStatus: args.policyDecision.keyResolutionStatus,
      reasonCode: args.policyDecision.reasonCode,
    });
  }

  if (requiredKeySource === "forge_managed") {
    if (!args.forgeManagedApiKey) {
      throw new MissingForgeKeyError();
    }
    return {
      provider: "openai",
      keySource: "forge_managed",
      keyResolutionStatus: "available",
      apiKey: args.forgeManagedApiKey,
      billingLane: "forge",
      attribution: {
        requestedLane: args.requestedLane,
        effectiveLane: "forge",
      },
    };
  }
  if (requiredKeySource === "org_shared") {
    throw new PolicyDeniedError({
      message: "Organization shared key source is not supported in this runtime.",
      keyResolutionStatus: "provider_not_supported",
      reasonCode: args.policyDecision?.reasonCode ?? null,
    });
  }

  if (!args.userId || !args.supabaseService) {
    if (!args.forgeManagedApiKey) {
      throw new MissingForgeKeyError();
    }
    return {
      provider: "openai",
      keySource: "forge_managed",
      keyResolutionStatus: "missing_required_key",
      apiKey: args.forgeManagedApiKey,
      billingLane: "byo",
      attribution: {
        requestedLane: args.requestedLane,
        effectiveLane: "byo",
      },
    };
  }

  const encrypted = await fetchUserKeyCiphertext({
    supabaseService: args.supabaseService,
    userId: args.userId,
    provider: "openai",
  });
  if (!encrypted) {
    throw new MissingUserKeyError();
  }

  let apiKey: string;
  try {
    apiKey = decryptUserAiKey(encrypted);
  } catch {
    throw new MissingUserKeyError("Stored BYO key is invalid. Reconnect your key.");
  }

  return {
    provider: "openai",
    keySource: "user_byo",
    keyResolutionStatus: "available",
    apiKey,
    billingLane: "byo",
    attribution: {
      requestedLane: args.requestedLane,
      effectiveLane: "byo",
    },
  };
}
