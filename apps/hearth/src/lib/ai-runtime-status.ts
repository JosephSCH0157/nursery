export type HearthAiBillingMode = "forge" | "byo";

export type HearthAiRuntimeStatus = {
  isAiProcessing: boolean;
  tokenBalance: number | null;
  billingMode: HearthAiBillingMode;
};

const STATUS_EVENT = "forge:ai:status";
const GLOBAL_STATUS_KEY = "__forgeAiRuntimeStatus";

type RuntimeWindow = Window & {
  [GLOBAL_STATUS_KEY]?: Partial<HearthAiRuntimeStatus>;
  __forgeAiTokenBalance?: unknown;
  __forgeAiTokens?: unknown;
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

export function readHearthAiRuntimeStatus(): HearthAiRuntimeStatus {
  if (typeof window === "undefined") {
    return {
      isAiProcessing: false,
      tokenBalance: null,
      billingMode: "forge",
    };
  }

  const w = window as RuntimeWindow;
  const root = w[GLOBAL_STATUS_KEY] ?? {};
  const tokenFromRoot = normalizeNumber(root.tokenBalance);
  const tokenFallback = normalizeNumber(w.__forgeAiTokenBalance ?? w.__forgeAiTokens);
  const isAiProcessing = root.isAiProcessing === true || w.__forgeAiInUse === true || w.__forgeAiActive === true;
  const billingMode = normalizeBillingMode(root.billingMode ?? w.__forgeAiBillingMode);

  return {
    isAiProcessing,
    tokenBalance: tokenFromRoot ?? tokenFallback,
    billingMode,
  };
}

export function writeHearthAiRuntimeStatus(patch: Partial<HearthAiRuntimeStatus>): HearthAiRuntimeStatus {
  if (typeof window === "undefined") {
    return {
      isAiProcessing: patch.isAiProcessing === true,
      tokenBalance: normalizeNumber(patch.tokenBalance),
      billingMode: normalizeBillingMode(patch.billingMode),
    };
  }

  const w = window as RuntimeWindow;
  const current = readHearthAiRuntimeStatus();
  const next: HearthAiRuntimeStatus = {
    isAiProcessing: patch.isAiProcessing ?? current.isAiProcessing,
    tokenBalance: patch.tokenBalance === undefined ? current.tokenBalance : normalizeNumber(patch.tokenBalance),
    billingMode: patch.billingMode === undefined ? current.billingMode : normalizeBillingMode(patch.billingMode),
  };

  w[GLOBAL_STATUS_KEY] = next;
  w.__forgeAiInUse = next.isAiProcessing;
  w.__forgeAiActive = next.isAiProcessing;
  w.__forgeAiTokenBalance = next.tokenBalance;
  w.__forgeAiTokens = next.tokenBalance;
  w.__forgeAiBillingMode = next.billingMode;

  try {
    window.dispatchEvent(new CustomEvent<HearthAiRuntimeStatus>(STATUS_EVENT, { detail: next }));
  } catch {
    // ignore event dispatch errors
  }

  return next;
}
