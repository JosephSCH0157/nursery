-- S5-2B: durable publishing connection and executable-destination authority.
-- No OAuth callback, provider API, adapter execution, or publication operation is implemented here.
begin;

create table tongs.publishing_provider_connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check(provider in('google','spotify','rumble','rss_host')),
  state text not null check(state in('pending_authorization','active','refresh_required','expired','revoked','invalid','disconnected')),
  authorization_revision integer not null default 1 check(authorization_revision > 0),
  provider_grant_subject_hash text null check(provider_grant_subject_hash is null or provider_grant_subject_hash ~ '^[a-f0-9]{64}$'),
  granted_scopes text[] not null default '{}',
  credential_authority_id uuid null,
  connected_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, owner_user_id),
  unique(id, owner_user_id, provider),
  check(state <> 'active' or connected_at is not null),
  check(state not in('revoked','disconnected') or revoked_at is not null)
);

create table tongs.publishing_provider_credential_authorities (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null unique references tongs.publishing_provider_connections(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  state text not null check(state in('unavailable','available','refresh_required','expired','revoked','invalid')),
  current_generation_id uuid null,
  current_generation integer not null default 0 check(current_generation >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, connection_id),
  foreign key(connection_id, owner_user_id) references tongs.publishing_provider_connections(id, owner_user_id),
  check((current_generation = 0 and current_generation_id is null) or (current_generation > 0 and current_generation_id is not null))
);

alter table tongs.publishing_provider_connections
  add constraint publishing_provider_connection_credential_fk
  foreign key(credential_authority_id, id)
  references tongs.publishing_provider_credential_authorities(id, connection_id);

create table tongs.publishing_provider_credential_generations (
  id uuid primary key default gen_random_uuid(),
  credential_authority_id uuid not null references tongs.publishing_provider_credential_authorities(id) on delete cascade,
  connection_id uuid not null references tongs.publishing_provider_connections(id) on delete cascade,
  generation integer not null check(generation > 0),
  encryption_key_version text not null check(length(btrim(encryption_key_version)) > 0),
  ciphertext_version text not null check(length(btrim(ciphertext_version)) > 0),
  encrypted_refresh_token text not null check(length(btrim(encrypted_refresh_token)) > 0),
  encrypted_access_token text null check(encrypted_access_token is null or length(btrim(encrypted_access_token)) > 0),
  access_token_expires_at timestamptz null,
  granted_scopes text[] not null,
  provider_grant_identity_hash text not null check(provider_grant_identity_hash ~ '^[a-f0-9]{64}$'),
  supersedes_generation_id uuid null,
  refreshed_at timestamptz null,
  rotated_at timestamptz null,
  validated_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(credential_authority_id, generation),
  unique(id, credential_authority_id),
  foreign key(credential_authority_id, connection_id)
    references tongs.publishing_provider_credential_authorities(id, connection_id),
  foreign key(supersedes_generation_id, credential_authority_id)
    references tongs.publishing_provider_credential_generations(id, credential_authority_id),
  check((generation = 1 and supersedes_generation_id is null) or (generation > 1 and supersedes_generation_id is not null))
);

alter table tongs.publishing_provider_credential_authorities
  add constraint publishing_credential_current_generation_fk
  foreign key(current_generation_id, id)
  references tongs.publishing_provider_credential_generations(id, credential_authority_id);

create table tongs.publishing_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references tongs.publishing_provider_connections(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  external_account_id text not null check(length(btrim(external_account_id)) > 0),
  display_label text not null check(length(btrim(display_label)) > 0),
  state text not null check(state in('active','unavailable','removed')),
  observation_revision integer not null check(observation_revision > 0),
  observed_at timestamptz not null,
  removed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, external_account_id),
  unique(id, connection_id),
  unique(id, connection_id, provider),
  foreign key(connection_id, owner_user_id) references tongs.publishing_provider_connections(id, owner_user_id),
  check(state <> 'removed' or removed_at is not null)
);

