export type AiLane = "forge" | "byo";
export type AiProvider = "openai";
export type AiBehavior = "fast" | "careful" | "deterministic" | "creative";
export type AiPolicyTestOverride = "rpc" | "allow" | "soft_deny" | "hard_deny";

export type AiSettings = {
  lane: AiLane;
  provider: AiProvider;
  behavior: AiBehavior;
  autoApproveImageSpend: boolean;
  policyTestOverride: AiPolicyTestOverride;
  byoKey?: string;
};

const LS_KEY = "forge:hearth:aiSettings:v1";

const DEFAULTS: AiSettings = {
  lane: "forge",
  provider: "openai",
  behavior: "careful",
  autoApproveImageSpend: false,
  policyTestOverride: "rpc",
};

function readStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, value);
  } catch {
    // ignore
  }
}

function emitSettingsEvent(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("forge:ai:settings"));
  } catch {
    // ignore
  }
}

export function loadAiSettings(): AiSettings {
  try {
    const raw = readStorage();
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AiSettings> & { byoKey?: unknown };
    return {
      lane: parsed.lane === "byo" ? "byo" : "forge",
      provider: "openai",
      behavior:
        parsed.behavior === "fast" ||
        parsed.behavior === "deterministic" ||
        parsed.behavior === "creative"
          ? parsed.behavior
          : "careful",
      autoApproveImageSpend: parsed.autoApproveImageSpend === true,
      policyTestOverride:
        parsed.policyTestOverride === "allow"
        || parsed.policyTestOverride === "soft_deny"
        || parsed.policyTestOverride === "hard_deny"
          ? parsed.policyTestOverride
          : "rpc",
      byoKey: typeof parsed.byoKey === "string" ? parsed.byoKey : undefined,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveAiSettings(next: AiSettings): void {
  writeStorage(JSON.stringify(next));
  emitSettingsEvent();
}

export function clearByoKey(): void {
  const cur = loadAiSettings();
  saveAiSettings({ ...cur, byoKey: undefined });
}

export function hasByoKey(): boolean {
  const cur = loadAiSettings();
  return cur.lane === "byo" && !!cur.byoKey?.trim();
}
