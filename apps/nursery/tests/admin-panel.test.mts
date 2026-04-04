import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessAdminPanel,
  parseAdminOverview,
  parseAdminUsageEvents,
  parseAdminUserInspection,
} from "../src/lib/admin/adminPanel";

test("canAccessAdminPanel allows owner/admin only", () => {
  assert.equal(canAccessAdminPanel("owner"), true);
  assert.equal(canAccessAdminPanel("admin"), true);
  assert.equal(canAccessAdminPanel("member"), false);
  assert.equal(canAccessAdminPanel(null), false);
});

test("parseAdminOverview normalizes totals and rollups", () => {
  const parsed = parseAdminOverview({
    total_usage_today: 8,
    total_estimated_cost_today: 0.9234,
    total_actual_cost_today: 0.7123,
    total_billable_tokens_today: 1022,
    usage_by_feature: [
      {
        feature: "speech_transcription",
        subfeature: "hammer_prep_nonbillable",
        call_count: 4,
        total_estimated_cost_usd: 0.4,
        total_actual_cost_usd: 0.32,
        total_billable_tokens: 400,
      },
    ],
    usage_by_lane: [
      {
        lane: "forge",
        call_count: 6,
        total_estimated_cost_usd: 0.6,
        total_actual_cost_usd: 0.5,
        total_billable_tokens: 900,
      },
    ],
  });

  assert.equal(parsed.totalUsageToday, 8);
  assert.equal(parsed.usageByFeature[0]?.feature, "speech_transcription");
  assert.equal(parsed.usageByLane[0]?.lane, "forge");
});

test("parseAdminUsageEvents filters invalid rows and keeps key fields", () => {
  const rows = parseAdminUsageEvents([
    {
      created_at: "2026-04-04T12:00:00.000Z",
      user_id: "5a0f2f8f-b6e6-4ef2-aef2-f61f3917cb52",
      workspace_id: "4cb6e775-0d6d-4514-986b-cf09f4f46d20",
      feature: "script_assist",
      subfeature: "chat",
      lane: "forge",
      status: "success",
      estimated_cost_usd: 0.1,
      actual_cost_usd: 0.09,
      billable_tokens: 110,
      model: "gpt-5.2",
    },
    {
      feature: "invalid-row",
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.feature, "script_assist");
  assert.equal(rows[0]?.lane, "forge");
});

test("parseAdminUserInspection reads membership + policy fields", () => {
  const parsed = parseAdminUserInspection([
    {
      target_user_id: "17ecbcbd-e39a-445a-8f93-f37ceee9ca3a",
      profile_tier: "pro",
      active_plan_code: "pro",
      founders_club_flag: false,
      is_founder_entitled: false,
      is_studio_entitled: false,
      org_toolbox_allowed: true,
      org_policy_default_mode: "ORG_FIRST_PERSONAL_FALLBACK",
      org_shared_ai_enabled: true,
      org_member_byo_allowed: true,
      member_mode_override: null,
      member_allow_heavy_tasks: true,
      byo_configured: true,
      byo_provider: "openai",
      policy_decision_type: "ALLOW",
      selected_funding_source: "org_shared_credits",
      effective_policy_snapshot: { sample: true },
    },
  ]);

  assert(parsed);
  assert.equal(parsed?.targetUserId, "17ecbcbd-e39a-445a-8f93-f37ceee9ca3a");
  assert.equal(parsed?.orgToolboxAllowed, true);
  assert.equal(parsed?.byoConfigured, true);
  assert.equal(parsed?.policyDecisionType, "ALLOW");
});
