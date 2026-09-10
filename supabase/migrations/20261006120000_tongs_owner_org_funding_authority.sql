-- Explicit owner-testing identity, organization payer authority, and Test-only
-- refill provenance. This migration prepares funding selection but deliberately
-- activates no budget, price, route, provider credential, or paid execution.
begin;

create table tongs.owner_testing_principals (
  user_id uuid primary key references auth.users(id) on delete restrict,
  status text not null check (status in ('enabled', 'disabled')),
  revision integer not null check (revision > 0),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  configured_by uuid not null references auth.users(id) on delete restrict,
  configured_at timestamptz not null default now()
);

create table tongs.owner_testing_principal_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  revision integer not null check (revision > 0),
  status text not null check (status in ('enabled', 'disabled')),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, revision)
);

create table tongs.organization_funding_account_revisions (
  id uuid primary key,
  org_id uuid not null references tongs.orgs(id) on delete restrict,
  revision integer not null check (revision > 0),
  payer_user_id uuid not null references auth.users(id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('draft', 'active', 'disabled')),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (org_id, revision)
);

create table tongs.organization_shared_spend_permission_revisions (
  id uuid primary key,
  org_id uuid not null references tongs.orgs(id) on delete restrict,
  member_user_id uuid not null references auth.users(id) on delete restrict,
  revision integer not null check (revision > 0),
  status text not null check (status in ('allowed', 'revoked')),
  route_codes text[] not null default '{}'::text[],
  reason text not null check (length(btrim(reason)) between 3 and 500),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (org_id, member_user_id, revision)
);

create table tongs.ai_funding_preference_revisions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  revision integer not null check (revision > 0),
  payer_kind text not null check (payer_kind in ('personal', 'organization_shared', 'owner_testing')),
  org_id uuid references tongs.orgs(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, workspace_id, revision),
  check ((payer_kind = 'organization_shared') = (org_id is not null))
);

create table tongs.spending_quote_authority_bindings (
  quote_id uuid primary key references tongs.customer_spending_quotes(id) on delete restrict,
  acting_user_id uuid not null references auth.users(id) on delete restrict,
  payer_kind text not null check (payer_kind in ('personal', 'organization_shared', 'owner_testing')),
  payer_user_id uuid references auth.users(id) on delete restrict,
  org_id uuid references tongs.orgs(id) on delete restrict,
  preference_revision_id uuid references tongs.ai_funding_preference_revisions(id) on delete restrict,
  organization_account_revision_id uuid references tongs.organization_funding_account_revisions(id) on delete restrict,
  organization_permission_revision_id uuid references tongs.organization_shared_spend_permission_revisions(id) on delete restrict,
  owner_principal_revision integer,
  accepted_authority_hash text not null check (accepted_authority_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  check (
    (payer_kind = 'personal' and payer_user_id = acting_user_id and org_id is null)
    or (payer_kind = 'organization_shared' and payer_user_id is not null and org_id is not null)
    or (payer_kind = 'owner_testing' and payer_user_id = acting_user_id and org_id is null
        and owner_principal_revision is not null)
  )
);

create table tongs.test_refill_grants (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  credit_units bigint not null check (credit_units > 0),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 8 and 300),
  granted_by uuid not null references auth.users(id) on delete restrict,
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table tongs.test_refill_consumptions (
  id uuid primary key,
  grant_id uuid not null references tongs.test_refill_grants(id) on delete restrict,
  operation_id text not null check (length(btrim(operation_id)) between 8 and 300),
  credit_units bigint not null check (credit_units > 0),
  provider_mode text not null check (provider_mode = 'simulated'),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 8 and 300),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (grant_id, operation_id)
);

alter table tongs.owner_operating_budgets
  add column owner_testing_user_id uuid references auth.users(id) on delete restrict;

alter table tongs.owner_testing_principals enable row level security;
alter table tongs.owner_testing_principals force row level security;
alter table tongs.owner_testing_principal_events enable row level security;
alter table tongs.owner_testing_principal_events force row level security;
alter table tongs.organization_funding_account_revisions enable row level security;
alter table tongs.organization_funding_account_revisions force row level security;
alter table tongs.organization_shared_spend_permission_revisions enable row level security;
alter table tongs.organization_shared_spend_permission_revisions force row level security;
alter table tongs.ai_funding_preference_revisions enable row level security;
alter table tongs.ai_funding_preference_revisions force row level security;
alter table tongs.spending_quote_authority_bindings enable row level security;
alter table tongs.spending_quote_authority_bindings force row level security;
alter table tongs.test_refill_grants enable row level security;
alter table tongs.test_refill_grants force row level security;
alter table tongs.test_refill_consumptions enable row level security;
alter table tongs.test_refill_consumptions force row level security;

revoke all on tongs.owner_testing_principals,tongs.owner_testing_principal_events,
  tongs.organization_funding_account_revisions,tongs.organization_shared_spend_permission_revisions,
  tongs.ai_funding_preference_revisions,tongs.spending_quote_authority_bindings,
  tongs.test_refill_grants,tongs.test_refill_consumptions from public,anon,authenticated,service_role;
grant select on tongs.owner_testing_principals,tongs.owner_testing_principal_events,
  tongs.organization_funding_account_revisions,tongs.organization_shared_spend_permission_revisions,
  tongs.ai_funding_preference_revisions,tongs.spending_quote_authority_bindings,
  tongs.test_refill_grants,tongs.test_refill_consumptions to service_role;

create trigger owner_testing_principal_events_immutable before update or delete on tongs.owner_testing_principal_events
  for each row execute function tongs._reject_accounting_mutation();
create trigger organization_funding_account_revisions_immutable before update or delete on tongs.organization_funding_account_revisions
  for each row execute function tongs._reject_accounting_mutation();
create trigger organization_shared_spend_permission_revisions_immutable before update or delete on tongs.organization_shared_spend_permission_revisions
  for each row execute function tongs._reject_accounting_mutation();
create trigger ai_funding_preference_revisions_immutable before update or delete on tongs.ai_funding_preference_revisions
  for each row execute function tongs._reject_accounting_mutation();
create trigger spending_quote_authority_bindings_immutable before update or delete on tongs.spending_quote_authority_bindings
  for each row execute function tongs._reject_accounting_mutation();
create trigger test_refill_grants_immutable before update or delete on tongs.test_refill_grants
  for each row execute function tongs._reject_accounting_mutation();
