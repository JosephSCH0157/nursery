-- DISPOSABLE CERTIFICATION FIXTURE ONLY. This file restores reviewed historical
-- owner-Hearth aggregate-policy data omitted by the schema-only baseline export.
-- It must never be placed in the migration chain or run against a linked database.

begin;

do $guard$
declare
  v_lineage text;
  v_lineage_count bigint;
  v_head text;
  v_marker text := current_setting('forge.owner_hearth_policy_fixture', true);
begin
  select count(*), min(lineage) into v_lineage_count, v_lineage
  from forge_meta.database_lineage;
  select max(version) into v_head from supabase_migrations.schema_migrations;

  if current_database() <> 'postgres'
     or v_marker is distinct from 'disposable-baseline-v1'
     or v_lineage_count is distinct from 1
     or v_lineage is distinct from 'baseline-v1'
     or v_head not in ('20261104003358','20261104071802') then
    raise exception 'owner-Hearth policy fixture requires the exact disposable aggregate-attempt baseline';
  end if;

  if exists (
    select 1 from tongs.restricted_beta_policy_revisions
    where id = any(array[
      '9e86fd12-96ae-5e47-bfd0-9bb130e081ca','62afdf4d-0fad-5b23-a58f-b8f6aacad9e8',
      'd2b62b9b-8876-50b8-9f44-9f567cb6559c','33dcc509-8c98-50a0-8b5c-4bbd6e0dbd76',
      '64dc6183-b47d-50cb-b583-9158bee307a3','4f461d37-dfe0-5324-8882-ba8135951240',
      '1ff2bed7-e5de-58ae-8185-8df57f1163c4','cb2151c2-55b7-5a33-a0f9-b775650a9f95',
      'c70df4c8-b3f4-5fa8-8ca4-83e1ec5e2c66','975d3721-2704-5c2d-a6db-e45c2f57c6d9'
    ]::uuid[])
  ) or exists (
    select 1 from tongs.restricted_beta_cost_evidence_revisions
    where capability_code='openai.text.hearth_chat' and revision between 101 and 115
  ) then
    raise exception 'owner-Hearth policy fixture requires the reviewed policy family to be absent';
  end if;

  if exists(select 1 from tongs.openai_text_route_policies where route_code='hearth.chat_completion') then
    raise exception 'owner-Hearth policy fixture requires the reviewed Hearth route policy to be absent';
  end if;

  if exists (select 1 from tongs.openai_text_cost_policy_revisions
      where id = any(array[
        '81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002',
        '81000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000004',
        '81000000-0000-4000-8000-000000000005','81000000-0000-4000-8000-000000000011',
        '81000000-0000-4000-8000-000000000012','81000000-0000-4000-8000-000000000013',
        '81000000-0000-4000-8000-000000000014','81000000-0000-4000-8000-000000000015'
      ]::uuid[])) then
    raise exception 'owner-Hearth policy fixture requires the reviewed cost-policy family to be absent';
  end if;
end
$guard$;

create temporary table owner_hearth_policy_forbidden_counts(
  relation_name regclass primary key,
  row_count bigint not null
) on commit drop;

do $snapshot$
declare v_relation regclass; v_count bigint;
begin
  foreach v_relation in array array[
    'tongs.paid_execution_aggregate_assignments'::regclass,
    'tongs.owner_operating_budgets'::regclass,
    'tongs.owner_operating_budget_revisions'::regclass,
    'tongs.owner_hearth_authorizations'::regclass,
    'tongs.owner_hearth_operation_authorizations'::regclass,
    'tongs.customer_spending_quotes'::regclass,
    'tongs.funding_reservations'::regclass,
    'tongs.account_balances'::regclass,
    'tongs.accounting_journal_events'::regclass,
    'tongs.accounting_journal_entries'::regclass,
    'tongs.openai_text_provider_captures'::regclass
  ] loop
    execute format('select count(*) from %s',v_relation) into v_count;
    insert into owner_hearth_policy_forbidden_counts values(v_relation,v_count);
  end loop;
end
$snapshot$;

