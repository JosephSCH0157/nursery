import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getAiReasonMessage,
  type AiDecisionType,
  type AiReasonCode,
} from "@forge/tongs/ai-policy";

type AnyRecord = Record<string, unknown>;

type SessionUser = {
  label: "founder" | "studio" | "free";
  userId: string;
  email: string;
  password: string;
  accessToken: string;
  client: SupabaseClient;
};

type ResolverCase = {
  key: string;
  user: SessionUser;
  tool?: "hearth" | "hammer" | "quench";
  action: "chat" | "stt";
  feature: "research_flows" | "heavy_tasks";
  orgId: string | null;
  workspaceId: string | null;
  requestedMode: "ORG_ONLY" | "PERSONAL_ONLY" | "ORG_FIRST_PERSONAL_FALLBACK" | null;
  personalAiConfigured: boolean;
  orgAiAvailable: boolean;
  requestedFundingSource:
    | "org_shared_credits"
    | "org_byo_key"
    | "personal_byo_key"
    | "personal_credits"
    | null;
  expectedDecision: AiDecisionType;
  expectedReasonCode: AiReasonCode | null;
  expectedFallbackUsed: boolean;
};

type ResolverRow = {
  decision_type: AiDecisionType;
  reason_code: AiReasonCode | null;
  selected_funding_source: string | null;
  fallback_available: boolean;
  fallback_used: boolean;
  effective_policy_snapshot: AnyRecord;
};