create trigger test_refill_consumptions_immutable before update or delete on tongs.test_refill_consumptions
  for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.configure_owner_testing_principal(
  p_user_id uuid,
  p_operator_user_id uuid,
  p_status text,
  p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_actor uuid := p_operator_user_id;
  v_revision integer;
  v_id uuid := gen_random_uuid();
begin
  if coalesce(auth.role(),'') <> 'service_role' or v_actor is null
     or not tongs.is_platform_operator(v_actor) then
    raise exception 'service-role platform operator required' using errcode='42501';
  end if;
  if p_user_id is null or p_status not in ('enabled','disabled')
     or length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'invalid owner-testing principal revision' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('owner-testing-principal:'||p_user_id::text,0));
  select coalesce(max(revision),0)+1 into v_revision
  from tongs.owner_testing_principal_events where user_id=p_user_id;
  insert into tongs.owner_testing_principal_events(id,user_id,revision,status,reason,actor_id)
  values(v_id,p_user_id,v_revision,p_status,btrim(p_reason),v_actor);
  insert into tongs.owner_testing_principals(user_id,status,revision,reason,configured_by)
  values(p_user_id,p_status,v_revision,btrim(p_reason),v_actor)
  on conflict(user_id) do update set status=excluded.status,revision=excluded.revision,
    reason=excluded.reason,configured_by=excluded.configured_by,configured_at=now();
  return jsonb_build_object('user_id',p_user_id,'status',p_status,'revision',v_revision,'event_id',v_id);
end $$;

create or replace function tongs.set_my_ai_funding_preference(
  p_workspace_id uuid,
  p_payer_kind text,
  p_org_id uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_user uuid := auth.uid();
  v_workspace tongs.workspaces%rowtype;
  v_revision integer;
  v_id uuid := gen_random_uuid();
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into v_workspace from tongs.workspaces where id=p_workspace_id;
  if not found or not exists(select 1 from tongs.workspace_members wm where wm.workspace_id=p_workspace_id and wm.user_id=v_user) then
    raise exception 'workspace membership required' using errcode='42501';
  end if;
  if p_payer_kind not in ('personal','organization_shared','owner_testing') then
    raise exception 'invalid payer selection' using errcode='22023';
  end if;
  if p_payer_kind='organization_shared' then
    if p_org_id is null or v_workspace.org_id is distinct from p_org_id
       or not exists(select 1 from tongs.org_members om where om.org_id=p_org_id and om.user_id=v_user) then
      raise exception 'organization funding membership required' using errcode='42501';
    end if;
  elsif p_org_id is not null then
    raise exception 'organization id is only valid for shared funding' using errcode='22023';
  end if;
  if p_payer_kind='owner_testing' and not exists(
    select 1 from tongs.owner_testing_principals p where p.user_id=v_user and p.status='enabled'
  ) then raise exception 'explicit owner-testing identity required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ai-funding-preference:'||v_user::text||':'||p_workspace_id::text,0));
  select coalesce(max(revision),0)+1 into v_revision from tongs.ai_funding_preference_revisions
    where user_id=v_user and workspace_id=p_workspace_id;
  insert into tongs.ai_funding_preference_revisions(id,user_id,workspace_id,revision,payer_kind,org_id,actor_id)
  values(v_id,v_user,p_workspace_id,v_revision,p_payer_kind,p_org_id,v_user);
  return jsonb_build_object('preference_id',v_id,'revision',v_revision,'payer_kind',p_payer_kind,'org_id',p_org_id);
end $$;

