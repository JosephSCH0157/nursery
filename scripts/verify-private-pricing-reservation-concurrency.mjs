import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const customerId = randomUUID();
const operatorId = randomUUID();
const policyId = randomUUID();
const revisionId = randomUUID();
const depositId = randomUUID();
const feeId = randomUUID();
const quoteA = randomUUID();
const quoteB = randomUUID();
const acceptanceA = randomUUID();
const acceptanceB = randomUUID();
const reservationA = randomUUID();
const reservationB = randomUUID();

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

const components = JSON.stringify([
  {
    component_code: "concurrent-provider",
    component_kind: "direct_provider",
    credential_funding: "forge",
    provider_label: `Concurrency ${suffix}`,
    success_ceiling_micros: 700000,
    failure_ceiling_micros: 0,
    cost_policy_revision: "concurrency-v1",
    tail_policy: "none",
  },
]);

run(`
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values
    ('${customerId}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reservation-race-${suffix}@example.test','',now(),now(),now()),
    ('${operatorId}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reservation-operator-${suffix}@example.test','',now(),now(),now());
  insert into tongs.platform_operators(user_id,reason,granted_by)
  values('${operatorId}','reservation concurrency test','${operatorId}');
  set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='${operatorId}'; set role authenticated;
  select tongs.commit_private_pricing_revision(
    '${policyId}','concurrency-${suffix}','provider','concurrency-${suffix}',null,0,
    '${revisionId}',0,70,'usd','${components.replaceAll("'", "''")}'::jsonb,
    '[]'::jsonb,'["prebilling_rejection"]'::jsonb,'{"outputs":1}'::jsonb,
    '{"kind":"none"}'::jsonb,'local two-session concurrency proof');
  reset role; set request.jwt.claim.role='service_role'; set request.jwt.claim.sub=''; set role service_role;
  select tongs.record_customer_deposit('${depositId}','${customerId}','evt_${suffix}','cs_${suffix}','pi_${suffix}',true,'race-pack',1000000,'usd',100,now(),'{}');
  select tongs.record_customer_deposit_processor_fee('${feeId}','${depositId}','txn_${suffix}',0,now(),'{}');
  select tongs.create_shadow_spending_quote('${quoteA}','${customerId}','race-${suffix}-operation-a','race',null,'${revisionId}',repeat('a',64),'[{"component":"generation","provider_label":"Concurrency","credential_source":"forge"}]',now()+interval '1 hour');
  select tongs.create_shadow_spending_quote('${quoteB}','${customerId}','race-${suffix}-operation-b','race',null,'${revisionId}',repeat('b',64),'[{"component":"generation","provider_label":"Concurrency","credential_source":"forge"}]',now()+interval '1 hour');
  reset role; set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='${customerId}'; set role authenticated;
  select tongs.accept_quote('${quoteA}','${acceptanceA}','accept-${suffix}-a',(tongs.read_my_spending_quote('${quoteA}')->>'quote_hash'));
  select tongs.accept_quote('${quoteB}','${acceptanceB}','accept-${suffix}-b',(tongs.read_my_spending_quote('${quoteB}')->>'quote_hash'));
`);

const servicePrefix = "set request.jwt.claim.role='service_role'; set request.jwt.claim.sub=''; set role service_role;";
const results = await Promise.all([
  runAsync(`${servicePrefix} select tongs.reserve_operation('${reservationA}','${quoteA}','customer_deposit','${depositId}','reserve-${suffix}-a');`),
  runAsync(`${servicePrefix} select tongs.reserve_operation('${reservationB}','${quoteB}','customer_deposit','${depositId}','reserve-${suffix}-b');`),
]);
const succeeded = results.filter((result) => result.code === 0);
const rejected = results.filter((result) => result.code !== 0 && /insufficient verified deposit balance/.test(result.stderr));
if (succeeded.length !== 1 || rejected.length !== 1) {
  throw new Error(`Expected one committed hold and one insufficient-balance rejection: ${JSON.stringify(results)}`);
}

const proofText = run(`
  select jsonb_build_object(
    'committed_reservations', count(*),
    'held_customer_charge_micros', coalesce(sum(reserved_customer_charge_micros),0),
    'held_credit_units', coalesce(sum(reserved_credit_units),0),
    'deposit_gross_micros', (select gross_amount_micros from tongs.customer_deposits where id='${depositId}'),
    'provider_execution_enabled', (select provider_execution_enabled from tongs.paid_execution_control_revisions order by revision desc limit 1)
  ) from tongs.funding_reservations where funding_source_id='${depositId}';
`).stdout.trim();
const proof = JSON.parse(proofText);
if (proof.committed_reservations !== 1 || proof.held_customer_charge_micros !== 700000
    || proof.held_credit_units !== 70 || proof.deposit_gross_micros !== 1000000
    || proof.provider_execution_enabled !== false) {
  throw new Error(`Concurrent reservation proof failed: ${proofText}`);
}

console.log(JSON.stringify({ concurrent_verified_funding_reservation: "passed", ...proof }));