create table tongs.publishing_executable_destinations (
  id uuid primary key default gen_random_uuid(),
  provider_account_id uuid not null,
  connection_id uuid not null references tongs.publishing_provider_connections(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  destination_kind text not null check(destination_kind in('channel','page','show','feed')),
  external_destination_id text not null check(length(btrim(external_destination_id)) > 0),
  display_label text not null check(length(btrim(display_label)) > 0),
  state text not null check(state in('active','unavailable','ownership_changed','removed')),
  observation_revision integer not null check(observation_revision > 0),
  observed_at timestamptz not null,
  removed_at timestamptz null,
  current_capability_revision_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, external_destination_id),
  unique(id, connection_id),
  foreign key(provider_account_id, connection_id, provider) references tongs.publishing_provider_accounts(id, connection_id, provider),
  foreign key(connection_id, owner_user_id, provider) references tongs.publishing_provider_connections(id, owner_user_id, provider),
  check(state <> 'removed' or removed_at is not null)
);

create table tongs.publishing_destination_capability_revisions (
  id uuid primary key default gen_random_uuid(),
  executable_destination_id uuid not null references tongs.publishing_executable_destinations(id) on delete cascade,
  revision integer not null check(revision > 0),
  previous_revision_id uuid null,
  contract_version text not null,
  observation_source text not null check(observation_source in('provider_api','verified_configuration')),
  capabilities_json jsonb not null check(jsonb_typeof(capabilities_json) = 'object'),
  content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
  adapter_id text not null,
  adapter_version text not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(executable_destination_id, revision),
  unique(executable_destination_id, content_hash),
  unique(id, executable_destination_id),
  foreign key(previous_revision_id, executable_destination_id)
    references tongs.publishing_destination_capability_revisions(id, executable_destination_id),
  check((revision = 1 and previous_revision_id is null) or (revision > 1 and previous_revision_id is not null))
);

alter table tongs.publishing_executable_destinations
  add constraint publishing_destination_current_capability_fk
  foreign key(current_capability_revision_id, id)
  references tongs.publishing_destination_capability_revisions(id, executable_destination_id);

create table tongs.publishing_workspace_destination_grant_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  executable_destination_id uuid not null references tongs.publishing_executable_destinations(id) on delete cascade,
  connection_id uuid not null references tongs.publishing_provider_connections(id) on delete cascade,
  revision integer not null check(revision > 0),
  previous_grant_revision_id uuid null,
  state text not null check(state in('active','revoked')),
  granted_by_user_id uuid not null references auth.users(id),
  reason text null,
  created_at timestamptz not null default now(),
  unique(workspace_id, executable_destination_id, revision),
  unique(id, workspace_id, executable_destination_id),
  foreign key(executable_destination_id, connection_id)
    references tongs.publishing_executable_destinations(id, connection_id),
  foreign key(previous_grant_revision_id, workspace_id, executable_destination_id)
    references tongs.publishing_workspace_destination_grant_revisions(id, workspace_id, executable_destination_id),
  check((revision = 1 and previous_grant_revision_id is null) or (revision > 1 and previous_grant_revision_id is not null))
);

create table tongs.publishing_workspace_destination_grant_heads (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  executable_destination_id uuid not null references tongs.publishing_executable_destinations(id) on delete cascade,
  current_grant_revision_id uuid not null,
  current_revision integer not null check(current_revision > 0),
  updated_at timestamptz not null default now(),
  primary key(workspace_id, executable_destination_id),
  foreign key(current_grant_revision_id, workspace_id, executable_destination_id)
    references tongs.publishing_workspace_destination_grant_revisions(id, workspace_id, executable_destination_id)
);

create index publishing_connections_owner_idx on tongs.publishing_provider_connections(owner_user_id, provider, state);
create index publishing_accounts_connection_idx on tongs.publishing_provider_accounts(connection_id, state);
create index publishing_destinations_connection_idx on tongs.publishing_executable_destinations(connection_id, state);
create index publishing_grants_workspace_idx on tongs.publishing_workspace_destination_grant_revisions(workspace_id, state, created_at desc);
create index publishing_capabilities_destination_idx on tongs.publishing_destination_capability_revisions(executable_destination_id, revision desc);

