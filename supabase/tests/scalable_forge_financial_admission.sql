begin;

do $test$
declare
  active_v2 bigint;
  hammer_nonlegacy bigint;
  function_security boolean;
  function_volatility "char";
  report jsonb;
begin
  select count(*) into active_v2
  from tongs.restricted_beta_policy_revisions
  where exposure_accounting_mode='funded_net_v2' and lifecycle_state='active';
  if active_v2<>0 then
    raise exception 'scalable admission must remain inactive until an append-only policy is approved';
  end if;

  select count(*) into hammer_nonlegacy
  from tongs.restricted_beta_policy_revisions policy
  join tongs.restricted_beta_policy_capabilities capability on capability.policy_revision_id=policy.id
  where capability.capability_code='assemblyai.transcription.hammer'
    and policy.exposure_accounting_mode<>'legacy_gross';
  if hammer_nonlegacy<>0 then
    raise exception 'Hammer owner-canary policy changed accounting modes';
  end if;

  if exists(select 1 from tongs.restricted_beta_policy_revisions
            where exposure_accounting_mode='funded_net_v2'
              and (net_forge_loss_limit_micros is null
                   or emergency_platform_risk_limit_micros is null)) then
    raise exception 'funded-net policy has incomplete limits';
  end if;
  if exists(select 1 from tongs.restricted_beta_exposure_holds
            where exposure_accounting_mode='funded_net_v2'
              and (eligible_funding_offset_micros>gross_supplier_liquidity_exposure_micros
                   or net_forge_loss_exposure_micros<0
                   or net_forge_loss_exposure_micros<>
                     gross_supplier_liquidity_exposure_micros-eligible_funding_offset_micros)) then
    raise exception 'funded-net hold arithmetic is inconsistent';
  end if;

  select prosecdef,provolatile into function_security,function_volatility
  from pg_proc where oid='tongs.read_forge_cost_observability()'::regprocedure;
  if function_security is not true or function_volatility<>'s' then
    raise exception 'observability reader must remain stable and security definer';
  end if;
  if has_function_privilege('anon','tongs.read_forge_cost_observability()','execute')
     or has_function_privilege('authenticated','tongs.read_forge_cost_observability()','execute')
     or not has_function_privilege('service_role','tongs.read_forge_cost_observability()','execute') then
    raise exception 'observability reader ACL drift';
  end if;

  perform set_config('request.jwt.claim.role','service_role',true);
  select tongs.read_forge_cost_observability() into report;
  if report->>'schema'<>'forge.cost-observability.v1'
     or report#>>'{infrastructure,netlify,status}'<>'external_observation_required'
     or report#>>'{infrastructure,supabase,status}'<>'supported_authenticated_observation_required'
     or report#>>'{amount_semantics,unknown}'<>'not reported as zero' then
    raise exception 'cost observability semantics drift';
  end if;

  begin
    insert into tongs.restricted_beta_policy_revisions(
      id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,
      reserved_headroom_micros,maximum_concurrency,rolling_window_seconds,
      evidence_max_age_seconds,reason,exposure_accounting_mode,
      net_forge_loss_limit_micros,emergency_platform_risk_limit_micros)
    values('f5100000-0000-4000-8000-000000000001','test',2147483647,'draft',null,null,null,null,null,
      'negative incomplete funded-net policy','funded_net_v2',1000,null);
    raise exception 'incomplete funded-net limits were accepted';
  exception when check_violation then null; end;

  begin
    perform tongs._scalable_funding_offset(null,1,'real');
    raise exception 'missing reservation was accepted';
  exception when sqlstate '22023' then null; end;
end
$test$;

rollback;
