-- Active Slice 1 implementation begins here.
-- Records authority only; activates no admission enforcement and changes no
-- existing Auth, workspace, Storage, Realtime, financial, or RLS behavior.

begin;

create table tongs.beta_access_applications (
  id uuid primary key default extensions.gen_random_uuid(),
  source text not null default 'netlify_form' check (source = 'netlify_form'),
  source_reference text not null check (nullif(btrim(source_reference), '') is not null and length(source_reference) <= 200),
  source_payload_sha256 text not null check (source_payload_sha256 ~ '^[0-9a-f]{64}$'),
  applicant_email_normalized text not null check (
    applicant_email_normalized = lower(btrim(applicant_email_normalized))
    and nullif(applicant_email_normalized, '') is not null
    and length(applicant_email_normalized) <= 320
  ),
  application_snapshot jsonb not null check (jsonb_typeof(application_snapshot) = 'object'),
  submitted_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique (source, source_reference)
);
comment on table tongs.beta_access_applications is
  'Immutable normalized intake from verified Netlify beta-form submissions; never grants admission.';
create index beta_access_applications_email_idx
  on tongs.beta_access_applications (applicant_email_normalized, submitted_at desc);

create table tongs.beta_access_application_decisions (
  id uuid primary key default extensions.gen_random_uuid(),
  application_id uuid not null references tongs.beta_access_applications(id) on delete restrict,
  revision bigint not null check (revision > 0),
  operation_id uuid not null unique,
  decision text not null check (decision in ('approved', 'denied')),
  reason text not null check (nullif(btrim(reason), '') is not null and length(reason) <= 2000),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (application_id, revision)
);
comment on table tongs.beta_access_application_decisions is
  'Append-only operator decisions; approval alone never creates an identity or admission.';
create index beta_access_application_decisions_actor_idx
  on tongs.beta_access_application_decisions (actor_id);

create table tongs.beta_access_identity_bindings (
  application_id uuid primary key references tongs.beta_access_applications(id) on delete restrict,
  user_id uuid not null unique references auth.users(id) on delete restrict,
  operation_id uuid not null unique,
  bound_by uuid not null references auth.users(id) on delete restrict,
  bound_at timestamptz not null default now()
);
comment on table tongs.beta_access_identity_bindings is
  'Immutable one-to-one approved-application binding to the canonical Supabase Auth UUID.';
create index beta_access_identity_bindings_bound_by_idx
  on tongs.beta_access_identity_bindings (bound_by);

create table tongs.legacy_account_admission_cohort (
  user_id uuid primary key references auth.users(id) on delete restrict,
  captured_at timestamptz not null default now(),
  migration_version text not null default '20261031123320' check (migration_version = '20261031123320')
);
comment on table tongs.legacy_account_admission_cohort is
  'Immutable cutover snapshot; membership is provenance and never overrides effective admission state.';
insert into tongs.legacy_account_admission_cohort (user_id)
select u.id from auth.users u on conflict (user_id) do nothing;

create table tongs.account_admission_events (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  revision bigint not null check (revision > 0),
  operation_id uuid not null unique,
  event_type text not null check (event_type in ('grant', 'revoke', 'restore')),
  origin_kind text not null check (origin_kind in ('legacy', 'application')),
  origin_application_id uuid references tongs.beta_access_identity_bindings(application_id) on delete restrict,
  origin_legacy_user_id uuid references tongs.legacy_account_admission_cohort(user_id) on delete restrict,
  reason text not null check (nullif(btrim(reason), '') is not null and length(reason) <= 2000),
  actor_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, revision),
  constraint account_admission_events_origin_check check (
    (origin_kind = 'legacy' and origin_application_id is null and origin_legacy_user_id = user_id)
    or (origin_kind = 'application' and origin_application_id is not null and origin_legacy_user_id is null)
  ),
  constraint account_admission_events_actor_check check (
    (event_type = 'grant' and origin_kind = 'legacy' and actor_id is null) or actor_id is not null
  )
);
comment on table tongs.account_admission_events is
  'Canonical append-only grant, revoke, and restore ledger that exclusively determines effective state.';