create or replace function tongs.reject_publishing_authority_immutable_mutation()
returns trigger language plpgsql set search_path = pg_catalog, tongs as $$
begin
  raise exception 'Publishing authority history is immutable' using errcode = '55000';
end; $$;

create trigger trg_publishing_credential_generations_immutable before update or delete on tongs.publishing_provider_credential_generations for each row execute function tongs.reject_publishing_authority_immutable_mutation();
create trigger trg_publishing_capability_revisions_immutable before update or delete on tongs.publishing_destination_capability_revisions for each row execute function tongs.reject_publishing_authority_immutable_mutation();
create trigger trg_publishing_grant_revisions_immutable before update or delete on tongs.publishing_workspace_destination_grant_revisions for each row execute function tongs.reject_publishing_authority_immutable_mutation();

create or replace function tongs.publishing_destination_grant_is_active(p_workspace_id uuid, p_destination_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, tongs as $$
  select exists(
    select 1
    from tongs.publishing_workspace_destination_grant_heads h
    join tongs.publishing_workspace_destination_grant_revisions r on r.id = h.current_grant_revision_id
    join tongs.publishing_executable_destinations d on d.id = h.executable_destination_id
    join tongs.publishing_provider_connections c on c.id = d.connection_id
    join tongs.publishing_provider_credential_authorities ca on ca.id = c.credential_authority_id
    where h.workspace_id = p_workspace_id and h.executable_destination_id = p_destination_id
      and r.state = 'active'
      and d.state = 'active'
      and d.current_capability_revision_id is not null
      and c.state = 'active'
      and ca.state = 'available'
      and tongs.has_workspace_role(p_workspace_id, 'viewer')
  );
$$;

create or replace function tongs.set_publishing_workspace_destination_grant(
  p_workspace_id uuid,
  p_destination_id uuid,
  p_expected_revision integer,
  p_state text,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, tongs as $$
declare
  v_user uuid := auth.uid();
  v_destination tongs.publishing_executable_destinations%rowtype;
  v_connection tongs.publishing_provider_connections%rowtype;
  v_head tongs.publishing_workspace_destination_grant_heads%rowtype;
  v_id uuid := gen_random_uuid();
  v_revision integer;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id, 'admin') then
    return jsonb_build_object('disposition','denied','code','workspace_admin_required');
  end if;
  if p_state not in('active','revoked') then
    return jsonb_build_object('disposition','invalid','code','invalid_grant_state');
  end if;
  select * into v_destination from tongs.publishing_executable_destinations where id = p_destination_id;
  if not found then return jsonb_build_object('disposition','blocked','code','destination_missing'); end if;
  select * into v_connection from tongs.publishing_provider_connections where id = v_destination.connection_id;
  if not found or v_connection.owner_user_id <> v_user then
    return jsonb_build_object('disposition','denied','code','connection_owner_required');
  end if;
  if p_state = 'active' and (
    v_connection.state <> 'active'
    or v_destination.state <> 'active'
    or v_destination.current_capability_revision_id is null
    or not exists(
      select 1 from tongs.publishing_provider_credential_authorities ca
      where ca.id = v_connection.credential_authority_id and ca.state = 'available'
    )
  ) then
    return jsonb_build_object('disposition','blocked','code','destination_not_executable');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_destination_id::text||':publishing-grant',0));
  select * into v_head from tongs.publishing_workspace_destination_grant_heads where workspace_id=p_workspace_id and executable_destination_id=p_destination_id for update;
  if coalesce(v_head.current_revision,0) <> p_expected_revision then
    return jsonb_build_object('disposition','revision_conflict','current_revision',coalesce(v_head.current_revision,0),'current_grant_revision_id',v_head.current_grant_revision_id);
  end if;
  if v_head.current_grant_revision_id is not null and exists(select 1 from tongs.publishing_workspace_destination_grant_revisions where id=v_head.current_grant_revision_id and state=p_state) then
    return jsonb_build_object('disposition','no_change','grant_revision_id',v_head.current_grant_revision_id,'revision',v_head.current_revision,'state',p_state);
  end if;
  v_revision := coalesce(v_head.current_revision,0) + 1;
  insert into tongs.publishing_workspace_destination_grant_revisions(id,workspace_id,executable_destination_id,connection_id,revision,previous_grant_revision_id,state,granted_by_user_id,reason)
  values(v_id,p_workspace_id,p_destination_id,v_destination.connection_id,v_revision,v_head.current_grant_revision_id,p_state,v_user,nullif(btrim(coalesce(p_reason,'')),''));
  insert into tongs.publishing_workspace_destination_grant_heads(workspace_id,executable_destination_id,current_grant_revision_id,current_revision)
  values(p_workspace_id,p_destination_id,v_id,v_revision)
  on conflict(workspace_id,executable_destination_id) do update set current_grant_revision_id=excluded.current_grant_revision_id,current_revision=excluded.current_revision,updated_at=now();
  return jsonb_build_object('disposition','committed','grant_revision_id',v_id,'revision',v_revision,'state',p_state);
