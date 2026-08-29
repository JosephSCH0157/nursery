-- S5-2C: YouTube connection OAuth state and provider lifecycle authority.
-- This migration does not add publication operations or upload authority.
begin;

create table tongs.publishing_oauth_connection_attempts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references tongs.publishing_provider_connections(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check(provider = 'google'),
  state_hash text not null unique check(state_hash ~ '^[a-f0-9]{64}$'),
  encrypted_pkce_verifier text not null check(length(btrim(encrypted_pkce_verifier)) > 0),
  encryption_key_version text not null check(length(btrim(encryption_key_version)) > 0),
  ciphertext_version text not null check(length(btrim(ciphertext_version)) > 0),
  expected_redirect_uri text not null check(expected_redirect_uri ~ '^https://'),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  state text not null default 'pending' check(state in('pending','consumed','completed','failed','expired')),
  failure_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, connection_id),
  foreign key(connection_id, owner_user_id, provider)
    references tongs.publishing_provider_connections(id, owner_user_id, provider),
  check(expires_at > created_at),
  check((state='pending' and consumed_at is null) or (state<>'pending' and consumed_at is not null))
);

create index publishing_oauth_attempt_owner_idx on tongs.publishing_oauth_connection_attempts(owner_user_id, created_at desc);
create index publishing_oauth_attempt_expiry_idx on tongs.publishing_oauth_connection_attempts(state, expires_at);

alter table tongs.publishing_oauth_connection_attempts enable row level security;
revoke all on tongs.publishing_oauth_connection_attempts from public, anon, authenticated;
grant all on tongs.publishing_oauth_connection_attempts to service_role;
-- No authenticated policy: PKCE verifier ciphertext and state evidence are server-only.

