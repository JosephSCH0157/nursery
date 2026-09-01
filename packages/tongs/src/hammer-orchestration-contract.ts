export const HAMMER_PREP_STATUS_VALUES = ["idle", "preparing", "prepared", "prep_failed"] as const;
export type HammerPrepStatus = (typeof HAMMER_PREP_STATUS_VALUES)[number];

export const HAMMER_ALIGNMENT_STATUS_VALUES = ["not_started", "pending", "aligned", "needs_review"] as const;
export type HammerAlignmentStatus = (typeof HAMMER_ALIGNMENT_STATUS_VALUES)[number];

export const HAMMER_PASS_ID_VALUES = [
  "transcript_cleanup",
  "retakes",
  "gap_pacing",
  "visual_finishing",
  "image_placement",
  "image_animation",
  "audio_finalization",
  "packaging",
  "shorts",
  "ready",
] as const;
export type HammerPassId = (typeof HAMMER_PASS_ID_VALUES)[number];

export const HAMMER_PASS_STATE_VALUES = ["not_started", "in_progress", "completed"] as const;
export type HammerPassState = (typeof HAMMER_PASS_STATE_VALUES)[number];

export type HammerPassStatusMap = Partial<Record<HammerPassId, HammerPassState>>;

export const HAMMER_PASS_ORDER_VERSION = 3;

export interface HammerOrchestrationStateContract {
  prep_status: HammerPrepStatus;
  alignment_status: HammerAlignmentStatus;
  current_pass: HammerPassId;
  pass_order_version: number;
  pass_status: HammerPassStatusMap;
  edit_plan_signature: string | null;
  macro_recipe_ref: string | null;
  last_macro_run_ref: string | null;
}

const HAMMER_PREP_STATUS_SET = new Set<string>(HAMMER_PREP_STATUS_VALUES);
const HAMMER_ALIGNMENT_STATUS_SET = new Set<string>(HAMMER_ALIGNMENT_STATUS_VALUES);
const HAMMER_PASS_ID_SET = new Set<string>(HAMMER_PASS_ID_VALUES);
const HAMMER_PASS_STATE_SET = new Set<string>(HAMMER_PASS_STATE_VALUES);
const DEFAULT_HAMMER_PASS_ID = HAMMER_PASS_ID_VALUES[0];

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readPassState(value: unknown): HammerPassState | null {
  const normalized = readString(value)?.toLowerCase() ?? null;
  return normalized && HAMMER_PASS_STATE_SET.has(normalized)
    ? normalized as HammerPassState
    : null;
}

export function normalizeHammerPrepStatus(value: unknown): HammerPrepStatus {
  const normalized = readString(value)?.toLowerCase() ?? null;
  return normalized && HAMMER_PREP_STATUS_SET.has(normalized)
    ? normalized as HammerPrepStatus
    : "idle";
}

export function normalizeHammerAlignmentStatus(value: unknown): HammerAlignmentStatus {
  const normalized = readString(value)?.toLowerCase() ?? null;
  return normalized && HAMMER_ALIGNMENT_STATUS_SET.has(normalized)
    ? normalized as HammerAlignmentStatus
    : "not_started";
}

export function normalizeHammerPassId(value: unknown): HammerPassId {
  const normalized = readString(value)?.toLowerCase() ?? null;
  return normalized && HAMMER_PASS_ID_SET.has(normalized)
    ? normalized as HammerPassId
    : DEFAULT_HAMMER_PASS_ID;
}

export function normalizeHammerPassOrderVersion(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1
    ? value
    : HAMMER_PASS_ORDER_VERSION;
}

export function resolveDefaultHammerPassStatus(currentPass: HammerPassId): HammerPassStatusMap {
  const status: HammerPassStatusMap = {};
  for (const passId of HAMMER_PASS_ID_VALUES) {
    status[passId] = passId === currentPass ? "in_progress" : "not_started";
  }
  return status;
}

export function normalizeHammerPassStatusMap(
  value: unknown,
  currentPass: HammerPassId,
): HammerPassStatusMap {
  const fallback = resolveDefaultHammerPassStatus(currentPass);
  const row = readObject(value);
  if (!row) {
    return fallback;
  }

  const normalized: HammerPassStatusMap = { ...fallback };
  for (const passId of HAMMER_PASS_ID_VALUES) {
    const state = readPassState(row[passId]);
    if (state) {
      normalized[passId] = state;
    }
  }

  if (normalized[currentPass] === "not_started") {
    normalized[currentPass] = "in_progress";
  }

  return normalized;
}

export function normalizeHammerOrchestrationState(
  value: Partial<HammerOrchestrationStateContract> | Record<string, unknown> | null | undefined,
): HammerOrchestrationStateContract {
  const row = readObject(value);
  const currentPass = normalizeHammerPassId(row?.current_pass);

  return {
    prep_status: normalizeHammerPrepStatus(row?.prep_status),
    alignment_status: normalizeHammerAlignmentStatus(row?.alignment_status),
    current_pass: currentPass,
    pass_order_version: normalizeHammerPassOrderVersion(row?.pass_order_version),
    pass_status: normalizeHammerPassStatusMap(row?.pass_status, currentPass),
    edit_plan_signature: readString(row?.edit_plan_signature),
    macro_recipe_ref: readString(row?.macro_recipe_ref),
    last_macro_run_ref: readString(row?.last_macro_run_ref),
  };
}

export function cloneHammerOrchestrationState(
  value: Partial<HammerOrchestrationStateContract> | Record<string, unknown> | null | undefined,
): HammerOrchestrationStateContract {
  return normalizeHammerOrchestrationState(value);
}
