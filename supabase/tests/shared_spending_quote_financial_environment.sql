\set ON_ERROR_STOP on
begin;

do $metadata$
declare
  v_function oid;
  v_quote_definition text;
begin
  select p.oid into v_function from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='tongs' and p.proname='_stamp_spending_quote_environment'
    and p.prorettype='trigger'::regtype and p.pronargs=0;
  if not exists(select 1 from pg_trigger t
    where t.tgrelid='tongs.customer_spending_quotes'::regclass
      and t.tgname='customer_spending_quotes_financial_environment'
      and t.tgfoid=v_function and t.tgenabled='O' and not t.tgisinternal) then
    raise exception 'financial-environment trigger is not ordinarily enabled';
  end if;
  if tongs._current_financial_environment()<>'test' then
    raise exception 'disposable financial runtime must begin in Test';
  end if;
  if (select count(*) from tongs.financial_runtime_environment_revisions)<>1 then
    raise exception 'fresh baseline must have exactly one canonical Test runtime revision';
  end if;
  if not exists(select 1 from tongs.financial_runtime_environment_revisions
    where revision=1 and financial_environment='test'
      and reason='Development and beta use Stripe Test through the canonical financial path.'
      and actor_id is null) then
    raise exception 'canonical Test runtime authority row differs';
  end if;
  if to_regprocedure('tongs._resolve_spending_quote_environment(uuid,text,uuid)') is not null then
    raise exception 'unreviewed quote-environment resolver was installed';
  end if;
  select pg_get_functiondef(
    'tongs.create_shadow_spending_quote(uuid,uuid,text,text,uuid,uuid,text,jsonb,timestamptz)'::regprocedure
  ) into v_quote_definition;
  if position('_resolve_spending_quote_environment' in v_quote_definition)>0 then
    raise exception 'shared quote function was replaced by the rejected environment resolver';
  end if;
end
$metadata$;

-- A malformed environment revision is rejected by the canonical constraint.
do $invalid$
begin
  begin
    insert into tongs.financial_runtime_environment_revisions(
      revision,financial_environment,reason
    ) values(900001,'invalid','negative financial-environment regression');
    raise exception 'invalid financial environment unexpectedly accepted';
  exception when check_violation then null;
  end;
end
$invalid$;

-- The complete owner-sponsored Hammer flow below proves the shared quote
-- function receives Test through the trigger. Cross-environment reservation
-- rejection remains covered by unified-financial-environment and funding tests.

rollback;