end; $$;

create or replace function tongs.get_my_publishing_connection_authorities()
returns jsonb language sql stable security definer set search_path = pg_catalog, tongs as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider_connection_id', c.id,
    'provider', c.provider,
    'state', c.state,
    'authorization_revision', c.authorization_revision,
    'granted_scopes', c.granted_scopes,
    'credential_authority_id', c.credential_authority_id,
    'credential_state', ca.state,
    'credential_generation', ca.current_generation,
    'connected_at', c.connected_at,
    'revoked_at', c.revoked_at
  ) order by c.created_at), '[]'::jsonb)
  from tongs.publishing_provider_connections c
  left join tongs.publishing_provider_credential_authorities ca on ca.id=c.credential_authority_id
  where c.owner_user_id=auth.uid();
$$;

create or replace function tongs.get_workspace_publishing_destination_authorities(p_workspace_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, tongs as $$
  select case when not tongs.has_workspace_role(p_workspace_id,'viewer') then '[]'::jsonb else coalesce(jsonb_agg(jsonb_build_object(
    'workspace_id', p_workspace_id,
    'executable_destination_id', d.id,
    'provider_connection_id', c.id,
    'provider_account_id', a.id,
    'provider', d.provider,
    'destination_kind', d.destination_kind,
    'external_destination_id', d.external_destination_id,
    'display_label', d.display_label,
    'destination_state', d.state,
    'connection_state', c.state,
    'credential_authority_id', ca.id,
    'credential_state', ca.state,
    'capability_revision_id', cap.id,
    'capability_revision', cap.revision,
    'capability_content_hash', cap.content_hash,
    'capabilities', cap.capabilities_json,
    'grant_revision_id', g.id,
    'grant_revision', g.revision
  ) order by d.display_label), '[]'::jsonb) end
  from tongs.publishing_workspace_destination_grant_heads h
  join tongs.publishing_workspace_destination_grant_revisions g on g.id=h.current_grant_revision_id and g.state='active'
  join tongs.publishing_executable_destinations d on d.id=h.executable_destination_id
  join tongs.publishing_provider_accounts a on a.id=d.provider_account_id
  join tongs.publishing_provider_connections c on c.id=d.connection_id
  join tongs.publishing_provider_credential_authorities ca on ca.id=c.credential_authority_id and ca.state='available'
  join tongs.publishing_destination_capability_revisions cap on cap.id=d.current_capability_revision_id
  where h.workspace_id=p_workspace_id and d.state='active' and c.state='active';
$$;

create or replace function tongs.create_publishing_provider_connection_authority(
  p_owner_user_id uuid,
  p_provider text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, tongs as $$
declare v_connection_id uuid:=gen_random_uuid(); v_credential_id uuid:=gen_random_uuid();
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_provider not in('google','spotify','rumble','rss_host') then return jsonb_build_object('disposition','invalid','code','provider_unsupported'); end if;
  if not exists(select 1 from auth.users where id=p_owner_user_id) then return jsonb_build_object('disposition','invalid','code','owner_missing'); end if;
  insert into tongs.publishing_provider_connections(id,owner_user_id,provider,state)
  values(v_connection_id,p_owner_user_id,p_provider,'pending_authorization');
  insert into tongs.publishing_provider_credential_authorities(id,connection_id,owner_user_id,state)
  values(v_credential_id,v_connection_id,p_owner_user_id,'unavailable');
  update tongs.publishing_provider_connections set credential_authority_id=v_credential_id where id=v_connection_id;
  return jsonb_build_object('disposition','created','provider_connection_id',v_connection_id,'credential_authority_id',v_credential_id);
end; $$;

create or replace function tongs.commit_publishing_credential_generation(
  p_credential_authority_id uuid,
  p_expected_generation integer,
  p_encryption_key_version text,
  p_ciphertext_version text,
  p_encrypted_refresh_token text,
  p_encrypted_access_token text,
  p_access_token_expires_at timestamptz,
  p_granted_scopes text[],
  p_provider_grant_identity_hash text,
  p_validated_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, tongs as $$
declare v_authority tongs.publishing_provider_credential_authorities%rowtype; v_connection tongs.publishing_provider_connections%rowtype; v_id uuid:=gen_random_uuid(); v_generation integer;
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_provider_grant_identity_hash!~'^[a-f0-9]{64}$' or coalesce(array_length(p_granted_scopes,1),0)=0 or btrim(coalesce(p_encrypted_refresh_token,''))='' then
    return jsonb_build_object('disposition','invalid','code','credential_evidence_incomplete');
  end if;
  select * into v_authority from tongs.publishing_provider_credential_authorities where id=p_credential_authority_id for update;
  if not found then return jsonb_build_object('disposition','blocked','code','credential_authority_missing'); end if;
  if v_authority.current_generation<>p_expected_generation then return jsonb_build_object('disposition','generation_conflict','current_generation',v_authority.current_generation); end if;
  select * into v_connection from tongs.publishing_provider_connections where id=v_authority.connection_id for update;
  if v_connection.state in('revoked','disconnected','invalid') or v_authority.state in('revoked','invalid') then
    return jsonb_build_object('disposition','blocked','code','connection_reauthorization_required');
  end if;
  if v_connection.provider_grant_subject_hash is not null and v_connection.provider_grant_subject_hash<>p_provider_grant_identity_hash then
    return jsonb_build_object('disposition','blocked','code','provider_grant_identity_conflict');
  end if;
  v_generation:=v_authority.current_generation+1;
  insert into tongs.publishing_provider_credential_generations(id,credential_authority_id,connection_id,generation,encryption_key_version,ciphertext_version,encrypted_refresh_token,encrypted_access_token,access_token_expires_at,granted_scopes,provider_grant_identity_hash,supersedes_generation_id,refreshed_at,rotated_at,validated_at)
  values(v_id,v_authority.id,v_authority.connection_id,v_generation,p_encryption_key_version,p_ciphertext_version,p_encrypted_refresh_token,nullif(btrim(coalesce(p_encrypted_access_token,'')),''),p_access_token_expires_at,p_granted_scopes,p_provider_grant_identity_hash,v_authority.current_generation_id,case when v_generation>1 then now() end,case when v_generation>1 then now() end,p_validated_at);
  update tongs.publishing_provider_credential_authorities set current_generation_id=v_id,current_generation=v_generation,state='available',updated_at=now() where id=v_authority.id;
  update tongs.publishing_provider_connections set state='active',authorization_revision=authorization_revision+case when connected_at is null then 0 else 1 end,provider_grant_subject_hash=p_provider_grant_identity_hash,granted_scopes=p_granted_scopes,connected_at=coalesce(connected_at,now()),revoked_at=null,updated_at=now() where id=v_connection.id;
  return jsonb_build_object('disposition','committed','credential_authority_id',v_authority.id,'credential_generation_id',v_id,'generation',v_generation);
end; $$;

create or replace function tongs.record_publishing_provider_account(
  p_connection_id uuid,
  p_external_account_id text,
  p_display_label text,
  p_state text,
  p_observed_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, tongs as $$
declare v_connection tongs.publishing_provider_connections%rowtype; v_account tongs.publishing_provider_accounts%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_state not in('active','unavailable','removed') then return jsonb_build_object('disposition','invalid','code','invalid_account_state'); end if;
  select * into v_connection from tongs.publishing_provider_connections where id=p_connection_id;
  if not found then return jsonb_build_object('disposition','blocked','code','connection_missing'); end if;
  if v_connection.state <> 'active' then return jsonb_build_object('disposition','blocked','code','connection_not_active'); end if;
  insert into tongs.publishing_provider_accounts(connection_id,owner_user_id,provider,external_account_id,display_label,state,observation_revision,observed_at,removed_at)
  values(v_connection.id,v_connection.owner_user_id,v_connection.provider,p_external_account_id,p_display_label,p_state,1,p_observed_at,case when p_state='removed' then p_observed_at end)
  on conflict(connection_id,external_account_id) do update set display_label=excluded.display_label,state=excluded.state,observation_revision=tongs.publishing_provider_accounts.observation_revision+1,observed_at=excluded.observed_at,removed_at=excluded.removed_at,updated_at=now()
  returning * into v_account;
  return jsonb_build_object('disposition','recorded','provider_account_id',v_account.id,'observation_revision',v_account.observation_revision);
end; $$;

create or replace function tongs.record_publishing_executable_destination(
  p_provider_account_id uuid,
  p_destination_kind text,
  p_external_destination_id text,
  p_display_label text,
  p_state text,
  p_observed_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, tongs as $$
declare v_account tongs.publishing_provider_accounts%rowtype; v_connection tongs.publishing_provider_connections%rowtype; v_destination tongs.publishing_executable_destinations%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_destination_kind not in('channel','page','show','feed') or p_state not in('active','unavailable','ownership_changed','removed') then return jsonb_build_object('disposition','invalid','code','invalid_destination_observation'); end if;
  select * into v_account from tongs.publishing_provider_accounts where id=p_provider_account_id;
  if not found then return jsonb_build_object('disposition','blocked','code','provider_account_missing'); end if;
  if v_account.state <> 'active' then return jsonb_build_object('disposition','blocked','code','provider_account_not_active'); end if;
  select * into v_connection from tongs.publishing_provider_connections where id=v_account.connection_id;
  if v_connection.state <> 'active' then return jsonb_build_object('disposition','blocked','code','connection_not_active'); end if;
  insert into tongs.publishing_executable_destinations(provider_account_id,connection_id,owner_user_id,provider,destination_kind,external_destination_id,display_label,state,observation_revision,observed_at,removed_at)
  values(v_account.id,v_connection.id,v_connection.owner_user_id,v_connection.provider,p_destination_kind,p_external_destination_id,p_display_label,p_state,1,p_observed_at,case when p_state='removed' then p_observed_at end)
  on conflict(connection_id,external_destination_id) do update set provider_account_id=excluded.provider_account_id,destination_kind=excluded.destination_kind,display_label=excluded.display_label,state=excluded.state,observation_revision=tongs.publishing_executable_destinations.observation_revision+1,observed_at=excluded.observed_at,removed_at=excluded.removed_at,updated_at=now()
  returning * into v_destination;
  return jsonb_build_object('disposition','recorded','executable_destination_id',v_destination.id,'observation_revision',v_destination.observation_revision);
end; $$;

create or replace function tongs.commit_publishing_destination_capability_revision(
  p_destination_id uuid,
  p_expected_revision integer,
  p_contract_version text,
  p_observation_source text,
  p_capabilities jsonb,
  p_adapter_id text,
  p_adapter_version text,
  p_observed_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, tongs, extensions as $$
declare v_destination tongs.publishing_executable_destinations%rowtype; v_current tongs.publishing_destination_capability_revisions%rowtype; v_hash text; v_id uuid:=gen_random_uuid(); v_revision integer;
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_observation_source not in('provider_api','verified_configuration') or jsonb_typeof(p_capabilities)<>'object' then return jsonb_build_object('disposition','invalid','code','invalid_capability_evidence'); end if;
  select * into v_destination from tongs.publishing_executable_destinations where id=p_destination_id for update;
  if not found then return jsonb_build_object('disposition','blocked','code','destination_missing'); end if;
  if v_destination.state <> 'active' then return jsonb_build_object('disposition','blocked','code','destination_not_active'); end if;
  select * into v_current from tongs.publishing_destination_capability_revisions where id=v_destination.current_capability_revision_id;
  if coalesce(v_current.revision,0)<>p_expected_revision then return jsonb_build_object('disposition','revision_conflict','current_revision',coalesce(v_current.revision,0)); end if;
  v_hash:=encode(extensions.digest(convert_to(p_capabilities::text,'UTF8'),'sha256'),'hex');
  if v_current.content_hash=v_hash then return jsonb_build_object('disposition','no_change','capability_revision_id',v_current.id,'revision',v_current.revision,'content_hash',v_hash); end if;
  v_revision:=coalesce(v_current.revision,0)+1;
  insert into tongs.publishing_destination_capability_revisions(id,executable_destination_id,revision,previous_revision_id,contract_version,observation_source,capabilities_json,content_hash,adapter_id,adapter_version,observed_at)
  values(v_id,p_destination_id,v_revision,v_current.id,p_contract_version,p_observation_source,p_capabilities,v_hash,p_adapter_id,p_adapter_version,p_observed_at);
  update tongs.publishing_executable_destinations set current_capability_revision_id=v_id,updated_at=now() where id=p_destination_id;
  return jsonb_build_object('disposition','committed','capability_revision_id',v_id,'revision',v_revision,'content_hash',v_hash);
end; $$;

do $$ declare n text; begin foreach n in array array[
  'publishing_provider_connections','publishing_provider_credential_authorities','publishing_provider_credential_generations',
  'publishing_provider_accounts','publishing_executable_destinations','publishing_destination_capability_revisions',
  'publishing_workspace_destination_grant_revisions','publishing_workspace_destination_grant_heads'
] loop execute format('alter table tongs.%I enable row level security',n); end loop; end; $$;

create policy publishing_connections_owner_read on tongs.publishing_provider_connections for select to authenticated using(owner_user_id=auth.uid());
create policy publishing_credential_authorities_owner_safe_read on tongs.publishing_provider_credential_authorities for select to authenticated using(owner_user_id=auth.uid());
-- Credential generations deliberately have no authenticated policy.
create policy publishing_accounts_owner_read on tongs.publishing_provider_accounts for select to authenticated using(owner_user_id=auth.uid());
create policy publishing_destinations_owner_or_grantee_read on tongs.publishing_executable_destinations for select to authenticated using(owner_user_id=auth.uid() or exists(select 1 from tongs.publishing_workspace_destination_grant_heads h where h.executable_destination_id=id and tongs.publishing_destination_grant_is_active(h.workspace_id,id)));
create policy publishing_capabilities_owner_or_grantee_read on tongs.publishing_destination_capability_revisions for select to authenticated using(exists(select 1 from tongs.publishing_executable_destinations d where d.id=executable_destination_id and (d.owner_user_id=auth.uid() or exists(select 1 from tongs.publishing_workspace_destination_grant_heads h where h.executable_destination_id=d.id and tongs.publishing_destination_grant_is_active(h.workspace_id,d.id)))));
create policy publishing_grant_revisions_owner_or_workspace_read on tongs.publishing_workspace_destination_grant_revisions for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer') or exists(select 1 from tongs.publishing_provider_connections c where c.id=connection_id and c.owner_user_id=auth.uid()));
create policy publishing_grant_heads_workspace_read on tongs.publishing_workspace_destination_grant_heads for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));

do $$ declare n text; begin foreach n in array array[
  'publishing_provider_connections','publishing_provider_credential_authorities','publishing_provider_credential_generations',
  'publishing_provider_accounts','publishing_executable_destinations','publishing_destination_capability_revisions',
  'publishing_workspace_destination_grant_revisions','publishing_workspace_destination_grant_heads'
] loop
  execute format('revoke all on tongs.%I from public,anon,authenticated',n);
  execute format('grant select on tongs.%I to service_role',n);
end loop; end; $$;

grant select on tongs.publishing_provider_connections,tongs.publishing_provider_credential_authorities,tongs.publishing_provider_accounts,tongs.publishing_executable_destinations,tongs.publishing_destination_capability_revisions,tongs.publishing_workspace_destination_grant_revisions,tongs.publishing_workspace_destination_grant_heads to authenticated;
grant all on tongs.publishing_provider_connections,tongs.publishing_provider_credential_authorities,tongs.publishing_provider_credential_generations,tongs.publishing_provider_accounts,tongs.publishing_executable_destinations,tongs.publishing_destination_capability_revisions,tongs.publishing_workspace_destination_grant_revisions,tongs.publishing_workspace_destination_grant_heads to service_role;

revoke all on function tongs.reject_publishing_authority_immutable_mutation() from public,anon,authenticated;
revoke all on function tongs.publishing_destination_grant_is_active(uuid,uuid) from public,anon;
grant execute on function tongs.publishing_destination_grant_is_active(uuid,uuid) to authenticated,service_role;
revoke all on function tongs.set_publishing_workspace_destination_grant(uuid,uuid,integer,text,text) from public,anon;
grant execute on function tongs.set_publishing_workspace_destination_grant(uuid,uuid,integer,text,text) to authenticated,service_role;
revoke all on function tongs.get_my_publishing_connection_authorities() from public,anon;
grant execute on function tongs.get_my_publishing_connection_authorities() to authenticated,service_role;
revoke all on function tongs.get_workspace_publishing_destination_authorities(uuid) from public,anon;
grant execute on function tongs.get_workspace_publishing_destination_authorities(uuid) to authenticated,service_role;

revoke all on function tongs.create_publishing_provider_connection_authority(uuid,text) from public,anon,authenticated;
grant execute on function tongs.create_publishing_provider_connection_authority(uuid,text) to service_role;
revoke all on function tongs.commit_publishing_credential_generation(uuid,integer,text,text,text,text,timestamptz,text[],text,timestamptz) from public,anon,authenticated;
grant execute on function tongs.commit_publishing_credential_generation(uuid,integer,text,text,text,text,timestamptz,text[],text,timestamptz) to service_role;
revoke all on function tongs.record_publishing_provider_account(uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function tongs.record_publishing_provider_account(uuid,text,text,text,timestamptz) to service_role;
revoke all on function tongs.record_publishing_executable_destination(uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function tongs.record_publishing_executable_destination(uuid,text,text,text,text,timestamptz) to service_role;
revoke all on function tongs.commit_publishing_destination_capability_revision(uuid,integer,text,text,jsonb,text,text,timestamptz) from public,anon,authenticated;
grant execute on function tongs.commit_publishing_destination_capability_revision(uuid,integer,text,text,jsonb,text,text,timestamptz) to service_role;

comment on table tongs.publishing_provider_connections is 'User-owned publishing authorization relationship; never an executable destination.';
comment on table tongs.publishing_provider_credential_authorities is 'Server-resolved publishing credential status and current immutable generation pointer.';
comment on table tongs.publishing_provider_credential_generations is 'Server-only encrypted OAuth credential generations; never readable by Quench or authenticated clients.';
comment on table tongs.publishing_provider_accounts is 'Verified external principals exposed by one provider connection; not destinations.';
comment on table tongs.publishing_executable_destinations is 'Exact external channel/page/show/feed identity available through one connection and account.';
comment on table tongs.publishing_workspace_destination_grant_revisions is 'Immutable explicit delegation of one user-owned destination to one workspace.';
comment on table tongs.publishing_destination_capability_revisions is 'Immutable capabilities observed for one exact executable destination.';

commit;
