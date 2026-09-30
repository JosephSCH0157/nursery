-- Canonical account-level Forge owner authority. The legacy
-- owner_testing_principals relation remains the runtime authority until the
-- separately reviewed dual-read cutover.
begin;

do $$
declare
  v_enabled_count bigint;
  v_auth_user_count bigint;
  v_event_count bigint;
  v_matching_event_count bigint;
  v_principal_revision integer;
  v_min_event_revision integer;
  v_max_event_revision integer;
begin
  if to_regclass('tongs.account_authority_classifications') is not null
     or to_regclass('tongs.account_authority_classification_events') is not null then
    raise exception 'account authority classification relation already exists'
      using errcode = '42P07';
  end if;

  select count(*) into v_enabled_count
  from tongs.owner_testing_principals
  where status = 'enabled';
  if v_enabled_count <> 1 then
    raise exception 'expected exactly one enabled owner-testing principal, found %', v_enabled_count
      using errcode = '23514';
  end if;

  select count(*), max(p.revision)
  into v_auth_user_count, v_principal_revision
  from tongs.owner_testing_principals p
  join auth.users u on u.id = p.user_id
  where p.status = 'enabled';
  if v_auth_user_count <> 1 or v_principal_revision <> 1 then
    raise exception 'verified owner principal does not map uniquely to auth.users at revision 1'
      using errcode = '23514';
  end if;

  select count(*), min(e.revision), max(e.revision),
         count(*) filter (where e.revision = p.revision and e.status = p.status)
  into v_event_count, v_min_event_revision, v_max_event_revision, v_matching_event_count
  from tongs.owner_testing_principals p
  join tongs.owner_testing_principal_events e on e.user_id = p.user_id
  where p.status = 'enabled'
  group by p.user_id, p.revision, p.status;

  if v_event_count <> 1 or v_min_event_revision <> 1 or v_max_event_revision <> 1
     or v_matching_event_count <> 1 then
    raise exception 'enabled owner-testing principal event history is inconsistent'
      using errcode = '23514';
  end if;
end
$$;

create table tongs.account_authority_classifications (
  user_id uuid primary key references auth.users(id) on delete restrict,
  account_class text not null check (account_class in ('customer', 'owner')),
  revision integer not null check (revision > 0),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  configured_by uuid not null references auth.users(id) on delete restrict,
  configured_at timestamptz not null default now()
);

create table tongs.account_authority_classification_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  revision integer not null check (revision > 0),
  account_class text not null check (account_class in ('customer', 'owner')),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  actor_id uuid not null references auth.users(id) on delete restrict,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, revision)
);

create index account_authority_classifications_configured_by_idx
  on tongs.account_authority_classifications(configured_by);
create index account_authority_classification_events_actor_id_idx
  on tongs.account_authority_classification_events(actor_id);

alter table tongs.account_authority_classifications enable row level security;
alter table tongs.account_authority_classifications force row level security;
alter table tongs.account_authority_classification_events enable row level security;
alter table tongs.account_authority_classification_events force row level security;

revoke all on table tongs.account_authority_classifications,
  tongs.account_authority_classification_events
  from public, anon, authenticated, service_role;
grant select on table tongs.account_authority_classifications,
  tongs.account_authority_classification_events
  to service_role;

