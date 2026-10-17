import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_hammer_b1b_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
const schemaPath = resolve(root, ".git/forge-private-evidence/slice6a-connected-schema-after.sql");
const migrationPath = resolve(root, "supabase/migrations/20261017201640_hammer_customer_test_acceptance.sql");
const priorVerifier = readFileSync(
  resolve(root, "scripts/verify-hammer-test-canary-prerequisites-isolated.mjs"),
  "utf8",
);
const fixtureMatch = priorVerifier.match(/const fixture = String\.raw`([\s\S]*?)`;\n\ntry \{/);
if (!fixtureMatch) throw new Error("Hammer prerequisite fixture could not be located");
const fixture = fixtureMatch[1]
  .replaceAll("6b100000-0000-4000-8000-000000000010", "40010000-0000-4000-8000-000000000601")
  .replace(
    "'slice6b1-mini','sku','openai','slice6b1-mini'",
    "'slice6b1-mini','sku','openai','openai-text:hammer.transcript_cleanup:gpt-5.4-mini:40010000-0000-4000-8000-000000000301'",
  );

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 96 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) throw new Error(`${options.label || command} failed:\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function docker(args, options = {}) { return run("docker", args, options); }
function psql(sql, label) {
  return docker([
    "exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], { input: sql, label });
}
function psqlFile(hostPath, containerPath, label) {
  docker(["cp", hostPath, `${container}:${containerPath}`], { label: `${label} copy` });
  return docker([
    "exec", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database, "-f", containerPath,
  ], { label });
}

const staged = String.raw`
insert into auth.users(id,email) values
 ('b1b00000-0000-4000-8000-000000000001','customer@example.test');
insert into tongs.openai_text_cost_policy_revisions(
 id,route_code,revision,policy_code,attempt_plan,maximum_input_units,maximum_output_units,maximum_attempts,
 direct_provider_ceiling_micros,supporting_cost_ceiling_micros,full_cost_ceiling_micros,cost_coverage,lifecycle_state,notes
) values('40010000-0000-4000-8000-000000000301','hammer.transcript_cleanup',3,'b1b-mini',
 '[{"attempt":1,"rate_revision_id":"6b100000-0000-4000-8000-000000000080","runtime_model":"gpt-5.4-mini","provider_model_id":"gpt-5.4-mini-2026-03-17","input_max":128000,"output_max":16384}]',
 128000,16384,1,169728,0,169728,'complete','active','B1-B exact Mini policy');
insert into tongs.private_pricing_publications(
 id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id
) values('b1b00000-0000-4000-8000-000000000002','40010000-0000-4000-8000-000000000401',
 '40010000-0000-4000-8000-000000000402',1,'published','B1-B exact price',
 '6b100000-0000-4000-8000-000000000001');
insert into tongs.openai_text_failure_loss_policy_revisions(
 id,route_code,environment,revision,per_operation_limit_micros,aggregate_limit_micros,
 rolling_window_seconds,maximum_concurrency,lifecycle_state,reason,actor_id
) values('40010000-0000-4000-8000-000000000602','hammer.transcript_cleanup','production',1,
 967680,967680,86400,1,'active','B1-B defensive Live policy',
 '6b100000-0000-4000-8000-000000000001');
insert into tongs.openai_text_failure_loss_rollout_revisions(
 route_code,financial_environment,revision,mode,loss_policy_revision_id,reason,actor_id
) values
 ('hammer.transcript_cleanup','test',1,'halt_new','40010000-0000-4000-8000-000000000601','B1-B Test halt baseline','6b100000-0000-4000-8000-000000000001'),
 ('hammer.transcript_cleanup','live',1,'halt_new','40010000-0000-4000-8000-000000000602','B1-B Live halt baseline','6b100000-0000-4000-8000-000000000001');
insert into tongs.orgs(id,name,created_by,personal_owner_user_id)
values('b1b00000-0000-4000-8000-000000000010','B1-B Customer Org','b1b00000-0000-4000-8000-000000000001','b1b00000-0000-4000-8000-000000000001');
insert into tongs.workspaces(id,name,created_by,org_id)
values('b1b00000-0000-4000-8000-000000000011','B1-B Customer Workspace','b1b00000-0000-4000-8000-000000000001','b1b00000-0000-4000-8000-000000000010');
insert into tongs.customer_paid_execution_scope_authorizations(
 id,user_id,workspace_id,financial_environment,route_code,provider,model_or_sku,
 pricing_revision_id,cost_policy_revision_id,maximum_operation_count,
 maximum_customer_charge_micros,maximum_wholesale_exposure_micros,
 maximum_concurrency,rolling_window_seconds,valid_from,valid_until,status,
 reason,created_by,authorization_kind,created_at
) values
 ('b1b00000-0000-4000-8000-000000000030','6b100000-0000-4000-8000-000000000001','b1b00000-0000-4000-8000-000000000011','test','hammer.transcript_cleanup','openai','gpt-5.4-mini','40010000-0000-4000-8000-000000000402','40010000-0000-4000-8000-000000000301',1,230000,169728,1,86400,'2026-10-04T21:30:12Z','2026-10-05T21:30:12Z','active','Historical owner-only Hammer Test canary one','6b100000-0000-4000-8000-000000000001','owner_only','2026-10-04T21:30:12Z'),
 ('b1b00000-0000-4000-8000-000000000031','6b100000-0000-4000-8000-000000000001','b1b00000-0000-4000-8000-000000000011','test','hammer.transcript_cleanup','openai','gpt-5.4-mini','40010000-0000-4000-8000-000000000402','40010000-0000-4000-8000-000000000301',1,230000,169728,1,86400,'2026-10-05T23:47:00Z','2026-10-06T01:17:00Z','active','Historical owner-only Hammer Test canary two','6b100000-0000-4000-8000-000000000001','owner_only','2026-10-05T23:47:00Z'),
 ('b1b00000-0000-4000-8000-000000000032','6b100000-0000-4000-8000-000000000001','b1b00000-0000-4000-8000-000000000011','test','hammer.transcript_cleanup','openai','gpt-5.4-mini','40010000-0000-4000-8000-000000000402','40010000-0000-4000-8000-000000000301',1,230000,169728,1,86400,'2026-10-07T08:33:52Z','2026-10-07T09:03:52Z','active','Historical owner-only Hammer Test canary three','6b100000-0000-4000-8000-000000000001','owner_only','2026-10-07T08:33:52Z');
`;

try {
  docker(["exec", container, "createdb", "-U", "postgres", database], { label: "create isolated database" });
  psql(String.raw`
    create schema if not exists auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(current_setting('request.jwt.claim.role',true),'') $$;
    create schema if not exists extensions;
    create extension if not exists "uuid-ossp" with schema extensions;
    create extension if not exists pgcrypto with schema extensions;
  `, "isolated bootstrap");
  psqlFile(schemaPath, "/tmp/forge-hammer-b1b-schema.sql", "connected-shape schema restore");
  psql(fixture, "Hammer prerequisite fixture");
  psqlFile(
    resolve(root, "supabase/migrations/20261012040000_hammer_test_canary_prerequisites.sql"),
    "/tmp/forge-hammer-b1b-prerequisite.sql",
    "Hammer prerequisite migration",
  );
  psql(staged, "B1-B staged exact authority");
  const historicalBefore = psql(String.raw`
    select coalesce(jsonb_agg(to_jsonb(scope_auth) order by scope_auth.id),'[]'::jsonb)
    from tongs.customer_paid_execution_scope_authorizations scope_auth
    where scope_auth.route_code='hammer.transcript_cleanup'
      and scope_auth.authorization_kind='owner_only';
  `, "historical scopes before migration");
  psqlFile(migrationPath, "/tmp/forge-hammer-b1b-migration.sql", "B1-B migration");

  const inert = JSON.parse(psql(String.raw`
    select jsonb_build_object(
      'latest_route_revision',(select revision from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_cleanup' order by revision desc limit 1),
      'latest_route_mode',(select mode from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_cleanup' order by revision desc limit 1),
      'scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup'),
      'historical_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup' and authorization_kind='owner_only'),
      'normal_customer_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup' and authorization_kind='normal_customer'),
      'effective_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations scope_auth where route_code='hammer.transcript_cleanup' and tongs._hammer_scope_is_effective(scope_auth.id,clock_timestamp())),
      'quotes',(select count(*) from tongs.openai_text_customer_quote_bindings where route_code='hammer.transcript_cleanup'),
      'reservations',(select count(*) from tongs.openai_text_funding_bindings where route_code='hammer.transcript_cleanup'));
  `, "inert migration readback"));
  if (inert.latest_route_revision !== 3 || inert.latest_route_mode !== "halt_new"
      || inert.scopes !== 3 || inert.historical_scopes !== 3
      || inert.normal_customer_scopes !== 0 || inert.effective_scopes !== 0
      || inert.quotes !== 0 || inert.reservations !== 0) {
    throw new Error(`migration application created authority: ${JSON.stringify(inert)}`);
  }
  const historicalAfterMigration = psql(String.raw`
    select coalesce(jsonb_agg(to_jsonb(scope_auth) order by scope_auth.id),'[]'::jsonb)
    from tongs.customer_paid_execution_scope_authorizations scope_auth
    where scope_auth.route_code='hammer.transcript_cleanup'
      and scope_auth.authorization_kind='owner_only';
  `, "historical scopes after migration");
  if (historicalAfterMigration !== historicalBefore) throw new Error("migration changed historical owner-only scopes");

  const activated = JSON.parse(psql(String.raw`
    set request.jwt.claim.role='service_role';
    select tongs.activate_hammer_customer_test_acceptance(
      'b1b00000-0000-4000-8000-000000000020',
      '6b100000-0000-4000-8000-000000000001',
      'b1b00000-0000-4000-8000-000000000001',
      'b1b00000-0000-4000-8000-000000000011',
      date_trunc('second',clock_timestamp()+interval '1 hour'),
      'B1-B disposable exact customer activation'
    );
  `, "activate exact Test scope"));
  if (activated.replay !== false || activated.customer_credit_units !== 46
      || activated.maximum_customer_charge_micros !== 230000
      || activated.maximum_wholesale_exposure_micros !== 169728
      || activated.maximum_operation_count !== 1
      || activated.live_authority_count !== 0) {
    throw new Error(`activation result drifted: ${JSON.stringify(activated)}`);
  }

  const replay = JSON.parse(psql(String.raw`
    set request.jwt.claim.role='service_role';
    select tongs.activate_hammer_customer_test_acceptance(
      'b1b00000-0000-4000-8000-000000000020',
      '6b100000-0000-4000-8000-000000000001',
      'b1b00000-0000-4000-8000-000000000001',
      'b1b00000-0000-4000-8000-000000000011',
      (select valid_until from tongs.customer_paid_execution_scope_authorizations where id='b1b00000-0000-4000-8000-000000000020'),
      'B1-B disposable exact customer activation'
    );
  `, "activation replay"));
  if (replay.replay !== true) throw new Error("exact activation replay was not idempotent");

  const state = JSON.parse(psql(String.raw`
    select jsonb_build_object(
      'route_revision',(select revision from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_cleanup' order by revision desc limit 1),
      'route_mode',(select mode from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_cleanup' order by revision desc limit 1),
      'route_cost_policy',(select cost_policy_revision_id from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_cleanup' order by revision desc limit 1),
      'test_loss_revision',(select revision from tongs.openai_text_failure_loss_rollout_revisions where route_code='hammer.transcript_cleanup' and financial_environment='test' order by revision desc limit 1),
      'test_loss_mode',(select mode from tongs.openai_text_failure_loss_rollout_revisions where route_code='hammer.transcript_cleanup' and financial_environment='test' order by revision desc limit 1),
      'live_loss_revision',(select revision from tongs.openai_text_failure_loss_rollout_revisions where route_code='hammer.transcript_cleanup' and financial_environment='live' order by revision desc limit 1),
      'live_loss_mode',(select mode from tongs.openai_text_failure_loss_rollout_revisions where route_code='hammer.transcript_cleanup' and financial_environment='live' order by revision desc limit 1),
      'test_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup' and financial_environment='test'),
      'historical_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup' and authorization_kind='owner_only'),
      'normal_customer_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup' and authorization_kind='normal_customer'),
      'effective_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations scope_auth where route_code='hammer.transcript_cleanup' and tongs._hammer_scope_is_effective(scope_auth.id,clock_timestamp())),
      'live_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup' and financial_environment='live'),
      'operation_limit',(select maximum_operation_count from tongs.customer_paid_execution_scope_authorizations where id='b1b00000-0000-4000-8000-000000000020'),
      'model',(select model_or_sku from tongs.customer_paid_execution_scope_authorizations where id='b1b00000-0000-4000-8000-000000000020'),
      'customer_ceiling',(select maximum_customer_charge_micros from tongs.customer_paid_execution_scope_authorizations where id='b1b00000-0000-4000-8000-000000000020'),
      'wholesale_ceiling',(select maximum_wholesale_exposure_micros from tongs.customer_paid_execution_scope_authorizations where id='b1b00000-0000-4000-8000-000000000020'),
      'service_can_activate',has_function_privilege('service_role','tongs.activate_hammer_customer_test_acceptance(uuid,uuid,uuid,uuid,timestamptz,text)','execute'),
      'authenticated_can_activate',has_function_privilege('authenticated','tongs.activate_hammer_customer_test_acceptance(uuid,uuid,uuid,uuid,timestamptz,text)','execute'),
      'quotes',(select count(*) from tongs.openai_text_customer_quote_bindings where route_code='hammer.transcript_cleanup'),
      'reservations',(select count(*) from tongs.openai_text_funding_bindings where route_code='hammer.transcript_cleanup'));
  `, "activation state readback"));
  const expected = {
    route_revision: 4,
    route_mode: "enforce",
    route_cost_policy: "40010000-0000-4000-8000-000000000301",
    test_loss_revision: 2,
    test_loss_mode: "enforce",
    live_loss_revision: 1,
    live_loss_mode: "halt_new",
    test_scopes: 4,
    historical_scopes: 3,
    normal_customer_scopes: 1,
    effective_scopes: 1,
    live_scopes: 0,
    operation_limit: 1,
    model: "gpt-5.4-mini",
    customer_ceiling: 230000,
    wholesale_ceiling: 169728,
    service_can_activate: true,
    authenticated_can_activate: false,
    quotes: 0,
    reservations: 0,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (state[key] !== value) throw new Error(`${key} drifted: ${JSON.stringify(state)}`);
  }

  let conflictFailed = false;
  try {
    psql(String.raw`
      set request.jwt.claim.role='service_role';
      select tongs.activate_hammer_customer_test_acceptance(
        'b1b00000-0000-4000-8000-000000000020',
        '6b100000-0000-4000-8000-000000000001',
        'b1b00000-0000-4000-8000-000000000001',
        'b1b00000-0000-4000-8000-000000000011',
        now()+interval '2 hours',
        'B1-B conflicting replay must fail closed'
      );
    `, "conflicting replay");
  } catch {
    conflictFailed = true;
  }
  if (!conflictFailed) throw new Error("conflicting activation replay did not fail closed");

  psql(String.raw`
    set session_replication_role=replica;
    insert into tongs.funding_reservations(
      id,quote_id,user_id,operation_id,funding_source_type,funding_source_id,
      currency,reserved_customer_charge_micros,reserved_credit_units,
      reserved_wholesale_spend_micros,idempotency_key,funding_environment,
      rollout_authorization_id
    ) values
      ('b1b00000-0000-4000-8000-000000000040','b1b00000-0000-4000-8000-000000000050','b1b00000-0000-4000-8000-000000000001','hammer-b1d-failed-operation','customer_deposit','b1b00000-0000-4000-8000-000000000060','USD',230000,46,169728,'hammer-b1d-failure-marker','test','b1b00000-0000-4000-8000-000000000020'),
      ('b1b00000-0000-4000-8000-000000000041','b1b00000-0000-4000-8000-000000000051','b1b00000-0000-4000-8000-000000000001','hammer-b1d-ambiguous-operation','customer_deposit','b1b00000-0000-4000-8000-000000000061','USD',230000,46,169728,'hammer-b1d-ambiguous-marker','test','b1b00000-0000-4000-8000-000000000020');
    insert into tongs.funding_reservation_events(
      id,reservation_id,sequence,event_type,event_key,provider_attempt_key,
      customer_charge_micros,credit_units,wholesale_spend_micros,failure_class,evidence_json
    ) values
      ('b1b00000-0000-4000-8000-000000000070','b1b00000-0000-4000-8000-000000000040',1,'provider_failure_recorded','hammer-b1d-provider-failure','hammer-b1d-failed-attempt',0,0,40,'validation_failure','{"preserve":true}'),
      ('b1b00000-0000-4000-8000-000000000071','b1b00000-0000-4000-8000-000000000041',1,'submission_unknown','hammer-b1d-submission-unknown','hammer-b1d-ambiguous-attempt',null,null,null,'submission_unknown','{"preserve":true}');
    insert into tongs.supplier_expenses(
      id,reservation_id,expense_key,provider,component_code,provider_reference,
      currency,amount_micros,evidence_status,obligation_status,evidence_json,incurred_at
    ) values
      ('b1b00000-0000-4000-8000-000000000080','b1b00000-0000-4000-8000-000000000040','hammer-b1d-failure-expense','openai','text_generation','failure-request','USD',40,'estimated','open','{"preserve":true}',clock_timestamp()),
      ('b1b00000-0000-4000-8000-000000000081','b1b00000-0000-4000-8000-000000000041','hammer-b1d-ambiguous-expense','openai','text_generation',null,'USD',null,'unresolved','unresolved','{"preserve":true}',clock_timestamp());
    set session_replication_role=origin;
  `, "stage failure and ambiguous reconciliation obligations");
  const financialEvidenceBeforeClose = psql(String.raw`
    select jsonb_build_object(
      'reservations',(select jsonb_agg(to_jsonb(r) order by r.id) from tongs.funding_reservations r where r.rollout_authorization_id='b1b00000-0000-4000-8000-000000000020'),
      'events',(select jsonb_agg(to_jsonb(e) order by e.id) from tongs.funding_reservation_events e where e.reservation_id in('b1b00000-0000-4000-8000-000000000040','b1b00000-0000-4000-8000-000000000041')),
      'expenses',(select jsonb_agg(to_jsonb(x) order by x.id) from tongs.supplier_expenses x where x.reservation_id in('b1b00000-0000-4000-8000-000000000040','b1b00000-0000-4000-8000-000000000041'))
    );
  `, "financial evidence before shutdown");

  const closed = JSON.parse(psql(String.raw`
    set request.jwt.claim.role='service_role';
    select tongs.close_hammer_customer_test_acceptance(
      'b1b00000-0000-4000-8000-000000000090',
      'b1b00000-0000-4000-8000-000000000020',
      '6b100000-0000-4000-8000-000000000001',
      'B1-D disposable exact customer shutdown'
    );
  `, "close exact Test scope"));
  if (closed.replay !== false || closed.route_revision !== 5
      || closed.route_mode !== "halt_new" || closed.test_loss_revision !== 3
      || closed.test_loss_mode !== "halt_new" || closed.live_loss_revision !== 1
      || closed.live_loss_mode !== "halt_new" || closed.effective_scope_count !== 0) {
    throw new Error(`shutdown result drifted: ${JSON.stringify(closed)}`);
  }

  const closeReplay = JSON.parse(psql(String.raw`
    set request.jwt.claim.role='service_role';
    select tongs.close_hammer_customer_test_acceptance(
      'b1b00000-0000-4000-8000-000000000090',
      'b1b00000-0000-4000-8000-000000000020',
      '6b100000-0000-4000-8000-000000000001',
      'B1-D disposable exact customer shutdown'
    );
  `, "shutdown replay"));
  if (closeReplay.replay !== true) throw new Error("exact shutdown replay was not idempotent");

  let closeConflictFailed = false;
  try {
    psql(String.raw`
      set request.jwt.claim.role='service_role';
      select tongs.close_hammer_customer_test_acceptance(
        'b1b00000-0000-4000-8000-000000000090',
        'b1b00000-0000-4000-8000-000000000020',
        '6b100000-0000-4000-8000-000000000001',
        'B1-D conflicting shutdown must fail closed'
      );
    `, "conflicting shutdown replay");
  } catch {
    closeConflictFailed = true;
  }
  if (!closeConflictFailed) throw new Error("conflicting shutdown replay did not fail closed");

  const postClose = JSON.parse(psql(String.raw`
    select jsonb_build_object(
      'route_revision',(select revision from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_cleanup' order by revision desc limit 1),
      'route_mode',(select mode from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_cleanup' order by revision desc limit 1),
      'test_loss_revision',(select revision from tongs.openai_text_failure_loss_rollout_revisions where route_code='hammer.transcript_cleanup' and financial_environment='test' order by revision desc limit 1),
      'test_loss_mode',(select mode from tongs.openai_text_failure_loss_rollout_revisions where route_code='hammer.transcript_cleanup' and financial_environment='test' order by revision desc limit 1),
      'live_loss_revision',(select revision from tongs.openai_text_failure_loss_rollout_revisions where route_code='hammer.transcript_cleanup' and financial_environment='live' order by revision desc limit 1),
      'live_loss_mode',(select mode from tongs.openai_text_failure_loss_rollout_revisions where route_code='hammer.transcript_cleanup' and financial_environment='live' order by revision desc limit 1),
      'effective_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations scope_auth where route_code='hammer.transcript_cleanup' and tongs._hammer_scope_is_effective(scope_auth.id,clock_timestamp())),
      'historical_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup' and authorization_kind='owner_only'),
      'normal_customer_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup' and authorization_kind='normal_customer'),
      'closure_receipts',(select count(*) from tongs.hammer_customer_test_acceptance_closures where authorization_id='b1b00000-0000-4000-8000-000000000020'),
      'service_can_close',has_function_privilege('service_role','tongs.close_hammer_customer_test_acceptance(uuid,uuid,uuid,text)','execute'),
      'authenticated_can_close',has_function_privilege('authenticated','tongs.close_hammer_customer_test_acceptance(uuid,uuid,uuid,text)','execute')
    );
  `, "post-close state readback"));
  const expectedPostClose = {
    route_revision: 5,
    route_mode: "halt_new",
    test_loss_revision: 3,
    test_loss_mode: "halt_new",
    live_loss_revision: 1,
    live_loss_mode: "halt_new",
    effective_scopes: 0,
    historical_scopes: 3,
    normal_customer_scopes: 1,
    closure_receipts: 1,
    service_can_close: true,
    authenticated_can_close: false,
  };
  for (const [key, value] of Object.entries(expectedPostClose)) {
    if (postClose[key] !== value) throw new Error(`${key} drifted after shutdown: ${JSON.stringify(postClose)}`);
  }
  const historicalAfterClose = psql(String.raw`
    select coalesce(jsonb_agg(to_jsonb(scope_auth) order by scope_auth.id),'[]'::jsonb)
    from tongs.customer_paid_execution_scope_authorizations scope_auth
    where scope_auth.route_code='hammer.transcript_cleanup'
      and scope_auth.authorization_kind='owner_only';
  `, "historical scopes after shutdown");
  if (historicalAfterClose !== historicalBefore) throw new Error("shutdown changed historical owner-only scopes");
  const financialEvidenceAfterClose = psql(String.raw`
    select jsonb_build_object(
      'reservations',(select jsonb_agg(to_jsonb(r) order by r.id) from tongs.funding_reservations r where r.rollout_authorization_id='b1b00000-0000-4000-8000-000000000020'),
      'events',(select jsonb_agg(to_jsonb(e) order by e.id) from tongs.funding_reservation_events e where e.reservation_id in('b1b00000-0000-4000-8000-000000000040','b1b00000-0000-4000-8000-000000000041')),
      'expenses',(select jsonb_agg(to_jsonb(x) order by x.id) from tongs.supplier_expenses x where x.reservation_id in('b1b00000-0000-4000-8000-000000000040','b1b00000-0000-4000-8000-000000000041'))
    );
  `, "financial evidence after shutdown");
  if (financialEvidenceAfterClose !== financialEvidenceBeforeClose) throw new Error("shutdown changed reconciliation obligations");

  console.log(JSON.stringify({
    ok: true,
    database,
    migration_inert: inert,
    activation: state,
    exact_replay_idempotent: true,
    conflicting_replay_failed_closed: true,
    shutdown: postClose,
    exact_shutdown_replay_idempotent: true,
    conflicting_shutdown_failed_closed: true,
    historical_scopes_unchanged: true,
    failure_and_ambiguous_obligations_preserved: true,
    provider_network_calls: 0,
  }, null, 2));
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database], { label: "drop isolated database" });
}
