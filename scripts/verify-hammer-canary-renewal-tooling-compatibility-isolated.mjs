import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const sourceContainer = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_forge-gate-e1-pre";
const sourceDatabase = process.env.SUPABASE_SOURCE_DATABASE ?? "postgres";
const database = `forge_hammer_renewal_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const migration = readFileSync(
  "supabase/migrations/20261104212918_hammer_canary_renewal_tooling_compatibility.sql",
  "utf8",
);

function docker(args, input) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 80 * 1024 * 1024 });
}

function check(result, label) {
  if (result.status !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout}`);
}

function sql(input, { allowFailure = false } = {}) {
  const result = docker([
    "exec", "-i", sourceContainer, "psql", "-X", "-q", "-A", "-t",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database,
  ], input);
  if (!allowFailure) check(result, "isolated SQL");
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  process.stdout.write(`ok - ${message}\n`);
}

const ids = {
  operator: "10000000-0000-4000-8000-000000000001",
  oldEvidence: "10000000-0000-4000-8000-000000000002",
  wrongPolicy: "10000000-0000-4000-8000-000000000003",
  wrongCapability: "10000000-0000-4000-8000-000000000004",
  currentPolicy: "10000000-0000-4000-8000-000000000005",
  currentCapability: "10000000-0000-4000-8000-000000000006",
  newEvidence: "10000000-0000-4000-8000-000000000007",
  newPolicy: "10000000-0000-4000-8000-000000000008",
  newCapability: "10000000-0000-4000-8000-000000000009",
};