create index account_admission_events_actor_idx on tongs.account_admission_events (actor_id);
create index account_admission_events_origin_application_idx
  on tongs.account_admission_events (origin_application_id) where origin_application_id is not null;
create index account_admission_events_origin_legacy_idx
  on tongs.account_admission_events (origin_legacy_user_id) where origin_legacy_user_id is not null;

create table tongs.account_admissions (
  user_id uuid primary key references auth.users(id) on delete restrict,
  effective_state text not null check (effective_state in ('admitted', 'revoked')),
  origin_kind text not null check (origin_kind in ('legacy', 'application')),
  origin_application_id uuid references tongs.beta_access_identity_bindings(application_id) on delete restrict,
  origin_legacy_user_id uuid references tongs.legacy_account_admission_cohort(user_id) on delete restrict,
  current_event_id uuid not null unique references tongs.account_admission_events(id) on delete restrict,
  event_revision bigint not null check (event_revision > 0),
  updated_at timestamptz not null,
  constraint account_admissions_origin_check check (
    (origin_kind = 'legacy' and origin_application_id is null and origin_legacy_user_id = user_id)
    or (origin_kind = 'application' and origin_application_id is not null and origin_legacy_user_id is null)
  )
);
comment on table tongs.account_admissions is
  'Trigger-maintained current-state projection of account_admission_events; never independently mutable authority.';
create index account_admissions_origin_application_idx
  on tongs.account_admissions (origin_application_id) where origin_application_id is not null;
create index account_admissions_origin_legacy_idx
  on tongs.account_admissions (origin_legacy_user_id) where origin_legacy_user_id is not null;

alter table tongs.beta_access_applications enable row level security;
alter table tongs.beta_access_applications force row level security;
alter table tongs.beta_access_application_decisions enable row level security;
alter table tongs.beta_access_application_decisions force row level security;
alter table tongs.beta_access_identity_bindings enable row level security;
alter table tongs.beta_access_identity_bindings force row level security;
alter table tongs.legacy_account_admission_cohort enable row level security;
alter table tongs.legacy_account_admission_cohort force row level security;
alter table tongs.account_admission_events enable row level security;
alter table tongs.account_admission_events force row level security;
alter table tongs.account_admissions enable row level security;
alter table tongs.account_admissions force row level security;

revoke all on tongs.beta_access_applications from public, anon, authenticated, service_role;
revoke all on tongs.beta_access_application_decisions from public, anon, authenticated, service_role;
revoke all on tongs.beta_access_identity_bindings from public, anon, authenticated, service_role;
revoke all on tongs.legacy_account_admission_cohort from public, anon, authenticated, service_role;
revoke all on tongs.account_admission_events from public, anon, authenticated, service_role;
revoke all on tongs.account_admissions from public, anon, authenticated, service_role;

create or replace function tongs._reject_account_admission_immutable_mutation()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin raise exception '% is immutable', tg_table_name using errcode = '55000'; end;
$$;
create trigger beta_access_applications_immutable before update or delete on tongs.beta_access_applications
  for each row execute function tongs._reject_account_admission_immutable_mutation();
create trigger beta_access_application_decisions_immutable before update or delete on tongs.beta_access_application_decisions
  for each row execute function tongs._reject_account_admission_immutable_mutation();
create trigger beta_access_identity_bindings_immutable before update or delete on tongs.beta_access_identity_bindings
  for each row execute function tongs._reject_account_admission_immutable_mutation();
create trigger legacy_account_admission_cohort_immutable before update or delete on tongs.legacy_account_admission_cohort
  for each row execute function tongs._reject_account_admission_immutable_mutation();
create trigger account_admission_events_immutable before update or delete on tongs.account_admission_events
  for each row execute function tongs._reject_account_admission_immutable_mutation();

-- ACTIVE IMPLEMENTATION CONTINUES
create or replace function tongs._guard_account_admissions_projection()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if pg_trigger_depth() < 2 then
    raise exception 'account_admissions is event-projected and cannot be changed directly' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger account_admissions_projection_guard
before insert or update or delete on tongs.account_admissions
for each row execute function tongs._guard_account_admissions_projection();

