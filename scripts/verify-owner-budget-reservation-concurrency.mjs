import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER;
if (!container || !/^forge_billing_pg_isolated_[a-zA-Z0-9_-]+$/.test(container)) {
  throw new Error("SUPABASE_DB_CONTAINER must name an explicitly disposable Forge billing database.");
}

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const operatorId = randomUUID();
const policyId = randomUUID();
const revisionId = randomUUID();
const budgetId = randomUUID();
const quoteA = randomUUID();
const quoteB = randomUUID();
const acceptanceA = randomUUID();
const acceptanceB = randomUUID();
const reservationA = randomUUID();
const reservationB = randomUUID();
const providerCode = `runway-owner-test-${suffix}`;

function psqlArgs() {
  return ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
}

function run(sql, allowFailure = false) {
  const result = spawnSync("docker", psqlArgs(), { input: sql, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result;
}

function runAsync(sql) {
  return new Promise((resolve) => {
    const child = spawn("docker", psqlArgs());
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(sql);
  });
}

const components = JSON.stringify([{
  component_code: "runway-generation",
  component_kind: "direct_provider",
  credential_funding: "forge",
  provider_label: "Runway",
  success_ceiling_micros: 500000,
  failure_ceiling_micros: 250000,
  cost_policy_revision: "fake-runway-concurrency-v1",
  tail_policy: "none",
}]);

run(`
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values('${operatorId}','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'owner-budget-race-${suffix}@example.test','',now(),now(),now());
  insert into tongs.platform_operators(user_id,reason,granted_by)
  values('${operatorId}','owner budget concurrency test','${operatorId}');
  set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='${operatorId}'; set role authenticated;
  select tongs.commit_private_pricing_revision(
    '${policyId}','owner-race-${suffix}','provider','${providerCode}',null,0,
    '${revisionId}',0,50,'usd','${components.replaceAll("'", "''")}'::jsonb,
    '["provider_billed_failure"]'::jsonb,'["prebilling_rejection"]'::jsonb,
    '{"outputs":1}'::jsonb,'{"kind":"none"}'::jsonb,'isolated owner concurrency proof');
  select tongs.create_owner_operating_budget_draft(
    '${budgetId}','development',null,'${providerCode}','tongs_broll_v2',null,'usd',
    now()-interval '1 hour',now()+interval '1 day','isolated owner concurrency draft');
  select tongs.revise_owner_operating_budget(
    '${budgetId}','active',700000,'isolated owner concurrency activation');
  reset role; set request.jwt.claim.role='service_role'; set request.jwt.claim.sub='';
  insert into tongs.paid_execution_control_revisions(
    revision,pricing_activation_enabled,reservation_shadow_enabled,customer_settlement_enabled,
    owner_budget_spending_enabled,provider_execution_enabled,reason,actor_id)
  select coalesce(max(revision),0)+1,true,true,false,true,true,
    'isolated owner concurrency proof','${operatorId}' from tongs.paid_execution_control_revisions;
  set role service_role;
  select tongs.create_shadow_spending_quote(
    '${quoteA}','${operatorId}','owner-race-${suffix}-a','tongs_broll_v2',null,'${revisionId}',
    repeat('a',64),'[{"component":"generation","provider_label":"Runway","credential_source":"forge"}]',now()+interval '1 hour');
  select tongs.create_shadow_spending_quote(
    '${quoteB}','${operatorId}','owner-race-${suffix}-b','tongs_broll_v2',null,'${revisionId}',
    repeat('b',64),'[{"component":"generation","provider_label":"Runway","credential_source":"forge"}]',now()+interval '1 hour');
  reset role; set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='${operatorId}'; set role authenticated;
  select tongs.accept_quote('${quoteA}','${acceptanceA}','accept-owner-${suffix}-a',
    tongs.read_my_spending_quote('${quoteA}')->>'quote_hash');
  select tongs.accept_quote('${quoteB}','${acceptanceB}','accept-owner-${suffix}-b',
    tongs.read_my_spending_quote('${quoteB}')->>'quote_hash');
`);

const servicePrefix = "set request.jwt.claim.role='service_role'; set request.jwt.claim.sub=''; set role service_role;";
const results = await Promise.all([
  runAsync(`${servicePrefix} select tongs.reserve_operation('${reservationA}','${quoteA}','owner_budget','${budgetId}','reserve-owner-${suffix}-a');`),
  runAsync(`${servicePrefix} select tongs.reserve_operation('${reservationB}','${quoteB}','owner_budget','${budgetId}','reserve-owner-${suffix}-b');`),
]);
const succeeded = results.filter((result) => result.code === 0);
const rejected = results.filter((result) => result.code !== 0 && /insufficient owner operating budget/.test(result.stderr));
if (succeeded.length !== 1 || rejected.length !== 1) {
  throw new Error(`Expected one owner hold and one cap rejection: ${JSON.stringify(results)}`);
}

const proofText = run(`
  select jsonb_build_object(
    'committed_reservations',count(*),
    'held_wholesale_micros',coalesce(sum(reserved_wholesale_spend_micros),0),
    'held_customer_charge_micros',coalesce(sum(reserved_customer_charge_micros),0),
    'held_credit_units',coalesce(sum(reserved_credit_units),0),
    'maximum_budget_micros',(select maximum_amount_micros from tongs.owner_operating_budget_revisions
      where budget_id='${budgetId}' order by revision desc limit 1)
  ) from tongs.funding_reservations where funding_source_id='${budgetId}';
`).stdout.trim();
const proof = JSON.parse(proofText);
if (proof.committed_reservations !== 1 || proof.held_wholesale_micros !== 500000
    || proof.held_customer_charge_micros !== 0 || proof.held_credit_units !== 0
    || proof.maximum_budget_micros !== 700000) {
  throw new Error(`Owner budget concurrency proof failed: ${proofText}`);
}

console.log(JSON.stringify({ concurrent_owner_budget_reservation: "passed", ...proof }));