create trigger account_authority_classification_events_immutable
  before update or delete on tongs.account_authority_classification_events
  for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.resolve_account_authority_classification(
  p_user_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_row tongs.account_authority_classifications%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'account user id required' using errcode = '22023';
  end if;

  select * into v_row
  from tongs.account_authority_classifications
  where user_id = p_user_id;

  if not found then
    return jsonb_build_object(
      'user_id', p_user_id,
      'account_class', 'customer',
      'revision', null,
      'configured_at', null,
      'explicit', false
    );
  end if;

  return jsonb_build_object(
    'user_id', v_row.user_id,
    'account_class', v_row.account_class,
    'revision', v_row.revision,
    'configured_at', v_row.configured_at,
    'explicit', true
  );
end
$$;

create or replace function tongs.read_account_authority_classification(
  p_user_id uuid,
  p_operator_user_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     or p_operator_user_id is null
     or not tongs.is_platform_operator(p_operator_user_id) then
    raise exception 'service-role platform operator required' using errcode = '42501';
  end if;
  return tongs.resolve_account_authority_classification(p_user_id);
end
$$;

create or replace function tongs.configure_account_authority_classification(
  p_user_id uuid,
  p_operator_user_id uuid,
  p_account_class text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_revision integer;
  v_event_id uuid := gen_random_uuid();
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     or p_operator_user_id is null
     or not tongs.is_platform_operator(p_operator_user_id) then
    raise exception 'service-role platform operator required' using errcode = '42501';
  end if;
  if p_user_id is null or p_account_class not in ('customer', 'owner')
     or length(v_reason) not between 3 and 500 then
    raise exception 'invalid account authority classification revision' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('account-authority-classification:' || p_user_id::text, 0)
  );
  select coalesce(max(revision), 0) + 1 into v_revision
  from tongs.account_authority_classification_events
  where user_id = p_user_id;

  insert into tongs.account_authority_classification_events(
    id, user_id, revision, account_class, reason, actor_id, evidence
  ) values (
    v_event_id, p_user_id, v_revision, p_account_class, v_reason,
    p_operator_user_id, jsonb_build_object('source', 'canonical_admin_rpc')
  );

  insert into tongs.account_authority_classifications(
    user_id, account_class, revision, reason, configured_by, configured_at
  ) values (
    p_user_id, p_account_class, v_revision, v_reason, p_operator_user_id, now()
  )
  on conflict (user_id) do update
    set account_class = excluded.account_class,
        revision = excluded.revision,
        reason = excluded.reason,
        configured_by = excluded.configured_by,
        configured_at = excluded.configured_at;

  return jsonb_build_object(
    'user_id', p_user_id,
    'account_class', p_account_class,
    'revision', v_revision,
    'event_id', v_event_id
  );
end
$$;

revoke all on function tongs.resolve_account_authority_classification(uuid)
  from public, anon, authenticated, service_role;
revoke all on function tongs.read_account_authority_classification(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function tongs.configure_account_authority_classification(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function tongs.resolve_account_authority_classification(uuid) to service_role;
grant execute on function tongs.read_account_authority_classification(uuid, uuid) to service_role;
grant execute on function tongs.configure_account_authority_classification(uuid, uuid, text, text) to service_role;

with legacy as (
  select p.user_id, p.revision, p.configured_by,
         e.id as legacy_event_id
  from tongs.owner_testing_principals p
  join tongs.owner_testing_principal_events e
    on e.user_id = p.user_id
   and e.revision = p.revision
   and e.status = p.status
  where p.status = 'enabled'
), inserted_event as (
  insert into tongs.account_authority_classification_events(
    id, user_id, revision, account_class, reason, actor_id, evidence
  )
  select gen_random_uuid(), user_id, 1, 'owner',
         'Backfilled from verified owner-testing principal authority.',
         configured_by,
         jsonb_build_object(
           'migration_source', '20261011940000_canonical_account_owner_authority',
           'legacy_authority', 'owner_testing_principals',
           'legacy_principal_revision', revision,
           'legacy_event_id', legacy_event_id
         )
  from legacy
  returning user_id, revision, account_class, reason, actor_id, created_at
)
insert into tongs.account_authority_classifications(
  user_id, account_class, revision, reason, configured_by, configured_at
)
select user_id, account_class, revision, reason, actor_id, created_at
from inserted_event;

comment on table tongs.account_authority_classifications is
  'Private current account-level Forge authority. An absent row is an ordinary customer; owner requires an explicit current owner classification.';
comment on table tongs.account_authority_classification_events is
  'Append-only account authority revisions. Owner revocation is a new customer revision, never deletion.';
comment on function tongs.resolve_account_authority_classification(uuid) is
  'Service-only current account authority resolver. Missing rows resolve to the customer default without creating state.';
comment on function tongs.read_account_authority_classification(uuid, uuid) is
  'Narrow service-role platform-operator inspection path for account authority metadata.';
comment on function tongs.configure_account_authority_classification(uuid, uuid, text, text) is
  'Service-role platform-operator mutation path for append-only account authority revisions.';

commit;