create or replace function tongs.read_my_ai_funding_options(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_user uuid := auth.uid();
  v_workspace tongs.workspaces%rowtype;
  v_preference tongs.ai_funding_preference_revisions%rowtype;
  v_org_account tongs.organization_funding_account_revisions%rowtype;
  v_permission tongs.organization_shared_spend_permission_revisions%rowtype;
  v_owner boolean := false;
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into v_workspace from tongs.workspaces where id=p_workspace_id;
  if not found or not exists(select 1 from tongs.workspace_members wm where wm.workspace_id=p_workspace_id and wm.user_id=v_user) then
    raise exception 'workspace membership required' using errcode='42501';
  end if;
  select * into v_preference from tongs.ai_funding_preference_revisions
    where user_id=v_user and workspace_id=p_workspace_id order by revision desc limit 1;
  v_owner := exists(select 1 from tongs.owner_testing_principals p where p.user_id=v_user and p.status='enabled');
  if v_workspace.org_id is not null then
    select * into v_org_account from tongs.organization_funding_account_revisions
      where org_id=v_workspace.org_id order by revision desc limit 1;
    select * into v_permission from tongs.organization_shared_spend_permission_revisions
      where org_id=v_workspace.org_id and member_user_id=v_user order by revision desc limit 1;
  end if;
  return jsonb_build_object(
    'workspace_id',p_workspace_id,
    'org_id',v_workspace.org_id,
    'selected_payer',coalesce(v_preference.payer_kind,'personal'),
    'selected_revision_id',v_preference.id,
    'options',jsonb_build_array(
      jsonb_build_object('kind','personal','label','My purchased credits','available',true),
      jsonb_build_object('kind','organization_shared','label','Organization shared credits',
        'available',v_org_account.status='active' and v_permission.status='allowed'),
      jsonb_build_object('kind','owner_testing','label','Private owner testing',
        'available',v_owner,'requires_active_budget',true)
    )
  );
end $$;

create or replace function tongs.configure_organization_funding_account(
  p_org_id uuid,p_payer_user_id uuid,p_currency text,p_status text,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_revision integer; v_id uuid:=gen_random_uuid();
begin
  if v_actor is null or not exists(select 1 from tongs.org_members om where om.org_id=p_org_id and om.user_id=v_actor and om.org_role in ('owner','admin')) then
    raise exception 'organization owner or admin required' using errcode='42501'; end if;
  if not exists(select 1 from tongs.org_members om where om.org_id=p_org_id and om.user_id=p_payer_user_id)
     or upper(btrim(coalesce(p_currency,'')))!~'^[A-Z]{3}$' or p_status not in ('draft','active','disabled')
     or length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'invalid organization funding account revision' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('org-funding-account:'||p_org_id::text,0));
  select coalesce(max(revision),0)+1 into v_revision from tongs.organization_funding_account_revisions where org_id=p_org_id;
  insert into tongs.organization_funding_account_revisions(id,org_id,revision,payer_user_id,currency,status,reason,actor_id)
  values(v_id,p_org_id,v_revision,p_payer_user_id,upper(btrim(p_currency)),p_status,btrim(p_reason),v_actor);
  return jsonb_build_object('revision_id',v_id,'revision',v_revision,'status',p_status);
end $$;

create or replace function tongs.configure_organization_shared_spend_permission(
  p_org_id uuid,p_member_user_id uuid,p_status text,p_route_codes text[],p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_revision integer; v_id uuid:=gen_random_uuid();
begin
  if v_actor is null or not exists(select 1 from tongs.org_members om where om.org_id=p_org_id and om.user_id=v_actor and om.org_role in ('owner','admin')) then
    raise exception 'organization owner or admin required' using errcode='42501'; end if;
  if not exists(select 1 from tongs.org_members om where om.org_id=p_org_id and om.user_id=p_member_user_id)
     or p_status not in ('allowed','revoked') or p_route_codes is null
     or length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'invalid organization spend permission revision' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('org-spend-permission:'||p_org_id::text||':'||p_member_user_id::text,0));
  select coalesce(max(revision),0)+1 into v_revision from tongs.organization_shared_spend_permission_revisions where org_id=p_org_id and member_user_id=p_member_user_id;
  insert into tongs.organization_shared_spend_permission_revisions(id,org_id,member_user_id,revision,status,route_codes,reason,actor_id)
  values(v_id,p_org_id,p_member_user_id,v_revision,p_status,p_route_codes,btrim(p_reason),v_actor);
  return jsonb_build_object('revision_id',v_id,'revision',v_revision,'status',p_status);
end $$;

create or replace function tongs._resolve_spending_authority(
  p_user_id uuid,p_workspace_id uuid,p_route_code text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_workspace tongs.workspaces%rowtype;
  v_pref tongs.ai_funding_preference_revisions%rowtype;
  v_account tongs.organization_funding_account_revisions%rowtype;
  v_permission tongs.organization_shared_spend_permission_revisions%rowtype;
  v_principal tongs.owner_testing_principals%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into v_workspace from tongs.workspaces where id=p_workspace_id;
  if not found or not exists(select 1 from tongs.workspace_members wm where wm.workspace_id=p_workspace_id and wm.user_id=p_user_id) then
    raise exception 'workspace membership required' using errcode='42501'; end if;
  select * into v_pref from tongs.ai_funding_preference_revisions where user_id=p_user_id and workspace_id=p_workspace_id order by revision desc limit 1;
  if not found or v_pref.payer_kind='personal' then
    return jsonb_build_object('payer_kind','personal','payer_user_id',p_user_id,'preference_revision_id',v_pref.id);
  end if;
  if v_pref.payer_kind='owner_testing' then
    select * into v_principal from tongs.owner_testing_principals where user_id=p_user_id and status='enabled';
    if not found then raise exception 'owner-testing authority is no longer available' using errcode='42501'; end if;
    return jsonb_build_object('payer_kind','owner_testing','payer_user_id',p_user_id,
      'preference_revision_id',v_pref.id,'owner_principal_revision',v_principal.revision);
  end if;
  if v_workspace.org_id is distinct from v_pref.org_id or not exists(select 1 from tongs.org_members om where om.org_id=v_pref.org_id and om.user_id=p_user_id) then
    raise exception 'organization funding membership required' using errcode='42501'; end if;
  select * into v_account from tongs.organization_funding_account_revisions where org_id=v_pref.org_id order by revision desc limit 1;
  select * into v_permission from tongs.organization_shared_spend_permission_revisions where org_id=v_pref.org_id and member_user_id=p_user_id order by revision desc limit 1;
  if v_account.status<>'active' or v_permission.status<>'allowed'
     or (cardinality(v_permission.route_codes)>0 and not p_route_code=any(v_permission.route_codes)) then
    raise exception 'organization shared funding is not authorized for this operation' using errcode='42501'; end if;
  return jsonb_build_object('payer_kind','organization_shared','payer_user_id',v_account.payer_user_id,'org_id',v_pref.org_id,
    'preference_revision_id',v_pref.id,'organization_account_revision_id',v_account.id,
    'organization_permission_revision_id',v_permission.id,'currency',v_account.currency);
end $$;

create or replace function tongs.bind_spending_quote_authority()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_authority jsonb; v_hash text;
begin
  v_authority:=tongs._resolve_spending_authority(new.user_id,new.workspace_id,new.tool);
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'quote_id',new.id,'acting_user_id',new.user_id,
    'payer_kind',v_authority->>'payer_kind','payer_user_id',v_authority->>'payer_user_id',
    'org_id',v_authority->>'org_id','preference_revision_id',v_authority->>'preference_revision_id',
    'organization_account_revision_id',v_authority->>'organization_account_revision_id',
    'organization_permission_revision_id',v_authority->>'organization_permission_revision_id',
    'owner_principal_revision',v_authority->>'owner_principal_revision',
    'route_code',new.tool,'request_fingerprint',new.request_fingerprint,
    'pricing_revision_id',new.pricing_revision_id,'quote_hash',new.quote_hash,'expires_at',new.expires_at
  )::text,'utf8'),'sha256'),'hex');
  insert into tongs.spending_quote_authority_bindings(
    quote_id,acting_user_id,payer_kind,payer_user_id,org_id,preference_revision_id,
    organization_account_revision_id,organization_permission_revision_id,
    owner_principal_revision,accepted_authority_hash
  ) values(
    new.id,new.user_id,v_authority->>'payer_kind',(v_authority->>'payer_user_id')::uuid,
    nullif(v_authority->>'org_id','')::uuid,nullif(v_authority->>'preference_revision_id','')::uuid,
    nullif(v_authority->>'organization_account_revision_id','')::uuid,
    nullif(v_authority->>'organization_permission_revision_id','')::uuid,
    nullif(v_authority->>'owner_principal_revision','')::integer,v_hash
  );
  return new;
end $$;

create trigger customer_spending_quote_funding_authority
after insert on tongs.customer_spending_quotes
for each row execute function tongs.bind_spending_quote_authority();

