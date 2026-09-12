import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_hearth_funding_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
const migrations = [
  "20260910120000_tongs_accounting_foundation.sql",
  "20260911120000_tongs_private_pricing_reservations_shadow.sql",
  "20260912120000_tongs_owner_budget_reservations_shadow.sql",
  "20260915120000_tongs_runway_paid_execution_boundary.sql",
  "20260916120000_tongs_runway_owner_pilot_activation.sql",
  "20260917120000_tongs_pricing_customer_interface.sql",
  "20260918120000_tongs_failure_relief_openai_text_shadow.sql",
  "20260919120000_tongs_openai_text_enforcement_foundation.sql",
  "20260920120000_tongs_hearth_chat_paid_execution.sql",
  "20260921120000_tongs_openai_hearth_owner_pilot_control.sql",
  "20260922120000_tongs_openai_hearth_luna_pilot_proposal.sql",
  "20260922130000_tongs_openai_hearth_luna_pilot_control.sql",
  "20260922140000_tongs_openai_hearth_luna_pilot_emergency_halt.sql",
  "20260922150000_tongs_openai_loss_policy_scope_and_preprovider_rearm.sql",
  "20260922160000_tongs_failure_class_corrections_and_luna_retest.sql",
  "20260922170000_tongs_precise_forge_failure_classes.sql",
  "20260923120000_tongs_customer_hearth_luna_canary.sql",
  "20260928120000_tongs_openai_text_ordinary_customer_funding.sql",
  "20260929120000_tongs_openai_text_model_catalog.sql",
  "20260930120000_tongs_openai_evidence_and_support_proposal.sql",
  "20261001120000_tongs_restricted_beta_financial_policy.sql",
  "20261002120000_tongs_aggregate_paid_execution_connection.sql",
  "20261003120000_tongs_openai_cost_reconciliation_connection.sql",
  "20261004120000_tongs_openai_transcription_financial_coordination.sql",
  "20261005120000_tongs_customer_funding_read_model.sql",
  "20261006120000_tongs_owner_org_funding_authority.sql",
  "20261006130000_tongs_openai_model_catalog_revision_2.sql",
  "20261007120000_tongs_non_spending_financial_repairs.sql",
  "20261008120000_tongs_owner_funded_hearth_activation.sql",
  "20261008130000_tongs_owner_hearth_runway_commitment_repair.sql",
  "20261008140000_tongs_owner_hearth_attempt_signature_repair.sql",
  "20261008150000_tongs_owner_hearth_definitive_rejection_recovery.sql",
  "20261008160000_tongs_owner_hearth_compatibility_result_corrections.sql",
  "20261008170000_tongs_owner_hearth_compatibility_rpc_alias.sql",
  "20261008180000_tongs_owner_hearth_fresh_compatibility_retry.sql",
  "20261008190000_tongs_owner_hearth_terminal_concurrency_recovery.sql",
  "20261008200000_tongs_owner_hearth_preprovider_recovery_expiry.sql",
  "20261008210000_tongs_owner_hearth_recovery_renewal.sql",
  "20261008220000_tongs_owner_hearth_model_choice_view.sql",
  "20261009120000_tongs_openai_coordinated_cutover.sql",
  "20261010120000_tongs_owner_funded_hearth_research.sql",
  "20261010130000_tongs_owner_hearth_research_permissions.sql",
];