insert into tongs.openai_text_route_policies(
  route_code,product_area,provider_operation,maximum_input_units,maximum_output_units,
  maximum_attempts,requires_result_validation,requires_canonical_persistence,byo_supported,rollout_mode,notes
) values (
  'hearth.chat_completion','hearth','responses',128000,32000,3,true,true,true,'inactive',
  'Includes bounded model-access fallback and structured script/research validation.'
);

insert into tongs.openai_text_cost_policy_revisions(
  id,route_code,revision,policy_code,attempt_plan,maximum_input_units,maximum_output_units,
  maximum_attempts,direct_provider_ceiling_micros,supporting_cost_ceiling_micros,
  full_cost_ceiling_micros,cost_coverage,lifecycle_state,notes
) values
 ('81000000-0000-4000-8000-000000000001','hearth.chat_completion',101,'owner-hearth-compat-astra-v1','[{"attempt":1,"rate_revision_id":"60000000-0000-4000-8000-000000000002","input_max":386,"output_max":512}]',386,512,1,29460,1456,30916,'complete','pilot_candidate','Compatibility only; exact serialized Ready request, no tools/supporting services beyond the approved first-30-day allocation.'),
 ('81000000-0000-4000-8000-000000000002','hearth.chat_completion',102,'owner-hearth-compat-sol-v1','[{"attempt":1,"rate_revision_id":"56000000-0000-4000-8000-000000000012","input_max":386,"output_max":512}]',386,512,1,11784,1456,13240,'complete','pilot_candidate','Compatibility only; exact serialized Ready request.'),
 ('81000000-0000-4000-8000-000000000003','hearth.chat_completion',103,'owner-hearth-compat-terra-v1','[{"attempt":1,"rate_revision_id":"56000000-0000-4000-8000-000000000022","input_max":388,"output_max":512}]',388,512,1,6920,1456,8376,'complete','pilot_candidate','Compatibility only; exact serialized Ready request.'),
 ('81000000-0000-4000-8000-000000000004','hearth.chat_completion',104,'owner-hearth-compat-mini-v1','[{"attempt":1,"rate_revision_id":"54000000-0000-4000-8000-000000000001","input_max":398,"output_max":512}]',398,512,1,2603,1456,4059,'complete','pilot_candidate','Compatibility only; pinned GPT-5.4 Mini model.'),
 ('81000000-0000-4000-8000-000000000005','hearth.chat_completion',105,'owner-hearth-compat-luna-v1','[{"attempt":1,"rate_revision_id":"56000000-0000-4000-8000-000000000032","input_max":387,"output_max":512}]',387,512,1,692,1456,2148,'complete','pilot_candidate','Compatibility only; exact serialized Ready request.'),
 ('81000000-0000-4000-8000-000000000011','hearth.chat_completion',111,'owner-hearth-session-astra-v1','[{"attempt":1,"rate_revision_id":"60000000-0000-4000-8000-000000000002","input_max":32000,"output_max":8000}]',32000,8000,1,720000,1456,721456,'complete','pilot_candidate','Owner creator session; attachments, research, search, transcription, tools, and other paid support remain excluded.'),
 ('81000000-0000-4000-8000-000000000012','hearth.chat_completion',112,'owner-hearth-session-sol-v1','[{"attempt":1,"rate_revision_id":"56000000-0000-4000-8000-000000000012","input_max":32000,"output_max":8000}]',32000,8000,1,288000,1456,289456,'complete','pilot_candidate','Owner creator session; excluded supporting services remain blocked.'),
 ('81000000-0000-4000-8000-000000000013','hearth.chat_completion',113,'owner-hearth-session-terra-v1','[{"attempt":1,"rate_revision_id":"56000000-0000-4000-8000-000000000022","input_max":32000,"output_max":8000}]',32000,8000,1,160000,1456,161456,'complete','pilot_candidate','Owner creator session; excluded supporting services remain blocked.'),
 ('81000000-0000-4000-8000-000000000014','hearth.chat_completion',114,'owner-hearth-session-mini-v1','[{"attempt":1,"rate_revision_id":"54000000-0000-4000-8000-000000000001","input_max":32000,"output_max":8000}]',32000,8000,1,60000,1456,61456,'complete','pilot_candidate','Owner creator session; pinned GPT-5.4 Mini model.'),
 ('81000000-0000-4000-8000-000000000015','hearth.chat_completion',115,'owner-hearth-session-luna-v1','[{"attempt":1,"rate_revision_id":"56000000-0000-4000-8000-000000000032","input_max":32000,"output_max":8000}]',32000,8000,1,16000,1456,17456,'complete','pilot_candidate','Owner creator session; excluded supporting services remain blocked.');