try {
  const inspection = docker(["inspect", sourceContainer]);
  check(inspection, "inspect disposable Supabase database container");
  const metadata = JSON.parse(inspection.stdout)[0];
  assert(Boolean(metadata?.Config?.Labels?.["com.supabase.cli.project"]), "source is a Supabase CLI disposable container");
  check(docker(["exec", sourceContainer, "createdb", "-U", "postgres", database]), "create isolated database");
  check(docker([
    "exec", "-i", sourceContainer, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], "create schema extensions; create extension pgcrypto with schema extensions;"), "install isolated pgcrypto dependency");
  const dump = docker([
    "exec", sourceContainer, "pg_dump", "-U", "postgres", "-d", sourceDatabase,
    "--schema-only", "--no-owner", "--schema=tongs", "--schema=auth", "--schema=extensions", "--schema=public",
  ]);
  check(dump, "capture certified schema");
  const schema = dump.stdout
    .replace(/^CREATE SCHEMA public;\r?\n/m, "")
    .replace(/^CREATE SCHEMA extensions;\r?\n/m, "")
    .replace(/^ALTER DEFAULT PRIVILEGES[\s\S]*?;\r?\n/gm, "");
  check(docker([
    "exec", "-i", sourceContainer, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], schema), "restore certified schema");
  sql(migration);

  sql(`
    insert into auth.users(id) values('${ids.operator}');
    insert into tongs.platform_operators(user_id,reason) values('${ids.operator}','Synthetic isolated renewal verifier operator.');
    insert into tongs.restricted_beta_cost_evidence_revisions(
      id,capability_code,revision,evidence_state,coverage_state,source_reference,observed_at,valid_until,
      included_capacity_json,reserved_headroom_json,latency_json,hard_cap_scope,notes
    ) values('${ids.oldEvidence}','assemblyai.transcription.hammer',2,'verified_rate','complete',
      'https://www.assemblyai.com/pricing/',clock_timestamp()-interval '26 hours',clock_timestamp()-interval '2 hours',
      '{"supplier_rate_micros_per_hour":230000,"supplier_ceiling_micros":38589,"maximum_attempts":1,"automatic_retries":0,"evidence_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
      '{"supporting_cost_ceiling_micros":6000,"complete_wholesale_ceiling_micros":44589}',
      '{"maximum_provider_polls":12}','one exact owner-sponsored Hammer operation','Synthetic expired predecessor evidence.');
    insert into tongs.restricted_beta_policy_revisions(
      id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,reserved_headroom_micros,
      maximum_concurrency,rolling_window_seconds,evidence_max_age_seconds,reason
    ) values
      ('${ids.wrongPolicy}','production',117,'active',44589,0,1,86400,86400,'Synthetic obsolete envelope.'),
      ('${ids.currentPolicy}','production',118,'active',10840000,0,1,86400,86400,'Synthetic reviewed current envelope.');
    insert into tongs.restricted_beta_policy_capabilities(
      id,policy_revision_id,capability_code,admission_mode,cost_evidence_revision_id,maximum_attempts,
      maximum_concurrency,per_operation_supplier_ceiling_micros,per_operation_supporting_ceiling_micros,
      per_operation_tail_ceiling_micros,permitted_callers_json,exact_model_or_sku,notes
    ) values
      ('${ids.wrongCapability}','${ids.wrongPolicy}','assemblyai.transcription.hammer','covered','${ids.oldEvidence}',1,1,38589,6000,0,'["interactive"]','universal-3-5-pro:diarization','Synthetic obsolete envelope.'),
      ('${ids.currentCapability}','${ids.currentPolicy}','assemblyai.transcription.hammer','covered','${ids.oldEvidence}',1,1,38589,6000,0,'["interactive"]','universal-3-5-pro:diarization','Synthetic reviewed current envelope.');
  `);

  const wrongEnvelope = sql(`
    select set_config('request.jwt.claim.role','service_role',false);
    select tongs.renew_hammer_first_transcription_aggregate_cost_authority(
      '${ids.wrongPolicy}','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000003','${ids.operator}','${"b".repeat(64)}',clock_timestamp(),
      clock_timestamp()+interval '12 hours','https://www.assemblyai.com/pricing/','Reject obsolete aggregate envelope.');
  `, { allowFailure: true });
  assert(wrongEnvelope.status !== 0 && /changed upstream/.test(wrongEnvelope.stderr), "obsolete 44,589 global envelope fails closed");

  const receipt = JSON.parse(sql(`
    select set_config('request.jwt.claim.role','service_role',false);
    select tongs.renew_hammer_first_transcription_aggregate_cost_authority(
      '${ids.currentPolicy}','${ids.newEvidence}','${ids.newPolicy}','${ids.newCapability}','${ids.operator}',
      '${"c".repeat(64)}',clock_timestamp(),clock_timestamp()+interval '12 hours',
      'https://www.assemblyai.com/pricing/','Renew exact expired evidence without changing authority.')::text;
  `).stdout.trim().split(/\r?\n/).at(-1));
  assert(receipt.aggregate_forge_exposure_limit_micros === 10_840_000, "global aggregate envelope remains 10,840,000 micros");
  assert(receipt.per_operation_wholesale_ceiling_micros === 44_589, "individual Hammer exposure remains 44,589 micros");
  assert(receipt.supplier_ceiling_micros === 38_589 && receipt.supporting_cost_ceiling_micros === 6_000, "supplier and supporting ceilings remain exact");
  assert(receipt.maximum_attempts === 1 && receipt.automatic_retries === 0, "one-attempt and zero-retry contract remains exact");
  assert(receipt.customer_payment_micros === 0 && receipt.customer_credit_units === 0, "renewal creates no customer charge authority");
  assert(sql("select tongs._current_hammer_first_transcription_aggregate_policy()::text;").stdout.trim() === ids.newPolicy, "resolver selects the fresh exact successor");

  const beforeCounts = sql("select count(*)||'|'||(select count(*) from tongs.restricted_beta_policy_revisions)||(select '|'||count(*) from tongs.restricted_beta_policy_capabilities) from tongs.restricted_beta_cost_evidence_revisions;").stdout.trim();
  const duplicate = sql(`
    select set_config('request.jwt.claim.role','service_role',false);
    select tongs.renew_hammer_first_transcription_aggregate_cost_authority(
      '${ids.newPolicy}','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003','${ids.operator}','${"c".repeat(64)}',clock_timestamp(),
      clock_timestamp()+interval '12 hours','https://www.assemblyai.com/pricing/','Reject duplicate evidence identity.');
  `, { allowFailure: true });
  assert(duplicate.status !== 0 && /duplicate AssemblyAI aggregate renewal evidence/.test(duplicate.stderr), "duplicate evidence renewal fails closed");
  const afterCounts = sql("select count(*)||'|'||(select count(*) from tongs.restricted_beta_policy_revisions)||(select '|'||count(*) from tongs.restricted_beta_policy_capabilities) from tongs.restricted_beta_cost_evidence_revisions;").stdout.trim();
  assert(beforeCounts === afterCounts, "failed duplicate renewal creates no partial authority rows");

  const capacityCounts = sql("select count(*)||'|'||(select count(*) from tongs.hammer_first_transcription_activation_authorities) from tongs.hammer_first_transcription_capacity_authorities;").stdout.trim();
  const missingCapacity = sql(`
    select set_config('request.jwt.claim.role','service_role',false);
    select tongs.renew_hammer_owner_funded_first_transcription_authority(
      null,null,null,null,null,'${ids.operator}',null,null,null,0,0,0,false,null,null,'Missing capacity must fail.');
  `, { allowFailure: true });
  assert(missingCapacity.status !== 0 && /current bounded Hammer renewal evidence is required/.test(missingCapacity.stderr), "missing capacity evidence fails before renewal");
  assert(sql("select count(*)||'|'||(select count(*) from tongs.hammer_first_transcription_activation_authorities) from tongs.hammer_first_transcription_capacity_authorities;").stdout.trim() === capacityCounts, "missing capacity evidence creates no capacity or activation rows");

  const acl = JSON.parse(sql(`select json_build_object(
    'public',has_function_privilege('public','tongs.renew_hammer_first_transcription_aggregate_cost_authority(uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text)','EXECUTE'),
    'anon',has_function_privilege('anon','tongs.renew_hammer_first_transcription_aggregate_cost_authority(uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text)','EXECUTE'),
    'authenticated',has_function_privilege('authenticated','tongs.renew_hammer_first_transcription_aggregate_cost_authority(uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text)','EXECUTE'),
    'service',has_function_privilege('service_role','tongs.renew_hammer_first_transcription_aggregate_cost_authority(uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text)','EXECUTE'))::text;`).stdout.trim());
  assert(!acl.public && !acl.anon && !acl.authenticated && acl.service, "renewal remains service-role only");
} finally {
  docker(["exec", sourceContainer, "dropdb", "-U", "postgres", "--if-exists", "--force", database]);
}
