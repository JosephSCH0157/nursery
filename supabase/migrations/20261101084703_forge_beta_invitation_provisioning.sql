-- Slice 2A: invitation orchestration and admission-aware provisioning.
-- This migration adds no runtime admission enforcement. The invitation journal
-- is operational audit evidence only; account_admission_events remains the
-- exclusive authority for effective admission state.

begin;

create table tongs.beta_access_invitation_events (
  id uuid primary key default extensions.gen_random_uuid(),
  application_id uuid not null
    references tongs.beta_access_applications(id) on delete restrict,
  decision_revision bigint not null check (decision_revision > 0),
  attempt_id uuid not null,
  event_sequence bigint not null check (event_sequence > 0),
  operation_id uuid not null unique,
  event_type text not null check (event_type in (
    'identity_collision_detected',
    'dispatch_claimed',
    'dispatch_succeeded',
    'dispatch_failed',
    'dispatch_ambiguous',
    'collision_acknowledged',
    'binding_succeeded',
    'binding_failed'
  )),
  actor_id uuid not null references auth.users(id) on delete restrict,
  auth_user_id uuid references auth.users(id) on delete restrict,
  identity_disposition text check (
    identity_disposition is null or identity_disposition in (
      'absent',
      'existing_confirmed',
      'existing_unconfirmed',
      'journaled_invitation',
      'ambiguous'
    )
  ),
  lease_token_sha256 text check (
    lease_token_sha256 is null or lease_token_sha256 ~ '^[0-9a-f]{64}$'
  ),
  lease_expires_at timestamptz,
  outcome_code text check (
    outcome_code is null or (
      nullif(btrim(outcome_code), '') is not null and length(outcome_code) <= 120
    )
  ),
  reason text not null check (
    nullif(btrim(reason), '') is not null and length(reason) <= 2000
  ),
  created_at timestamptz not null default now(),
  unique (attempt_id, event_sequence),
  constraint beta_access_invitation_events_lease_check check (
    (event_type = 'dispatch_claimed'
      and lease_token_sha256 is not null
      and lease_expires_at is not null)
    or
    (event_type <> 'dispatch_claimed'
      and lease_token_sha256 is null
      and lease_expires_at is null)
  )
);

comment on table tongs.beta_access_invitation_events is
  'Append-only invitation orchestration evidence. It never grants admission and is not an admission-state authority.';

create unique index beta_access_invitation_attempt_once_idx
  on tongs.beta_access_invitation_events (application_id, decision_revision)
  where event_sequence = 1;

create index beta_access_invitation_events_application_idx
  on tongs.beta_access_invitation_events (application_id, created_at desc);

create index beta_access_invitation_events_auth_user_idx
  on tongs.beta_access_invitation_events (auth_user_id)
  where auth_user_id is not null;

alter table tongs.beta_access_invitation_events owner to postgres;
alter table tongs.beta_access_invitation_events enable row level security;
alter table tongs.beta_access_invitation_events force row level security;
revoke all on table tongs.beta_access_invitation_events
  from public, anon, authenticated, service_role;

create or replace function tongs._reject_beta_access_invitation_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'beta_access_invitation_events is append-only'
    using errcode = '55000';
end;
$$;

create trigger beta_access_invitation_events_immutable_rows
before update or delete on tongs.beta_access_invitation_events
for each row execute function tongs._reject_beta_access_invitation_event_mutation();

create trigger beta_access_invitation_events_immutable_truncate
before truncate on tongs.beta_access_invitation_events
for each statement execute function tongs._reject_beta_access_invitation_event_mutation();

create or replace function tongs._append_beta_access_invitation_event(
  p_application_id uuid,
  p_decision_revision bigint,
  p_attempt_id uuid,
  p_operation_id uuid,
  p_event_type text,
  p_actor_id uuid,
  p_auth_user_id uuid,
  p_identity_disposition text,
  p_lease_token_sha256 text,
  p_lease_expires_at timestamptz,
  p_outcome_code text,
  p_reason text
)
returns tongs.beta_access_invitation_events
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_existing tongs.beta_access_invitation_events%rowtype;
  v_first tongs.beta_access_invitation_events%rowtype;
  v_sequence bigint;
  v_inserted tongs.beta_access_invitation_events%rowtype;
