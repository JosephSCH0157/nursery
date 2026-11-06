-- Current canonical Hearth denial, not the historical successful-execution canary.
-- Authority: unchanged 20261104143249 migration and provider_request_financial_alignment.sql.
-- No financial scopes, funds, controls, credentials or loss rollouts are invented.
do $guard$
begin
  if current_database() is distinct from 'postgres'
     or current_setting('forge.luna_canary_certification',true) is distinct from 'disposable-baseline-v1'
     or current_setting('forge.luna_current_denial_certification',true) is distinct from 'disposable-baseline-v1'
     or (select count(*) from forge_meta.database_lineage) is distinct from 1
     or not exists(select 1 from forge_meta.database_lineage where singleton and lineage='baseline-v1')
     or coalesce((select max(version) from supabase_migrations.schema_migrations),'') not in ('20261104143249','20261104212918')
     or to_regclass('pg_temp.luna_original_state') is null
     or exists(select 1 from auth.users where id in (
       'ce000000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000002')) then
    raise exception 'Current Luna denial requires the exact guarded aligned disposable baseline' using errcode='42501';
  end if;
end $guard$;

begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
 ('ce000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','canary-operator@example.test','',now(),now(),now()),
 ('ce000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','canary-customer@example.test','',now(),now(),now());
insert into tongs.workspaces(id,name,created_by,org_id)
values('ce000000-0000-4000-8000-000000000010','Customer canary proof',
 'ce000000-0000-4000-8000-000000000002',tongs.ensure_personal_org('ce000000-0000-4000-8000-000000000002'));
-- Canonical trigger provisions the owner row; assert it below without rewriting it.
insert into tongs.platform_operators(user_id,reason,granted_by)
values('ce000000-0000-4000-8000-000000000001','isolated customer canary proof','ce000000-0000-4000-8000-000000000001');

do $ownership$
declare v_org uuid;
begin
  select w.org_id into strict v_org from tongs.workspaces w
    where w.id='ce000000-0000-4000-8000-000000000010'
      and w.created_by='ce000000-0000-4000-8000-000000000002';
  if not exists(select 1 from tongs.orgs where id=v_org
                 and personal_owner_user_id='ce000000-0000-4000-8000-000000000002')
     or not exists(select 1 from tongs.org_members where org_id=v_org
                    and user_id='ce000000-0000-4000-8000-000000000002' and org_role='owner')
     or exists(select 1 from tongs.org_members where org_id=v_org
                and user_id='ce000000-0000-4000-8000-000000000001')
     or not exists(select 1 from tongs.workspace_members
       where workspace_id='ce000000-0000-4000-8000-000000000010'
         and user_id='ce000000-0000-4000-8000-000000000002' and role='owner') then
    raise exception 'Luna workspace organization or owner membership is incorrect';
  end if;
end $ownership$;


create temp table luna_attempt_state(relation_name text primary key,fingerprint text);
do $snapshot$
declare r record; v_hash text;
begin
  for r in
    select c.oid::regclass::text relation_name
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where (n.nspname='tongs' and c.relkind in ('r','p'))
       or (n.nspname='auth' and c.relname='users')
  loop
    execute format('select md5(coalesce(string_agg(to_jsonb(x)::text,E''\n'' order by to_jsonb(x)::text),'''')) from %s x',r.relation_name) into v_hash;
    insert into luna_attempt_state values(r.relation_name,v_hash);
  end loop;
end $snapshot$;

create function pg_temp.assert_luna_attempt_state() returns void
language plpgsql as $verify$
declare r record; v_hash text;
begin
  for r in select * from pg_temp.luna_attempt_state loop
    execute format('select md5(coalesce(string_agg(to_jsonb(x)::text,E''\n'' order by to_jsonb(x)::text),'''')) from %s x',r.relation_name) into v_hash;
    if v_hash is distinct from r.fingerprint then
      raise exception 'Luna fixture changed original data in %',r.relation_name;
    end if;
  end loop;
end $verify$;


