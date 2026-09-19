do $$
declare
  quote_definition text;
  aggregate_definition text;
  proposal_definition text;
begin
  select pg_get_functiondef(
    'tongs.create_shadow_spending_quote(uuid,uuid,text,text,uuid,uuid,text,jsonb,timestamptz)'::regprocedure
  ) into quote_definition;
  if position('settled_customer_price_micros' in quote_definition)=0
     or position('settled customer price must equal the published ceiling' in quote_definition)=0 then
    raise exception 'settled customer price quote reassertion is absent';
  end if;

  select pg_get_functiondef(
    'tongs.acquire_openai_text_aggregate_admission(uuid,text,text)'::regprocedure
  ) into aggregate_definition;
  if position('openai_text_customer_quote_bindings' in aggregate_definition)=0
     or position('qb.canonical_operation_id' in aggregate_definition)=0
     or position('capability,b.operation_id' in aggregate_definition)=0
     or position('normal_customer_credit_bounded' in aggregate_definition)=0
     or position('r.funding_environment' in aggregate_definition)=0 then
    raise exception 'canonical aggregate admission reassertion is absent';
  end if;

  select pg_get_functiondef(
    'tongs.read_my_pending_hearth_script_proposal(uuid,uuid)'::regprocedure
  ) into proposal_definition;
  if position('hearth_script_generation_proposals newer' in proposal_definition)=0
     or position('(newer.created_at,newer.id)>(candidate.created_at,candidate.id)' in proposal_definition)=0 then
    raise exception 'newest-only proposal lifecycle guard is absent';
  end if;

  if to_regprocedure('tongs.approve_canonical_script_v3(uuid,uuid,bigint,bigint,text,text,text,uuid,text)') is null
     or to_regprocedure('tongs.hearth_transition_preflighted_script_ready_v3(uuid,uuid,uuid,uuid,text,jsonb)') is null
     or to_regclass('tongs.script_approval_revisions') is null
     or to_regclass('tongs.workpiece_ready_transition_requests') is null
     or to_regclass('tongs.hearth_editorial_preflight_findings') is null
     or to_regclass('tongs.hearth_editorial_preflight_reports') is null
     or to_regclass('tongs.hearth_preflight_finding_acknowledgements') is null then
    raise exception 'v3 readiness or optional-review prerequisites are absent';
  end if;

  if not exists (
    select 1 from pg_class relation
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='tongs'
      and relation.relname='openai_text_failure_loss_operator_decisions'
      and relation.relrowsecurity
  ) or not exists (
    select 1 from pg_proc function
    join pg_namespace namespace on namespace.oid=function.pronamespace
    where namespace.nspname='tongs'
      and function.proname='control_openai_text_failure_loss_environment'
  ) then
    raise exception 'operator failure-loss authority is absent';
  end if;

  if (select count(*) from supabase_migrations.schema_migrations
      where version in (
        '20260917225047','20260918055813',
        '20261011460000','20261011470000'
      ))<>4 then
    raise exception 'the four local readiness/reassertion migrations were not all applied';
  end if;
end $$;

select jsonb_build_object(
  'functions',(
    select jsonb_object_agg(signature,definition_hash order by signature)
    from (
      select
        namespace.nspname||'.'||function.proname||'('||pg_get_function_identity_arguments(function.oid)||')' as signature,
        encode(extensions.digest(convert_to(pg_get_functiondef(function.oid),'UTF8'),'sha256'),'hex') as definition_hash
      from pg_proc function
      join pg_namespace namespace on namespace.oid=function.pronamespace
      where namespace.nspname='tongs'
        and function.proname in (
          'create_shadow_spending_quote',
          'acquire_openai_text_aggregate_admission',
          'control_openai_text_failure_loss_environment',
          '_authorize_openai_text_provider_attempt_before_customer_test_scope',
          'read_my_pending_hearth_script_proposal'
        )
    ) definitions
  ),
  'failure_loss_authority',jsonb_build_object(
    'rls',(
      select relation.relrowsecurity
      from pg_class relation
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='tongs'
        and relation.relname='openai_text_failure_loss_operator_decisions'
    ),
    'indexes',(
      select coalesce(jsonb_agg(indexdef order by indexname),'[]'::jsonb)
      from pg_indexes
      where schemaname='tongs'
        and tablename='openai_text_failure_loss_operator_decisions'
    ),
    'policies',(
      select coalesce(jsonb_agg(
        jsonb_build_object('name',policyname,'command',cmd,'roles',roles)
        order by policyname
      ),'[]'::jsonb)
      from pg_policies
      where schemaname='tongs'
        and tablename='openai_text_failure_loss_operator_decisions'
    )
  ),
  'standard_customer_catalog',(
    select to_jsonb(catalog)
    from (
      select id,revision,lifecycle_state
      from tongs.openai_text_model_catalog_revisions
      where id='3f1d45b8-15ad-4d84-a5f4-0b3845f649ab'::uuid
    ) catalog
  ),
  'readiness_prerequisites',jsonb_build_object(
    'script_approval_revisions',to_regclass('tongs.script_approval_revisions') is not null,
    'ready_transition_requests',to_regclass('tongs.workpiece_ready_transition_requests') is not null,
    'preflight_findings',to_regclass('tongs.hearth_editorial_preflight_findings') is not null,
    'preflight_reports',to_regclass('tongs.hearth_editorial_preflight_reports') is not null,
    'preflight_acknowledgements',to_regclass('tongs.hearth_preflight_finding_acknowledgements') is not null
  )
) as fingerprint;