begin
  if p_application_id is null or p_decision_revision is null or p_decision_revision < 1
     or p_attempt_id is null or p_operation_id is null or p_actor_id is null
     or p_event_type not in (
       'identity_collision_detected', 'dispatch_claimed', 'dispatch_succeeded',
       'dispatch_failed', 'dispatch_ambiguous', 'collision_acknowledged',
       'binding_succeeded', 'binding_failed'
     )
     or nullif(btrim(coalesce(p_reason, '')), '') is null
     or length(btrim(p_reason)) > 2000 then
    raise exception 'invalid invitation event' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_attempt_id::text, 428)
  );

  select event.* into v_existing
  from tongs.beta_access_invitation_events event
  where event.operation_id = p_operation_id;
  if found then
    if v_existing.application_id <> p_application_id
       or v_existing.decision_revision <> p_decision_revision
       or v_existing.attempt_id <> p_attempt_id
       or v_existing.event_type <> p_event_type
       or v_existing.actor_id <> p_actor_id
       or v_existing.auth_user_id is distinct from p_auth_user_id
       or v_existing.identity_disposition is distinct from p_identity_disposition
       or v_existing.lease_token_sha256 is distinct from p_lease_token_sha256
       or v_existing.lease_expires_at is distinct from p_lease_expires_at
       or v_existing.outcome_code is distinct from p_outcome_code
       or v_existing.reason <> btrim(p_reason) then
      raise exception 'invitation event operation conflict' using errcode = '23505';
    end if;
    return v_existing;
  end if;

  select event.* into v_first
  from tongs.beta_access_invitation_events event
  where event.attempt_id = p_attempt_id
  order by event.event_sequence
  limit 1
  for update;

  if found then
    if v_first.application_id <> p_application_id
       or v_first.decision_revision <> p_decision_revision then
      raise exception 'invitation attempt identity conflict' using errcode = '23505';
    end if;
    select max(event.event_sequence) + 1 into v_sequence
    from tongs.beta_access_invitation_events event
    where event.attempt_id = p_attempt_id;
  else
    if exists (
      select 1
      from tongs.beta_access_invitation_events event
      where event.application_id = p_application_id
        and event.decision_revision = p_decision_revision
    ) then
      raise exception 'approved decision already has a different invitation attempt'
        using errcode = '23505';
    end if;
    v_sequence := 1;
  end if;

  insert into tongs.beta_access_invitation_events (
    application_id, decision_revision, attempt_id, event_sequence,
    operation_id, event_type, actor_id, auth_user_id,
    identity_disposition, lease_token_sha256, lease_expires_at,
    outcome_code, reason
  ) values (
    p_application_id, p_decision_revision, p_attempt_id, v_sequence,
    p_operation_id, p_event_type, p_actor_id, p_auth_user_id,
    p_identity_disposition, p_lease_token_sha256, p_lease_expires_at,
    p_outcome_code, btrim(p_reason)
  ) returning * into v_inserted;

  return v_inserted;
end;
$$;

create or replace function tongs._provision_bound_beta_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_workspace_id uuid;
  v_profile_created boolean := false;
  v_workspace_created boolean := false;
begin
  if p_user_id is null then
    raise exception 'user is required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 429)
  );

  if not exists (
    select 1 from auth.users user_row where user_row.id = p_user_id
  ) then
    raise exception 'Auth identity not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from tongs.account_admissions admission
    where admission.user_id = p_user_id
      and admission.effective_state = 'admitted'
  ) then
    raise exception 'effective admission is required before provisioning'
      using errcode = '42501';
  end if;

  insert into public.profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
  v_profile_created := found;

  select member.workspace_id into v_workspace_id
  from tongs.workspace_members member
  where member.user_id = p_user_id
  order by member.created_at, member.workspace_id
  limit 1;

  if v_workspace_id is null then
    v_workspace_id := tongs.create_workspace_admin('My Workspace', p_user_id);
    v_workspace_created := true;
  end if;

  return jsonb_build_object(
    'user_id', p_user_id,
    'profile_created', v_profile_created,
    'workspace_created', v_workspace_created,
    'workspace_id', v_workspace_id
  );
end;
$$;

