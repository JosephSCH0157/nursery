-- Audited renewal for the exact owner-sponsored Brad Hammer transcription.
-- Applying this migration creates no authority, budget, quote, reservation,
-- operation, provider attempt, customer charge, or provider submission.
begin;

do $prerequisites$
begin
  if to_regprocedure(
       'tongs.install_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text)'
     ) is null
     or to_regprocedure(
       'tongs.authorize_hammer_first_transcription_attempt(uuid,uuid,text,text,jsonb)'
     ) is null
     or to_regprocedure(
       'tongs._active_hammer_owner_sponsorship_for_quote(uuid)'
     ) is null
  then
    raise exception 'Hammer owner sponsorship migrations 425 and 426 are required';
  end if;
end
$prerequisites$;

create table tongs.hammer_first_transcription_activation_revocations (
  id uuid primary key,
  activation_authority_id uuid not null unique
    references tongs.hammer_first_transcription_activation_authorities(id) on delete restrict,
  revoked_by uuid not null references auth.users(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 8 and 500),
  revoked_at timestamptz not null default clock_timestamp()
);

alter table tongs.hammer_first_transcription_activation_revocations enable row level security;
alter table tongs.hammer_first_transcription_activation_revocations force row level security;
revoke all on table tongs.hammer_first_transcription_activation_revocations
  from public, anon, authenticated, service_role;
grant select on table tongs.hammer_first_transcription_activation_revocations to service_role;

create trigger hammer_first_transcription_activation_revocations_immutable
before update or delete on tongs.hammer_first_transcription_activation_revocations
for each row execute function tongs._reject_accounting_mutation();

-- The original authority was deliberately single-use. Preserve its immutable
-- row, but permit later immutable authority rows for the same exact source.
alter table tongs.hammer_first_transcription_activation_authorities
  drop constraint hammer_first_transcription_ac_user_id_canonical_recording_i_key;

create index hammer_first_transcription_activation_exact_source_idx
  on tongs.hammer_first_transcription_activation_authorities(
    user_id, canonical_recording_id, recording_revision_id, valid_until
  );

create or replace function tongs._guard_hammer_first_transcription_activation_insert()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'hammer-first-transcription-renewal:' || new.user_id::text || ':' ||
    new.canonical_recording_id::text || ':' || new.recording_revision_id::text,
    0
  ));

  if exists (
    select 1
    from tongs.hammer_first_transcription_activation_authorities prior
    join tongs.hammer_first_transcription_activation_consumptions consumed
      on consumed.activation_authority_id=prior.id
    where prior.user_id=new.user_id
      and prior.canonical_recording_id=new.canonical_recording_id
      and prior.recording_revision_id=new.recording_revision_id
  ) or exists (
    select 1
    from tongs.hammer_transcription_operations operation
    join tongs.hammer_transcription_provider_attempts attempt
      on attempt.operation_id=operation.id
    where operation.user_id=new.user_id
      and operation.canonical_recording_id=new.canonical_recording_id
      and operation.recording_revision_id=new.recording_revision_id
  ) then
    raise exception 'Hammer first-transcription provider-attempt allowance is already consumed'
      using errcode='42501';
  end if;

  if exists (
    select 1
    from tongs.hammer_first_transcription_activation_authorities prior
    where prior.user_id=new.user_id
      and prior.canonical_recording_id=new.canonical_recording_id
      and prior.recording_revision_id=new.recording_revision_id
      and tstzrange(prior.valid_from,prior.valid_until,'[)')
          && tstzrange(new.valid_from,new.valid_until,'[)')
      and not exists (
        select 1
        from tongs.hammer_first_transcription_activation_revocations revoked
        where revoked.activation_authority_id=prior.id
      )
  ) then
    raise exception 'overlapping Hammer first-transcription authority is prohibited'
      using errcode='23P01';
  end if;
  return new;
end
$$;