set local request.jwt.claim.role='service_role';
do $current_denial$
declare v_denied boolean; v_result jsonb; v_retry integer;
begin
  if current_setting('forge.luna_current_denial_certification',true) is distinct from 'disposable-baseline-v1'
     or coalesce((select max(version) from supabase_migrations.schema_migrations),'') not in ('20261104143249','20261104212918') then
    raise exception 'Current Luna denial requires the reviewed aligned disposable head';
  end if;
  if (select count(*) from tongs.openai_text_cost_policy_revisions
      where id='10000000-0000-4000-8000-000000000011' and revision=4
        and route_code='hearth.chat_completion' and full_cost_ceiling_micros=11115
        and maximum_input_units=2000 and maximum_output_units=512 and maximum_attempts=1
        and direct_provider_ceiling_micros=1115 and supporting_cost_ceiling_micros=10000
        and cost_coverage='complete') is distinct from 1
     or (select count(*) from tongs.private_pricing_revisions
      where id='b4c4472f-0325-4c2e-b2ef-9aef5e59e64b' and full_cost_ceiling_micros=11115
        and currency='USD' and customer_price_ceiling_micros=15000
        and settled_customer_price_micros=15000 and customer_credit_units=3
        and customer_credit_units*5000=settled_customer_price_micros) is distinct from 1
     or not exists(select 1 from tongs._current_openai_text_rollout('hearth.chat_completion')
      where revision=13 and mode='halt_new' and funding_scope='all'
        and cost_policy_revision_id='10000000-0000-4000-8000-000000000011')
     or not exists(select 1 from tongs._openai_rollout_for_funding('hearth.chat_completion','forge')
      where revision=13 and mode='halt_new'
        and cost_policy_revision_id='10000000-0000-4000-8000-000000000011')
     or tongs._current_financial_environment() is distinct from 'test' then
    raise exception 'Reviewed current Luna financial authority differs';
  end if;
  if exists(select 1 from tongs.customer_paid_execution_scope_authorizations
       where route_code='hearth.chat_completion')
     or exists(select 1 from tongs.owner_paid_execution_canary_activation_revisions)
     or exists(select 1 from tongs.funding_reservations)
     or exists(select 1 from tongs.openai_text_customer_quote_bindings) then
    raise exception 'Denial requires absent customer scope, owner exception and funding authority';
  end if;

  -- Repeat the real customer admission operation. Require the specific halt rejection,
  -- rather than accepting a missing catalog, balance, scope, or arbitrary exception.
  for v_retry in 1..2 loop
    v_denied:=false;
    begin
      v_result:=tongs.create_customer_openai_text_quote(
        'ce000000-0000-4000-8000-000000000040','ce000000-0000-4000-8000-000000000002',
        'luna-current-denial-0001','hearth.chat_completion',
        'ce000000-0000-4000-8000-000000000010','luna-denial-workpiece',repeat('a',64),
        'gpt-5.6-luna','forge',now()+interval '5 minutes');
    exception when insufficient_privilege then
      if sqlerrm is distinct from 'OpenAI text customer spending is not active' then raise; end if;
      v_denied:=true;
    end;
    if v_denied is distinct from true then
      raise exception 'Halted customer admission unexpectedly returned: %',v_result;
    end if;
    perform pg_temp.assert_luna_attempt_state();

    v_denied:=false;
    begin
      v_result:=tongs.authorize_openai_text_provider_attempt(
        'ce000000-0000-4000-8000-000000000042','luna-current-denial-attempt-0001',
        1::smallint,11115,120,'{"certification":"current_halt_new","network":false}');
    exception when no_data_found then
      if sqlerrm is distinct from 'funding reservation not found' then raise; end if;
      v_denied:=true;
    end;
    if v_denied is distinct from true then
      raise exception 'Unfunded provider attempt unexpectedly returned: %',v_result;
    end if;
    perform pg_temp.assert_luna_attempt_state();
  end loop;
end $current_denial$;
rollback;
select pg_temp.assert_luna_original_state();
select 'Current Hearth revision-4 halt_new denial, zero financial mutations and rollback passed; historical execution is separate' as certification;