create or replace function tongs._bind_beta_access_application_core(
  p_application_id uuid,
  p_user_id uuid,
  p_reason text,
  p_operation_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_application tongs.beta_access_applications%rowtype;
  v_binding tongs.beta_access_identity_bindings%rowtype;
  v_user_email text;
  v_decision text;
  v_projection tongs.account_admissions%rowtype;
  v_created_grant boolean := false;
  v_provisioning jsonb := null;
begin
  if p_application_id is null or p_user_id is null or p_operation_id is null
     or p_actor_id is null or nullif(v_reason, '') is null
     or length(v_reason) > 2000 then
    raise exception 'invalid beta identity binding' using errcode = '22023';
  end if;

  select binding.* into v_binding
  from tongs.beta_access_identity_bindings binding
  where binding.operation_id = p_operation_id;
  if found then
    if v_binding.application_id <> p_application_id
       or v_binding.user_id <> p_user_id
       or v_binding.bound_by <> p_actor_id then
      raise exception 'binding operation conflict' using errcode = '23505';
    end if;
    select admission.* into v_projection
    from tongs.account_admissions admission
    where admission.user_id = p_user_id;
    return jsonb_build_object(
      'application_id', p_application_id,
      'user_id', p_user_id,
      'effective_state', v_projection.effective_state,
      'disposition', 'replayed',
      'provisioning', null
    );
  end if;

  select application.* into v_application
  from tongs.beta_access_applications application
  where application.id = p_application_id
  for update;
  if not found then
    raise exception 'beta application not found' using errcode = 'P0002';
  end if;

  select lower(btrim(user_row.email)) into v_user_email
  from auth.users user_row
  where user_row.id = p_user_id;
  if not found then
    raise exception 'Auth identity not found' using errcode = 'P0002';
  end if;
  if v_user_email is distinct from v_application.applicant_email_normalized then
    raise exception 'application and Auth identity email mismatch'
      using errcode = '23514';
  end if;

  select decision.decision into v_decision
  from tongs.beta_access_application_decisions decision
  where decision.application_id = p_application_id
  order by decision.revision desc
  limit 1;
  if v_decision is distinct from 'approved' then
    raise exception 'application is not currently approved' using errcode = '42501';
  end if;

  select binding.* into v_binding
  from tongs.beta_access_identity_bindings binding
  where binding.application_id = p_application_id
     or binding.user_id = p_user_id;
  if found then
    if v_binding.application_id = p_application_id
       and v_binding.user_id = p_user_id then
      select admission.* into v_projection
      from tongs.account_admissions admission
      where admission.user_id = p_user_id;
      return jsonb_build_object(
        'application_id', p_application_id,
        'user_id', p_user_id,
        'effective_state', v_projection.effective_state,
        'disposition', 'already_bound',
        'provisioning', null
      );
    end if;
    raise exception 'application or Auth UUID is already bound' using errcode = '23505';
  end if;

  insert into tongs.beta_access_identity_bindings (
    application_id, user_id, operation_id, bound_by
  ) values (
    p_application_id, p_user_id, p_operation_id, p_actor_id
  );

  select admission.* into v_projection
  from tongs.account_admissions admission
  where admission.user_id = p_user_id
  for update;
  if not found then
    insert into tongs.account_admission_events (
      user_id, revision, operation_id, event_type, origin_kind,
      origin_application_id, reason, actor_id
    ) values (
      p_user_id, 1, p_operation_id, 'grant', 'application',
      p_application_id, v_reason, p_actor_id
    );
    select admission.* into strict v_projection
    from tongs.account_admissions admission
    where admission.user_id = p_user_id;
    v_created_grant := true;
  end if;

  if v_created_grant and v_projection.effective_state = 'admitted' then
    v_provisioning := tongs._provision_bound_beta_account(p_user_id);
  end if;

  return jsonb_build_object(
    'application_id', p_application_id,
    'user_id', p_user_id,
    'effective_state', v_projection.effective_state,
    'disposition', 'bound',
    'provisioning', v_provisioning
  );
end;
$$;

create or replace function tongs.bind_beta_access_application(
  p_application_id uuid,
  p_user_id uuid,
  p_reason text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not tongs.is_platform_operator(v_actor) then
    raise exception 'platform operator authority required' using errcode = '42501';
  end if;
  return tongs._bind_beta_access_application_core(
    p_application_id, p_user_id, p_reason, p_operation_id, v_actor
  );
end;
$$;

comment on function tongs.bind_beta_access_application(uuid,uuid,text,uuid) is
  'Retained for historical signature compatibility. Slice 2A removes client execution; binding must use a journal-aware service RPC.';

create or replace function tongs.list_beta_invitation_applications(
  p_state text default null,
  p_limit integer default 100,
  p_before_submitted_at timestamptz default null,
  p_before_application_id uuid default null
)
returns table (
  application_id uuid,
  applicant_email text,
  application_snapshot jsonb,
  submitted_at timestamptz,
  current_decision text,
  decision_revision bigint,
  invitation_attempt_id uuid,
  invitation_event_type text,
  invitation_state text,
  matched_auth_user_id uuid,
  matched_auth_identity_confirmed boolean,
  matched_auth_identity_invited_at timestamptz,
  auth_identity_match_count bigint,
  bound_user_id uuid,
  effective_admission_state text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not tongs.is_platform_operator(auth.uid()) then
    raise exception 'platform operator authority required' using errcode = '42501';
  end if;
  if p_state is not null and p_state not in (
    'pending', 'approved', 'confirmed_identity_review',
    'unconfirmed_identity_collision', 'identity_ambiguous', 'dispatching',
    'delivery_ambiguous', 'delivery_failed', 'invited_unbound',
    'bound_admitted', 'bound_revoked', 'denied'
  ) then
    raise exception 'invalid invitation state filter' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'limit must be between 1 and 500' using errcode = '22023';
  end if;
  if (p_before_submitted_at is null) <> (p_before_application_id is null) then
    raise exception 'both invitation cursor values are required' using errcode = '22023';
  end if;

  return query
  with invitation_rows as (
    select
      application.id as application_id,
      application.applicant_email_normalized as applicant_email,
      application.application_snapshot,
      application.submitted_at,
      coalesce(decision.decision, 'pending') as current_decision,
      decision.revision as decision_revision,
      latest_event.attempt_id as invitation_attempt_id,
      latest_event.event_type as invitation_event_type,
      identity_match.user_id as matched_auth_user_id,
      identity_match.confirmed as matched_auth_identity_confirmed,
      identity_match.invited_at as matched_auth_identity_invited_at,
      identity_match.match_count as auth_identity_match_count,
      binding.user_id as bound_user_id,
      admission.effective_state as effective_admission_state,
      case
        when binding.user_id is not null and admission.effective_state = 'revoked'
          then 'bound_revoked'
        when binding.user_id is not null and admission.effective_state = 'admitted'
          then 'bound_admitted'
        when coalesce(decision.decision, 'pending') = 'denied'
          then 'denied'
        when coalesce(identity_match.match_count, 0) > 1
          then 'identity_ambiguous'
        when coalesce(identity_match.match_count, 0) = 1
          and coalesce(identity_match.confirmed, false)
          and latest_event.event_type is distinct from 'dispatch_succeeded'
          then 'confirmed_identity_review'
        when coalesce(identity_match.match_count, 0) = 1
          and not coalesce(identity_match.confirmed, false)
          and latest_event.event_type is distinct from 'dispatch_succeeded'
          then 'unconfirmed_identity_collision'
        when latest_event.event_type = 'dispatch_claimed'
          and latest_event.lease_expires_at > statement_timestamp()
          then 'dispatching'
        when latest_event.event_type = 'dispatch_claimed'
          then 'delivery_ambiguous'
        when latest_event.event_type = 'dispatch_ambiguous'
          then 'delivery_ambiguous'
        when latest_event.event_type in ('dispatch_failed', 'binding_failed')
          then 'delivery_failed'
        when latest_event.event_type = 'dispatch_succeeded'
          then 'invited_unbound'
        when coalesce(decision.decision, 'pending') = 'approved'
          then 'approved'
        else 'pending'
      end as invitation_state
    from tongs.beta_access_applications application
    left join lateral (
      select d.decision, d.revision
      from tongs.beta_access_application_decisions d
      where d.application_id = application.id
      order by d.revision desc
      limit 1
    ) decision on true
    left join lateral (
      select event.attempt_id, event.event_type, event.lease_expires_at
      from tongs.beta_access_invitation_events event
      where event.application_id = application.id
        and event.decision_revision = decision.revision
      order by event.event_sequence desc
      limit 1
    ) latest_event on true
    left join lateral (
      select
        count(*)::bigint as match_count,
        (array_agg(user_row.id order by user_row.id))[1] as user_id,
        (array_agg(user_row.email_confirmed_at is not null order by user_row.id))[1] as confirmed,
        (array_agg(user_row.invited_at order by user_row.id))[1] as invited_at
      from auth.users user_row
      where lower(btrim(user_row.email)) = application.applicant_email_normalized
    ) identity_match on true
    left join tongs.beta_access_identity_bindings binding
      on binding.application_id = application.id
    left join tongs.account_admissions admission
      on admission.user_id = binding.user_id
    where p_before_submitted_at is null
       or (application.submitted_at, application.id)
          < (p_before_submitted_at, p_before_application_id)
  )
  select
    row.application_id,
    row.applicant_email,
    row.application_snapshot,
    row.submitted_at,
    row.current_decision,
    row.decision_revision,
    row.invitation_attempt_id,
    row.invitation_event_type,
    row.invitation_state,
    row.matched_auth_user_id,
    row.matched_auth_identity_confirmed,
    row.matched_auth_identity_invited_at,
    row.auth_identity_match_count,
    row.bound_user_id,
    row.effective_admission_state
  from invitation_rows row
  where p_state is null or row.invitation_state = p_state
  order by row.submitted_at desc, row.application_id desc
  limit p_limit;
end;
$$;

create or replace function tongs.claim_beta_invitation_dispatch(
  p_actor_id uuid,
  p_application_id uuid,
  p_attempt_id uuid,
  p_operation_id uuid,
  p_lease_token_sha256 text,
  p_lease_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_application tongs.beta_access_applications%rowtype;
  v_decision tongs.beta_access_application_decisions%rowtype;
  v_event tongs.beta_access_invitation_events%rowtype;
  v_latest_claim tongs.beta_access_invitation_events%rowtype;
  v_user_ids uuid[];
  v_match_count bigint;
  v_user_id uuid;
  v_confirmed boolean;
  v_journaled boolean;
  v_disposition text;
begin
  if auth.role() is distinct from 'service_role'
     or not tongs.is_platform_operator(p_actor_id) then
    raise exception 'platform operator service authority required' using errcode = '42501';
  end if;
  if p_application_id is null or p_attempt_id is null or p_operation_id is null
     or p_lease_token_sha256 is null
     or p_lease_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_lease_expires_at is null
     or p_lease_expires_at <= statement_timestamp()
     or p_lease_expires_at > statement_timestamp() + interval '5 minutes' then
    raise exception 'invalid invitation dispatch claim' using errcode = '22023';
  end if;

  select event.* into v_event
  from tongs.beta_access_invitation_events event
  where event.operation_id = p_operation_id;
  if found then
    if v_event.application_id <> p_application_id
       or v_event.attempt_id <> p_attempt_id
       or v_event.actor_id <> p_actor_id
       or v_event.event_type not in ('dispatch_claimed', 'identity_collision_detected') then
      raise exception 'invitation claim operation conflict' using errcode = '23505';
    end if;
    select application.* into strict v_application
    from tongs.beta_access_applications application
    where application.id = p_application_id;
    return jsonb_build_object(
      'application_id', p_application_id,
      'attempt_id', p_attempt_id,
      'decision_revision', v_event.decision_revision,
      'disposition', case
        when v_event.event_type = 'dispatch_claimed' then 'dispatch_claimed'
        else v_event.identity_disposition
      end,
      'email', v_application.applicant_email_normalized,
      'auth_user_id', v_event.auth_user_id,
      'replayed', true
    );
  end if;

  select application.* into v_application
  from tongs.beta_access_applications application
  where application.id = p_application_id
  for update;
  if not found then
    raise exception 'beta application not found' using errcode = 'P0002';
  end if;

  select decision.* into v_decision
  from tongs.beta_access_application_decisions decision
  where decision.application_id = p_application_id
  order by decision.revision desc
  limit 1;
  if not found or v_decision.decision <> 'approved' then
    raise exception 'application is not currently approved' using errcode = '42501';
  end if;
  if exists (
    select 1 from tongs.beta_access_identity_bindings binding
    where binding.application_id = p_application_id
  ) then
    return jsonb_build_object(
      'application_id', p_application_id,
      'attempt_id', p_attempt_id,
      'decision_revision', v_decision.revision,
      'disposition', 'already_bound',
      'email', v_application.applicant_email_normalized,
      'replayed', false
    );
  end if;

  select array_agg(user_row.id order by user_row.id), count(*)
    into v_user_ids, v_match_count
  from auth.users user_row
  where lower(btrim(user_row.email)) = v_application.applicant_email_normalized;

  if v_match_count > 0 then
    if v_match_count > 1 then
      v_disposition := 'ambiguous';
      v_user_id := null;
    else
      v_user_id := v_user_ids[1];
      select user_row.email_confirmed_at is not null into v_confirmed
      from auth.users user_row where user_row.id = v_user_id;
      select exists (
        select 1
        from tongs.beta_access_invitation_events event
        where event.attempt_id = p_attempt_id
          and event.event_type = 'dispatch_succeeded'
          and event.auth_user_id = v_user_id
      ) into v_journaled;
      v_disposition := case
        when v_journaled then 'journaled_invitation'
        when v_confirmed then 'existing_confirmed'
        else 'existing_unconfirmed'
      end;
    end if;

    v_event := tongs._append_beta_access_invitation_event(
      p_application_id, v_decision.revision, p_attempt_id, p_operation_id,
      'identity_collision_detected', p_actor_id, v_user_id, v_disposition,
      null, null,
      case when v_match_count > 1 then 'multiple_exact_auth_identities'
           else v_disposition end,
      'Exact Auth identity resolution prevented a new invitation dispatch.'
    );
    return jsonb_build_object(
      'application_id', p_application_id,
      'attempt_id', p_attempt_id,
      'decision_revision', v_decision.revision,
      'disposition', v_disposition,
      'email', v_application.applicant_email_normalized,
      'auth_user_id', v_user_id,
      'replayed', false
    );
  end if;

  select event.* into v_latest_claim
  from tongs.beta_access_invitation_events event
  where event.attempt_id = p_attempt_id
    and event.event_type = 'dispatch_claimed'
    and not exists (
      select 1
      from tongs.beta_access_invitation_events terminal
      where terminal.attempt_id = event.attempt_id
        and terminal.event_sequence > event.event_sequence
        and terminal.event_type in (
          'dispatch_succeeded', 'dispatch_failed', 'dispatch_ambiguous'
        )
    )
  order by event.event_sequence desc
  limit 1;
  if found and v_latest_claim.lease_expires_at > statement_timestamp() then
    return jsonb_build_object(
      'application_id', p_application_id,
      'attempt_id', p_attempt_id,
      'decision_revision', v_decision.revision,
      'disposition', 'busy',
      'email', v_application.applicant_email_normalized,
      'lease_expires_at', v_latest_claim.lease_expires_at,
      'replayed', false
    );
  end if;

  v_event := tongs._append_beta_access_invitation_event(
    p_application_id, v_decision.revision, p_attempt_id, p_operation_id,
    'dispatch_claimed', p_actor_id, null, 'absent',
    lower(p_lease_token_sha256), p_lease_expires_at,
    'dispatch_claimed', 'No exact Auth identity existed when dispatch was claimed.'
  );
  return jsonb_build_object(
    'application_id', p_application_id,
    'attempt_id', p_attempt_id,
    'decision_revision', v_decision.revision,
    'disposition', 'dispatch_claimed',
    'email', v_application.applicant_email_normalized,
    'lease_expires_at', p_lease_expires_at,
    'replayed', false
  );
end;
$$;

create or replace function tongs.record_beta_invitation_dispatch(
  p_actor_id uuid,
  p_application_id uuid,
  p_attempt_id uuid,
  p_operation_id uuid,
  p_lease_token text,
  p_outcome text,
  p_auth_user_id uuid,
  p_outcome_code text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_application tongs.beta_access_applications%rowtype;
  v_first tongs.beta_access_invitation_events%rowtype;
  v_claim tongs.beta_access_invitation_events%rowtype;
  v_event tongs.beta_access_invitation_events%rowtype;
  v_token_sha256 text;
  v_email text;
  v_event_type text;
begin
  if auth.role() is distinct from 'service_role'
     or not tongs.is_platform_operator(p_actor_id) then
    raise exception 'platform operator service authority required' using errcode = '42501';
  end if;
  if p_application_id is null or p_attempt_id is null or p_operation_id is null
     or nullif(p_lease_token, '') is null
     or p_outcome not in ('succeeded', 'failed', 'ambiguous')
     or nullif(btrim(coalesce(p_outcome_code, '')), '') is null
     or length(btrim(p_outcome_code)) > 120
     or (p_outcome = 'succeeded' and p_auth_user_id is null)
     or (p_outcome <> 'succeeded' and p_auth_user_id is not null) then
    raise exception 'invalid invitation dispatch outcome' using errcode = '22023';
  end if;
  v_event_type := case p_outcome
    when 'succeeded' then 'dispatch_succeeded'
    when 'failed' then 'dispatch_failed'
    else 'dispatch_ambiguous'
  end;

  select event.* into v_event
  from tongs.beta_access_invitation_events event
  where event.operation_id = p_operation_id;
  if found then
    if v_event.application_id <> p_application_id
       or v_event.attempt_id <> p_attempt_id
       or v_event.actor_id <> p_actor_id
       or v_event.event_type <> v_event_type
       or v_event.auth_user_id is distinct from p_auth_user_id
       or v_event.outcome_code <> btrim(p_outcome_code) then
      raise exception 'dispatch outcome operation conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'application_id', p_application_id,
      'attempt_id', p_attempt_id,
      'event_type', v_event.event_type,
      'auth_user_id', v_event.auth_user_id,
      'disposition', 'replayed'
    );
  end if;

  select event.* into v_first
  from tongs.beta_access_invitation_events event
  where event.attempt_id = p_attempt_id
  order by event.event_sequence
  limit 1;
  if not found or v_first.application_id <> p_application_id then
    raise exception 'invitation attempt not found' using errcode = 'P0002';
  end if;

  select event.* into v_claim
  from tongs.beta_access_invitation_events event
  where event.attempt_id = p_attempt_id
    and event.event_type = 'dispatch_claimed'
    and not exists (
      select 1
      from tongs.beta_access_invitation_events terminal
      where terminal.attempt_id = event.attempt_id
        and terminal.event_sequence > event.event_sequence
        and terminal.event_type in (
          'dispatch_succeeded', 'dispatch_failed', 'dispatch_ambiguous'
        )
    )
  order by event.event_sequence desc
  limit 1;
  if not found then
    raise exception 'active invitation dispatch claim not found' using errcode = '42501';
  end if;

  v_token_sha256 := encode(
    extensions.digest(convert_to(p_lease_token, 'utf8'), 'sha256'), 'hex'
  );
  if v_token_sha256 <> v_claim.lease_token_sha256 then
    raise exception 'invitation dispatch lease mismatch' using errcode = '42501';
  end if;

  select application.* into strict v_application
  from tongs.beta_access_applications application
  where application.id = p_application_id
  for update;

  if p_outcome = 'succeeded' then
    select lower(btrim(user_row.email)) into v_email
    from auth.users user_row
    where user_row.id = p_auth_user_id;
    if not found or v_email is distinct from v_application.applicant_email_normalized then
      raise exception 'invited Auth UUID does not match the approved application email'
        using errcode = '23514';
    end if;
  end if;

  v_event := tongs._append_beta_access_invitation_event(
    p_application_id, v_first.decision_revision, p_attempt_id, p_operation_id,
    v_event_type, p_actor_id, p_auth_user_id,
    case when p_outcome = 'succeeded' then 'journaled_invitation' else null end,
    null, null, btrim(p_outcome_code),
    case p_outcome
      when 'succeeded' then 'Supabase Auth returned the canonical invited user UUID.'
      when 'failed' then 'Invitation delivery failed without a successful Auth UUID result.'
      else 'Invitation delivery result was ambiguous and requires identity reconciliation.'
    end
  );

  return jsonb_build_object(
    'application_id', p_application_id,
    'attempt_id', p_attempt_id,
    'event_type', v_event.event_type,
    'auth_user_id', v_event.auth_user_id,
    'disposition', 'recorded'
  );
end;
$$;

create or replace function tongs.bind_beta_access_application_as_operator(
  p_actor_id uuid,
  p_application_id uuid,
  p_user_id uuid,
  p_reason text,
  p_binding_operation_id uuid,
  p_attempt_id uuid,
  p_journal_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_success tongs.beta_access_invitation_events%rowtype;
  v_result jsonb;
  v_event tongs.beta_access_invitation_events%rowtype;
begin
  if auth.role() is distinct from 'service_role'
     or not tongs.is_platform_operator(p_actor_id) then
    raise exception 'platform operator service authority required' using errcode = '42501';
  end if;
  if p_attempt_id is null or p_journal_operation_id is null then
    raise exception 'invitation attempt and journal operation are required'
      using errcode = '22023';
  end if;

  select event.* into v_success
  from tongs.beta_access_invitation_events event
  where event.attempt_id = p_attempt_id
    and event.application_id = p_application_id
    and event.event_type = 'dispatch_succeeded'
    and event.auth_user_id = p_user_id
  order by event.event_sequence desc
  limit 1;
  if not found then
    raise exception 'successful invitation UUID evidence is required'
      using errcode = '42501';
  end if;

  v_result := tongs._bind_beta_access_application_core(
    p_application_id, p_user_id, p_reason, p_binding_operation_id, p_actor_id
  );
  v_event := tongs._append_beta_access_invitation_event(
    p_application_id, v_success.decision_revision, p_attempt_id,
    p_journal_operation_id, 'binding_succeeded', p_actor_id, p_user_id,
    'journaled_invitation', null, null, 'binding_succeeded',
    'The journaled invitation UUID was atomically bound and provisioned.'
  );
  return v_result || jsonb_build_object(
    'attempt_id', p_attempt_id,
    'journal_event_id', v_event.id
  );
end;
$$;

create or replace function tongs.bind_existing_beta_access_application_as_operator(
  p_actor_id uuid,
  p_application_id uuid,
  p_user_id uuid,
  p_reason text,
  p_binding_operation_id uuid,
  p_attempt_id uuid,
  p_acknowledgement_operation_id uuid,
  p_journal_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_application tongs.beta_access_applications%rowtype;
  v_decision tongs.beta_access_application_decisions%rowtype;
  v_email text;
  v_confirmed boolean;
  v_event tongs.beta_access_invitation_events%rowtype;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role'
     or not tongs.is_platform_operator(p_actor_id) then
    raise exception 'platform operator service authority required' using errcode = '42501';
  end if;
  if p_attempt_id is null or p_acknowledgement_operation_id is null
     or p_journal_operation_id is null then
    raise exception 'collision acknowledgement operations are required'
      using errcode = '22023';
  end if;

  select application.* into v_application
  from tongs.beta_access_applications application
  where application.id = p_application_id
  for update;
  if not found then
    raise exception 'beta application not found' using errcode = 'P0002';
  end if;
  select decision.* into v_decision
  from tongs.beta_access_application_decisions decision
  where decision.application_id = p_application_id
  order by decision.revision desc
  limit 1;
  if not found or v_decision.decision <> 'approved' then
    raise exception 'application is not currently approved' using errcode = '42501';
  end if;
  select lower(btrim(user_row.email)), user_row.email_confirmed_at is not null
    into v_email, v_confirmed
  from auth.users user_row
  where user_row.id = p_user_id;
  if not found or v_email is distinct from v_application.applicant_email_normalized then
    raise exception 'existing Auth UUID does not match the application email'
      using errcode = '23514';
  end if;
  if not v_confirmed then
    raise exception 'existing Auth identity must be confirmed before collision binding'
      using errcode = '42501';
  end if;

  v_event := tongs._append_beta_access_invitation_event(
    p_application_id, v_decision.revision, p_attempt_id,
    p_acknowledgement_operation_id, 'collision_acknowledged', p_actor_id,
    p_user_id, 'existing_confirmed', null, null,
    'exact_uuid_acknowledged', p_reason
  );
  v_result := tongs._bind_beta_access_application_core(
    p_application_id, p_user_id, p_reason, p_binding_operation_id, p_actor_id
  );
  v_event := tongs._append_beta_access_invitation_event(
    p_application_id, v_decision.revision, p_attempt_id,
    p_journal_operation_id, 'binding_succeeded', p_actor_id, p_user_id,
    'existing_confirmed', null, null, 'binding_succeeded',
    'The explicitly acknowledged confirmed Auth UUID was bound.'
  );
  return v_result || jsonb_build_object(
    'attempt_id', p_attempt_id,
    'journal_event_id', v_event.id,
    'collision_acknowledged', true
  );
end;
$$;

create or replace function tongs.record_beta_invitation_binding_failure(
  p_actor_id uuid,
  p_application_id uuid,
  p_attempt_id uuid,
  p_operation_id uuid,
  p_auth_user_id uuid,
  p_outcome_code text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_first tongs.beta_access_invitation_events%rowtype;
  v_event tongs.beta_access_invitation_events%rowtype;
begin
  if auth.role() is distinct from 'service_role'
     or not tongs.is_platform_operator(p_actor_id) then
    raise exception 'platform operator service authority required' using errcode = '42501';
  end if;
  if p_operation_id is null or p_attempt_id is null
     or nullif(btrim(coalesce(p_outcome_code, '')), '') is null
     or length(btrim(p_outcome_code)) > 120 then
    raise exception 'invalid binding failure event' using errcode = '22023';
  end if;
  select event.* into v_first
  from tongs.beta_access_invitation_events event
  where event.attempt_id = p_attempt_id
  order by event.event_sequence
  limit 1;
  if not found or v_first.application_id <> p_application_id then
    raise exception 'invitation attempt not found' using errcode = 'P0002';
  end if;
  v_event := tongs._append_beta_access_invitation_event(
    p_application_id, v_first.decision_revision, p_attempt_id, p_operation_id,
    'binding_failed', p_actor_id, p_auth_user_id, null, null, null,
    btrim(p_outcome_code),
    'Invitation binding did not commit and remains safely retryable.'
  );
  return jsonb_build_object(
    'application_id', p_application_id,
    'attempt_id', p_attempt_id,
    'journal_event_id', v_event.id,
    'disposition', 'recorded'
  );
end;
$$;

create or replace function tongs.read_my_admission_onboarding()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_admission tongs.account_admissions%rowtype;
  v_profile_exists boolean;
  v_workspace_exists boolean;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select admission.* into v_admission
  from tongs.account_admissions admission
  where admission.user_id = v_user_id;
  select exists (
    select 1 from public.profiles profile where profile.user_id = v_user_id
  ) into v_profile_exists;
  select exists (
    select 1 from tongs.workspace_members member where member.user_id = v_user_id
  ) into v_workspace_exists;
  return jsonb_build_object(
    'user_id', v_user_id,
    'effective_state', v_admission.effective_state,
    'origin_kind', v_admission.origin_kind,
    'admitted', coalesce(v_admission.effective_state = 'admitted', false),
    'profile_ready', v_profile_exists,
    'workspace_ready', v_workspace_exists
  );
end;
$$;

-- Supabase invitation creation inserts auth.users before Forge can bind the
-- returned UUID. Defer only those invite rows; ordinary signup behavior is
-- preserved. Binding then provisions in the same transaction as the grant.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.invited_at is not null then
    return new;
  end if;

  begin
    if pg_catalog.to_regclass('public.profiles') is not null then
      insert into public.profiles (user_id)
      values (new.id)
      on conflict (user_id) do nothing;
    end if;
  exception when others then
    raise warning '[handle_new_user] profile bootstrap failed for user %: % (%)',
      new.id, SQLERRM, SQLSTATE;
  end;

  begin
    if not exists (
      select 1
      from tongs.workspace_members member
      where member.user_id = new.id
    ) then
      perform tongs.create_workspace_admin('My Workspace', new.id);
    end if;
  exception when others then
    raise warning '[handle_new_user] workspace bootstrap failed for user %: % (%)',
      new.id, SQLERRM, SQLSTATE;
  end;

  return new;
end;
$$;

alter function tongs._reject_beta_access_invitation_event_mutation() owner to postgres;
alter function tongs._append_beta_access_invitation_event(
  uuid,bigint,uuid,uuid,text,uuid,uuid,text,text,timestamptz,text,text
) owner to postgres;
alter function tongs._provision_bound_beta_account(uuid) owner to postgres;
alter function tongs._bind_beta_access_application_core(uuid,uuid,text,uuid,uuid) owner to postgres;
alter function tongs.bind_beta_access_application(uuid,uuid,text,uuid) owner to postgres;
alter function tongs.list_beta_invitation_applications(text,integer,timestamptz,uuid) owner to postgres;
alter function tongs.claim_beta_invitation_dispatch(uuid,uuid,uuid,uuid,text,timestamptz) owner to postgres;
alter function tongs.record_beta_invitation_dispatch(uuid,uuid,uuid,uuid,text,text,uuid,text) owner to postgres;
alter function tongs.bind_beta_access_application_as_operator(uuid,uuid,uuid,text,uuid,uuid,uuid) owner to postgres;
alter function tongs.bind_existing_beta_access_application_as_operator(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid) owner to postgres;
alter function tongs.record_beta_invitation_binding_failure(uuid,uuid,uuid,uuid,uuid,text) owner to postgres;
alter function tongs.read_my_admission_onboarding() owner to postgres;
alter function public.handle_new_user() owner to postgres;

revoke all on function tongs._reject_beta_access_invitation_event_mutation()
  from public, anon, authenticated, service_role;
revoke all on function tongs._append_beta_access_invitation_event(
  uuid,bigint,uuid,uuid,text,uuid,uuid,text,text,timestamptz,text,text
) from public, anon, authenticated, service_role;
revoke all on function tongs._provision_bound_beta_account(uuid)
  from public, anon, authenticated, service_role;
revoke all on function tongs._bind_beta_access_application_core(uuid,uuid,text,uuid,uuid)
  from public, anon, authenticated, service_role;

revoke all on function tongs.bind_beta_access_application(uuid,uuid,text,uuid)
  from public, anon, authenticated, service_role;

revoke all on function tongs.list_beta_invitation_applications(text,integer,timestamptz,uuid)
  from public, anon, authenticated, service_role;
grant execute on function tongs.list_beta_invitation_applications(text,integer,timestamptz,uuid)
  to authenticated;

revoke all on function tongs.claim_beta_invitation_dispatch(uuid,uuid,uuid,uuid,text,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function tongs.claim_beta_invitation_dispatch(uuid,uuid,uuid,uuid,text,timestamptz)
  to service_role;

revoke all on function tongs.record_beta_invitation_dispatch(uuid,uuid,uuid,uuid,text,text,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function tongs.record_beta_invitation_dispatch(uuid,uuid,uuid,uuid,text,text,uuid,text)
  to service_role;

revoke all on function tongs.bind_beta_access_application_as_operator(uuid,uuid,uuid,text,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function tongs.bind_beta_access_application_as_operator(uuid,uuid,uuid,text,uuid,uuid,uuid)
  to service_role;

revoke all on function tongs.bind_existing_beta_access_application_as_operator(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function tongs.bind_existing_beta_access_application_as_operator(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid)
  to service_role;

revoke all on function tongs.record_beta_invitation_binding_failure(uuid,uuid,uuid,uuid,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function tongs.record_beta_invitation_binding_failure(uuid,uuid,uuid,uuid,uuid,text)
  to service_role;

revoke all on function tongs.read_my_admission_onboarding()
  from public, anon, authenticated, service_role;
grant execute on function tongs.read_my_admission_onboarding()
  to authenticated;

revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;
grant execute on function public.handle_new_user() to service_role;

commit;
