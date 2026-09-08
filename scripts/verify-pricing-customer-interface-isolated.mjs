import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_pricing_interface_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const migrationFiles = [
  "supabase/migrations/20260910120000_tongs_accounting_foundation.sql",
  "supabase/migrations/20260911120000_tongs_private_pricing_reservations_shadow.sql",
  "supabase/migrations/20260912120000_tongs_owner_budget_reservations_shadow.sql",
  "supabase/migrations/20260915120000_tongs_runway_paid_execution_boundary.sql",
  "supabase/migrations/20260916120000_tongs_runway_owner_pilot_activation.sql",
  "supabase/migrations/20260917120000_tongs_pricing_customer_interface.sql",
];

function docker(args, input) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}
function assertSuccess(result, step) {
  if (result.status !== 0) throw new Error(`${step} failed:\n${result.stderr || result.stdout}`);
}
function psql(sql, step) {
  const result = docker(["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], sql);
  assertSuccess(result, step);
  return result.stdout.trim();
}
function psqlAsync(sql) {
  return new Promise((resolve) => {
    const child = spawn("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database]);
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(sql);
  });
}

const customerId = randomUUID(), operatorId = randomUUID(), workspaceId = randomUUID();
const rulesId = randomUUID(), policyId = randomUUID(), pricingId = randomUUID(), publicationId = randomUUID();
const depositId = randomUUID(), feeId = randomUUID();
const quoteA = randomUUID(), quoteB = randomUUID(), acceptanceA = randomUUID(), acceptanceB = randomUUID();
const reservationA = randomUUID(), reservationB = randomUUID();
const components = JSON.stringify([
  { component_code: "runway_generation", component_kind: "direct_provider", credential_funding: "forge", provider_label: "Runway", success_ceiling_micros: 600000, failure_ceiling_micros: 300000, cost_policy_revision: "isolated-race", tail_policy: "none" },
  { component_code: "supporting_services", component_kind: "supporting_provider", credential_funding: "forge", provider_label: "Forge support", success_ceiling_micros: 150000, failure_ceiling_micros: 75000, cost_policy_revision: "isolated-race", tail_policy: "none" },
]).replaceAll("'", "''");

try {
  assertSuccess(docker(["exec", container, "createdb", "-U", "postgres", database]), "create isolated database");
  let baseline = readFileSync("supabase/tests/billing_isolated_baseline.sql", "utf8")
    .replace("create role anon nologin;\n", "")
    .replace("create role authenticated nologin;\n", "")
    .replace("create role service_role nologin bypassrls;\n", "");
  psql(baseline, "isolated baseline");
  for (const file of migrationFiles) psql(readFileSync(file, "utf8"), file);
  psql(readFileSync("supabase/tests/pricing_customer_interface.sql", "utf8"), "full isolated customer flow");

  psql(`
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
      ('${customerId}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','race-customer@example.test','',now(),now(),now()),
      ('${operatorId}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','race-operator@example.test','',now(),now(),now());
    insert into tongs.workspaces(id,name) values('${workspaceId}','Race proof');
    insert into tongs.platform_operators(user_id,reason,granted_by) values('${operatorId}','isolated race proof','${operatorId}');
    set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='${operatorId}'; set role authenticated;
    select tongs.commit_private_markup_rule_revision('${rulesId}',0,2000,'[]','isolated race proof');
    select tongs.commit_operator_pricing_revision('${rulesId}','${policyId}','runway-race','sku','runway','gen4.5:5s:1280:720',0,'${pricingId}',90,'usd','${components}'::jsonb,'["provider_billed_failure"]','["pre_billing_rejection"]','{"model":"gen4.5","duration_seconds":5,"ratio":"1280:720"}','{"kind":"included_until","duration_hours":24}','isolated race proof');
    select tongs.publish_private_pricing_revision('${publicationId}','${pricingId}','isolated race proof');
    reset role; set request.jwt.claim.role='service_role'; set request.jwt.claim.sub=''; set role service_role;
    select tongs.record_customer_deposit('${depositId}','${customerId}','evt_race','cs_race','pi_race',true,'pack',1000000,'usd',100,now(),'{}');
    select tongs.record_customer_deposit_processor_fee('${feeId}','${depositId}','txn_race',0,now(),'{}');
    select tongs.create_customer_runway_quote('${quoteA}','${customerId}','runway-race-operation-a','${workspaceId}',repeat('a',64),'gen4.5',5,'1280:720',now()+interval '1 hour');
    select tongs.create_customer_runway_quote('${quoteB}','${customerId}','runway-race-operation-b','${workspaceId}',repeat('b',64),'gen4.5',5,'1280:720',now()+interval '1 hour');
    reset role; set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='${customerId}'; set role authenticated;
    select tongs.accept_quote('${quoteA}','${acceptanceA}','accept-race-a',(tongs.read_my_spending_quote('${quoteA}')->>'quote_hash'));
    select tongs.accept_quote('${quoteB}','${acceptanceB}','accept-race-b',(tongs.read_my_spending_quote('${quoteB}')->>'quote_hash'));
    reset role;
    insert into tongs.paid_execution_control_revisions(revision,pricing_activation_enabled,reservation_shadow_enabled,customer_settlement_enabled,owner_budget_spending_enabled,provider_execution_enabled,reason)
    values(2,true,true,true,false,true,'isolated concurrent customer reservation proof');
    insert into tongs.runway_execution_rollout_revisions(revision,mode,reason) values(2,'enforce','isolated concurrent customer reservation proof');
  `, "concurrent customer setup");

  const service = "set request.jwt.claim.role='service_role'; set request.jwt.claim.sub=''; set role service_role;";
  const results = await Promise.all([
    psqlAsync(`${service} select tongs.reserve_customer_runway_quote('${quoteA}','${reservationA}','reserve-race-a',repeat('a',64),'gen4.5',5,'1280:720');`),
    psqlAsync(`${service} select tongs.reserve_customer_runway_quote('${quoteB}','${reservationB}','reserve-race-b',repeat('b',64),'gen4.5',5,'1280:720');`),
  ]);
  const succeeded = results.filter((result) => result.code === 0);
  const rejected = results.filter((result) => result.code !== 0 && /insufficient verified funding/i.test(result.stderr));
  if (succeeded.length !== 1 || rejected.length !== 1) throw new Error(`concurrent reservation proof failed: ${JSON.stringify(results)}`);
  const proof = JSON.parse(psql(`select jsonb_build_object('reservation_count',count(*),'held_charge_micros',coalesce(sum(reserved_customer_charge_micros),0),'held_wholesale_micros',coalesce(sum(reserved_wholesale_spend_micros),0)) from tongs.funding_reservations where funding_source_id='${depositId}';`, "read race proof"));
  if (proof.reservation_count !== 1 || proof.held_charge_micros !== 900000 || proof.held_wholesale_micros !== 750000) throw new Error(`unexpected concurrent hold totals: ${JSON.stringify(proof)}`);
  console.log(JSON.stringify({ isolated_database: true, full_customer_flow: "passed", concurrent_reservation: "passed", ...proof }));
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", database]);
}