create or replace function tongs.create_publishing_oauth_connection_attempt(
  p_owner_user_id uuid,
  p_connection_id uuid,
  p_state_hash text,
  p_encrypted_pkce_verifier text,
  p_encryption_key_version text,
  p_ciphertext_version text,
  p_expected_redirect_uri text,
  p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_connection tongs.publishing_provider_connections%rowtype; v_id uuid:=gen_random_uuid();
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into v_connection from tongs.publishing_provider_connections where id=p_connection_id for update;
  if not found or v_connection.owner_user_id<>p_owner_user_id or v_connection.provider<>'google' then return jsonb_build_object('disposition','denied','code','connection_owner_or_provider_mismatch'); end if;
  if v_connection.state<>'pending_authorization' then return jsonb_build_object('disposition','blocked','code','connection_not_pending'); end if;
  if p_state_hash!~'^[a-f0-9]{64}$' or p_expires_at<=now() or p_expected_redirect_uri!~'^https://' then return jsonb_build_object('disposition','invalid','code','oauth_attempt_evidence_invalid'); end if;
  insert into tongs.publishing_oauth_connection_attempts(id,connection_id,owner_user_id,provider,state_hash,encrypted_pkce_verifier,encryption_key_version,ciphertext_version,expected_redirect_uri,expires_at)
  values(v_id,p_connection_id,p_owner_user_id,'google',p_state_hash,p_encrypted_pkce_verifier,p_encryption_key_version,p_ciphertext_version,p_expected_redirect_uri,p_expires_at);
  return jsonb_build_object('disposition','created','oauth_attempt_id',v_id,'connection_id',p_connection_id,'expires_at',p_expires_at);
end; $$;

create or replace function tongs.prepare_publishing_connection_reauthorization(p_owner_user_id uuid, p_connection_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_connection tongs.publishing_provider_connections%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into v_connection from tongs.publishing_provider_connections where id=p_connection_id for update;
  if not found or v_connection.owner_user_id<>p_owner_user_id or v_connection.provider<>'google' then return jsonb_build_object('disposition','denied','code','connection_owner_or_provider_mismatch'); end if;
  if v_connection.state not in('revoked','disconnected','invalid','expired','refresh_required') then return jsonb_build_object('disposition','blocked','code','connection_reauthorization_not_required'); end if;
  update tongs.publishing_provider_connections set state='pending_authorization',revoked_at=null,updated_at=now() where id=p_connection_id;
  update tongs.publishing_provider_credential_authorities set state='unavailable',updated_at=now() where id=v_connection.credential_authority_id;
  return jsonb_build_object('disposition','prepared','connection_id',p_connection_id);
end; $$;

create or replace function tongs.consume_publishing_oauth_connection_attempt(
  p_provider text,
  p_state_hash text,
  p_expected_redirect_uri text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_attempt tongs.publishing_oauth_connection_attempts%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into v_attempt from tongs.publishing_oauth_connection_attempts where state_hash=p_state_hash for update;
  if not found then return jsonb_build_object('disposition','blocked','code','oauth_state_invalid'); end if;
  if v_attempt.state<>'pending' then return jsonb_build_object('disposition','blocked','code','oauth_state_replayed'); end if;
  if v_attempt.expires_at<=now() then
    update tongs.publishing_oauth_connection_attempts set state='expired',consumed_at=now(),failure_code='oauth_state_expired',updated_at=now() where id=v_attempt.id;
    return jsonb_build_object('disposition','blocked','code','oauth_state_expired');
  end if;
  if v_attempt.provider<>p_provider or v_attempt.expected_redirect_uri<>p_expected_redirect_uri then return jsonb_build_object('disposition','blocked','code','oauth_state_context_mismatch'); end if;
  update tongs.publishing_oauth_connection_attempts set state='consumed',consumed_at=now(),updated_at=now() where id=v_attempt.id;
  return jsonb_build_object('disposition','consumed','oauth_attempt_id',v_attempt.id,'connection_id',v_attempt.connection_id,'owner_user_id',v_attempt.owner_user_id,'encrypted_pkce_verifier',v_attempt.encrypted_pkce_verifier,'encryption_key_version',v_attempt.encryption_key_version,'ciphertext_version',v_attempt.ciphertext_version);
end; $$;

create or replace function tongs.complete_publishing_oauth_connection_attempt(p_attempt_id uuid, p_success boolean, p_failure_code text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  update tongs.publishing_oauth_connection_attempts set state=case when p_success then 'completed' else 'failed' end,failure_code=case when p_success then null else coalesce(nullif(btrim(p_failure_code),''),'oauth_callback_failed') end,updated_at=now() where id=p_attempt_id and state='consumed';
  if not found then return jsonb_build_object('disposition','blocked','code','oauth_attempt_not_consumed'); end if;
  return jsonb_build_object('disposition','completed','success',p_success);
end; $$;

create or replace function tongs.get_publishing_credential_execution_authority(p_connection_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
  select case when auth.role()<>'service_role' then null else jsonb_build_object(
    'connection_id',c.id,'owner_user_id',c.owner_user_id,'provider',c.provider,'connection_state',c.state,
    'credential_authority_id',ca.id,'credential_state',ca.state,'generation',g.generation,
    'encrypted_refresh_token',g.encrypted_refresh_token,'encrypted_access_token',g.encrypted_access_token,
    'access_token_expires_at',g.access_token_expires_at,'granted_scopes',g.granted_scopes,
    'provider_grant_identity_hash',g.provider_grant_identity_hash,'encryption_key_version',g.encryption_key_version,'ciphertext_version',g.ciphertext_version
  ) end
  from tongs.publishing_provider_connections c
  join tongs.publishing_provider_credential_authorities ca on ca.id=c.credential_authority_id
  left join tongs.publishing_provider_credential_generations g on g.id=ca.current_generation_id
  where c.id=p_connection_id;
$$;

create or replace function tongs.get_publishing_destination_capability_head(p_destination_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
  select case when auth.role()<>'service_role' then null else jsonb_build_object('destination_id',d.id,'capability_revision_id',cap.id,'capability_revision',coalesce(cap.revision,0),'capability_content_hash',cap.content_hash) end
  from tongs.publishing_executable_destinations d left join tongs.publishing_destination_capability_revisions cap on cap.id=d.current_capability_revision_id where d.id=p_destination_id;
$$;

create or replace function tongs.set_publishing_provider_connection_state(
  p_actor_user_id uuid, p_connection_id uuid, p_connection_state text, p_credential_state text, p_reason text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_connection tongs.publishing_provider_connections%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_connection_state not in('refresh_required','expired','revoked','invalid','disconnected') or p_credential_state not in('refresh_required','expired','revoked','invalid') then return jsonb_build_object('disposition','invalid','code','invalid_connection_transition'); end if;
  select * into v_connection from tongs.publishing_provider_connections where id=p_connection_id for update;
  if not found or v_connection.owner_user_id<>p_actor_user_id then return jsonb_build_object('disposition','denied','code','connection_owner_required'); end if;
  update tongs.publishing_provider_connections set state=p_connection_state,authorization_revision=authorization_revision+1,revoked_at=case when p_connection_state in('revoked','disconnected') then now() else revoked_at end,updated_at=now() where id=p_connection_id;
  update tongs.publishing_provider_credential_authorities set state=p_credential_state,updated_at=now() where id=v_connection.credential_authority_id;
  return jsonb_build_object('disposition','committed','connection_id',p_connection_id,'connection_state',p_connection_state,'credential_state',p_credential_state,'reason',p_reason);
end; $$;

revoke all on function tongs.create_publishing_oauth_connection_attempt(uuid,uuid,text,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function tongs.prepare_publishing_connection_reauthorization(uuid,uuid) from public,anon,authenticated;
revoke all on function tongs.consume_publishing_oauth_connection_attempt(text,text,text) from public,anon,authenticated;
revoke all on function tongs.complete_publishing_oauth_connection_attempt(uuid,boolean,text) from public,anon,authenticated;
revoke all on function tongs.get_publishing_credential_execution_authority(uuid) from public,anon,authenticated;
revoke all on function tongs.get_publishing_destination_capability_head(uuid) from public,anon,authenticated;
revoke all on function tongs.set_publishing_provider_connection_state(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function tongs.create_publishing_oauth_connection_attempt(uuid,uuid,text,text,text,text,text,timestamptz),tongs.prepare_publishing_connection_reauthorization(uuid,uuid),tongs.consume_publishing_oauth_connection_attempt(text,text,text),tongs.complete_publishing_oauth_connection_attempt(uuid,boolean,text),tongs.get_publishing_credential_execution_authority(uuid),tongs.get_publishing_destination_capability_head(uuid),tongs.set_publishing_provider_connection_state(uuid,uuid,text,text,text) to service_role;

comment on table tongs.publishing_oauth_connection_attempts is 'Server-only, single-use OAuth state and PKCE evidence. It grants no workspace or destination authority.';
commit;
