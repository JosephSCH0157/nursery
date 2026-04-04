import { resolveAiPolicy } from "@forge/tongs/ai-policy";
import { loadAiSettings } from "../hearth/ai-settings";
import { supabase, tongsSupabase } from "../supabase";

export type HammerPrepAiEffectiveLane = "forge-managed" | "personal-byo" | "ai-disabled";
export type HammerPrepAiNoticeResolutionState = "loading" | "ready" | "error";

type ProfilesRow = {
  settings: unknown;
};

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readAckLaneSignature(settings: unknown): string | null {
  const root = readObject(settings);
  const hammer = readObject(root?.hammer);
  const prepNotice = readObject(hammer?.prep_ai_notice);
  return readString(prepNotice?.acknowledged_lane);
}

function mergeAckLaneSignature(settings: unknown, laneSignature: string): Record<string, unknown> {
  const root = readObject(settings) ?? {};
  const hammer = readObject(root.hammer) ?? {};
  const prepNotice = readObject(hammer.prep_ai_notice) ?? {};
  return {
    ...root,
    hammer: {
      ...hammer,
      prep_ai_notice: {
        ...prepNotice,
        acknowledged_lane: laneSignature,
        updated_at: new Date().toISOString(),
      },
    },
  };
}

async function resolveOrgIdForWorkspace(workspaceId: string | null): Promise<string | null> {
  if (!workspaceId) return null;
  const { data, error } = await tongsSupabase
    .from("workspaces")
    .select("org_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) return null;
  return readString(data?.org_id);
}

export async function resolveHammerPrepAiEffectiveLane(
  workspaceId: string | null,
): Promise<HammerPrepAiEffectiveLane> {
  const settings = loadAiSettings();
  const hasByoConfigured = Boolean(settings.byoKey?.trim());
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user?.id) {
    return settings.lane === "byo" && hasByoConfigured
      ? "personal-byo"
      : "forge-managed";
  }

  const orgId = await resolveOrgIdForWorkspace(workspaceId);
  const policy = await resolveAiPolicy(tongsSupabase, {
    orgId,
    workspaceId,
    userId: authData.user.id,
    tool: "hammer",
    feature: "heavy_tasks",
    action: "stt",
    requestedMode: settings.lane === "byo" ? "PERSONAL_ONLY" : "ORG_FIRST_PERSONAL_FALLBACK",
    personalAiConfigured: hasByoConfigured,
    orgAiAvailable: settings.lane !== "byo",
    requestedFundingSource: settings.lane === "byo" ? "personal_byo_key" : "org_shared_credits",
    writeLedger: false,
  });

  if (policy.decisionType !== "ALLOW") {
    return "ai-disabled";
  }

  if (policy.effectiveAiKeySource === "user_byo") {
    return "personal-byo";
  }

  return "forge-managed";
}

export async function loadHammerPrepAiNoticeAcknowledgedLane(): Promise<string | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user?.id) return null;

  const { data, error } = await tongsSupabase
    .from("profiles")
    .select("settings")
    .eq("user_id", authData.user.id)
    .maybeSingle<ProfilesRow>();
  if (error) {
    throw new Error(error.message || "Failed loading Hammer prep AI notice preference.");
  }
  return readAckLaneSignature(data?.settings);
}

export async function saveHammerPrepAiNoticeAcknowledgedLane(
  laneSignature: string,
): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user?.id) {
    throw new Error("Sign in required to save Hammer prep AI notice preference.");
  }
  const user = authData.user;
  await tongsSupabase.rpc("ensure_profile_for_user", {
    p_user_id: user.id,
    p_email: user.email ?? null,
  });

  const { data: profileRow, error: readError } = await tongsSupabase
    .from("profiles")
    .select("settings")
    .eq("user_id", user.id)
    .single<ProfilesRow>();
  if (readError) {
    throw new Error(readError.message || "Failed loading profile settings.");
  }

  const nextSettings = mergeAckLaneSignature(profileRow?.settings, laneSignature);
  const { error: updateError } = await tongsSupabase
    .from("profiles")
    .update({ settings: nextSettings })
    .eq("user_id", user.id);
  if (updateError) {
    throw new Error(updateError.message || "Failed saving Hammer prep AI notice preference.");
  }
}