create or replace function tongs._project_account_admission_event()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_current tongs.account_admissions%rowtype;
  v_state text;
begin
  select admission.* into v_current
  from tongs.account_admissions admission
  where admission.user_id = new.user_id for update;

  if not found then
    if new.event_type <> 'grant' or new.revision <> 1 then
      raise exception 'first admission event must be revision 1 grant' using errcode = '23514';
    end if;
    v_state := 'admitted';
  else
    if new.revision <> v_current.event_revision + 1
       or new.origin_kind <> v_current.origin_kind
       or new.origin_application_id is distinct from v_current.origin_application_id
       or new.origin_legacy_user_id is distinct from v_current.origin_legacy_user_id then
      raise exception 'admission event does not continue canonical authority' using errcode = '23514';
    end if;
    if v_current.effective_state = 'admitted' and new.event_type <> 'revoke' then
      raise exception 'admitted principal requires a revoke event' using errcode = '23514';
    end if;
    if v_current.effective_state = 'revoked' and new.event_type <> 'restore' then
      raise exception 'revoked principal requires a restore event' using errcode = '23514';
    end if;
    v_state := case new.event_type when 'revoke' then 'revoked' else 'admitted' end;
  end if;

  insert into tongs.account_admissions (
    user_id, effective_state, origin_kind, origin_application_id,
    origin_legacy_user_id, current_event_id, event_revision, updated_at
  ) values (
    new.user_id, v_state, new.origin_kind, new.origin_application_id,
    new.origin_legacy_user_id, new.id, new.revision, new.created_at
  ) on conflict (user_id) do update
  set effective_state = excluded.effective_state,
      current_event_id = excluded.current_event_id,
      event_revision = excluded.event_revision,
      updated_at = excluded.updated_at;
  return new;
end;
$$;
create trigger account_admission_events_project_current
after insert on tongs.account_admission_events
for each row execute function tongs._project_account_admission_event();

insert into tongs.account_admission_events (
  user_id, revision, operation_id, event_type, origin_kind,
  origin_legacy_user_id, reason, actor_id
)
select cohort.user_id, 1, extensions.gen_random_uuid(), 'grant', 'legacy', cohort.user_id,
       'Legacy cohort captured before admission enforcement', null
from tongs.legacy_account_admission_cohort cohort order by cohort.user_id;

create or replace function tongs.account_admission_authority_version()
returns text language sql immutable set search_path = pg_catalog
as $$ select 'forge-account-admission-v1'::text $$;

