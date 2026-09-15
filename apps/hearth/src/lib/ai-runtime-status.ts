import type { HearthOwnerChatCapability } from "./hearth-ai-runtime-contract";

export type HearthAiBillingMode = "forge" | "byo";

export type HearthAiRuntimeStatus = {
  isAiProcessing: boolean;
  tokenBalance: number | null;
  billingMode: HearthAiBillingMode;
  ownerChatCapability: HearthOwnerChatCapability;
};

const STATUS_EVENT = "forge:ai:status";
const GLOBAL_STATUS_KEY = "__forgeAiRuntimeStatus";

type RuntimeWindow = Window & {
  [GLOBAL_STATUS_KEY]?: Partial<HearthAiRuntimeStatus>;
  __forgeAiInUse?: unknown;
  __forgeAiActive?: unknown;
  __forgeAiBillingMode?: unknown;
};

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeBillingMode(value: unknown): HearthAiBillingMode {
  return value === "byo" ? "byo" : "forge";
}

function normalizeOwnerChatCapability(value: unknown): HearthOwnerChatCapability {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { status: "checking", reasonCode: null };
  }
  const candidate = value as Partial<HearthOwnerChatCapability>;
  const status = candidate.status;
  if (
    status !== "checking"
    && status !== "not_required"
    && status !== "available"
    && status !== "unavailable"
    && status !== "unknown"
  ) {
    return { status: "checking", reasonCode: null };
  }
  const reasonCode = candidate.reasonCode === "owner_runtime_unavailable"
    || candidate.reasonCode === "owner_controls_unavailable"
    ? candidate.reasonCode
    : null;
  return { status, reasonCode };
}

export function readHearthAiRuntimeStatus(): HearthAiRuntimeStatus {
  if (typeof window === "undefined") {
    return {
      isAiProcessing: false,
      tokenBalance: null,
      billingMode: "forge",
      ownerChatCapability: { status: "checking", reasonCode: null },
    };
  }

  const w = window as RuntimeWindow;
  const root = w[GLOBAL_STATUS_KEY] ?? {};
  const tokenFromRoot = normalizeNumber(root.tokenBalance);
  const isAiProcessing = root.isAiProcessing === true;
  const billingMode = normalizeBillingMode(root.billingMode ?? w.__forgeAiBillingMode);
  const ownerChatCapability = normalizeOwnerChatCapability(root.ownerChatCapability);

  return {
    isAiProcessing,
    tokenBalance: tokenFromRoot,
    billingMode,
    ownerChatCapability,
  };
}

export function writeHearthAiRuntimeStatus(patch: Partial<HearthAiRuntimeStatus>): HearthAiRuntimeStatus {
  if (typeof window === "undefined") {
    return {
      isAiProcessing: patch.isAiProcessing === true,
      tokenBalance: normalizeNumber(patch.tokenBalance),
      billingMode: normalizeBillingMode(patch.billingMode),
      ownerChatCapability: normalizeOwnerChatCapability(patch.ownerChatCapability),
    };
  }

  const w = window as RuntimeWindow;
  const current = readHearthAiRuntimeStatus();
  const next: HearthAiRuntimeStatus = {
    isAiProcessing: patch.isAiProcessing ?? current.isAiProcessing,
    tokenBalance: patch.tokenBalance === undefined ? current.tokenBalance : normalizeNumber(patch.tokenBalance),
    billingMode: patch.billingMode === undefined ? current.billingMode : normalizeBillingMode(patch.billingMode),
    ownerChatCapability: patch.ownerChatCapability === undefined
      ? current.ownerChatCapability
      : normalizeOwnerChatCapability(patch.ownerChatCapability),
  };

  w[GLOBAL_STATUS_KEY] = next;
  w.__forgeAiInUse = next.isAiProcessing;
  w.__forgeAiActive = next.isAiProcessing;
  w.__forgeAiBillingMode = next.billingMode;

  try {
    window.dispatchEvent(new CustomEvent<HearthAiRuntimeStatus>(STATUS_EVENT, { detail: next }));
  } catch {
    // ignore event dispatch errors
  }

  return next;
}