type LedgerRow = {
  request_id: string | null;
  user_id: string;
  org_id: string | null;
  workspace_id: string | null;
  tool: string;
  feature: string | null;
  action: string | null;
  decision_type: AiDecisionType;
  reason_code: string | null;
  funding_source: string | null;
  fallback_available: boolean;
  fallback_used: boolean;
  effective_policy_snapshot: AnyRecord;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return out;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

function fail(message: string): never {
  throw new Error(message);
}

function pass(label: string, detail?: string): void {
  console.log(`PASS ${label}${detail ? ` :: ${detail}` : ""}`);
}

function info(label: string, detail?: string): void {
  console.log(`INFO ${label}${detail ? ` :: ${detail}` : ""}`);
}

function mapHearthLaneToRequestedMode(lane: "forge" | "byo"): "ORG_FIRST_PERSONAL_FALLBACK" | "PERSONAL_ONLY" {
  return lane === "byo" ? "PERSONAL_ONLY" : "ORG_FIRST_PERSONAL_FALLBACK";
}

function mapHearthLaneToFundingSource(lane: "forge" | "byo"): "org_shared_credits" | "personal_byo_key" {
  return lane === "byo" ? "personal_byo_key" : "org_shared_credits";
}

function toHearthPolicyMessage(
  reasonCode: AiReasonCode | null,
  decisionType: AiDecisionType,
  lane: "forge" | "byo",
): string {
  const base = reasonCode ? getAiReasonMessage(reasonCode) : "AI action blocked by policy.";
  if (decisionType === "SOFT_DENY" && lane !== "byo") {
    return `${base} Switch AI lane to BYO in Hearth settings and try again.`;
  }
  return base;
}

function toHammerPolicyMessage(
  reasonCode: AiReasonCode | null,
  decisionType: AiDecisionType,
): string {
  const base = reasonCode ? getAiReasonMessage(reasonCode) : "AI action blocked by policy.";
  if (decisionType === "SOFT_DENY") {
    return `${base} Configure a personal AI connection and retry.`;
  }
  return base;
}

function toQuenchPolicyMessage(
  reasonCode: AiReasonCode | null,
  decisionType: AiDecisionType,
): string {
  const base = reasonCode ? getAiReasonMessage(reasonCode) : "AI action blocked by policy.";
  if (decisionType === "SOFT_DENY") {
    return `${base} Configure a personal AI connection and retry.`;
  }
  return base;
}

function expectUuid(value: string | null, label: string): string {
  if (!value) fail(`${label} is missing`);
  return value;
}

async function createSessionUser(args: {
  admin: SupabaseClient;
  anonKey: string;
  supabaseUrl: string;
  label: SessionUser["label"];
  createdUserIds: string[];
}): Promise<SessionUser> {
  const email = `slice-c-${args.label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const password = `P@ss-${crypto.randomUUID()}!`;

  const created = await args.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { slice: "c", role: args.label },
  });
  if (created.error || !created.data.user?.id) {
    fail(`Failed to create ${args.label} user: ${created.error?.message ?? "unknown error"}`);
  }

  const userId = created.data.user.id;
  args.createdUserIds.push(userId);

  const client = createClient(args.supabaseUrl, args.anonKey, {
    db: { schema: "tongs" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session?.access_token) {
    fail(`Failed to sign in ${args.label}: ${signedIn.error?.message ?? "unknown error"}`);
  }

  return {
    label: args.label,
    userId,
    email,
    password,
    accessToken: signedIn.data.session.access_token,
    client,
  };
}

async function resolveCase(args: {
  actingClient: SupabaseClient;
  c: ResolverCase;
  requestId: string;
}): Promise<ResolverRow> {
  const { data, error } = await args.actingClient.rpc("resolve_ai_access_policy", {
    p_org_id: args.c.orgId,
    p_workspace_id: args.c.workspaceId,
    p_user_id: args.c.user.userId,
    p_tool: args.c.tool ?? "hearth",
    p_feature: args.c.feature,
    p_action: args.c.action,
    p_requested_mode: args.c.requestedMode,
    p_personal_ai_configured: args.c.personalAiConfigured,
    p_org_ai_available: args.c.orgAiAvailable,
    p_requested_funding_source: args.c.requestedFundingSource,
    p_request_id: args.requestId,
    p_write_ledger: true,
  });

  if (error) {
    fail(`resolve_ai_access_policy failed for ${args.c.key}: ${error.message}`);
  }

  const row = Array.isArray(data) ? (data[0] as ResolverRow | undefined) : undefined;
  if (!row) {
    fail(`resolve_ai_access_policy returned no row for ${args.c.key}`);
  }
  return row;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const env = {
    ...parseEnvFile(path.join(root, "apps/nursery/.env")),
    ...parseEnvFile(path.join(root, "apps/nursery/.env.local")),
    ...parseEnvFile(path.join(root, ".env")),
    ...parseEnvFile(path.join(root, ".env.local")),
    ...process.env,
  };

  const supabaseUrl = readString(env.VITE_SUPABASE_URL) ?? readString(env.SUPABASE_URL);
  const anonKey = readString(env.VITE_SUPABASE_ANON_KEY) ?? readString(env.SUPABASE_ANON_KEY);
  const serviceRoleKey = readString(env.TONGS_SERVICE_ROLE_KEY) ?? readString(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl) fail("Missing VITE_SUPABASE_URL or SUPABASE_URL");
  if (!anonKey) fail("Missing VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY");
  if (!serviceRoleKey) fail("Missing TONGS_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: "tongs" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const createdUserIds: string[] = [];
  const createdWorkspaceIds: string[] = [];
  const createdOrgIds: string[] = [];

  let founder: SessionUser | null = null;
  let studio: SessionUser | null = null;
  let free: SessionUser | null = null;

  try {
    founder = await createSessionUser({
      admin,
      anonKey,
      supabaseUrl,
      label: "founder",
      createdUserIds,
    });
    studio = await createSessionUser({
      admin,
      anonKey,
      supabaseUrl,
      label: "studio",
      createdUserIds,
    });
    free = await createSessionUser({
      admin,
      anonKey,
      supabaseUrl,
      label: "free",
      createdUserIds,
    });

    const workspaceName = `Slice C Policy ${Date.now()}`;
    const createdWorkspace = await founder.client
      .rpc("create_workspace_with_owner", { _name: workspaceName })
      .single();
    if (createdWorkspace.error || !createdWorkspace.data?.id) {
      fail(`create_workspace_with_owner failed: ${createdWorkspace.error?.message ?? "unknown error"}`);
    }
    const workspaceId = createdWorkspace.data.id;
    createdWorkspaceIds.push(workspaceId);

    const orgLookup = await admin
      .from("workspaces")
      .select("org_id")
      .eq("id", workspaceId)
      .single<{ org_id: string }>();
    if (orgLookup.error) {
      fail(`Failed to resolve org_id for workspace: ${orgLookup.error.message}`);
    }
    const orgId = expectUuid(readString(orgLookup.data?.org_id), "org_id");
    createdOrgIds.push(orgId);

    const upsertOrgMember = async (userId: string, orgRole: "owner" | "admin" | "member") => {
      const { error } = await admin.from("org_members").upsert({
        org_id: orgId,
        user_id: userId,
        org_role: orgRole,
        created_by: founder?.userId,
      });
      if (error) fail(`org_members upsert failed (${orgRole}): ${error.message}`);
    };
    const upsertWorkspaceMember = async (userId: string, role: "owner" | "editor" | "viewer") => {
      const { error } = await admin.from("workspace_members").upsert({
        workspace_id: workspaceId,
        user_id: userId,
        role,
        created_by: founder?.userId,
      });
      if (error) fail(`workspace_members upsert failed (${role}): ${error.message}`);
    };

    await upsertOrgMember(studio.userId, "admin");
    await upsertOrgMember(free.userId, "member");
    await upsertWorkspaceMember(studio.userId, "editor");
    await upsertWorkspaceMember(free.userId, "viewer");

    let founderEntitlementSeeded = false;
    {
      const founderPlanLookup = await admin
        .schema("public")
        .from("plans")
        .select("id")
        .order("is_active", { ascending: false })
        .order("is_public", { ascending: false })
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle<{ id: string }>();
      const founderPlanId = readString(founderPlanLookup.data?.id);
      if (founderPlanLookup.error) {
        fail(`Failed to resolve public.plans seed row: ${founderPlanLookup.error.message}`);
      }
      if (!founderPlanId) {
        fail("Failed to resolve public.plans seed row: no plan id available for founder seeding.");
      }

      const founderFromUserPlans = await admin
        .schema("public")
        .from("user_plans")
        .upsert(
          {
            user_id: founder.userId,
            plan_id: founderPlanId,
            is_founder: true,
            status: "active",
          } as AnyRecord,
          { onConflict: "user_id" },
        );
      if (!founderFromUserPlans.error) {
        founderEntitlementSeeded = true;
        info("Seed founder", "public.user_plans path applied");
      } else {
        info("Seed founder", `public.user_plans unavailable: ${founderFromUserPlans.error.message}`);
      }

      if (!founderEntitlementSeeded) {
        const founderFromPublicBalance = await admin
          .schema("public")
          .from("account_balances")
          .upsert(
            {
              user_id: founder.userId,
              founders_club: true,
            } as AnyRecord,
            { onConflict: "user_id" },
          );
        if (!founderFromPublicBalance.error) {
          founderEntitlementSeeded = true;
          info("Seed founder", "public.account_balances.founders_club path applied");
        } else {
          info(
            "Seed founder",
            `public.account_balances.founders_club unavailable: ${founderFromPublicBalance.error.message}`,
          );
        }
      }
    }

    const seedBalances = async (userId: string, planItemId: string | null) => {
      const { error } = await admin.from("account_balances").upsert({
        user_id: userId,
        plan_item_id: planItemId,
      });
      if (error) fail(`Failed to seed account_balances (${planItemId ?? "null"}): ${error.message}`);
    };
    await seedBalances(founder.userId, null);
    await seedBalances(studio.userId, "studio");
    await seedBalances(free.userId, null);

    // One org policy row (enabled defaults + fallback allowed)
    {
      const { error } = await admin.from("organization_ai_policy").upsert({
        org_id: orgId,
        shared_org_ai_enabled: true,
        member_byo_allowed: true,
        fallback_allowed: true,
        default_mode: "ORG_FIRST_PERSONAL_FALLBACK",
      });
      if (error) fail(`Failed to seed organization_ai_policy: ${error.message}`);
    }

    // Three member policy rows: allow, soft-deny (recoverable), hard-deny
    {
      const { error } = await admin.from("member_ai_policy").upsert([
        {
          org_id: orgId,
          user_id: founder.userId,
          ai_enabled: true,
          mode_override: "ORG_FIRST_PERSONAL_FALLBACK",
        },
        {
          org_id: orgId,
          user_id: studio.userId,
          ai_enabled: true,
          mode_override: "PERSONAL_ONLY",
        },
        {
          org_id: orgId,
          user_id: free.userId,
          ai_enabled: false,
          mode_override: "ORG_FIRST_PERSONAL_FALLBACK",
        },
      ]);
      if (error) fail(`Failed to seed member_ai_policy rows: ${error.message}`);
    }

    info("Seed", "Tiny real policy dataset created (founder/free/studio + org/member policy rows)");

    const entitlementChecks: Array<{
      user: SessionUser;
      expectFounder: boolean;
      expectStudio: boolean;
    }> = [
      { user: founder, expectFounder: founderEntitlementSeeded, expectStudio: false },
      { user: studio, expectFounder: false, expectStudio: true },
      { user: free, expectFounder: false, expectStudio: false },
    ];

    for (const check of entitlementChecks) {
      const rpc = await check.user.client.rpc("resolve_membership_entitlement", {
        p_user_id: check.user.userId,
        p_org_id: orgId,
        p_workspace_id: workspaceId,
      });
      if (rpc.error) fail(`resolve_membership_entitlement failed (${check.user.label}): ${rpc.error.message}`);
      const row = Array.isArray(rpc.data) ? (rpc.data[0] as AnyRecord | undefined) : undefined;
      if (!row) fail(`resolve_membership_entitlement returned no row (${check.user.label})`);

      const founderEntitled = row.is_founder_entitled === true;
      const studioEntitled = row.is_studio_entitled === true;
      if (founderEntitled !== check.expectFounder) {
        fail(`${check.user.label} founder entitlement mismatch: expected ${check.expectFounder}, got ${founderEntitled}`);
      }
      if (studioEntitled !== check.expectStudio) {
        fail(`${check.user.label} studio entitlement mismatch: expected ${check.expectStudio}, got ${studioEntitled}`);
      }
      pass(`Entitlement ${check.user.label}`, `founder=${founderEntitled} studio=${studioEntitled}`);
    }

    const cases: ResolverCase[] = [
      {
        key: "allow-personal-free",
        user: free,
        action: "chat",
        feature: "research_flows",
        orgId,
        workspaceId,
        requestedMode: "PERSONAL_ONLY",
        personalAiConfigured: true,
        orgAiAvailable: false,
        requestedFundingSource: "personal_byo_key",
        expectedDecision: "ALLOW",
        expectedReasonCode: null,
        expectedFallbackUsed: false,
      },
      {
        key: "allow-org-studio",
        user: studio,
        action: "chat",
        feature: "research_flows",
        orgId,
        workspaceId,
        requestedMode: "ORG_ONLY",
        personalAiConfigured: false,
        orgAiAvailable: true,
        requestedFundingSource: "org_shared_credits",
        expectedDecision: "ALLOW",
        expectedReasonCode: null,
        expectedFallbackUsed: false,
      },
      {
        key: "soft-deny-recoverable-studio-no-personal",
        user: studio,
        action: "stt",
        feature: "heavy_tasks",
        orgId,
        workspaceId,
        requestedMode: "PERSONAL_ONLY",
        personalAiConfigured: false,
        orgAiAvailable: false,
        requestedFundingSource: "personal_byo_key",
        expectedDecision: "SOFT_DENY",
        expectedReasonCode: "PERSONAL_AI_REQUIRED_NOT_CONFIGURED",
        expectedFallbackUsed: false,
      },
      {
        key: "hard-deny-free-org-only",
        user: free,
        action: "stt",
        feature: "heavy_tasks",
        orgId,
        workspaceId,
        requestedMode: "ORG_ONLY",
        personalAiConfigured: false,
        orgAiAvailable: true,
        requestedFundingSource: "org_shared_credits",
        expectedDecision: "HARD_DENY",
        expectedReasonCode: "MEMBERSHIP_REQUIRED_STUDIO_OR_FOUNDER",
        expectedFallbackUsed: false,
      },
      {
        key: "context-no-workspace-org-still-allows-personal",
        user: founder,
        action: "chat",
        feature: "research_flows",
        orgId: null,
        workspaceId: null,
        requestedMode: "PERSONAL_ONLY",
        personalAiConfigured: true,
        orgAiAvailable: false,
        requestedFundingSource: "personal_byo_key",
        expectedDecision: "ALLOW",
        expectedReasonCode: null,
        expectedFallbackUsed: false,
      },
      {
        key: "context-workspace-present-founder-org-allow",
        user: founder,
        action: "chat",
        feature: "research_flows",
        orgId,
        workspaceId,
        requestedMode: "ORG_FIRST_PERSONAL_FALLBACK",
        personalAiConfigured: false,
        orgAiAvailable: true,
        requestedFundingSource: "org_shared_credits",
        expectedDecision: "ALLOW",
        expectedReasonCode: null,
        expectedFallbackUsed: false,
      },
    ];

    for (const c of cases) {
      const requestId = `slice-c-${c.key}-${crypto.randomUUID()}`;
      const resolved = await resolveCase({
        actingClient: c.user.client,
        c,
        requestId,
      });

      if (resolved.decision_type !== c.expectedDecision) {
        fail(`${c.key} decision mismatch: expected ${c.expectedDecision}, got ${resolved.decision_type}`);
      }
      const reasonCode = (readString(resolved.reason_code) ?? null) as AiReasonCode | null;
      if (reasonCode !== c.expectedReasonCode) {
        fail(`${c.key} reason mismatch: expected ${c.expectedReasonCode ?? "null"}, got ${reasonCode ?? "null"}`);
      }
      if (Boolean(resolved.fallback_used) !== c.expectedFallbackUsed) {
        fail(`${c.key} fallback_used mismatch`);
      }
      if (!resolved.effective_policy_snapshot || typeof resolved.effective_policy_snapshot !== "object") {
        fail(`${c.key} missing effective_policy_snapshot object`);
      }

      const ledgerLookup = await admin
        .from("ai_usage_ledger")
        .select("request_id,user_id,org_id,workspace_id,tool,feature,action,decision_type,reason_code,funding_source,fallback_available,fallback_used,effective_policy_snapshot")
        .eq("request_id", requestId)
        .single<LedgerRow>();
      if (ledgerLookup.error || !ledgerLookup.data) {
        fail(`${c.key} missing ai_usage_ledger row for request_id=${requestId}`);
      }
      const ledger = ledgerLookup.data;
      if (ledger.decision_type !== c.expectedDecision) {
        fail(`${c.key} ledger decision mismatch`);
      }
      if ((readString(ledger.reason_code) ?? null) !== c.expectedReasonCode) {
        fail(`${c.key} ledger reason mismatch`);
      }
      if (!ledger.effective_policy_snapshot || typeof ledger.effective_policy_snapshot !== "object") {
        fail(`${c.key} ledger effective_policy_snapshot missing/object mismatch`);
      }

      pass(
        `Resolver ${c.key}`,
        `decision=${resolved.decision_type} reason=${reasonCode ?? "null"} funding=${resolved.selected_funding_source ?? "null"}`,
      );
    }

    // Hearth-aligned policy preflight verification (chat + stt, forge + byo).
    const hearthCases: Array<{
      key: string;
      user: SessionUser;
      lane: "forge" | "byo";
      action: "chat" | "stt";
      feature: "research_flows" | "heavy_tasks";
      workspaceId: string | null;
      expectedDecision: AiDecisionType;
      expectedReason: AiReasonCode | null;
    }> = [
      {
        key: "hearth-chat-forge-allow-founder",
        user: founder,
        lane: "forge",
        action: "chat",
        feature: "research_flows",
        workspaceId,
        expectedDecision: "ALLOW",
        expectedReason: null,
      },
      {
        key: "hearth-chat-forge-hard-deny-free",
        user: free,
        lane: "forge",
        action: "chat",
        feature: "research_flows",
        workspaceId,
        expectedDecision: "HARD_DENY",
        expectedReason: "MEMBERSHIP_REQUIRED_STUDIO_OR_FOUNDER",
      },
      {
        key: "hearth-stt-byo-allow-studio",
        user: studio,
        lane: "byo",
        action: "stt",
        feature: "heavy_tasks",
        workspaceId,
        expectedDecision: "ALLOW",
        expectedReason: null,
      },
      {
        key: "hearth-stt-forge-hard-deny-free",
        user: free,
        lane: "forge",
        action: "stt",
        feature: "heavy_tasks",
        workspaceId,
        expectedDecision: "HARD_DENY",
        expectedReason: "MEMBERSHIP_REQUIRED_STUDIO_OR_FOUNDER",
      },
    ];

    for (const c of hearthCases) {
      const requestId = `slice-c-hearth-${c.key}-${crypto.randomUUID()}`;
      const resolved = await resolveCase({
        actingClient: c.user.client,
        c: {
          key: c.key,
          user: c.user,
          action: c.action,
          feature: c.feature,
          orgId,
          workspaceId: c.workspaceId,
          requestedMode: mapHearthLaneToRequestedMode(c.lane),
          personalAiConfigured: c.lane === "byo",
          orgAiAvailable: c.lane !== "byo",
          requestedFundingSource: mapHearthLaneToFundingSource(c.lane),
          expectedDecision: c.expectedDecision,
          expectedReasonCode: c.expectedReason,
          expectedFallbackUsed: false,
        },
        requestId,
      });

      const reasonCode = (readString(resolved.reason_code) ?? null) as AiReasonCode | null;
      if (resolved.decision_type !== c.expectedDecision) {
        fail(`${c.key} hearth-preflight decision mismatch`);
      }
      if (reasonCode !== c.expectedReason) {
        fail(`${c.key} hearth-preflight reason mismatch`);
      }

      if (resolved.decision_type === "ALLOW") {
        pass(`${c.key} hearth behavior`, "allowed -> request can proceed");
      } else {
        const message = toHearthPolicyMessage(reasonCode, resolved.decision_type, c.lane);
        if (!message || message.length < 8) {
          fail(`${c.key} hearth deny message mapping invalid`);
        }
        pass(`${c.key} hearth behavior`, `blocked -> ${resolved.decision_type} (${reasonCode ?? "no_code"})`);
      }
    }

    // Hammer transcript-preflight aligned verification.
    const hammerCases: Array<{
      key: string;
      user: SessionUser;
      action: "stt";
      feature: "heavy_tasks";
      workspaceId: string | null;
      expectedDecision: AiDecisionType;
      expectedReason: AiReasonCode | null;
    }> = [
      {
        key: "hammer-transcript-allow-founder",
        user: founder,
        action: "stt",
        feature: "heavy_tasks",
        workspaceId,
        expectedDecision: "ALLOW",
        expectedReason: null,
      },
      {
        key: "hammer-transcript-allow-studio",
        user: studio,
        action: "stt",
        feature: "heavy_tasks",
        workspaceId,
        expectedDecision: "ALLOW",
        expectedReason: null,
      },
      {
        key: "hammer-transcript-hard-deny-free",
        user: free,
        action: "stt",
        feature: "heavy_tasks",
        workspaceId,
        expectedDecision: "HARD_DENY",
        expectedReason: "MEMBERSHIP_REQUIRED_STUDIO_OR_FOUNDER",
      },
    ];

    for (const c of hammerCases) {
      const requestId = `slice-c-hammer-${c.key}-${crypto.randomUUID()}`;
      const resolved = await resolveCase({
        actingClient: c.user.client,
        c: {
          key: c.key,
          user: c.user,
          tool: "hammer",
          action: c.action,
          feature: c.feature,
          orgId,
          workspaceId: c.workspaceId,
          requestedMode: "ORG_FIRST_PERSONAL_FALLBACK",
          personalAiConfigured: false,
          orgAiAvailable: true,
          requestedFundingSource: "org_shared_credits",
          expectedDecision: c.expectedDecision,
          expectedReasonCode: c.expectedReason,
          expectedFallbackUsed: false,
        },
        requestId,
      });

      const reasonCode = (readString(resolved.reason_code) ?? null) as AiReasonCode | null;
      if (resolved.decision_type !== c.expectedDecision) {
        fail(`${c.key} hammer-preflight decision mismatch`);
      }
      if (reasonCode !== c.expectedReason) {
        fail(`${c.key} hammer-preflight reason mismatch`);
      }

      const ledgerLookup = await admin
        .from("ai_usage_ledger")
        .select("request_id,tool,decision_type,reason_code,effective_policy_snapshot")
        .eq("request_id", requestId)
        .single<Pick<LedgerRow, "request_id" | "tool" | "decision_type" | "reason_code" | "effective_policy_snapshot">>();
      if (ledgerLookup.error || !ledgerLookup.data) {
        fail(`${c.key} missing ai_usage_ledger row for request_id=${requestId}`);
      }
      if (ledgerLookup.data.tool !== "hammer") {
        fail(`${c.key} hammer ledger tool mismatch`);
      }
      if (ledgerLookup.data.decision_type !== c.expectedDecision) {
        fail(`${c.key} hammer ledger decision mismatch`);
      }
      if ((readString(ledgerLookup.data.reason_code) ?? null) !== c.expectedReason) {
        fail(`${c.key} hammer ledger reason mismatch`);
      }
      if (!ledgerLookup.data.effective_policy_snapshot || typeof ledgerLookup.data.effective_policy_snapshot !== "object") {
        fail(`${c.key} hammer ledger effective_policy_snapshot missing/object mismatch`);
      }

      if (resolved.decision_type === "ALLOW") {
        pass(`${c.key} hammer behavior`, "allowed -> request can proceed");
      } else {
        const message = toHammerPolicyMessage(reasonCode, resolved.decision_type);
        if (!message || message.length < 8) {
          fail(`${c.key} hammer deny message mapping invalid`);
        }
        pass(`${c.key} hammer behavior`, `blocked -> ${resolved.decision_type} (${reasonCode ?? "no_code"})`);
      }
    }

    const hammerCleanupCases: Array<{
      key: string;
      user: SessionUser;
      action: "chat";
      feature: "heavy_tasks";
      workspaceId: string | null;
      expectedDecision: AiDecisionType;
      expectedReason: AiReasonCode | null;
    }> = [
      {
        key: "hammer-cleanup-allow-founder",
        user: founder,
        action: "chat",
        feature: "heavy_tasks",
        workspaceId,
        expectedDecision: "ALLOW",
        expectedReason: null,
      },
      {
        key: "hammer-cleanup-allow-studio",
        user: studio,
        action: "chat",
        feature: "heavy_tasks",
        workspaceId,
        expectedDecision: "ALLOW",
        expectedReason: null,
      },
      {
        key: "hammer-cleanup-hard-deny-free",
        user: free,
        action: "chat",
        feature: "heavy_tasks",
        workspaceId,
        expectedDecision: "HARD_DENY",
        expectedReason: "MEMBERSHIP_REQUIRED_STUDIO_OR_FOUNDER",
      },
    ];

    for (const c of hammerCleanupCases) {
      const requestId = `slice-c-hammer-cleanup-${c.key}-${crypto.randomUUID()}`;
      const resolved = await resolveCase({
        actingClient: c.user.client,
        c: {
          key: c.key,
          user: c.user,
          tool: "hammer",
          action: c.action,
          feature: c.feature,
          orgId,
          workspaceId: c.workspaceId,
          requestedMode: "ORG_FIRST_PERSONAL_FALLBACK",
          personalAiConfigured: false,
          orgAiAvailable: true,
          requestedFundingSource: "org_shared_credits",
          expectedDecision: c.expectedDecision,
          expectedReasonCode: c.expectedReason,
          expectedFallbackUsed: false,
        },
        requestId,
      });

      const reasonCode = (readString(resolved.reason_code) ?? null) as AiReasonCode | null;
      if (resolved.decision_type !== c.expectedDecision) {
        fail(`${c.key} hammer-cleanup-preflight decision mismatch`);
      }
      if (reasonCode !== c.expectedReason) {
        fail(`${c.key} hammer-cleanup-preflight reason mismatch`);
      }

      const ledgerLookup = await admin
        .from("ai_usage_ledger")
        .select("request_id,tool,decision_type,reason_code,effective_policy_snapshot")
        .eq("request_id", requestId)
        .single<Pick<LedgerRow, "request_id" | "tool" | "decision_type" | "reason_code" | "effective_policy_snapshot">>();
      if (ledgerLookup.error || !ledgerLookup.data) {
        fail(`${c.key} missing ai_usage_ledger row for request_id=${requestId}`);
      }
      if (ledgerLookup.data.tool !== "hammer") {
        fail(`${c.key} hammer-cleanup ledger tool mismatch`);
      }
      if (ledgerLookup.data.decision_type !== c.expectedDecision) {
        fail(`${c.key} hammer-cleanup ledger decision mismatch`);
      }
      if ((readString(ledgerLookup.data.reason_code) ?? null) !== c.expectedReason) {
        fail(`${c.key} hammer-cleanup ledger reason mismatch`);
      }
      if (!ledgerLookup.data.effective_policy_snapshot || typeof ledgerLookup.data.effective_policy_snapshot !== "object") {
        fail(`${c.key} hammer-cleanup ledger effective_policy_snapshot missing/object mismatch`);
      }

      if (resolved.decision_type === "ALLOW") {
        pass(`${c.key} hammer cleanup behavior`, "allowed -> request can proceed");
      } else {
        const message = toHammerPolicyMessage(reasonCode, resolved.decision_type);
        if (!message || message.length < 8) {
          fail(`${c.key} hammer cleanup deny message mapping invalid`);
        }
        pass(`${c.key} hammer cleanup behavior`, `blocked -> ${resolved.decision_type} (${reasonCode ?? "no_code"})`);
      }
    }

    const hammerVisualCases: Array<{
      key: string;
      user: SessionUser;
      action: "chat";
      feature: "research_flows";
      workspaceId: string | null;
      expectedDecision: AiDecisionType;
      expectedReason: AiReasonCode | null;
    }> = [
      {
        key: "hammer-visual-allow-founder",
        user: founder,
        action: "chat",
        feature: "research_flows",
        workspaceId,
        expectedDecision: "ALLOW",
        expectedReason: null,
      },
      {
        key: "hammer-visual-allow-studio",
        user: studio,
        action: "chat",
        feature: "research_flows",
        workspaceId,
        expectedDecision: "ALLOW",
        expectedReason: null,
      },
      {
        key: "hammer-visual-hard-deny-free",
        user: free,
        action: "chat",
        feature: "research_flows",
        workspaceId,
        expectedDecision: "HARD_DENY",
        expectedReason: "MEMBERSHIP_REQUIRED_STUDIO_OR_FOUNDER",
      },
    ];

    for (const c of hammerVisualCases) {
      const requestId = `slice-c-hammer-visual-${c.key}-${crypto.randomUUID()}`;
      const resolved = await resolveCase({
        actingClient: c.user.client,
        c: {
          key: c.key,
          user: c.user,
          tool: "hammer",
          action: c.action,
          feature: c.feature,
          orgId,
          workspaceId: c.workspaceId,
          requestedMode: "ORG_FIRST_PERSONAL_FALLBACK",
          personalAiConfigured: false,
          orgAiAvailable: true,
          requestedFundingSource: "org_shared_credits",
          expectedDecision: c.expectedDecision,
          expectedReasonCode: c.expectedReason,
          expectedFallbackUsed: false,
        },
        requestId,
      });

      const reasonCode = (readString(resolved.reason_code) ?? null) as AiReasonCode | null;
      if (resolved.decision_type !== c.expectedDecision) {
        fail(`${c.key} hammer-visual-preflight decision mismatch`);
      }
      if (reasonCode !== c.expectedReason) {
        fail(`${c.key} hammer-visual-preflight reason mismatch`);
      }

      const ledgerLookup = await admin
        .from("ai_usage_ledger")
        .select("request_id,tool,decision_type,reason_code,effective_policy_snapshot")
        .eq("request_id", requestId)
        .single<Pick<LedgerRow, "request_id" | "tool" | "decision_type" | "reason_code" | "effective_policy_snapshot">>();
      if (ledgerLookup.error || !ledgerLookup.data) {
        fail(`${c.key} missing ai_usage_ledger row for request_id=${requestId}`);
      }
      if (ledgerLookup.data.tool !== "hammer") {
        fail(`${c.key} hammer-visual ledger tool mismatch`);
      }
      if (ledgerLookup.data.decision_type !== c.expectedDecision) {
        fail(`${c.key} hammer-visual ledger decision mismatch`);
      }
      if ((readString(ledgerLookup.data.reason_code) ?? null) !== c.expectedReason) {
        fail(`${c.key} hammer-visual ledger reason mismatch`);
      }
      if (!ledgerLookup.data.effective_policy_snapshot || typeof ledgerLookup.data.effective_policy_snapshot !== "object") {
        fail(`${c.key} hammer-visual ledger effective_policy_snapshot missing/object mismatch`);
      }

      if (resolved.decision_type === "ALLOW") {
        pass(`${c.key} hammer visual behavior`, "allowed -> request can proceed");
      } else {
        const message = toHammerPolicyMessage(reasonCode, resolved.decision_type);
        if (!message || message.length < 8) {
          fail(`${c.key} hammer visual deny message mapping invalid`);
        }
        pass(`${c.key} hammer visual behavior`, `blocked -> ${resolved.decision_type} (${reasonCode ?? "no_code"})`);
      }
    }

    const quenchMetadataCases: Array<{
      key: string;
      user: SessionUser;
      action: "chat";
      feature: "research_flows";
      workspaceId: string | null;
      expectedDecision: AiDecisionType;
      expectedReason: AiReasonCode | null;
    }> = [
      {
        key: "quench-metadata-allow-founder",
        user: founder,
        action: "chat",
        feature: "research_flows",
        workspaceId,
        expectedDecision: "ALLOW",
        expectedReason: null,
      },
      {
        key: "quench-metadata-allow-studio",
        user: studio,
        action: "chat",
        feature: "research_flows",
        workspaceId,
        expectedDecision: "ALLOW",
        expectedReason: null,
      },
      {
        key: "quench-metadata-hard-deny-free",
        user: free,
        action: "chat",
        feature: "research_flows",
        workspaceId,
        expectedDecision: "HARD_DENY",
        expectedReason: "MEMBERSHIP_REQUIRED_STUDIO_OR_FOUNDER",
      },
    ];

    for (const c of quenchMetadataCases) {
      const requestId = `slice-c-quench-metadata-${c.key}-${crypto.randomUUID()}`;
      const resolved = await resolveCase({
        actingClient: c.user.client,
        c: {
          key: c.key,
          user: c.user,
          tool: "quench",
          action: c.action,
          feature: c.feature,
          orgId,
          workspaceId: c.workspaceId,
          requestedMode: "ORG_FIRST_PERSONAL_FALLBACK",
          personalAiConfigured: false,
          orgAiAvailable: true,
          requestedFundingSource: "org_shared_credits",
          expectedDecision: c.expectedDecision,
          expectedReasonCode: c.expectedReason,
          expectedFallbackUsed: false,
        },
        requestId,
      });

      const reasonCode = (readString(resolved.reason_code) ?? null) as AiReasonCode | null;
      if (resolved.decision_type !== c.expectedDecision) {
        fail(`${c.key} quench-metadata-preflight decision mismatch`);
      }
      if (reasonCode !== c.expectedReason) {
        fail(`${c.key} quench-metadata-preflight reason mismatch`);
      }

      const ledgerLookup = await admin
        .from("ai_usage_ledger")
        .select("request_id,tool,decision_type,reason_code,effective_policy_snapshot")
        .eq("request_id", requestId)
        .single<Pick<LedgerRow, "request_id" | "tool" | "decision_type" | "reason_code" | "effective_policy_snapshot">>();
      if (ledgerLookup.error || !ledgerLookup.data) {
        fail(`${c.key} missing ai_usage_ledger row for request_id=${requestId}`);
      }
      if (ledgerLookup.data.tool !== "quench") {
        fail(`${c.key} quench-metadata ledger tool mismatch`);
      }
      if (ledgerLookup.data.decision_type !== c.expectedDecision) {
        fail(`${c.key} quench-metadata ledger decision mismatch`);
      }
      if ((readString(ledgerLookup.data.reason_code) ?? null) !== c.expectedReason) {
        fail(`${c.key} quench-metadata ledger reason mismatch`);
      }
      if (!ledgerLookup.data.effective_policy_snapshot || typeof ledgerLookup.data.effective_policy_snapshot !== "object") {
        fail(`${c.key} quench-metadata ledger effective_policy_snapshot missing/object mismatch`);
      }

      if (resolved.decision_type === "ALLOW") {
        pass(`${c.key} quench metadata behavior`, "allowed -> request can proceed");
      } else {
        const message = toQuenchPolicyMessage(reasonCode, resolved.decision_type);
        if (!message || message.length < 8) {
          fail(`${c.key} quench metadata deny message mapping invalid`);
        }
        pass(`${c.key} quench metadata behavior`, `blocked -> ${resolved.decision_type} (${reasonCode ?? "no_code"})`);
      }
    }

    console.log("");
    console.log(
      "SLICE_C_GATE: Hearth chat, Hearth STT, Hammer transcript prep, Hammer transcript cleanup assist, Hammer visual assist, and Quench metadata assist obey the real resolver in live conditions, " +
      "across allow/soft/hard deny paths, with ledger attribution validated.",
    );
  } finally {
    // Best-effort cleanup.
    for (const workspaceId of createdWorkspaceIds) {
      try {
        await founder?.client.rpc("delete_workspace_with_owner_check", { _workspace_id: workspaceId });
      } catch {
        // no-op
      }
    }

    for (const orgId of createdOrgIds) {
      try {
        await admin.from("organization_ai_policy").delete().eq("org_id", orgId);
      } catch {
        // no-op
      }
      try {
        await admin.from("member_ai_policy").delete().eq("org_id", orgId);
      } catch {
        // no-op
      }
    }

    for (const userId of createdUserIds) {
      try {
        await admin.auth.admin.deleteUser(userId);
      } catch {
        // no-op
      }
    }
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`SLICE_C_GATE_FAIL: ${message}`);
  process.exitCode = 1;
});