function docker(args, input) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
}
function check(result, label) {
  if (result.status !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout}`);
}
function psql(sql, label) {
  const result = docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], sql);
  check(result, label);
}

try {
  check(docker(["exec", container, "createdb", "-U", "postgres", database]), "create isolated database");
  const baseline = readFileSync("supabase/tests/billing_isolated_baseline.sql", "utf8")
    .replace(/^create role anon nologin;\r?\n/m, "")
    .replace(/^create role authenticated nologin;\r?\n/m, "")
    .replace(/^create role service_role nologin bypassrls;\r?\n/m, "");
  psql(baseline, "baseline");
  psql(`
    create table tongs.orgs(
      id uuid primary key,name text not null,created_by uuid references auth.users(id),
      personal_owner_user_id uuid references auth.users(id),created_at timestamptz default now(),updated_at timestamptz default now());
    create table tongs.org_members(
      org_id uuid references tongs.orgs(id),user_id uuid references auth.users(id),
      org_role text not null check(org_role in ('owner','admin','member')),created_at timestamptz default now(),
      created_by uuid references auth.users(id),primary key(org_id,user_id));
    alter table tongs.workspaces add column org_id uuid references tongs.orgs(id);
    alter table tongs.workspaces add column created_by uuid references auth.users(id);
    create table tongs.workspace_members(
      workspace_id uuid references tongs.workspaces(id),user_id uuid references auth.users(id),
      role text not null default 'member',primary key(workspace_id,user_id));
    create table tongs.workpiece_jobs(id uuid primary key,job_type text not null,status text not null);
    create table tongs.episodes(
      id uuid primary key,workspace_id uuid not null references tongs.workspaces(id),unique(id,workspace_id));
    create table tongs.hearth_research_synthesis_results(
      id uuid primary key default gen_random_uuid(),operation_id text not null unique,reservation_id uuid not null unique,
      user_id uuid not null references auth.users(id),workspace_id uuid not null references tongs.workspaces(id),
      workpiece_id uuid not null references tongs.episodes(id),request_fingerprint text not null,provider_request_id text,
      input_units bigint not null,output_units bigint not null,result_json jsonb not null,created_at timestamptz not null default now());
  `, "organization compatibility baseline");
  psql('create extension if not exists "uuid-ossp" with schema extensions;', "uuid compatibility");
  const guarded = process.env.HEARTH_RESEARCH_ACL_SEQUENCE === "guarded";
  for (const migration of migrations) {
    if (migration.startsWith("20261010120000")) {
      psql(`alter default privileges for role postgres in schema tongs grant execute on functions to authenticated,service_role;
        create function tongs._existing_release_acl_sentinel() returns integer language sql as 'select 1';`, "production-equivalent function ownership/default grants");
      if (guarded) {
        psql(`create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key);`, "synthetic migration ledger");
        psql(readFileSync("docs/billing/proposals/owner-hearth-research-v1.permissions-guard.sql", "utf8"), "pre-creation permission guard");
      }
    }
    psql(readFileSync(`supabase/migrations/${migration}`, "utf8"), migration);
    if (migration.startsWith("20261010120000")) {
      psql(`do $$ declare sig text; begin
        foreach sig in array array['tongs._owner_hearth_research_latest_authorization(uuid,uuid)',
          'tongs._finish_owner_hearth_research_stage(uuid,text,text,bigint,jsonb,jsonb)'] loop
          if has_function_privilege('authenticated',sig,'EXECUTE')<>${!guarded}
            or has_function_privilege('anon',sig,'EXECUTE')<>${!guarded} then
            raise exception 'inter-migration inherited privilege proof failed: %',sig; end if;
        end loop;
        if not has_function_privilege('authenticated','tongs._existing_release_acl_sentinel()','EXECUTE') then
          raise exception 'guard modified existing application function privileges'; end if;
        end $$;`, "independent-connection proof after original COMMIT, before correction");
      if (guarded) {
        psql(`insert into supabase_migrations.schema_migrations values('20261010120000');`, "synthetic original migration COMMIT ledger");
        const prematureRestore = docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
          readFileSync("docs/billing/proposals/owner-hearth-research-v1.permissions-restore.sql", "utf8"));
        if (prematureRestore.status === 0 || !prematureRestore.stderr.includes("both research migrations must be recorded exactly once")) {
          throw new Error("Incomplete migration sequence did not block default restoration");
        }
        psql(`set role authenticated; do $$ begin
        begin perform tongs._owner_hearth_research_latest_authorization(null,null); raise exception 'inter-migration helper access allowed';
        exception when insufficient_privilege then if sqlerrm not like 'permission denied for function %' then raise; end if; end;
        begin perform tongs._finish_owner_hearth_research_stage(null,'missing','captured',0,'{}','{}'); raise exception 'inter-migration stage helper access allowed';
        exception when insufficient_privilege then if sqlerrm not like 'permission denied for function %' then raise; end if; end;
        end $$; reset role;`, "inter-migration execution denied after attempted premature restoration");
      }
      else psql(`alter default privileges for role postgres in schema tongs grant execute on functions to anon;
        grant execute on function tongs._owner_hearth_research_latest_authorization(uuid,uuid),
        tongs._finish_owner_hearth_research_stage(uuid,text,text,bigint,jsonb,jsonb) to anon;`, "additional anonymous inherited-grant stress fixture");
    }
  }
  if (guarded) {
    psql(`insert into supabase_migrations.schema_migrations values('20261010130000');`, "synthetic correction migration COMMIT ledger");
    psql(readFileSync("docs/billing/proposals/owner-hearth-research-v1.permissions-restore.sql", "utf8"), "verified default-ACL restoration");
    psql(`do $$ begin
      if exists(select 1 from pg_default_acl where defaclrole='postgres'::regrole and defaclobjtype='f' and defaclnamespace=0)
        or has_function_privilege('authenticated','tongs._owner_hearth_research_latest_authorization(uuid,uuid)','EXECUTE') then
        raise exception 'restoration altered helper ACL or global defaults'; end if;
      if (select array_agg(r.rolname::text order by r.rolname) from pg_default_acl d
        cross join lateral aclexplode(d.defaclacl) a join pg_roles r on r.oid=a.grantee
        where d.defaclrole='postgres'::regrole and d.defaclobjtype='f' and d.defaclnamespace='tongs'::regnamespace)
        is distinct from array['authenticated','service_role']::text[] then raise exception 'tongs defaults not restored exactly'; end if;
      end $$;`, "restoration retains private helper ACLs");
  }
  // The older accounting-only fixture reserves synthetic organization funds;
  // it predates the separately approved customer rollout scope. Disable only
  // that rollout trigger inside its rollback transaction, never for execution
  // or cutover tests. All production-shaped guards remain enabled afterward.
  psql(readFileSync("supabase/tests/hearth_access_funding.sql", "utf8")
    .replace("begin;", "begin; alter table tongs.funding_reservations disable trigger funding_reservations_customer_test_scope;"), "Hearth access and funding proof");
  psql(readFileSync("supabase/tests/non_spending_financial_repairs.sql", "utf8"), "non-spending financial repair proof");
  psql(readFileSync("supabase/tests/owner_funded_hearth_research.sql", "utf8"), "dormant owner-funded Hearth research proof");
  psql(readFileSync("supabase/tests/owner_funded_hearth_activation.sql", "utf8")
    .replace(/rollback;\s*$/, () => readFileSync("supabase/tests/owner_hearth_research_permissions.sql", "utf8")
      + "\n" + readFileSync("supabase/tests/openai_coordinated_cutover.sql", "utf8") + "\nrollback;"), "owner-funded Hearth activation, complete permissions, and cutover proof");
  // Two concurrent transactions, two exact models/policy revisions, one
  // environment ceiling. This database is disposable; no production fixture.
  const seed = readFileSync("supabase/tests/restricted_beta_financial_policy.sql", "utf8").split("do $$ declare r jsonb;")[0];
  psql(seed + `
    insert into tongs.restricted_beta_policy_revisions(id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,reserved_headroom_micros,maximum_concurrency,rolling_window_seconds,evidence_max_age_seconds,allocation_policy_revision_id,tail_policy_revision_id,reason)
    select '55000000-0000-4000-8000-000000000130',environment,3,lifecycle_state,aggregate_forge_exposure_limit_micros,reserved_headroom_micros,maximum_concurrency,rolling_window_seconds,evidence_max_age_seconds,allocation_policy_revision_id,tail_policy_revision_id,'isolated second exact model'
    from tongs.restricted_beta_policy_revisions where id='55000000-0000-4000-8000-000000000030';
    insert into tongs.restricted_beta_policy_capabilities(id,policy_revision_id,capability_code,admission_mode,cost_evidence_revision_id,maximum_attempts,maximum_concurrency,per_operation_supplier_ceiling_micros,per_operation_supporting_ceiling_micros,per_operation_tail_ceiling_micros,permitted_callers_json,exact_model_or_sku,notes)
    select '55000000-0000-4000-8000-000000000131','55000000-0000-4000-8000-000000000130',capability_code,admission_mode,cost_evidence_revision_id,maximum_attempts,maximum_concurrency,per_operation_supplier_ceiling_micros,per_operation_supporting_ceiling_micros,per_operation_tail_ceiling_micros,permitted_callers_json,'fake-astra','isolated second exact model'
    from tongs.restricted_beta_policy_capabilities where id='55000000-0000-4000-8000-000000000031';
    commit;`, "cross-model fixture");
  const race = (suffix, policy, model, actor) => new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database]);
    let output = ""; child.stdout.on("data", data => { output += data; }); child.stderr.on("data", data => { output += data; });
    child.on("error", reject); child.on("close", code => code === 0 ? resolve(output) : reject(new Error(output)));
    child.stdin.end(`begin; set local request.jwt.claim.role='service_role';
      select tongs.reserve_restricted_beta_exposure('55000000-0000-4000-8000-000000000${suffix}','55000000-0000-4000-8000-000000000${policy}',
        'openai.text.hearth_research','cross-model-${suffix}','55000000-0000-4000-8000-00000000000${actor}',
        '55000000-0000-4000-8000-000000000010',repeat('${actor}',64),'${model}','test_customer','cross-model-${suffix}',
        'simulated','interactive',600,600,0,0,0,0,60,'cross-model-${suffix}'); select pg_sleep(1); commit;`);
  });
  const raceResults = await Promise.all([race("140", "030", "fake-luna", 1), race("141", "130", "fake-astra", 2)]);
  if (raceResults.filter(value => value.includes('"authorized": true')).length !== 1
      || !raceResults.some(value => value.includes("aggregate_exposure_exhausted"))) throw new Error("Cross-model ceiling was multiplied");
  console.log(JSON.stringify({
    isolated_database: true,
    explicit_owner_identity_not_role_inheritance: "passed",
    zero_purchased_credit_owner_selection: "passed",
    owner_execution_requires_separate_active_budget: "passed",
    organization_actor_payer_separation: "passed",
    organization_revocation_blocks_new_authority: "passed",
    test_refill_simulated_only: "passed",
    legacy_balance_preserved_ineligible: "passed",
    five_model_draft_catalog: "passed",
    production_rollout_unchanged: "passed",
    complete_serialized_request_binding_private: "passed",
    cross_revision_supplier_obligations_preserved: "passed",
    conservative_exposure_adjustment_and_halt: "passed",
    post_30_day_tail_funding_explicit: "passed",
    isolated_owner_credential_authority: "passed",
    exact_owner_operation_binding: "passed",
    historical_obligation_does_not_consume_concurrency: "passed",
    non_overlapping_owner_tail: "passed",
    cross_model_concurrent_shared_ceiling: "passed_one_admitted_one_rejected",
    revoked_result_access_and_job_halt: "passed",
    owner_research_proposal_dormant: "passed",
    owner_research_customer_failure_charge_zero: "passed",
    all_21_research_function_acl_ownership_and_search_paths: "passed",
    unauthorized_helper_execution_denied: "passed",
    legitimate_service_helper_execution_and_replay: "passed",
    creator_reads_reviews_and_current_access_replay: "passed",
    migration_sequence: guarded ? "guarded_separate_commits_no_exposure" : "unsafe_interval_reproduced_forward_repair_verified",
  }));
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", database]);
}