create or replace function tongs._quote_payer_allows_user(p_quote_id uuid,p_source_user_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select coalesce((select binding.payer_user_id=p_source_user_id
    from tongs.spending_quote_authority_bindings binding where binding.quote_id=p_quote_id),
    (select quote.user_id=p_source_user_id from tongs.customer_spending_quotes quote where quote.id=p_quote_id));
$$;

create or replace function tongs._quote_owner_budget_allows(p_quote_id uuid,p_budget_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select exists(
    select 1 from tongs.spending_quote_authority_bindings binding
    join tongs.owner_testing_principals principal on principal.user_id=binding.acting_user_id
      and principal.status='enabled' and principal.revision=binding.owner_principal_revision
    join tongs.owner_operating_budgets budget on budget.id=p_budget_id
      and budget.owner_testing_user_id=binding.acting_user_id
    where binding.quote_id=p_quote_id and binding.payer_kind='owner_testing'
  );
$$;

create or replace function tongs._validate_quote_authority_before_provider(p_quote_id uuid,p_route_code text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_binding tongs.spending_quote_authority_bindings%rowtype;
  v_workspace_id uuid;
  v_pref tongs.ai_funding_preference_revisions%rowtype;
  v_account tongs.organization_funding_account_revisions%rowtype;
  v_permission tongs.organization_shared_spend_permission_revisions%rowtype;
begin
  select * into v_binding from tongs.spending_quote_authority_bindings where quote_id=p_quote_id;
  if not found then return true; end if;
  select workspace_id into v_workspace_id from tongs.customer_spending_quotes where id=p_quote_id;
  if v_binding.preference_revision_id is not null then
    select * into v_pref from tongs.ai_funding_preference_revisions
      where user_id=v_binding.acting_user_id and workspace_id=v_workspace_id order by revision desc limit 1;
    if not found or v_pref.id<>v_binding.preference_revision_id then return false; end if;
  end if;
  if v_binding.payer_kind='owner_testing' then
    return exists(select 1 from tongs.owner_testing_principals p
      where p.user_id=v_binding.acting_user_id and p.status='enabled' and p.revision=v_binding.owner_principal_revision);
  end if;
  if v_binding.payer_kind='organization_shared' then
    if not exists(select 1 from tongs.org_members om where om.org_id=v_binding.org_id and om.user_id=v_binding.acting_user_id) then return false; end if;
    select * into v_account from tongs.organization_funding_account_revisions where org_id=v_binding.org_id order by revision desc limit 1;
    select * into v_permission from tongs.organization_shared_spend_permission_revisions where org_id=v_binding.org_id and member_user_id=v_binding.acting_user_id order by revision desc limit 1;
    return v_account.id=v_binding.organization_account_revision_id and v_account.status='active'
      and v_permission.id=v_binding.organization_permission_revision_id and v_permission.status='allowed'
      and (cardinality(v_permission.route_codes)=0 or p_route_code=any(v_permission.route_codes));
  end if;
  return true;
end $$;

create or replace function tongs._select_customer_funding_for_quote(p_quote_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_quote tongs.customer_spending_quotes%rowtype;
  v_authority tongs.spending_quote_authority_bindings%rowtype;
  v_source record;
  v_control tongs.paid_execution_control_revisions%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into v_quote from tongs.customer_spending_quotes where id=p_quote_id;
  if not found then raise exception 'spending quote not found' using errcode='P0002'; end if;
  select * into v_authority from tongs.spending_quote_authority_bindings where quote_id=p_quote_id;
  if not found then
    v_authority.acting_user_id:=v_quote.user_id;
    v_authority.payer_kind:='personal';
    v_authority.payer_user_id:=v_quote.user_id;
  end if;

  if v_authority.payer_kind='owner_testing' then
    select * into v_control from tongs._current_paid_execution_control();
    select 'owner_budget'::text source_type,budget.id source_id,
      'Private owner testing (no customer charge)'::text customer_label,budget.period_end sort_time
    into v_source
    from tongs.owner_operating_budgets budget
    join lateral(select revision.* from tongs.owner_operating_budget_revisions revision
      where revision.budget_id=budget.id order by revision.revision desc limit 1) latest on true
    left join lateral tongs._active_funding_hold('owner_budget',budget.id) held on true
    where v_control.owner_budget_spending_enabled and budget.owner_testing_user_id=v_authority.acting_user_id
      and latest.status='active' and latest.maximum_amount_micros is not null
      and now()>=budget.period_start and now()<budget.period_end and budget.currency=v_quote.currency
      and (budget.workspace_id is null or budget.workspace_id=v_quote.workspace_id)
      and (budget.provider is null or lower(budget.provider)='openai')
      and (budget.route is null or budget.route=v_quote.tool)
      and latest.maximum_amount_micros-held.wholesale_spend_micros>=v_quote.full_cost_ceiling_micros
    order by budget.period_end asc limit 1;
  else
    select candidate.* into v_source from (
      select 'customer_deposit'::text source_type,deposit.id source_id,
        case when v_authority.payer_kind='organization_shared' then 'Organization shared purchased credits' else 'Verified AI credit purchase' end customer_label,
        deposit.received_at sort_time
      from tongs.customer_deposits deposit
      join tongs.customer_deposit_processor_fees fee on fee.deposit_id=deposit.id
      left join lateral(select coalesce(sum(c.recognized_revenue_micros),0)::bigint used_charge,
        coalesce(sum(c.credit_units_consumed),0)::bigint used_units from tongs.customer_deposit_consumptions c where c.deposit_id=deposit.id) used on true
      left join lateral(select coalesce(sum(r.liability_release_micros),0)::bigint refunded_charge,
        coalesce(sum(r.refunded_credit_units),0)::bigint refunded_units from tongs.customer_deposit_refunds r where r.deposit_id=deposit.id) refunded on true
      left join lateral tongs._active_funding_hold('customer_deposit',deposit.id) held on true
      where deposit.user_id=v_authority.payer_user_id and deposit.stripe_mode='live' and deposit.currency=v_quote.currency
        and deposit.gross_amount_micros-used.used_charge-refunded.refunded_charge-held.customer_charge_micros>=v_quote.normal_maximum_charge_micros
        and deposit.credit_units-used.used_units-refunded.refunded_units-held.credit_units>=v_quote.customer_credit_units
      union all
      select 'paid_allowance',allowance.id,
        case when v_authority.payer_kind='organization_shared' then 'Organization shared paid allowance' else 'Paid-plan allowance' end,
        allowance.period_end
      from tongs.paid_allowance_grants allowance
      join tongs.subscription_cycle_receipts receipt on receipt.id=allowance.receipt_id
      left join lateral(select coalesce(sum(c.recognized_revenue_micros),0)::bigint used_charge,
        coalesce(sum(c.entitlement_units_consumed),0)::bigint used_units,
        coalesce(sum(c.wholesale_spend_micros),0)::bigint used_wholesale from tongs.paid_allowance_consumptions c where c.allowance_grant_id=allowance.id) used on true
      left join lateral tongs._active_funding_hold('paid_allowance',allowance.id) held on true
      where allowance.user_id=v_authority.payer_user_id and receipt.stripe_mode='live' and allowance.currency=v_quote.currency
        and now()>=allowance.period_start and now()<allowance.period_end
        and not exists(select 1 from tongs.subscription_cycle_adjustments a where a.receipt_id=allowance.receipt_id)
        and allowance.allocated_revenue_micros-used.used_charge-held.customer_charge_micros>=v_quote.normal_maximum_charge_micros
        and allowance.entitlement_units-used.used_units-held.credit_units>=v_quote.customer_credit_units
        and allowance.maximum_wholesale_spend_micros-used.used_wholesale-held.wholesale_spend_micros>=v_quote.full_cost_ceiling_micros
    ) candidate order by case candidate.source_type when 'customer_deposit' then 1 else 2 end,candidate.sort_time asc limit 1;
  end if;
  if not found then return jsonb_build_object('eligible',false,'funding_source','none',
    'payer_kind',v_authority.payer_kind,'customer_label',case when v_authority.payer_kind='owner_testing'
      then 'Owner testing selected; an active explicit budget is still required' else 'No verified eligible funds' end); end if;
  return jsonb_build_object('eligible',true,'funding_source',v_source.source_type,
    'funding_source_id',v_source.source_id,'payer_kind',v_authority.payer_kind,
    'payer_user_id',v_authority.payer_user_id,'customer_label',v_source.customer_label);
end $$;

create or replace function tongs.create_customer_openai_text_quote(
 p_quote_id uuid,p_user_id uuid,p_operation_id text,p_route_code text,p_workspace_id uuid,p_workpiece_id text,
 p_request_fingerprint text,p_model text,p_credential_funding text,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_rollout tongs.openai_text_rollout_revisions%rowtype; v_cost tongs.openai_text_cost_policy_revisions%rowtype;
 v_rate tongs.openai_text_provider_rate_revisions%rowtype; v_pricing tongs.private_pricing_revisions%rowtype;
 v_quote tongs.customer_spending_quotes%rowtype; v_binding tongs.openai_text_customer_quote_bindings%rowtype;
 v_funding jsonb; v_authority jsonb; v_sku text; v_internal_operation text; v_create jsonb;
begin
 perform tongs._require_pricing_service_role();
 if p_route_code not in ('hearth.chat_completion','hearth.research_synthesis','visual.unified_plan','visual.narrative_interpretation','motion.broll_interpretation','hammer.transcript_cleanup','shorts.discovery','quench.metadata')
   or p_quote_id is null or p_user_id is null or p_workspace_id is null or length(btrim(coalesce(p_operation_id,'')))<8
   or length(btrim(coalesce(p_workpiece_id,'')))<1 or p_request_fingerprint!~'^[0-9a-f]{64}$'
   or length(btrim(coalesce(p_model,'')))<2 or p_credential_funding not in ('forge','byo_customer')
   or p_expires_at is null or p_expires_at<=now() then raise exception 'invalid OpenAI customer quote request' using errcode='22023'; end if;
 select * into v_rollout from tongs._current_openai_text_rollout(p_route_code);
 if not found or v_rollout.mode<>'enforce' or v_rollout.cost_policy_revision_id is null then raise exception 'OpenAI text customer spending is not active' using errcode='42501'; end if;
 select * into v_cost from tongs.openai_text_cost_policy_revisions where id=v_rollout.cost_policy_revision_id;
 if not found or v_cost.route_code<>p_route_code or v_cost.cost_coverage<>'complete' or v_cost.lifecycle_state not in ('pilot_candidate','active') then raise exception 'pricing_not_configured: complete cost policy required' using errcode='P0001'; end if;
 select rate.* into v_rate from tongs.openai_text_provider_rate_revisions rate where rate.id=nullif(v_cost.attempt_plan->0->>'rate_revision_id','')::uuid;
 if not found or btrim(p_model) not in (v_rate.runtime_model_alias,v_rate.provider_model_id) then raise exception 'pricing_not_configured: exact accepted model rate required' using errcode='P0001'; end if;
 if p_credential_funding='byo_customer' and v_cost.direct_provider_ceiling_micros<>0 then raise exception 'pricing_not_configured: BYO support-only cost revision required' using errcode='P0001'; end if;
 v_sku:=lower('openai-text:'||p_route_code||':'||btrim(p_model)||':'||v_cost.id::text);
 v_authority:=tongs._resolve_spending_authority(p_user_id,p_workspace_id,p_route_code);
 if v_authority->>'payer_kind'='owner_testing' then
   select revision.* into v_pricing from tongs.private_pricing_revisions revision
   join tongs.private_pricing_policies policy on policy.id=revision.policy_id
   where revision.lifecycle_state='review_ready' and revision.full_cost_ceiling_micros=v_cost.full_cost_ceiling_micros
     and revision.markup_basis_points=3300 and lower(coalesce(policy.provider,''))='openai'
     and lower(coalesce(policy.sku,''))=v_sku
   order by revision.revision desc limit 1;
 else
   select * into v_pricing from tongs._published_pricing_revision('openai',v_sku);
 end if;
 if not found or v_pricing.full_cost_ceiling_micros<>v_cost.full_cost_ceiling_micros then raise exception 'pricing_not_configured: published exact route price required' using errcode='P0001'; end if;
 select * into v_binding from tongs.openai_text_customer_quote_bindings where quote_id=p_quote_id;
 if found then
   if v_binding.user_id<>p_user_id or v_binding.canonical_operation_id<>btrim(p_operation_id) or v_binding.route_code<>p_route_code
     or v_binding.workspace_id<>p_workspace_id or v_binding.workpiece_id<>btrim(p_workpiece_id) or v_binding.request_fingerprint<>p_request_fingerprint
     or v_binding.runtime_model<>btrim(p_model) or v_binding.credential_funding<>p_credential_funding
     or v_binding.cost_policy_revision_id<>v_cost.id or v_binding.pricing_revision_id<>v_pricing.id then raise exception 'OpenAI quote replay conflict' using errcode='23505'; end if;
 else
   v_internal_operation:=left(btrim(p_operation_id),250)||':q:'||p_quote_id::text;
   v_create:=tongs.create_shadow_spending_quote(p_quote_id,p_user_id,v_internal_operation,p_route_code,p_workspace_id,v_pricing.id,p_request_fingerprint,
     jsonb_build_array(jsonb_build_object('component','openai_text','provider_label','OpenAI','credential_source',case when p_credential_funding='forge' then 'forge' else 'byo_customer' end)),p_expires_at);
   insert into tongs.openai_text_customer_quote_bindings(quote_id,user_id,canonical_operation_id,route_code,workspace_id,workpiece_id,request_fingerprint,runtime_model,credential_funding,cost_policy_revision_id,pricing_revision_id,expires_at)
   values(p_quote_id,p_user_id,btrim(p_operation_id),p_route_code,p_workspace_id,btrim(p_workpiece_id),p_request_fingerprint,btrim(p_model),p_credential_funding,v_cost.id,v_pricing.id,p_expires_at);
 end if;
 select * into v_quote from tongs.customer_spending_quotes where id=p_quote_id;
 v_funding:=tongs._select_customer_funding_for_quote(p_quote_id);
 return jsonb_build_object('quote_id',v_quote.id,'operation_id',btrim(p_operation_id),'quote_hash',v_quote.quote_hash,
  'request_fingerprint',v_quote.request_fingerprint,'currency',v_quote.currency,'maximum_customer_charge_micros',
  case when v_funding->>'payer_kind'='owner_testing' then 0 else v_quote.normal_maximum_charge_micros end,
  'failure_customer_charge_micros',0,'failure_terms','Forge-caused and provider-caused failures cost you $0. Uncertain submissions are not retried automatically.',
  'funding_eligible',coalesce((v_funding->>'eligible')::boolean,false),'funding_source',coalesce(v_funding->>'funding_source','none'),
  'payer_kind',coalesce(v_funding->>'payer_kind','personal'),'funding_label',coalesce(v_funding->>'customer_label','No verified eligible funds'),
  'expires_at',v_quote.expires_at,'accepted',exists(select 1 from tongs.customer_spending_quote_acceptances a where a.quote_id=v_quote.id));
end $$;

create or replace function tongs.resolve_openai_text_model_for_funding_quote(
 p_user_id uuid,p_workspace_id uuid,p_route_code text,p_credential_funding text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_authority jsonb; v_catalog tongs.openai_text_model_catalog_revisions%rowtype;
 v_preference tongs.openai_text_user_model_preference_revisions%rowtype; v_selected record;
begin
 perform tongs._require_pricing_service_role();
 v_authority:=tongs._resolve_spending_authority(p_user_id,p_workspace_id,p_route_code);
 if v_authority->>'payer_kind'<>'owner_testing' then
   return tongs.resolve_openai_text_model_for_quote(p_user_id,p_route_code,p_credential_funding);
 end if;
 if p_credential_funding<>'forge' then raise exception 'BYO model access must use the exact customer provider credential; no Forge fallback is permitted' using errcode='P0001'; end if;
 select * into v_catalog from tongs.openai_text_model_catalog_revisions where lifecycle_state='active' order by revision desc limit 1;
 if not found then raise exception 'pricing_not_configured: no active model catalog' using errcode='P0001'; end if;
 select * into v_preference from tongs.openai_text_user_model_preference_revisions where user_id=p_user_id order by revision desc limit 1;
 select entry.id entry_id,entry.runtime_model_id,entry.provider_model_id,entry.display_name,entry.tradeoff_summary,
   entry.quality_rank,compatibility.cost_policy_revision_id,rate.revision rate_revision
 into v_selected
 from tongs.openai_text_model_catalog_entries entry
 join tongs.openai_text_model_route_compatibility compatibility on compatibility.catalog_entry_id=entry.id and compatibility.route_code=p_route_code
 join tongs.openai_text_cost_policy_revisions cost on cost.id=compatibility.cost_policy_revision_id
   and cost.cost_coverage='complete' and cost.lifecycle_state in ('pilot_candidate','active')
 join tongs.openai_text_provider_rate_revisions rate on rate.id=entry.rate_revision_id
 where entry.catalog_revision_id=v_catalog.id and entry.lifecycle_state='active'
   and entry.availability_status='generation_compatible'
   and compatibility.compatibility_status='generation_verified' and compatibility.supporting_cost_coverage='complete'
   and (coalesce(v_preference.preference_kind,'best_available')='best_available' or entry.provider_model_id=v_preference.provider_model_id)
   and exists(select 1 from tongs.private_pricing_revisions pricing
     join tongs.private_pricing_policies policy on policy.id=pricing.policy_id
     where pricing.lifecycle_state='review_ready' and pricing.markup_basis_points=3300
       and pricing.full_cost_ceiling_micros=cost.full_cost_ceiling_micros
       and lower(coalesce(policy.provider,''))='openai'
       and lower(coalesce(policy.sku,''))=lower('openai-text:'||p_route_code||':'||entry.runtime_model_id||':'||cost.id::text))
 order by entry.quality_rank desc,entry.provider_model_id limit 1;
 if not found then raise exception 'pricing_not_configured: no owner-testing model has verified generation compatibility and complete cost coverage' using errcode='P0001'; end if;
 return jsonb_build_object('catalog_revision_id',v_catalog.id,'catalog_revision',v_catalog.revision,
   'model_catalog_entry_id',v_selected.entry_id,'runtime_model_id',v_selected.runtime_model_id,
   'provider_model_id',v_selected.provider_model_id,'display_name',v_selected.display_name,
   'tradeoff_summary',v_selected.tradeoff_summary,'quality_rank',v_selected.quality_rank,
   'rate_revision',v_selected.rate_revision,'cost_policy_revision_id',v_selected.cost_policy_revision_id,
   'payer_kind','owner_testing');
end $$;

-- Preserve the mature reservation implementation while changing only its two
-- ownership predicates. The assertions make a future upstream text change fail
-- this migration instead of silently dropping delegated/owner authorization.
do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.reserve_operation(uuid,uuid,text,uuid,text)'::regprocedure) into definition;
  changed:=replace(definition,
    'v_deposit.user_id <> v_quote.user_id',
    'not tongs._quote_payer_allows_user(v_quote.id, v_deposit.user_id)');
  changed:=replace(changed,
    'v_allowance.user_id <> v_quote.user_id',
    'not tongs._quote_payer_allows_user(v_quote.id, v_allowance.user_id)');
  changed:=replace(changed,
    'if not found or v_budget_revision.status <> ''active''',
    'if not found or not tongs._quote_owner_budget_allows(v_quote.id, v_budget.id) or v_budget_revision.status <> ''active''');
  if changed=definition
     or position('not tongs._quote_payer_allows_user' in changed)=0
     or position('not tongs._quote_owner_budget_allows' in changed)=0 then
    raise exception 'reserve_operation ownership predicates changed upstream; explicit review required';
  end if;
  execute changed;
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.resolve_openai_text_paid_execution_context(text,text,uuid,uuid,uuid,text,text)'::regprocedure) into definition;
  changed:=regexp_replace(definition,'v_failure[[:space:]]*:=[[:space:]]*CASE',
    'if not tongs._validate_quote_authority_before_provider(v_quote.id, p_route_code) then raise exception ''accepted payer authority changed or was revoked'' using errcode=''42501''; end if; v_failure := CASE','i');
  if changed=definition or position('_validate_quote_authority_before_provider' in changed)=0 then
    raise exception 'OpenAI paid-context insertion point changed upstream; explicit review required'; end if;
  execute changed;
end $$;

create or replace function tongs.create_owner_testing_budget_draft(
  p_budget_id uuid,p_owner_testing_user_id uuid,p_operator_user_id uuid,p_environment text,p_workspace_id uuid,
  p_provider text,p_route text,p_sku text,p_currency text,p_period_start timestamptz,
  p_period_end timestamptz,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=p_operator_user_id; v_event uuid:=gen_random_uuid(); v_currency text:=upper(btrim(coalesce(p_currency,'')));
begin
  if coalesce(auth.role(),'')<>'service_role' or v_actor is null or not tongs.is_platform_operator(v_actor) then
    raise exception 'service-role platform operator required' using errcode='42501'; end if;
  if not exists(select 1 from tongs.owner_testing_principals p where p.user_id=p_owner_testing_user_id and p.status='enabled') then
    raise exception 'explicit owner-testing principal required' using errcode='42501'; end if;
  if p_budget_id is null or p_environment not in ('production','preview','development') or v_currency!~'^[A-Z]{3}$'
     or p_period_start is null or p_period_end<=p_period_start or length(btrim(coalesce(p_reason,'')))<3 then
    raise exception 'invalid owner-testing budget draft' using errcode='22023'; end if;
  perform tongs._create_accounting_event(v_event,'owner-testing-budget:'||p_budget_id::text||':revision:1',
    'owner_operating_budget_drafted','owner_internal','owner_operating_budget',p_budget_id::text,v_currency,
    p_owner_testing_user_id,p_workspace_id,v_actor,jsonb_build_object('status','draft','maximum_amount_micros',null,
      'owner_testing_user_id',p_owner_testing_user_id,'reason',btrim(p_reason)),now());
  insert into tongs.owner_operating_budgets(id,environment,workspace_id,provider,route,sku,currency,period_start,period_end,created_by,owner_testing_user_id)
  values(p_budget_id,p_environment,p_workspace_id,nullif(btrim(coalesce(p_provider,'')),''),nullif(btrim(coalesce(p_route,'')),''),
    nullif(btrim(coalesce(p_sku,'')),''),v_currency,p_period_start,p_period_end,v_actor,p_owner_testing_user_id);
  insert into tongs.owner_operating_budget_revisions(budget_id,revision,status,maximum_amount_micros,reason,actor_id,journal_event_id)
  values(p_budget_id,1,'draft',null,btrim(p_reason),v_actor,v_event);
  return jsonb_build_object('budget_id',p_budget_id,'revision',1,'status','draft','maximum_amount_micros',null,
    'owner_testing_user_id',p_owner_testing_user_id,'spending_enabled',false);
end $$;

create or replace function tongs.record_test_refill(
  p_grant_id uuid,p_user_id uuid,p_operator_user_id uuid,p_credit_units bigint,p_reason text,
  p_idempotency_key text,p_expires_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=p_operator_user_id; v_event uuid:=gen_random_uuid(); v_existing tongs.test_refill_grants%rowtype;
begin
  if coalesce(auth.role(),'')<>'service_role' or v_actor is null or not tongs.is_platform_operator(v_actor) then
    raise exception 'service-role platform operator required' using errcode='42501'; end if;
  if p_grant_id is null or p_user_id is null or p_credit_units<=0
     or length(btrim(coalesce(p_reason,''))) not between 3 and 500
     or length(btrim(coalesce(p_idempotency_key,''))) not between 8 and 300
     or (p_expires_at is not null and p_expires_at<=now()) then raise exception 'invalid Test refill' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('test-refill:'||btrim(p_idempotency_key),0));
  select * into v_existing from tongs.test_refill_grants where idempotency_key=btrim(p_idempotency_key);
  if found then
    if v_existing.id<>p_grant_id or v_existing.user_id<>p_user_id or v_existing.credit_units<>p_credit_units then
      raise exception 'Test refill replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('grant_id',v_existing.id,'replay',true,'environment','test','live_funding',false);
  end if;
  perform tongs._create_accounting_event(v_event,'test-refill:'||btrim(p_idempotency_key),
    'test_refill_granted','test','operator_test_refill',p_grant_id::text,null,p_user_id,null,v_actor,
    jsonb_build_object('credit_units',p_credit_units,'reason',btrim(p_reason),'live_funding',false,'customer_revenue',false),now());
  insert into tongs.accounting_journal_entries(event_id,line_number,account_code,user_id,quantity_delta,unit_kind,metadata_json)
  values(v_event,1,'test_credit_available',p_user_id,p_credit_units,'test_credit',jsonb_build_object('live_funding',false));
  insert into tongs.test_refill_grants(id,user_id,credit_units,reason,idempotency_key,granted_by,journal_event_id,expires_at)
  values(p_grant_id,p_user_id,p_credit_units,btrim(p_reason),btrim(p_idempotency_key),v_actor,v_event,p_expires_at);
  return jsonb_build_object('grant_id',p_grant_id,'replay',false,'environment','test','live_funding',false,'customer_revenue_micros',0);
end $$;

create or replace function tongs.consume_test_refill(
  p_consumption_id uuid,p_grant_id uuid,p_operation_id text,p_credit_units bigint,
  p_provider_mode text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_grant tongs.test_refill_grants%rowtype; v_existing tongs.test_refill_consumptions%rowtype;
  v_used bigint; v_event uuid:=gen_random_uuid();
begin
  perform tongs._require_accounting_service_role();
  if p_provider_mode<>'simulated' then raise exception 'Test refill cannot authorize a real provider' using errcode='42501'; end if;
  if p_consumption_id is null or p_grant_id is null or p_credit_units<=0
     or length(btrim(coalesce(p_operation_id,''))) not between 8 and 300
     or length(btrim(coalesce(p_idempotency_key,''))) not between 8 and 300 then raise exception 'invalid Test consumption' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('test-refill-consumption:'||p_grant_id::text,0));
  select * into v_existing from tongs.test_refill_consumptions where idempotency_key=btrim(p_idempotency_key);
  if found then
    if v_existing.id<>p_consumption_id or v_existing.grant_id<>p_grant_id or v_existing.operation_id<>btrim(p_operation_id)
       or v_existing.credit_units<>p_credit_units then raise exception 'Test consumption replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('consumption_id',v_existing.id,'replay',true,'environment','test','customer_revenue_micros',0);
  end if;
  select * into v_grant from tongs.test_refill_grants where id=p_grant_id for update;
  if not found or (v_grant.expires_at is not null and v_grant.expires_at<=now()) then raise exception 'eligible Test refill not found' using errcode='P0002'; end if;
  select coalesce(sum(credit_units),0) into v_used from tongs.test_refill_consumptions where grant_id=p_grant_id;
  if p_credit_units>v_grant.credit_units-v_used then raise exception 'insufficient Test refill' using errcode='P0001'; end if;
  perform tongs._create_accounting_event(v_event,'test-consumption:'||btrim(p_idempotency_key),
    'test_refill_consumed','test','simulated_operation',btrim(p_operation_id),null,v_grant.user_id,null,null,
    jsonb_build_object('credit_units',p_credit_units,'provider_mode','simulated','customer_revenue',false),now());
  insert into tongs.accounting_journal_entries(event_id,line_number,account_code,user_id,quantity_delta,unit_kind,metadata_json)
  values(v_event,1,'test_credit_available',v_grant.user_id,-p_credit_units,'test_credit',jsonb_build_object('provider_mode','simulated'));
  insert into tongs.test_refill_consumptions(id,grant_id,operation_id,credit_units,provider_mode,idempotency_key,journal_event_id)
  values(p_consumption_id,p_grant_id,btrim(p_operation_id),p_credit_units,'simulated',btrim(p_idempotency_key),v_event);
  return jsonb_build_object('consumption_id',p_consumption_id,'replay',false,'environment','test','customer_revenue_micros',0,'remaining_credit_units',v_grant.credit_units-v_used-p_credit_units);
end $$;

create or replace function tongs.read_pending_customer_deposits_for_fee_recovery(p_limit integer default 20)
returns table(deposit_id uuid,stripe_payment_intent_id text,currency text,received_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
  perform tongs._require_accounting_service_role();
  if p_limit not between 1 and 50 then raise exception 'recovery limit must be between 1 and 50' using errcode='22023'; end if;
  return query select deposit.id,deposit.stripe_payment_intent_id,deposit.currency,deposit.received_at
    from tongs.customer_deposits deposit
    where deposit.stripe_mode='live' and deposit.stripe_payment_intent_id is not null
      and not exists(select 1 from tongs.customer_deposit_processor_fees fee where fee.deposit_id=deposit.id)
    order by deposit.received_at asc limit p_limit;
end $$;

revoke all on function tongs.configure_owner_testing_principal(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function tongs._resolve_spending_authority(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function tongs._quote_payer_allows_user(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function tongs._quote_owner_budget_allows(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function tongs.resolve_openai_text_model_for_funding_quote(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function tongs._validate_quote_authority_before_provider(uuid,text) from public,anon,authenticated,service_role;
revoke all on function tongs.create_owner_testing_budget_draft(uuid,uuid,uuid,text,uuid,text,text,text,text,timestamptz,timestamptz,text) from public,anon,authenticated;
revoke all on function tongs.record_test_refill(uuid,uuid,uuid,bigint,text,text,timestamptz) from public,anon,authenticated;
revoke all on function tongs.consume_test_refill(uuid,uuid,text,bigint,text,text) from public,anon,authenticated;
revoke all on function tongs.read_pending_customer_deposits_for_fee_recovery(integer) from public,anon,authenticated;
revoke all on function tongs.set_my_ai_funding_preference(uuid,text,uuid) from public,anon;
revoke all on function tongs.read_my_ai_funding_options(uuid) from public,anon;
revoke all on function tongs.configure_organization_funding_account(uuid,uuid,text,text,text) from public,anon;
revoke all on function tongs.configure_organization_shared_spend_permission(uuid,uuid,text,text[],text) from public,anon;
grant execute on function tongs.configure_owner_testing_principal(uuid,uuid,text,text) to service_role;
grant execute on function tongs._resolve_spending_authority(uuid,uuid,text) to service_role;
grant execute on function tongs._quote_payer_allows_user(uuid,uuid) to service_role;
grant execute on function tongs._quote_owner_budget_allows(uuid,uuid) to service_role;
grant execute on function tongs.resolve_openai_text_model_for_funding_quote(uuid,uuid,text,text) to service_role;
grant execute on function tongs._validate_quote_authority_before_provider(uuid,text) to service_role;
grant execute on function tongs.create_owner_testing_budget_draft(uuid,uuid,uuid,text,uuid,text,text,text,text,timestamptz,timestamptz,text) to service_role;
grant execute on function tongs.record_test_refill(uuid,uuid,uuid,bigint,text,text,timestamptz) to service_role;
grant execute on function tongs.consume_test_refill(uuid,uuid,text,bigint,text,text) to service_role;
grant execute on function tongs.read_pending_customer_deposits_for_fee_recovery(integer) to service_role;
grant execute on function tongs.set_my_ai_funding_preference(uuid,text,uuid) to authenticated;
grant execute on function tongs.read_my_ai_funding_options(uuid) to authenticated;
grant execute on function tongs.configure_organization_funding_account(uuid,uuid,text,text,text) to authenticated;
grant execute on function tongs.configure_organization_shared_spend_permission(uuid,uuid,text,text[],text) to authenticated;

comment on table tongs.owner_testing_principals is 'Explicit verified identities eligible to select owner testing. Platform/operator/admin status alone never qualifies.';
comment on table tongs.organization_funding_account_revisions is 'Append-only organization payer selection. Credits stay on the canonical payer account and are never copied.';
comment on table tongs.test_refill_grants is 'Test-only refill provenance. It is not a Live deposit, customer revenue, or evidence of provider payment.';

commit;