revoke all on function tongs._guard_hammer_first_transcription_activation_insert()
  from public, anon, authenticated;

create trigger hammer_first_transcription_activation_insert_guard
before insert on tongs.hammer_first_transcription_activation_authorities
for each row execute function tongs._guard_hammer_first_transcription_activation_insert();

create or replace function tongs._guard_hammer_first_transcription_consumption_insert()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  authority tongs.hammer_first_transcription_activation_authorities%rowtype;
begin
  select * into authority
  from tongs.hammer_first_transcription_activation_authorities
  where id=new.activation_authority_id;
  if not found then
    raise exception 'Hammer activation authority is required' using errcode='23503';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'hammer-first-transcription-consumption:' || authority.user_id::text || ':' ||
    authority.canonical_recording_id::text || ':' || authority.recording_revision_id::text,
    0
  ));
  if exists (
    select 1
    from tongs.hammer_first_transcription_activation_consumptions consumed
    join tongs.hammer_first_transcription_activation_authorities prior
      on prior.id=consumed.activation_authority_id
    where prior.user_id=authority.user_id
      and prior.canonical_recording_id=authority.canonical_recording_id
      and prior.recording_revision_id=authority.recording_revision_id
  ) then
    raise exception 'Hammer first-transcription provider-attempt allowance is already consumed'
      using errcode='42501';
  end if;
  return new;
end
$$;

revoke all on function tongs._guard_hammer_first_transcription_consumption_insert()
  from public, anon, authenticated;

create trigger hammer_first_transcription_consumption_insert_guard
before insert on tongs.hammer_first_transcription_activation_consumptions
for each row execute function tongs._guard_hammer_first_transcription_consumption_insert();

create or replace function tongs.revoke_hammer_first_transcription_activation(
  p_revocation_id uuid,
  p_activation_authority_id uuid,
  p_actor_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  authority tongs.hammer_first_transcription_activation_authorities%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_revocation_id is null
     or p_activation_authority_id is null
     or p_actor_id is null
     or not tongs.is_platform_operator(p_actor_id)
     or length(btrim(coalesce(p_reason,''))) not between 8 and 500
  then
    raise exception 'valid platform-operator revocation is required' using errcode='22023';
  end if;

  select * into authority
  from tongs.hammer_first_transcription_activation_authorities
  where id=p_activation_authority_id
  for update;
  if not found then
    raise exception 'Hammer activation authority does not exist' using errcode='P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'hammer-first-transcription-renewal:' || authority.user_id::text || ':' ||
    authority.canonical_recording_id::text || ':' || authority.recording_revision_id::text,
    0
  ));
  if exists (
       select 1 from tongs.hammer_first_transcription_activation_consumptions
       where activation_authority_id=authority.id
     ) or exists (
       select 1
       from tongs.hammer_first_transcription_quote_bindings binding
       join tongs.hammer_transcription_operations operation
         on operation.quote_id=binding.quote_id
       where binding.activation_authority_id=authority.id
         and operation.state in ('queued','processing','submission_unknown','completed')
     ) or exists (
       select 1
       from tongs.hammer_first_transcription_quote_bindings binding
       join tongs.funding_reservations reservation on reservation.quote_id=binding.quote_id
       where binding.activation_authority_id=authority.id
         and tongs._funding_reservation_state(reservation.id) not in ('settled','released')
     )
  then
    raise exception 'an admitted, consumed, or ambiguous Hammer authority cannot be revoked'
      using errcode='42501';
  end if;

  insert into tongs.hammer_first_transcription_activation_revocations(
    id,activation_authority_id,revoked_by,reason
  ) values(p_revocation_id,authority.id,p_actor_id,btrim(p_reason));
  return jsonb_build_object(
    'activation_authority_id',authority.id,
    'revoked',true,
    'execution_authorized',false
  );
end
$$;

