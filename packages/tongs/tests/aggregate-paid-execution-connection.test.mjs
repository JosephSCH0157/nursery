import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../../../supabase/migrations/20261002120000_tongs_aggregate_paid_execution_connection.sql", import.meta.url);
const coordinatorUrl = new URL("../src/providers/paid-openai-text-execution-coordinator.ts", import.meta.url);
const runwayUrl = new URL("../src/providers/runway-paid-execution-boundary.ts", import.meta.url);
const workpieceUrl = new URL("../src/workpiece-commit-api.ts", import.meta.url);
const repairMigrationUrl = new URL("../../../supabase/migrations/20261007120000_tongs_non_spending_financial_repairs.sql", import.meta.url);
const settledReplayReliefSafetyMigrationUrl = new URL("../../../supabase/migrations/20260916181807_settled_openai_replay_relief_safety.sql", import.meta.url);

test("all eight OpenAI text routes map to aggregate capability terms", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const mappings = [
    ["hearth.chat_completion", "openai.text.hearth_chat"],
    ["hearth.research_synthesis", "openai.text.hearth_research"],
    ["visual.unified_plan", "openai.text.visual_unified_plan"],
    ["visual.narrative_interpretation", "openai.text.visual_narrative"],
    ["motion.broll_interpretation", "openai.text.motion_broll"],
    ["hammer.transcript_cleanup", "openai.text.hammer_cleanup"],
    ["shorts.discovery", "openai.text.shorts_discovery"],
    ["quench.metadata", "openai.text.quench_metadata"],
  ];
  for (const [route, capability] of mappings) {
    assert.match(sql, new RegExp(`when '${route.replace(".", "\\.")}' then '${capability.replaceAll(".", "\\.")}'`, "i"));
  }
  assert.match(sql, /exact accepted funding and complete cost policy required/i);
  assert.match(sql, /aggregate assignment cannot precede existing OpenAI route enforcement/i);
});