create or replace function tongs.ingest_beta_access_application(
  p_source_reference text,
  p_payload_sha256 text,
  p_email text,
  p_name text,
  p_creator_type text,
  p_frequency text,
  p_goals text,
  p_teleprompter_used text default null,
  p_frustrations text default null,
  p_notes text default null,
  p_submitted_at timestamptz default now()
)
returns table (application_id uuid, disposition text)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_reference text := btrim(coalesce(p_source_reference, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_creator_type text := btrim(coalesce(p_creator_type, ''));
  v_frequency text := btrim(coalesce(p_frequency, ''));
  v_goals text := btrim(coalesce(p_goals, ''));
  v_existing tongs.beta_access_applications%rowtype;
begin
  if nullif(v_reference, '') is null or length(v_reference) > 200
     or p_payload_sha256 is null or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or nullif(v_email, '') is null or length(v_email) > 320 or position('@' in v_email) < 2
     or nullif(v_name, '') is null or length(v_name) > 200
     or nullif(v_creator_type, '') is null or length(v_creator_type) > 120
     or nullif(v_frequency, '') is null or length(v_frequency) > 120
     or nullif(v_goals, '') is null or length(v_goals) > 5000
     or length(coalesce(p_teleprompter_used, '')) > 1000
     or length(coalesce(p_frustrations, '')) > 5000
     or length(coalesce(p_notes, '')) > 5000
     or p_submitted_at is null then
    raise exception 'invalid beta access application' using errcode = '22023';
  end if;

  select application.* into v_existing from tongs.beta_access_applications application
  where application.source = 'netlify_form' and application.source_reference = v_reference;
  if found then
    if v_existing.source_payload_sha256 <> p_payload_sha256 then
      raise exception 'beta application idempotency conflict' using errcode = '23505';
    end if;
    return query select v_existing.id, 'replayed'::text;
    return;
  end if;

  return query insert into tongs.beta_access_applications (
    source_reference, source_payload_sha256, applicant_email_normalized,
    application_snapshot, submitted_at
  ) values (
    v_reference, p_payload_sha256, v_email,
    jsonb_build_object(
      'name', v_name, 'email', v_email, 'creator_type', v_creator_type,
      'frequency', v_frequency, 'goals', v_goals,
      'teleprompter_used', nullif(btrim(coalesce(p_teleprompter_used, '')), ''),
      'frustrations', nullif(btrim(coalesce(p_frustrations, '')), ''),
      'notes', nullif(btrim(coalesce(p_notes, '')), '')
    ), p_submitted_at
  ) returning id, 'created'::text;
end;
$$;

-- ACTIVE IMPLEMENTATION CONTINUES 2
create or replace function tongs.list_beta_access_applications(
  p_decision text default null,
  p_limit integer default 100
)
returns table (
  application_id uuid,
  applicant_email text,
  application_snapshot jsonb,
  submitted_at timestamptz,
  current_decision text,
  decision_revision bigint,
  bound_user_id uuid,
  effective_admission_state text
)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  if not tongs.is_platform_operator(auth.uid()) then
    raise exception 'platform operator authority required' using errcode = '42501';
  end if;
  if p_decision is not null and p_decision not in ('pending', 'approved', 'denied') then
    raise exception 'invalid application decision filter' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'limit must be between 1 and 500' using errcode = '22023';
  end if;

  return query
  select application.id, application.applicant_email_normalized,
         application.application_snapshot, application.submitted_at,
         coalesce(decision.decision, 'pending'), decision.revision,
         binding.user_id, admission.effective_state
  from tongs.beta_access_applications application
  left join lateral (
    select d.decision, d.revision
    from tongs.beta_access_application_decisions d
    where d.application_id = application.id
    order by d.revision desc limit 1
  ) decision on true
  left join tongs.beta_access_identity_bindings binding on binding.application_id = application.id
  left join tongs.account_admissions admission on admission.user_id = binding.user_id
  where p_decision is null or coalesce(decision.decision, 'pending') = p_decision
  order by application.submitted_at desc limit p_limit;
end;
$$;

create or replace function tongs.decide_beta_access_application(
  p_application_id uuid,
  p_decision text,
  p_reason text,
  p_operation_id uuid
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_existing tongs.beta_access_application_decisions%rowtype;
  v_revision bigint;
begin
  if not tongs.is_platform_operator(v_actor) then
    raise exception 'platform operator authority required' using errcode = '42501';
  end if;
  if p_application_id is null or p_decision not in ('approved', 'denied')
     or p_operation_id is null or nullif(v_reason, '') is null or length(v_reason) > 2000 then
    raise exception 'invalid beta application decision' using errcode = '22023';
  end if;

  select d.* into v_existing from tongs.beta_access_application_decisions d
  where d.operation_id = p_operation_id;
  if found then
    if v_existing.application_id <> p_application_id or v_existing.decision <> p_decision
       or v_existing.reason <> v_reason or v_existing.actor_id <> v_actor then
      raise exception 'decision operation conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('application_id', p_application_id, 'decision', p_decision,
      'revision', v_existing.revision, 'disposition', 'replayed');
  end if;

  perform 1 from tongs.beta_access_applications a where a.id = p_application_id for update;
  if not found then raise exception 'beta application not found' using errcode = 'P0002'; end if;
  if exists (select 1 from tongs.beta_access_identity_bindings b where b.application_id = p_application_id) then
    raise exception 'bound application decisions are immutable; revoke admission instead' using errcode = '55000';
  end if;

  select coalesce(max(d.revision), 0) + 1 into v_revision
  from tongs.beta_access_application_decisions d where d.application_id = p_application_id;
  insert into tongs.beta_access_application_decisions (
    application_id, revision, operation_id, decision, reason, actor_id
  ) values (p_application_id, v_revision, p_operation_id, p_decision, v_reason, v_actor);
  return jsonb_build_object('application_id', p_application_id, 'decision', p_decision,
    'revision', v_revision, 'disposition', 'recorded');
end;
$$;

-- ACTIVE IMPLEMENTATION CONTINUES 3
create or replace function tongs.bind_beta_access_application(
  p_application_id uuid,
  p_user_id uuid,
  p_reason text,
  p_operation_id uuid
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_application tongs.beta_access_applications%rowtype;
  v_binding tongs.beta_access_identity_bindings%rowtype;
  v_user_email text;
  v_decision text;
  v_projection tongs.account_admissions%rowtype;
begin
  if not tongs.is_platform_operator(v_actor) then
    raise exception 'platform operator authority required' using errcode = '42501';
  end if;
  if p_application_id is null or p_user_id is null or p_operation_id is null
     or nullif(v_reason, '') is null or length(v_reason) > 2000 then
    raise exception 'invalid beta identity binding' using errcode = '22023';
  end if;

  select b.* into v_binding from tongs.beta_access_identity_bindings b
  where b.operation_id = p_operation_id;
  if found then
    if v_binding.application_id <> p_application_id or v_binding.user_id <> p_user_id
       or v_binding.bound_by <> v_actor then
      raise exception 'binding operation conflict' using errcode = '23505';
    end if;
    select * into v_projection from tongs.account_admissions a where a.user_id = p_user_id;
    return jsonb_build_object('application_id', p_application_id, 'user_id', p_user_id,
      'effective_state', v_projection.effective_state, 'disposition', 'replayed');
  end if;

  select a.* into v_application from tongs.beta_access_applications a
  where a.id = p_application_id for update;
  if not found then raise exception 'beta application not found' using errcode = 'P0002'; end if;
  select lower(btrim(u.email)) into v_user_email from auth.users u where u.id = p_user_id;
  if not found then raise exception 'Auth identity not found' using errcode = 'P0002'; end if;
  if v_user_email is distinct from v_application.applicant_email_normalized then
    raise exception 'application and Auth identity email mismatch' using errcode = '23514';
  end if;
  select d.decision into v_decision from tongs.beta_access_application_decisions d
  where d.application_id = p_application_id order by d.revision desc limit 1;
  if v_decision is distinct from 'approved' then
    raise exception 'application is not currently approved' using errcode = '42501';
  end if;

  select b.* into v_binding from tongs.beta_access_identity_bindings b
  where b.application_id = p_application_id or b.user_id = p_user_id;
  if found then
    if v_binding.application_id = p_application_id and v_binding.user_id = p_user_id then
      select * into v_projection from tongs.account_admissions a where a.user_id = p_user_id;
      return jsonb_build_object('application_id', p_application_id, 'user_id', p_user_id,
        'effective_state', v_projection.effective_state, 'disposition', 'already_bound');
    end if;
    raise exception 'application or Auth UUID is already bound' using errcode = '23505';
  end if;

  insert into tongs.beta_access_identity_bindings (application_id, user_id, operation_id, bound_by)
  values (p_application_id, p_user_id, p_operation_id, v_actor);
  select * into v_projection from tongs.account_admissions a where a.user_id = p_user_id for update;
  if not found then
    insert into tongs.account_admission_events (
      user_id, revision, operation_id, event_type, origin_kind,
      origin_application_id, reason, actor_id
    ) values (p_user_id, 1, p_operation_id, 'grant', 'application', p_application_id, v_reason, v_actor);
    select * into strict v_projection from tongs.account_admissions a where a.user_id = p_user_id;
  end if;
  return jsonb_build_object('application_id', p_application_id, 'user_id', p_user_id,
    'effective_state', v_projection.effective_state, 'disposition', 'bound');
end;
$$;

create or replace function tongs.set_account_admission_state(
  p_user_id uuid,
  p_state text,
  p_reason text,
  p_operation_id uuid
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_projection tongs.account_admissions%rowtype;
  v_existing tongs.account_admission_events%rowtype;
  v_event_type text;
begin
  if not tongs.is_platform_operator(v_actor) then
    raise exception 'platform operator authority required' using errcode = '42501';
  end if;
  if p_user_id is null or p_state not in ('admitted', 'revoked') or p_operation_id is null
     or nullif(v_reason, '') is null or length(v_reason) > 2000 then
    raise exception 'invalid account admission state change' using errcode = '22023';
  end if;
  v_event_type := case p_state when 'revoked' then 'revoke' else 'restore' end;

  select e.* into v_existing from tongs.account_admission_events e where e.operation_id = p_operation_id;
  if found then
    if v_existing.user_id <> p_user_id or v_existing.event_type <> v_event_type
       or v_existing.reason <> v_reason or v_existing.actor_id <> v_actor then
      raise exception 'admission-state operation conflict' using errcode = '23505';
    end if;
    select * into strict v_projection from tongs.account_admissions a where a.user_id = p_user_id;
    return jsonb_build_object('user_id', p_user_id, 'effective_state', v_projection.effective_state,
      'revision', v_projection.event_revision, 'disposition', 'replayed');
  end if;

  select a.* into v_projection from tongs.account_admissions a where a.user_id = p_user_id for update;
  if not found then raise exception 'account admission not found' using errcode = 'P0002'; end if;
  if v_projection.effective_state = p_state then
    raise exception 'account admission already has requested state' using errcode = '55000';
  end if;
  insert into tongs.account_admission_events (
    user_id, revision, operation_id, event_type, origin_kind,
    origin_application_id, origin_legacy_user_id, reason, actor_id
  ) values (
    p_user_id, v_projection.event_revision + 1, p_operation_id, v_event_type,
    v_projection.origin_kind, v_projection.origin_application_id,
    v_projection.origin_legacy_user_id, v_reason, v_actor
  );
  select * into strict v_projection from tongs.account_admissions a where a.user_id = p_user_id;
  return jsonb_build_object('user_id', p_user_id, 'effective_state', v_projection.effective_state,
    'revision', v_projection.event_revision, 'disposition', 'recorded');
end;
$$;

create or replace function tongs.is_account_admitted(p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  if p_user_id is null then return false; end if;
  if v_role <> 'service_role' and v_actor is distinct from p_user_id then
    raise exception 'self or service-role authority required' using errcode = '42501';
  end if;
  return exists (
    select 1 from tongs.account_admissions admission
    where admission.user_id = p_user_id and admission.effective_state = 'admitted'
  );
end;
$$;

revoke all on function tongs._reject_account_admission_immutable_mutation() from public, anon, authenticated, service_role;
revoke all on function tongs._guard_account_admissions_projection() from public, anon, authenticated, service_role;
revoke all on function tongs._project_account_admission_event() from public, anon, authenticated, service_role;
revoke all on function tongs.account_admission_authority_version() from public, anon, authenticated, service_role;
grant execute on function tongs.account_admission_authority_version() to service_role;
revoke all on function tongs.ingest_beta_access_application(text,text,text,text,text,text,text,text,text,text,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function tongs.ingest_beta_access_application(text,text,text,text,text,text,text,text,text,text,timestamptz)
  to service_role;
revoke all on function tongs.list_beta_access_applications(text,integer) from public, anon, authenticated, service_role;
grant execute on function tongs.list_beta_access_applications(text,integer) to authenticated;
revoke all on function tongs.decide_beta_access_application(uuid,text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function tongs.decide_beta_access_application(uuid,text,text,uuid) to authenticated;
revoke all on function tongs.bind_beta_access_application(uuid,uuid,text,uuid) from public, anon, authenticated, service_role;
grant execute on function tongs.bind_beta_access_application(uuid,uuid,text,uuid) to authenticated;
revoke all on function tongs.set_account_admission_state(uuid,text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function tongs.set_account_admission_state(uuid,text,text,uuid) to authenticated;
revoke all on function tongs.is_account_admitted(uuid) from public, anon, authenticated, service_role;
grant execute on function tongs.is_account_admitted(uuid) to authenticated, service_role;

commit;