revoke all on function tongs.revoke_hammer_first_transcription_activation(uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function tongs.revoke_hammer_first_transcription_activation(uuid,uuid,uuid,text)
  to service_role;

-- A revoked authority must stop participating in owner funding immediately,
-- including quotes created before the revocation was recorded.
create or replace function tongs._active_hammer_owner_sponsorship_for_quote(p_quote_id uuid)
returns tongs.hammer_owner_funded_transcription_authorities
language sql stable security definer set search_path=pg_catalog as $$
  select sponsorship
  from tongs.hammer_first_transcription_quote_bindings binding
  join tongs.hammer_owner_funded_transcription_authorities sponsorship
    on sponsorship.activation_authority_id=binding.activation_authority_id
  join tongs.owner_operating_budgets budget on budget.id=sponsorship.owner_budget_id
  join lateral (
    select revision.* from tongs.owner_operating_budget_revisions revision
    where revision.budget_id=budget.id order by revision.revision desc limit 1
  ) latest on true
  where binding.quote_id=p_quote_id
    and sponsorship.status='active'
    and sponsorship.valid_from<=clock_timestamp()
    and sponsorship.valid_until>clock_timestamp()
    and budget.period_start<=clock_timestamp() and budget.period_end>clock_timestamp()
    and latest.status='active'
    and latest.maximum_amount_micros=sponsorship.maximum_wholesale_exposure_micros
    and not exists (
      select 1 from tongs.hammer_first_transcription_activation_revocations revoked
      where revoked.activation_authority_id=sponsorship.activation_authority_id
    )
    and not exists (
      select 1 from tongs.hammer_first_transcription_activation_consumptions consumed
      where consumed.activation_authority_id=sponsorship.activation_authority_id
    )
  limit 1
$$;

-- Keep the existing quote/reservation/attempt implementations byte-for-byte
-- except for the new immutable revocation predicate. Fail closed if an upstream
-- definition no longer has the reviewed selection guard.
do $revocation_guards$
declare
  signature regprocedure;
  definition text;
  changed text;
  old_guard text;
  new_guard text;
begin
  foreach signature in array array[
    'tongs.create_hammer_first_transcription_quote(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)'::regprocedure,
    'tongs.create_hammer_owner_funded_first_transcription_quote(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)'::regprocedure
  ] loop
    select pg_get_functiondef(signature) into definition;
    old_guard := 'and not exists(select 1 from tongs.hammer_first_transcription_activation_consumptions c where c.activation_authority_id=a.id)';
    new_guard := old_guard || E'\n      and not exists(select 1 from tongs.hammer_first_transcription_activation_revocations r where r.activation_authority_id=a.id)';
    changed := replace(definition,old_guard,new_guard);
    if changed=definition then
      raise exception 'Hammer quote authority selection changed upstream: %',signature;
    end if;
    execute changed;
  end loop;

  foreach signature in array array[
    'tongs.reserve_hammer_first_transcription_quote(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
    'tongs.reserve_hammer_owner_funded_first_transcription_quote(uuid,uuid,uuid,uuid,text,text)'::regprocedure
  ] loop
    select pg_get_functiondef(signature) into definition;
    old_guard := 'or exists(select 1 from tongs.hammer_first_transcription_activation_consumptions c where c.activation_authority_id=authority.id)';
    new_guard := old_guard || E'\n     or exists(select 1 from tongs.hammer_first_transcription_activation_revocations r where r.activation_authority_id=authority.id)';
    changed := replace(definition,old_guard,new_guard);
    if changed=definition then
      raise exception 'Hammer reservation authority guard changed upstream: %',signature;
    end if;
    execute changed;
  end loop;

  signature := 'tongs.authorize_hammer_first_transcription_attempt(uuid,uuid,text,text,jsonb)'::regprocedure;
  select pg_get_functiondef(signature) into definition;
  old_guard := 'or exists(select 1 from tongs.hammer_first_transcription_activation_consumptions c where c.activation_authority_id=authority.id)';
  new_guard := old_guard || E'\n     or exists(select 1 from tongs.hammer_first_transcription_activation_revocations r where r.activation_authority_id=authority.id)';
  changed := replace(definition,old_guard,new_guard);
  if changed=definition then
    raise exception 'Hammer provider-attempt authority guard changed upstream';
  end if;
  execute changed;
end
$revocation_guards$;

create or replace function tongs.renew_hammer_owner_funded_first_transcription_authority(
  p_previous_activation_id uuid,
  p_activation_id uuid,
  p_capacity_authority_id uuid,
  p_owner_authority_id uuid,
  p_owner_budget_id uuid,
  p_operator_id uuid,
  p_capacity_evidence_sha256 text,
  p_capacity_checked_at timestamptz,
  p_capacity_expires_at timestamptz,
  p_netlify_remaining_credit_microunits bigint,
  p_supabase_remaining_uncached_egress_bytes bigint,
  p_supabase_remaining_database_bytes bigint,
  p_supabase_spend_cap_enabled boolean,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  previous tongs.hammer_first_transcription_activation_authorities%rowtype;
  provider tongs.hammer_transcription_provider_authorities%rowtype;
  source jsonb;
  sponsorship jsonb;
begin
  perform tongs._require_pricing_service_role();
  if p_previous_activation_id is null or p_activation_id is null
     or p_capacity_authority_id is null or p_owner_authority_id is null
     or p_owner_budget_id is null or p_operator_id is null
     or not tongs.is_platform_operator(p_operator_id)
     or p_capacity_evidence_sha256 !~ '^[0-9a-f]{64}$'
     or p_capacity_checked_at>clock_timestamp()
     or p_capacity_expires_at<=clock_timestamp()
     or p_capacity_expires_at-p_capacity_checked_at>interval '24 hours'
     or p_netlify_remaining_credit_microunits<671178
     or p_supabase_remaining_uncached_egress_bytes<243332008
     or p_supabase_remaining_database_bytes<8388608
     or p_supabase_spend_cap_enabled is not true
     or p_valid_from>clock_timestamp()+interval '5 minutes'
     or p_valid_until<=greatest(p_valid_from,clock_timestamp())
     or p_valid_until>p_capacity_expires_at
     or p_valid_until-p_valid_from>interval '24 hours'
     or length(btrim(coalesce(p_reason,''))) not between 8 and 500
  then
    raise exception 'current bounded Hammer renewal evidence is required' using errcode='22023';
  end if;

  select * into previous
  from tongs.hammer_first_transcription_activation_authorities
  where id=p_previous_activation_id
  for update;
  if not found
     or previous.user_id<>'71daf61b-57b3-4e5f-a8c8-64befecb5950'::uuid
     or previous.workspace_id<>'cc5478ff-37be-403e-824c-467fa7da061e'::uuid
     or previous.workpiece_id<>'21d16d6a-905b-491e-8761-028789612ae5'::uuid
     or previous.canonical_recording_id<>'4cc846e3-187c-46d9-8733-e7402488236c'::uuid
     or previous.recording_revision_id<>'9c991aa7-f551-4f03-a4d6-41eb40ef81ec'::uuid
     or previous.completion_id<>'bf67d649-1bc2-44ba-9a33-783b3ab523ea'::uuid
     or previous.media_sha256<>'595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24'
     or previous.media_bytes<>120617428
     or previous.verified_duration_ms<>603848
     or previous.financial_environment<>'live'
     or previous.supplier_ceiling_micros<>38589
     or previous.supporting_cost_ceiling_micros<>6000
     or previous.complete_wholesale_ceiling_micros<>44589
     or previous.customer_credit_units<>12
     or previous.maximum_customer_charge_micros<>60000
     or previous.maximum_provider_attempts<>1
     or previous.maximum_concurrency<>1
     or previous.automatic_retries<>0
  then
    raise exception 'exact expired Brad authority is required' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'hammer-first-transcription-renewal:' || previous.user_id::text || ':' ||
    previous.canonical_recording_id::text || ':' || previous.recording_revision_id::text,
    0
  ));
  if previous.valid_until>clock_timestamp()
     and not exists (
       select 1 from tongs.hammer_first_transcription_activation_revocations revoked
       where revoked.activation_authority_id=previous.id
     )
  then
    raise exception 'previous Hammer authority is still active' using errcode='55000';
  end if;
  if exists (
       select 1
       from tongs.hammer_first_transcription_activation_authorities newer
       where newer.user_id=previous.user_id
         and newer.canonical_recording_id=previous.canonical_recording_id
         and newer.recording_revision_id=previous.recording_revision_id
         and (newer.created_at,newer.id)>(previous.created_at,previous.id)
     )
     or exists (
       select 1
       from tongs.hammer_first_transcription_activation_authorities prior
       join tongs.hammer_first_transcription_activation_consumptions consumed
         on consumed.activation_authority_id=prior.id
       where prior.user_id=previous.user_id
         and prior.canonical_recording_id=previous.canonical_recording_id
         and prior.recording_revision_id=previous.recording_revision_id
     )
     or exists (
       select 1
       from tongs.hammer_transcription_operations operation
       join tongs.hammer_transcription_provider_attempts attempt
         on attempt.operation_id=operation.id
       where operation.user_id=previous.user_id
         and operation.canonical_recording_id=previous.canonical_recording_id
         and operation.recording_revision_id=previous.recording_revision_id
     )
     or exists (
       select 1 from tongs.hammer_transcription_operations operation
       where operation.user_id=previous.user_id
         and operation.canonical_recording_id=previous.canonical_recording_id
         and operation.recording_revision_id=previous.recording_revision_id
         and operation.state in ('queued','processing','submission_unknown')
     )
  then
    raise exception 'Hammer renewal cannot reset or duplicate prior execution authority'
      using errcode='42501';
  end if;

  select * into provider
  from tongs.hammer_transcription_provider_authorities
  where id=previous.provider_authority_id;
  if not found or provider.provider<>'assemblyai' or provider.model<>'universal-3-5-pro'
     or provider.speaker_labels is not true or provider.financial_environment<>'live'
     or provider.supplier_rate_micros_per_hour<>230000
     or provider.billing_increment_ms<>1000 or provider.minimum_billable_ms<>1000
     or provider.supporting_cost_ceiling_micros<>6000
     or provider.lifecycle_state<>'certified_inactive'
     or provider.expires_at<p_valid_until
  then
    raise exception 'current certified AssemblyAI provider authority is required'
      using errcode='42501';
  end if;

  source:=tongs.resolve_hammer_transcription_source_authority(
    previous.workspace_id,previous.workpiece_id,previous.canonical_recording_id,
    previous.recording_revision_id
  );
  if source->>'completion_id'<>previous.completion_id::text
     or source->>'media_sha256'<>previous.media_sha256
     or (source->>'media_bytes')::bigint<>previous.media_bytes
     or (source->>'duration_ms')::bigint<>previous.verified_duration_ms
  then
    raise exception 'canonical Brad recording authority drifted' using errcode='42501';
  end if;

  insert into tongs.hammer_first_transcription_capacity_authorities(
    id,project_ref,evidence_sha256,checked_at,expires_at,netlify_plan,
    netlify_remaining_credit_microunits,supabase_plan,supabase_spend_cap_enabled,
    supabase_remaining_uncached_egress_bytes,supabase_remaining_database_bytes,
    observed_active_hammer_operations,created_by
  ) values(
    p_capacity_authority_id,'wtvdjndyxegudufrompx',p_capacity_evidence_sha256,
    p_capacity_checked_at,p_capacity_expires_at,'pro',p_netlify_remaining_credit_microunits,
    'pro',p_supabase_spend_cap_enabled,p_supabase_remaining_uncached_egress_bytes,
    p_supabase_remaining_database_bytes,0,p_operator_id
  );

  insert into tongs.hammer_first_transcription_activation_authorities(
    id,financial_environment,user_id,workspace_id,workpiece_id,canonical_recording_id,
    recording_revision_id,completion_id,media_sha256,media_bytes,verified_duration_ms,
    provider_authority_id,capacity_authority_id,pricing_revision_id,aggregate_policy_revision_id,
    supplier_ceiling_micros,supporting_cost_ceiling_micros,complete_wholesale_ceiling_micros,
    customer_credit_units,maximum_customer_charge_micros,maximum_provider_attempts,
    maximum_concurrency,automatic_retries,valid_from,valid_until,reason,created_by
  ) values(
    p_activation_id,previous.financial_environment,previous.user_id,previous.workspace_id,
    previous.workpiece_id,previous.canonical_recording_id,previous.recording_revision_id,
    previous.completion_id,previous.media_sha256,previous.media_bytes,
    previous.verified_duration_ms,previous.provider_authority_id,p_capacity_authority_id,
    previous.pricing_revision_id,previous.aggregate_policy_revision_id,
    previous.supplier_ceiling_micros,previous.supporting_cost_ceiling_micros,
    previous.complete_wholesale_ceiling_micros,previous.customer_credit_units,
    previous.maximum_customer_charge_micros,previous.maximum_provider_attempts,
    previous.maximum_concurrency,previous.automatic_retries,p_valid_from,p_valid_until,
    btrim(p_reason),p_operator_id
  );

  sponsorship:=tongs.install_hammer_owner_funded_first_transcription_authority(
    p_owner_authority_id,p_owner_budget_id,p_activation_id,p_operator_id,
    p_valid_from,p_valid_until,btrim(p_reason)
  );
  return jsonb_build_object(
    'activation_authority_id',p_activation_id,
    'capacity_authority_id',p_capacity_authority_id,
    'owner_authority_id',p_owner_authority_id,
    'owner_budget_id',p_owner_budget_id,
    'customer_payment_micros',0,
    'customer_credit_units',0,
    'reference_customer_credit_units',12,
    'maximum_wholesale_exposure_micros',44589,
    'maximum_provider_attempts',1,
    'automatic_retries',0,
    'execution_authorized',false,
    'provider_submitted',false,
    'sponsorship',sponsorship
  );