insert into tongs.restricted_beta_cost_evidence_revisions(
 id,capability_code,revision,evidence_state,coverage_state,source_reference,observed_at,valid_until,
 included_capacity_json,reserved_headroom_json,hard_cap_scope,notes
) select
 extensions.uuid_generate_v5('82000000-0000-4000-8000-000000000000'::uuid,model_id||':'||kind),
 'openai.text.hearth_chat',100+ordinal+(case when kind='session' then 10 else 0 end),
 'verified_rate','complete','Official OpenAI model pricing plus Forge first-30-day support allocation',
 '2026-09-10T00:00:00Z','2026-10-10T00:00:00Z',
 jsonb_build_object('model',model_id,'maximum_input_tokens',input_max,'maximum_output_tokens',output_max,'attempts',1),
 jsonb_build_object('direct_rounding_risk_micros',3,'post_day_30_tail_separately_funded',true),
 case when kind='compatibility' then 'one exact compatibility operation' else 'one bounded owner Hearth operation' end,
 'Provider rates are pricing evidence, not authoritative per-operation expense.'
from (values
 ('compatibility',1,'gpt-6-astra',386,512),('compatibility',2,'gpt-5.6-sol',386,512),
 ('compatibility',3,'gpt-5.6-terra',388,512),('compatibility',4,'gpt-5.4-mini-2026-03-17',398,512),
 ('compatibility',5,'gpt-5.6-luna',387,512),('session',1,'gpt-6-astra',32000,8000),
 ('session',2,'gpt-5.6-sol',32000,8000),('session',3,'gpt-5.6-terra',32000,8000),
 ('session',4,'gpt-5.4-mini-2026-03-17',32000,8000),('session',5,'gpt-5.6-luna',32000,8000)
) v(kind,ordinal,model_id,input_max,output_max);

insert into tongs.restricted_beta_policy_revisions(
 id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,
 reserved_headroom_micros,maximum_concurrency,rolling_window_seconds,evidence_max_age_seconds,reason
) select
 extensions.uuid_generate_v5('83000000-0000-4000-8000-000000000000'::uuid,kind||':'||model_id),
 'production',100+ordinal+(case when kind='session' then 10 else 0 end),'active',10840000,0,
 case when kind='compatibility' then 1 else 2 end,86400,2592000,
 'Owner-only Hearth '||kind||' aggregate policy; unreachable without an exact owner operation authorization.'
from (values
 ('compatibility',1,'gpt-6-astra'),('compatibility',2,'gpt-5.6-sol'),('compatibility',3,'gpt-5.6-terra'),
 ('compatibility',4,'gpt-5.4-mini-2026-03-17'),('compatibility',5,'gpt-5.6-luna'),
 ('session',1,'gpt-6-astra'),('session',2,'gpt-5.6-sol'),('session',3,'gpt-5.6-terra'),
 ('session',4,'gpt-5.4-mini-2026-03-17'),('session',5,'gpt-5.6-luna')
) v(kind,ordinal,model_id);

insert into tongs.restricted_beta_policy_capabilities(
 id,policy_revision_id,capability_code,admission_mode,cost_evidence_revision_id,maximum_attempts,
 maximum_concurrency,per_operation_supplier_ceiling_micros,per_operation_supporting_ceiling_micros,
 per_operation_tail_ceiling_micros,permitted_callers_json,exact_model_or_sku,notes
) select
 extensions.uuid_generate_v5(policy.id,'openai.text.hearth_chat'),policy.id,'openai.text.hearth_chat','covered',evidence.id,1,
 case when spec.kind='compatibility' then 1 else 2 end,cost.direct_provider_ceiling_micros,1456,0,
 '["interactive","recovery"]'::jsonb,spec.model_id,
 'Owner-only exact-model term; post-day-30 retention is covered by a distinct tail authorization.'