test("actual OpenAI and Runway provider boundaries use transactional aggregate authorization", async () => {
  const [coordinator, runway, workpiece] = await Promise.all([
    readFile(coordinatorUrl, "utf8"),
    readFile(runwayUrl, "utf8"),
    readFile(workpieceUrl, "utf8"),
  ]);
  assert.match(coordinator, /authorize_openai_text_provider_attempt_with_aggregate/);
  assert.doesNotMatch(coordinator, /this\.rpc\("authorize_openai_text_provider_attempt",/);
  assert.match(runway, /authorize_runway_submission_with_aggregate/);
  assert.match(workpiece, /await this\.brollVideoProvider\.submit/);
  assert.match(workpiece, /recordCanonicalSuccessForReconciliation/);
  assert.ok(workpiece.lastIndexOf("recordCanonicalSuccessForReconciliation") > workpiece.indexOf('rpc("commit_broll_candidate"'));
});

test("outstanding exposure is not filtered by lease expiry or hold creation window", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const aggregateQuery = sql.match(/select coalesce\(sum\(h\.supplier_exposure_ceiling_micros[\s\S]+?if concurrent_count>=pol\.maximum_concurrency/i)?.[0] ?? "";
  assert.ok(aggregateQuery);
  assert.doesNotMatch(aggregateQuery, /h\.created_at\s*>/i);
  assert.doesNotMatch(aggregateQuery, /lease_expires_at\s*>/i);
  assert.match(aggregateQuery, /settled_unconfirmed/);
  assert.match(aggregateQuery, /supplier_recovery/);
});

test("migration is private and inactive by default", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.doesNotMatch(sql, /insert into tongs\.paid_execution_aggregate_assignments/i);
  assert.match(sql, /revoke all on tongs\.%I from public,anon,authenticated,service_role/i);
  assert.match(sql, /platform operator required/i);
});

test("caller classes match each route's execution lifecycle at aggregate-wired adapters", async () => {
  const root = new URL("../../../", import.meta.url);
  const files = {
    hearth: await readFile(new URL("apps/nursery/server/hearth/create-hearth-ai-handler.ts", root), "utf8"),
    visual: await readFile(workpieceUrl, "utf8"),
    hammer: await readFile(new URL("apps/nursery/scripts/mw-hammer-prep.ts", root), "utf8"),
    shorts: await readFile(new URL("apps/nursery/scripts/hammer-shorts-discovery.ts", root), "utf8"),
    jobs: await readFile(new URL("apps/nursery/server/tongs/workpiece-job-runner.ts", root), "utf8"),
    coordinator: await readFile(coordinatorUrl, "utf8"),
  };
  assert.match(files.hearth, /executePaidJsonOpenAiRoute\([\s\S]+?routeCode:\s*"hearth\.research_synthesis"/);
  for (const route of ["visual.unified_plan", "visual.narrative_interpretation", "motion.broll_interpretation"]) {
    assert.match(files.visual, new RegExp(`executePaidOpenAiTextRoute\\([\\s\\S]+?routeCode:\\s*"${route.replaceAll(".", "\\.")}"`));
  }
  const cleanupCaller = files.hammer.slice(
    files.hammer.indexOf("async function runOpenAiTranscriptCleanupAssist"),
    files.hammer.indexOf("async function runOpenAiQuenchMetadataAssist"),
  );
  assert.match(cleanupCaller, /routeCode:\s*"hammer\.transcript_cleanup"[\s\S]+?callerClass:\s*"interactive"/);
  assert.doesNotMatch(cleanupCaller, /callerClass:\s*"background"/);
  assert.match(files.hammer, /routeCode:\s*"quench\.metadata"[\s\S]+?callerClass:\s*"background"/);
  assert.match(files.shorts, /routeCode:\s*"shorts\.discovery"[\s\S]+?callerClass:\s*"background"/);
  assert.match(files.jobs, /p_caller_class:\s*"background"/);
  assert.match(files.coordinator, /p_caller_class:\s*attemptNumber === 1 \? input\.aggregateCallerClass : "retry"/);
  assert.doesNotMatch(files.coordinator, /owner[\s\S]{0,120}callerClass/i);
});

test("all JSON text callers bind a complete serialized request at quote and provider boundaries", async () => {
  const root = new URL("../../../", import.meta.url);
  const [funding, routeExecution, paidJson, hearthExecution, hearth, visual, hammer, shorts, migration] = await Promise.all([
    readFile(new URL("packages/tongs/src/providers/openai-text-customer-funding.ts", root), "utf8"),
    readFile(new URL("packages/tongs/src/providers/paid-openai-text-route-execution.ts", root), "utf8"),
    readFile(new URL("apps/nursery/server/billing/paid-json-openai-route.ts", root), "utf8"),
    readFile(new URL("apps/nursery/server/hearth/hearth-paid-chat-execution.ts", root), "utf8"),
    readFile(new URL("apps/nursery/server/hearth/create-hearth-ai-handler.ts", root), "utf8"),
    readFile(workpieceUrl, "utf8"),
    readFile(new URL("apps/nursery/scripts/mw-hammer-prep.ts", root), "utf8"),
    readFile(new URL("apps/nursery/scripts/hammer-shorts-discovery.ts", root), "utf8"),
    readFile(repairMigrationUrl, "utf8"),
  ]);
  assert.match(funding, /bind_bounded_provider_quote_request/);
  assert.match(routeExecution, /bind_bounded_provider_request/);
  assert.match(migration, /quote_request\.serialized_body_sha256<>p_serialized_body_sha256/);
  assert.match(paidJson, /body:\s*boundedRequest\.serializedBody/);
  assert.match(hearthExecution, /body:\s*boundedRequest\.serializedBody/);
  assert.ok((hearth.match(/prepareBoundedRequest:/g) ?? []).length >= 1);
  assert.ok((visual.match(/prepareBoundedRequest:/g) ?? []).length >= 6);
  assert.ok((hammer.match(/prepareBoundedRequest:/g) ?? []).length >= 3);
  assert.match(shorts, /buildHammerShortsProviderRequestBody/);
});

test("repair migration changes no rollout, price publication, budget, or aggregate assignment", async () => {
  const sql = await readFile(repairMigrationUrl, "utf8");
  assert.match(sql, /This migration activates no price, budget, assignment/);
  assert.doesNotMatch(sql, /insert\s+into\s+tongs\.openai_text_rollout_revisions/i);
  assert.doesNotMatch(sql, /insert\s+into\s+tongs\.paid_execution_aggregate_assignments/i);
  assert.doesNotMatch(sql, /insert\s+into\s+tongs\.owner_operating_budget_revisions/i);
  assert.doesNotMatch(sql, /lifecycle_state\s*=\s*'published'/i);
});

test("settled canonical results block automatic failure relief while genuine failures retain relief", async () => {
  const sql = await readFile(settledReplayReliefSafetyMigrationUrl, "utf8");
  const canonicalResultGuard = sql.indexOf("from tongs.openai_text_persisted_results result");
  const preservedReturn = sql.indexOf("'state','settled_result_preserved'");
  const reliefCall = sql.indexOf("relief:=tongs.relieve_failed_customer_operation");
  assert.ok(canonicalResultGuard >= 0);
  assert.ok(preservedReturn > canonicalResultGuard);
  assert.ok(reliefCall > preservedReturn);
  assert.match(sql, /binding\.reservation_id=result\.reservation_id/);
  assert.match(sql, /binding\.operation_id=result\.operation_id/);
  assert.match(sql, /binding\.route_code=result\.route_code/);
  assert.match(sql, /'customer_relief',null/);
  assert.match(sql, /'reason','canonical_result_already_persisted'/);
  assert.match(sql, /Preserve the existing customer-protection path for a genuinely failed/);
  assert.doesNotMatch(sql, /delete\s+from|update\s+tongs\.customer_operation_reliefs/i);
});