end
$$;

revoke all on function tongs.renew_hammer_owner_funded_first_transcription_authority(
  uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,
  bigint,bigint,bigint,boolean,timestamptz,timestamptz,text
) from public, anon, authenticated;
grant execute on function tongs.renew_hammer_owner_funded_first_transcription_authority(
  uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,
  bigint,bigint,bigint,boolean,timestamptz,timestamptz,text
) to service_role;

do $verify$
begin
  if has_function_privilege('public',
       'tongs.renew_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)',
       'EXECUTE')
     or has_function_privilege('anon',
       'tongs.renew_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)',
       'EXECUTE')
     or has_function_privilege('authenticated',
       'tongs.renew_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'tongs.renew_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)',
       'EXECUTE')
     or not (select relrowsecurity and relforcerowsecurity from pg_class
       where oid='tongs.hammer_first_transcription_activation_revocations'::regclass)
  then
    raise exception 'Hammer renewal service-only ACL or RLS verification failed';
  end if;
  if tongs._current_financial_environment()<>'test' then
    raise exception 'Hammer renewal migration must preserve global Test';
  end if;
end
$verify$;

comment on function tongs.renew_hammer_owner_funded_first_transcription_authority(
  uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,
  bigint,bigint,bigint,boolean,timestamptz,timestamptz,text
) is 'Service-only audited renewal of the exact Brad owner-sponsored Hammer authority. It preserves immutable history, zero customer debit, and the cross-renewal one-attempt boundary.';

notify pgrst,'reload schema';
commit;