from (values
 ('compatibility',1,'gpt-6-astra','81000000-0000-4000-8000-000000000001'::uuid),
 ('compatibility',2,'gpt-5.6-sol','81000000-0000-4000-8000-000000000002'::uuid),
 ('compatibility',3,'gpt-5.6-terra','81000000-0000-4000-8000-000000000003'::uuid),
 ('compatibility',4,'gpt-5.4-mini-2026-03-17','81000000-0000-4000-8000-000000000004'::uuid),
 ('compatibility',5,'gpt-5.6-luna','81000000-0000-4000-8000-000000000005'::uuid),
 ('session',1,'gpt-6-astra','81000000-0000-4000-8000-000000000011'::uuid),
 ('session',2,'gpt-5.6-sol','81000000-0000-4000-8000-000000000012'::uuid),
 ('session',3,'gpt-5.6-terra','81000000-0000-4000-8000-000000000013'::uuid),
 ('session',4,'gpt-5.4-mini-2026-03-17','81000000-0000-4000-8000-000000000014'::uuid),
 ('session',5,'gpt-5.6-luna','81000000-0000-4000-8000-000000000015'::uuid)
) spec(kind,ordinal,model_id,cost_id)
join tongs.openai_text_cost_policy_revisions cost on cost.id=spec.cost_id
join tongs.restricted_beta_policy_revisions policy
  on policy.id=extensions.uuid_generate_v5('83000000-0000-4000-8000-000000000000'::uuid,spec.kind||':'||spec.model_id)
join tongs.restricted_beta_cost_evidence_revisions evidence
  on evidence.id=extensions.uuid_generate_v5('82000000-0000-4000-8000-000000000000'::uuid,spec.model_id||':'||spec.kind);

do $proof$
declare v_relation regclass; v_before bigint; v_after bigint;
begin
  if (select count(*) from tongs.openai_text_route_policies
      where route_code='hearth.chat_completion' and product_area='hearth'
        and provider_operation='responses' and maximum_input_units=128000
        and maximum_output_units=32000 and maximum_attempts=3
        and requires_result_validation and requires_canonical_persistence and byo_supported
        and rollout_mode='inactive'
        and notes='Includes bounded model-access fallback and structured script/research validation.') <> 1
     or (select count(*) from tongs.openai_text_cost_policy_revisions where id = any(array[
       '81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002',
       '81000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000004',
       '81000000-0000-4000-8000-000000000005','81000000-0000-4000-8000-000000000011',
       '81000000-0000-4000-8000-000000000012','81000000-0000-4000-8000-000000000013',
       '81000000-0000-4000-8000-000000000014','81000000-0000-4000-8000-000000000015']::uuid[])) <> 10
     or (select count(*) from tongs.restricted_beta_policy_revisions where revision in (101,102,103,104,105,111,112,113,114,115)) <> 10
     or (select count(*) from tongs.restricted_beta_cost_evidence_revisions where capability_code='openai.text.hearth_chat' and revision in (101,102,103,104,105,111,112,113,114,115)) <> 10
     or (select count(*) from tongs.restricted_beta_policy_capabilities c join tongs.restricted_beta_policy_revisions p on p.id=c.policy_revision_id where p.revision in (101,102,103,104,105,111,112,113,114,115) and c.capability_code='openai.text.hearth_chat') <> 10 then
    raise exception 'owner-Hearth policy fixture did not install the exact reviewed ten-row family';
  end if;
  for v_relation,v_before in select relation_name,row_count from owner_hearth_policy_forbidden_counts loop
    execute format('select count(*) from %s',v_relation) into v_after;
    if v_after <> v_before then
      raise exception 'owner-Hearth policy fixture changed prohibited relation % (% -> %)',v_relation,v_before,v_after;
    end if;
  end loop;
end
$proof$;

commit;
