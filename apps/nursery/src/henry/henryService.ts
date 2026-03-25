import type { HenryPreferenceState } from "@forge/shared/henry";
import { tongsSupabase } from "../lib/supabase";

export type HenryMessageStateRow = {
  messageId: string;
  lastSeenAt: string;
  lastDismissedAt: string | null;
  cooldownUntil: string | null;
  dismissCount: number;
  updatedAt: string;
};

export type HenryTelemetryEventName =
  | "launcher_click"
  | "panel_open"
  | "quick_action"
  | "next_step_shown"
  | "observation_shown"
  | "observation_dismissed"
  | "muted"
  | "freeform_asked"
  | "follow_through";

const unavailableRpcNames = new Set<string>();

function toErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function readErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown; statusCode?: unknown }).status
    ?? (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : null;
}

function isMissingRpcError(error: unknown): boolean {
  const code = readErrorCode(error);
  if (code === "PGRST202") return true;
  const status = readErrorStatus(error);
  if (status === 404) return true;
  const message = toErrorMessage(error, "");
  return /Could not find the function|schema cache|no matches were found|not found/i.test(message);
}

async function callHenryRpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: unknown }> {
  if (unavailableRpcNames.has(fn)) {
    return { data: null, error: { code: "PGRST202", message: `RPC ${fn} unavailable` } };
  }
  const rpc = tongsSupabase.rpc.bind(tongsSupabase) as unknown as (
    name: string,
    payload: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  try {
    const result = await rpc(fn, args);
    if (result.error && isMissingRpcError(result.error)) {
      unavailableRpcNames.add(fn);
    }
    return result;
  } catch (error) {
    if (isMissingRpcError(error)) {
      unavailableRpcNames.add(fn);
    }
    return { data: null, error };
  }
}

type PreferenceRpcRow = {
  show_henry?: unknown;
  hide_tips?: unknown;
  muted_until?: unknown;
  open_last_tab?: unknown;
};

type MessageStateRpcRow = {
  message_id?: unknown;
  last_seen_at?: unknown;
  last_dismissed_at?: unknown;
  cooldown_until?: unknown;
  dismiss_count?: unknown;
  updated_at?: unknown;
};

export async function getHenryPreferences(workspaceId: string): Promise<HenryPreferenceState | null> {
  const { data, error } = await callHenryRpc("get_my_henry_preferences", { p_workspace_id: workspaceId });
  if (error) {
    if (isMissingRpcError(error)) return null;
    throw new Error(toErrorMessage(error, "Failed loading Henry preferences."));
  }
  const row = Array.isArray(data) ? (data[0] as PreferenceRpcRow | undefined) : null;
  if (!row) return null;
  return {
    showHenry: row.show_henry !== false,
    hideTips: row.hide_tips === true,
    mutedUntil: typeof row.muted_until === "string" ? row.muted_until : null,
    openLastTab: row.open_last_tab === true,
  };
}

export async function upsertHenryPreferences(workspaceId: string, preferences: HenryPreferenceState): Promise<void> {
  const { error } = await callHenryRpc("upsert_my_henry_preferences", {
    p_workspace_id: workspaceId,
    p_show_henry: preferences.showHenry,
    p_hide_tips: preferences.hideTips,
    p_muted_until: preferences.mutedUntil,
    p_open_last_tab: preferences.openLastTab,
  });
  if (error) {
    if (isMissingRpcError(error)) return;
    throw new Error(toErrorMessage(error, "Failed saving Henry preferences."));
  }
}

export async function getHenryMessageState(workspaceId: string): Promise<Map<string, HenryMessageStateRow>> {
  const { data, error } = await callHenryRpc("get_my_henry_message_state", { p_workspace_id: workspaceId });
  if (error) {
    if (isMissingRpcError(error)) return new Map();
    throw new Error(toErrorMessage(error, "Failed loading Henry message state."));
  }
  const rows = Array.isArray(data) ? data as MessageStateRpcRow[] : [];
  const map = new Map<string, HenryMessageStateRow>();
  for (const row of rows) {
    const messageId = typeof row.message_id === "string" ? row.message_id : null;
    if (!messageId) continue;
    map.set(messageId, {
      messageId,
      lastSeenAt: typeof row.last_seen_at === "string" ? row.last_seen_at : new Date().toISOString(),
      lastDismissedAt: typeof row.last_dismissed_at === "string" ? row.last_dismissed_at : null,
      cooldownUntil: typeof row.cooldown_until === "string" ? row.cooldown_until : null,
      dismissCount: typeof row.dismiss_count === "number" ? row.dismiss_count : 0,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
    });
  }
  return map;
}

export async function upsertHenryMessageState(args: {
  workspaceId: string;
  messageId: string;
  lastSeenAt?: string;
  lastDismissedAt?: string | null;
  cooldownUntil?: string | null;
  incrementDismiss?: number;
}): Promise<void> {
  const { error } = await callHenryRpc("upsert_my_henry_message_state", {
    p_workspace_id: args.workspaceId,
    p_message_id: args.messageId,
    p_last_seen_at: args.lastSeenAt ?? new Date().toISOString(),
    p_last_dismissed_at: args.lastDismissedAt ?? null,
    p_cooldown_until: args.cooldownUntil ?? null,
    p_increment_dismiss: args.incrementDismiss ?? 0,
  });
  if (error) {
    if (isMissingRpcError(error)) return;
    throw new Error(toErrorMessage(error, "Failed saving Henry message state."));
  }
}

export async function trackHenryEvent(args: {
  workspaceId: string | null;
  workpieceId: string | null;
  eventName: HenryTelemetryEventName;
  surface: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!args.workspaceId) return;
  const { error } = await callHenryRpc("track_henry_event", {
    p_workspace_id: args.workspaceId,
    p_workpiece_id: args.workpieceId,
    p_event_name: args.eventName,
    p_surface: args.surface,
    p_metadata: args.metadata ?? {},
  });
  if (error) {
    if (isMissingRpcError(error)) return;
    // telemetry failures are intentionally non-fatal
    console.warn("[henry] telemetry event failed", args.eventName, error);
  }
}
