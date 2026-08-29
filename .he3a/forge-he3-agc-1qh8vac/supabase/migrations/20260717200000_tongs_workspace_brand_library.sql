-- Workspace Brand Library: canonical profiles, immutable content/assets, optional defaults,
-- and concurrency-safe workpiece package bindings.
begin;
create extension if not exists pgcrypto;

create table tongs.brand_profiles (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  internal_label text not null, legacy_template_id uuid null, archived_at timestamptz null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  constraint brand_profiles_label_check check(length(btrim(internal_label))>0), unique(workspace_id,legacy_template_id)
);
create index brand_profiles_workspace_idx on tongs.brand_profiles(workspace_id,archived_at,updated_at desc);

create table tongs.brand_assets (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  profile_id uuid not null references tongs.brand_profiles(id) on delete cascade, role text not null, internal_label text not null,
  archived_at timestamptz null, created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  constraint brand_assets_role_check check(role in ('primary_logo','secondary_logo','alternate_logo','transparent_logo','watermark_logo','intro_media','outro_media','theme_music','intro_stinger','outro_stinger','music_bed')),
  constraint brand_assets_label_check check(length(btrim(internal_label))>0)
);
create index brand_assets_profile_idx on tongs.brand_assets(workspace_id,profile_id,role);

create table tongs.brand_asset_revisions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  asset_id uuid not null references tongs.brand_assets(id) on delete cascade, revision int not null, role text not null,
  state text not null, storage_bucket text not null default 'forge-workpieces', storage_key text not null,
  mime_type text not null, bytes bigint not null default 0, content_hash text null, width int null, height int null, duration_ms bigint null,
  operation_id text not null, operation_fingerprint text not null, failure_message text null,
  created_at timestamptz not null default now(), ready_at timestamptz null, created_by uuid not null references auth.users(id),
  constraint brand_asset_revisions_revision_check check(revision>0),
  constraint brand_asset_revisions_state_check check(state in ('pending','ready','failed','superseded','archived')),
  constraint brand_asset_revisions_hash_check check(content_hash is null or content_hash~'^[a-f0-9]{64}$'),
  constraint brand_asset_revisions_operation_check check(operation_fingerprint~'^[a-f0-9]{64}$'),
  constraint brand_asset_revisions_ready_check check((state='ready' and content_hash is not null and ready_at is not null) or state<>'ready'),
  unique(asset_id,revision), unique(workspace_id,operation_id)
);
create unique index brand_asset_revisions_storage_uidx on tongs.brand_asset_revisions(storage_bucket,storage_key);
create index brand_asset_revisions_asset_idx on tongs.brand_asset_revisions(asset_id,revision desc);

create table tongs.brand_profile_revisions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  profile_id uuid not null references tongs.brand_profiles(id) on delete cascade, revision int not null, rules_json jsonb not null,
  content_hash text not null, state text not null default 'committed', eligible_for_new_use boolean not null default true,
  validation_json jsonb not null, verified_at timestamptz null, verification_version text not null default 'forge-brand-validation-v1',
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  constraint brand_profile_revisions_revision_check check(revision>0), constraint brand_profile_revisions_rules_check check(jsonb_typeof(rules_json)='object'),
  constraint brand_profile_revisions_hash_check check(content_hash~'^[a-f0-9]{64}$'),
  constraint brand_profile_revisions_state_check check(state in ('committed','ineligible','archived')),
  constraint brand_profile_revisions_validation_check check(jsonb_typeof(validation_json)='object'), unique(profile_id,revision), unique(profile_id,content_hash)
);
create index brand_profile_revisions_profile_idx on tongs.brand_profile_revisions(profile_id,revision desc);

create table tongs.workspace_default_brand_profiles (
  workspace_id uuid primary key references tongs.workspaces(id) on delete cascade,
  profile_id uuid not null references tongs.brand_profiles(id), selected_at timestamptz not null default now(), selected_by uuid not null references auth.users(id)
);

create table tongs.workpiece_brand_bindings (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade, revision int not null, state text not null,
  profile_id uuid null references tongs.brand_profiles(id), profile_revision_id uuid null references tongs.brand_profile_revisions(id),
  profile_revision int null, profile_content_hash text null, asset_revision_ids uuid[] not null default '{}', mutation_reason text not null,
  operation_id text not null, operation_fingerprint text not null, previous_binding_id uuid null references tongs.workpiece_brand_bindings(id),
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  constraint workpiece_brand_bindings_state_check check(state in ('profile','disabled')),
  constraint workpiece_brand_bindings_shape_check check((state='disabled' and profile_id is null and profile_revision_id is null and profile_revision is null and profile_content_hash is null) or (state='profile' and profile_id is not null and profile_revision_id is not null and profile_revision is not null and profile_content_hash~'^[a-f0-9]{64}$')),
  constraint workpiece_brand_bindings_reason_check check(mutation_reason in ('resolve_default','select_profile_revision','update_to_current_profile_revision','disable')),
  constraint workpiece_brand_bindings_operation_check check(operation_fingerprint~'^[a-f0-9]{64}$'),
  unique(workpiece_id,revision), unique(workspace_id,operation_id)
);
create index workpiece_brand_bindings_active_idx on tongs.workpiece_brand_bindings(workpiece_id,revision desc);

create table tongs.workpiece_brand_binding_operations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade, operation_id text not null, operation_fingerprint text not null,
  intent text not null, disposition text not null, binding_id uuid null references tongs.workpiece_brand_bindings(id), result_json jsonb not null,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  constraint workpiece_brand_operations_fingerprint_check check(operation_fingerprint~'^[a-f0-9]{64}$'), unique(workspace_id,operation_id)
);

create or replace function tongs.reject_brand_immutable_mutation() returns trigger language plpgsql as $$ begin
  if pg_trigger_depth()>1 then return old; end if;
  if current_setting('tongs.brand_controlled_transition',true)='on' then return new; end if;
  raise exception 'Brand content, asset revisions, bindings, and operation receipts are immutable.' using errcode='55000'; end $$;
create trigger trg_brand_profile_revisions_immutable before update or delete on tongs.brand_profile_revisions for each row execute function tongs.reject_brand_immutable_mutation();
create trigger trg_brand_asset_revisions_immutable before update or delete on tongs.brand_asset_revisions for each row execute function tongs.reject_brand_immutable_mutation();
create trigger trg_workpiece_brand_bindings_immutable before update or delete on tongs.workpiece_brand_bindings for each row execute function tongs.reject_brand_immutable_mutation();
create trigger trg_workpiece_brand_operations_immutable before update or delete on tongs.workpiece_brand_binding_operations for each row execute function tongs.reject_brand_immutable_mutation();
create trigger trg_brand_profiles_updated before update on tongs.brand_profiles for each row execute function tongs.set_updated_at();

create or replace function tongs.brand_rules_hash(p_rules jsonb) returns text language sql immutable as $$
  select encode(extensions.digest(convert_to(coalesce(p_rules,'{}'::jsonb)::text,'UTF8'),'sha256'),'hex') $$;

create or replace function tongs.brand_revision_is_bindable(p_workspace_id uuid,p_profile_id uuid,p_revision_id uuid) returns boolean
language sql stable security definer set search_path=tongs,public as $$
  select exists(select 1 from tongs.brand_profile_revisions r join tongs.brand_profiles p on p.id=r.profile_id and p.workspace_id=r.workspace_id
    where r.id=p_revision_id and r.workspace_id=p_workspace_id and r.profile_id=p_profile_id and p.archived_at is null
      and r.state='committed' and r.eligible_for_new_use and r.verified_at is not null and r.content_hash=tongs.brand_rules_hash(r.rules_json)
      and coalesce((r.validation_json->>'valid')::boolean,false)
      and not exists(select 1 from jsonb_array_elements_text(coalesce(r.validation_json->'asset_revision_ids','[]'::jsonb)) x
        left join tongs.brand_asset_revisions ar on ar.id=x.value::uuid
        where ar.id is null or ar.workspace_id<>p_workspace_id or ar.state<>'ready')) $$;

create or replace function tongs.brand_binding_json(p_id uuid) returns jsonb language sql stable security definer set search_path=tongs,public as $$
  select jsonb_build_object('id',b.id,'workspace_id',b.workspace_id,'workpiece_id',b.workpiece_id,'revision',b.revision,'state',b.state,
    'profile_id',b.profile_id,'profile_revision_id',b.profile_revision_id,'profile_revision',b.profile_revision,'profile_content_hash',b.profile_content_hash,
    'asset_revision_ids',b.asset_revision_ids,'mutation_reason',b.mutation_reason,'operation_id',b.operation_id,'previous_binding_id',b.previous_binding_id,'created_at',b.created_at)
  from tongs.workpiece_brand_bindings b where b.id=p_id $$;

create or replace function tongs.create_brand_profile(p_workspace_id uuid,p_internal_label text,p_rules jsonb,p_operation_id text)
returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_user uuid:=auth.uid(); v_profile uuid:=gen_random_uuid(); v_revision uuid:=gen_random_uuid(); v_hash text; v_validation jsonb;
begin if v_user is null then raise exception 'Not authenticated' using errcode='42501'; end if; perform tongs.assert_workspace_role(p_workspace_id,'editor');
  if length(btrim(coalesce(p_internal_label,'')))=0 then raise exception 'internal label is required' using errcode='22023'; end if;
  if jsonb_typeof(p_rules)<>'object' then raise exception 'rules must be an object' using errcode='22023'; end if;
  v_hash:=tongs.brand_rules_hash(p_rules); v_validation:=jsonb_build_object('valid',true,'bindable',true,'errors','[]'::jsonb,'asset_revision_ids',coalesce(p_rules->'asset_revision_ids','{}'::jsonb));
  insert into tongs.brand_profiles(id,workspace_id,internal_label,created_by,updated_by) values(v_profile,p_workspace_id,btrim(p_internal_label),v_user,v_user);
  insert into tongs.brand_profile_revisions(id,workspace_id,profile_id,revision,rules_json,content_hash,validation_json,verified_at,created_by)
    values(v_revision,p_workspace_id,v_profile,1,jsonb_strip_nulls(p_rules),v_hash,v_validation,now(),v_user);
  return jsonb_build_object('profile_id',v_profile,'profile_revision_id',v_revision,'revision',1,'content_hash',v_hash); end $$;

create or replace function tongs.append_brand_profile_revision(p_workspace_id uuid,p_profile_id uuid,p_rules jsonb,p_operation_id text)
returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_user uuid:=auth.uid(); v_revision int; v_id uuid; v_hash text; v_asset_ids uuid[]; v_errors text[]:='{}'; v_validation jsonb;
begin if v_user is null then raise exception 'Not authenticated' using errcode='42501'; end if; perform tongs.assert_workspace_role(p_workspace_id,'editor');
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_profile_id::text,0));
  if not exists(select 1 from tongs.brand_profiles where id=p_profile_id and workspace_id=p_workspace_id and archived_at is null) then raise exception 'profile unavailable' using errcode='22023'; end if;
  select coalesce(array_agg(value::uuid),'{}') into v_asset_ids from jsonb_each_text(coalesce(p_rules->'asset_revision_ids','{}'::jsonb));
  if exists(select 1 from unnest(v_asset_ids)x left join tongs.brand_asset_revisions ar on ar.id=x where ar.id is null or ar.workspace_id<>p_workspace_id or ar.state<>'ready') then v_errors:=array_append(v_errors,'All referenced asset revisions must be ready and workspace-owned.'); end if;
  v_hash:=tongs.brand_rules_hash(p_rules); select id,revision into v_id,v_revision from tongs.brand_profile_revisions where profile_id=p_profile_id and content_hash=v_hash;
  if v_id is not null then return jsonb_build_object('disposition','existing_revision','profile_revision_id',v_id,'revision',v_revision); end if;
  select coalesce(max(revision),0)+1 into v_revision from tongs.brand_profile_revisions where profile_id=p_profile_id;
  v_id:=gen_random_uuid(); v_validation:=jsonb_build_object('valid',cardinality(v_errors)=0,'bindable',cardinality(v_errors)=0,'errors',to_jsonb(v_errors),'asset_revision_ids',to_jsonb(v_asset_ids));
  insert into tongs.brand_profile_revisions(id,workspace_id,profile_id,revision,rules_json,content_hash,state,eligible_for_new_use,validation_json,verified_at,created_by)
  values(v_id,p_workspace_id,p_profile_id,v_revision,jsonb_strip_nulls(p_rules),v_hash,case when cardinality(v_errors)=0 then 'committed' else 'ineligible' end,cardinality(v_errors)=0,v_validation,now(),v_user);
  return jsonb_build_object('disposition','created_revision','profile_revision_id',v_id,'revision',v_revision,'bindable',cardinality(v_errors)=0,'errors',to_jsonb(v_errors)); end $$;

create or replace function tongs.set_workspace_default_brand_profile(p_workspace_id uuid,p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_user uuid:=auth.uid(); v_revision uuid;
begin if v_user is null then raise exception 'Not authenticated' using errcode='42501'; end if; perform tongs.assert_workspace_role(p_workspace_id,'editor');
  select r.id into v_revision from tongs.brand_profile_revisions r where r.workspace_id=p_workspace_id and r.profile_id=p_profile_id and tongs.brand_revision_is_bindable(p_workspace_id,p_profile_id,r.id) order by r.revision desc limit 1;
  if v_revision is null then raise exception 'Profile has no bindable current revision' using errcode='22023'; end if;
  insert into tongs.workspace_default_brand_profiles(workspace_id,profile_id,selected_by) values(p_workspace_id,p_profile_id,v_user)
    on conflict(workspace_id) do update set profile_id=excluded.profile_id,selected_at=now(),selected_by=v_user;
  return jsonb_build_object('workspace_id',p_workspace_id,'profile_id',p_profile_id,'profile_revision_id',v_revision); end $$;

create or replace function tongs.clear_workspace_default_brand_profile(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path=tongs,public as $$ begin perform tongs.assert_workspace_role(p_workspace_id,'editor'); delete from tongs.workspace_default_brand_profiles where workspace_id=p_workspace_id; return jsonb_build_object('workspace_id',p_workspace_id,'profile_id',null); end $$;

create or replace function tongs.rename_brand_profile(p_workspace_id uuid,p_profile_id uuid,p_internal_label text) returns jsonb
language plpgsql security definer set search_path=tongs,public as $$ begin perform tongs.assert_workspace_role(p_workspace_id,'editor'); update tongs.brand_profiles set internal_label=btrim(p_internal_label),updated_by=auth.uid() where id=p_profile_id and workspace_id=p_workspace_id; return jsonb_build_object('profile_id',p_profile_id,'internal_label',btrim(p_internal_label)); end $$;

create or replace function tongs.reserve_brand_asset_revision(p_workspace_id uuid,p_profile_id uuid,p_asset_id uuid,p_role text,p_internal_label text,p_filename text,p_mime_type text,p_operation_id text,p_operation_fingerprint text)
returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_user uuid:=auth.uid(); v_asset uuid; v_id uuid; v_revision int; v_key text; v_existing tongs.brand_asset_revisions%rowtype;
begin if v_user is null then raise exception 'Not authenticated' using errcode='42501'; end if; perform tongs.assert_workspace_role(p_workspace_id,'editor');
  if not exists(select 1 from tongs.brand_profiles where id=p_profile_id and workspace_id=p_workspace_id and archived_at is null) then raise exception 'profile unavailable' using errcode='22023'; end if;
  select * into v_existing from tongs.brand_asset_revisions where workspace_id=p_workspace_id and operation_id=p_operation_id;
  if found then if v_existing.operation_fingerprint<>p_operation_fingerprint then raise exception 'Operation identity reused with different asset payload.' using errcode='22023'; end if; return to_jsonb(v_existing); end if;
  v_asset:=p_asset_id; if v_asset is null then v_asset:=gen_random_uuid(); insert into tongs.brand_assets(id,workspace_id,profile_id,role,internal_label,created_by) values(v_asset,p_workspace_id,p_profile_id,p_role,btrim(p_internal_label),v_user);
  elsif not exists(select 1 from tongs.brand_assets where id=v_asset and workspace_id=p_workspace_id and profile_id=p_profile_id and role=p_role and archived_at is null) then raise exception 'asset unavailable or role mismatch' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||v_asset::text,0)); select coalesce(max(revision),0)+1 into v_revision from tongs.brand_asset_revisions where asset_id=v_asset;
  v_id:=gen_random_uuid(); v_key:=format('workspaces/%s/assets/branding/%s/%s/r%s/%s',p_workspace_id,p_profile_id,v_asset,v_revision,regexp_replace(p_filename,'[^A-Za-z0-9._-]+','-','g'));
  insert into tongs.brand_asset_revisions(id,workspace_id,asset_id,revision,role,state,storage_key,mime_type,operation_id,operation_fingerprint,created_by)
    values(v_id,p_workspace_id,v_asset,v_revision,p_role,'pending',v_key,p_mime_type,p_operation_id,p_operation_fingerprint,v_user);
  return (select to_jsonb(ar) from tongs.brand_asset_revisions ar where ar.id=v_id); end $$;

create or replace function tongs.finalize_brand_asset_revision(p_workspace_id uuid,p_revision_id uuid,p_operation_id text,p_content_hash text,p_bytes bigint,p_width int default null,p_height int default null,p_duration_ms bigint default null)
returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_row tongs.brand_asset_revisions%rowtype;
begin perform tongs.assert_workspace_role(p_workspace_id,'editor'); select * into v_row from tongs.brand_asset_revisions where id=p_revision_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'asset revision not found' using errcode='P0002'; end if; if v_row.operation_id<>p_operation_id then raise exception 'operation identity mismatch' using errcode='22023'; end if;
  if v_row.state='ready' then if v_row.content_hash<>p_content_hash or v_row.bytes<>p_bytes then raise exception 'ready asset readback mismatch' using errcode='22023'; end if; return to_jsonb(v_row); end if;
  if p_content_hash!~'^[a-f0-9]{64}$' or p_bytes<=0 then raise exception 'verified hash and bytes are required' using errcode='22023'; end if;
  perform set_config('tongs.brand_controlled_transition','on',true); update tongs.brand_asset_revisions set state='ready',content_hash=p_content_hash,bytes=p_bytes,width=p_width,height=p_height,duration_ms=p_duration_ms,ready_at=now() where id=p_revision_id; perform set_config('tongs.brand_controlled_transition','off',true);
  return (select to_jsonb(ar) from tongs.brand_asset_revisions ar where ar.id=p_revision_id); end $$;

create or replace function tongs.set_brand_profile_archived(p_workspace_id uuid,p_profile_id uuid,p_archived boolean,p_clear_default boolean default false,p_replacement_profile_id uuid default null) returns jsonb
language plpgsql security definer set search_path=tongs,public as $$
declare v_is_default boolean;
begin perform tongs.assert_workspace_role(p_workspace_id,'editor'); select exists(select 1 from tongs.workspace_default_brand_profiles where workspace_id=p_workspace_id and profile_id=p_profile_id) into v_is_default;
  if p_archived and v_is_default and not p_clear_default and p_replacement_profile_id is null then raise exception 'Archiving the default requires explicit replacement or clear.' using errcode='22023'; end if;
  if p_archived and v_is_default then if p_replacement_profile_id is not null then perform tongs.set_workspace_default_brand_profile(p_workspace_id,p_replacement_profile_id); else perform tongs.clear_workspace_default_brand_profile(p_workspace_id); end if; end if;
  update tongs.brand_profiles set archived_at=case when p_archived then now() else null end,updated_by=auth.uid() where id=p_profile_id and workspace_id=p_workspace_id;
  return jsonb_build_object('profile_id',p_profile_id,'archived',p_archived); end $$;

create or replace function tongs.resolve_workpiece_brand_default(p_workspace_id uuid,p_workpiece_id uuid,p_operation_id text,p_operation_fingerprint text)
returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_user uuid:=auth.uid(); v_current tongs.workpiece_brand_bindings%rowtype; v_default uuid; v_revision tongs.brand_profile_revisions%rowtype; v_id uuid; v_result jsonb; v_assets uuid[];
begin if v_user is null then raise exception 'Not authenticated' using errcode='42501'; end if; perform tongs.assert_workspace_role(p_workspace_id,'editor');
  if not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id) then raise exception 'workpiece does not belong to workspace' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_workpiece_id::text||':brand',0));
  select * into v_current from tongs.workpiece_brand_bindings where workpiece_id=p_workpiece_id order by revision desc limit 1;
  if found then return jsonb_build_object('disposition','existing_binding','binding',tongs.brand_binding_json(v_current.id)); end if;
  select profile_id into v_default from tongs.workspace_default_brand_profiles where workspace_id=p_workspace_id;
  if v_default is not null then select * into v_revision from tongs.brand_profile_revisions r where r.profile_id=v_default and tongs.brand_revision_is_bindable(p_workspace_id,v_default,r.id) order by revision desc limit 1; end if;
  v_id:=gen_random_uuid();
  if v_revision.id is null then
    insert into tongs.workpiece_brand_bindings(id,workspace_id,workpiece_id,revision,state,mutation_reason,operation_id,operation_fingerprint,created_by) values(v_id,p_workspace_id,p_workpiece_id,1,'disabled','resolve_default',p_operation_id,p_operation_fingerprint,v_user);
  else select coalesce(array_agg(value::uuid),'{}') into v_assets from jsonb_each_text(coalesce(v_revision.rules_json->'asset_revision_ids','{}'::jsonb));
    insert into tongs.workpiece_brand_bindings(id,workspace_id,workpiece_id,revision,state,profile_id,profile_revision_id,profile_revision,profile_content_hash,asset_revision_ids,mutation_reason,operation_id,operation_fingerprint,created_by)
      values(v_id,p_workspace_id,p_workpiece_id,1,'profile',v_default,v_revision.id,v_revision.revision,v_revision.content_hash,v_assets,'resolve_default',p_operation_id,p_operation_fingerprint,v_user); end if;
  v_result:=jsonb_build_object('disposition','created_binding','binding',tongs.brand_binding_json(v_id));
  insert into tongs.workpiece_brand_binding_operations(workspace_id,workpiece_id,operation_id,operation_fingerprint,intent,disposition,binding_id,result_json,created_by) values(p_workspace_id,p_workpiece_id,p_operation_id,p_operation_fingerprint,'resolve_default','created_binding',v_id,v_result,v_user);
  return v_result; end $$;

create or replace function tongs.mutate_workpiece_brand_binding(p_workspace_id uuid,p_workpiece_id uuid,p_intent text,p_operation_id text,p_operation_fingerprint text,p_expected_current_revision int,p_profile_id uuid default null,p_profile_revision_id uuid default null)
returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_user uuid:=auth.uid(); v_op tongs.workpiece_brand_binding_operations%rowtype; v_current tongs.workpiece_brand_bindings%rowtype; v_target tongs.brand_profile_revisions%rowtype; v_id uuid; v_result jsonb; v_assets uuid[];
begin if v_user is null then raise exception 'Not authenticated' using errcode='42501'; end if; perform tongs.assert_workspace_role(p_workspace_id,'editor');
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_workpiece_id::text||':brand',0));
  select * into v_op from tongs.workpiece_brand_binding_operations where workspace_id=p_workspace_id and operation_id=p_operation_id;
  if found then if v_op.operation_fingerprint<>p_operation_fingerprint then raise exception 'Operation identity was reused with a different payload.' using errcode='22023'; end if; return v_op.result_json; end if;
  select * into v_current from tongs.workpiece_brand_bindings where workpiece_id=p_workpiece_id order by revision desc limit 1;
  if v_current.id is null or v_current.revision<>p_expected_current_revision then v_result:=jsonb_build_object('disposition','revision_conflict','binding',case when v_current.id is null then null else tongs.brand_binding_json(v_current.id) end,'current_revision',v_current.revision,'message','Expected binding revision is stale.');
  elsif p_intent='disable' and v_current.state='disabled' then v_result:=jsonb_build_object('disposition','no_change','binding',tongs.brand_binding_json(v_current.id),'current_revision',v_current.revision);
  else
    if p_intent='update_to_current_profile_revision' then p_profile_id:=v_current.profile_id; select * into v_target from tongs.brand_profile_revisions r where r.profile_id=p_profile_id and tongs.brand_revision_is_bindable(p_workspace_id,p_profile_id,r.id) order by revision desc limit 1;
    elsif p_intent='select_profile_revision' then select * into v_target from tongs.brand_profile_revisions where id=p_profile_revision_id and profile_id=p_profile_id;
    elsif p_intent<>'disable' then raise exception 'Unsupported brand binding intent' using errcode='22023'; end if;
    if p_intent<>'disable' and (v_target.id is null or not tongs.brand_revision_is_bindable(p_workspace_id,p_profile_id,v_target.id)) then v_result:=jsonb_build_object('disposition','target_not_bindable','binding',tongs.brand_binding_json(v_current.id),'current_revision',v_current.revision,'message','Target profile revision is not bindable.');
    elsif p_intent<>'disable' and v_current.state='profile' and v_current.profile_revision_id=v_target.id then v_result:=jsonb_build_object('disposition','no_change','binding',tongs.brand_binding_json(v_current.id),'current_revision',v_current.revision);
    else v_id:=gen_random_uuid();
      if p_intent='disable' then insert into tongs.workpiece_brand_bindings(id,workspace_id,workpiece_id,revision,state,mutation_reason,operation_id,operation_fingerprint,previous_binding_id,created_by) values(v_id,p_workspace_id,p_workpiece_id,v_current.revision+1,'disabled','disable',p_operation_id,p_operation_fingerprint,v_current.id,v_user);
      else select coalesce(array_agg(value::uuid),'{}') into v_assets from jsonb_each_text(coalesce(v_target.rules_json->'asset_revision_ids','{}'::jsonb)); insert into tongs.workpiece_brand_bindings(id,workspace_id,workpiece_id,revision,state,profile_id,profile_revision_id,profile_revision,profile_content_hash,asset_revision_ids,mutation_reason,operation_id,operation_fingerprint,previous_binding_id,created_by) values(v_id,p_workspace_id,p_workpiece_id,v_current.revision+1,'profile',p_profile_id,v_target.id,v_target.revision,v_target.content_hash,v_assets,p_intent,p_operation_id,p_operation_fingerprint,v_current.id,v_user); end if;
      v_result:=jsonb_build_object('disposition','created_revision','binding',tongs.brand_binding_json(v_id),'current_revision',v_current.revision+1); end if; end if;
  insert into tongs.workpiece_brand_binding_operations(workspace_id,workpiece_id,operation_id,operation_fingerprint,intent,disposition,binding_id,result_json,created_by) values(p_workspace_id,p_workpiece_id,p_operation_id,p_operation_fingerprint,p_intent,v_result->>'disposition',coalesce(v_id,v_current.id),v_result,v_user);
  return v_result; end $$;

create or replace function tongs.list_workspace_brand_library(p_workspace_id uuid,p_include_archived boolean default false) returns jsonb
language plpgsql security definer set search_path=tongs,public as $$ begin perform tongs.assert_workspace_role(p_workspace_id,'viewer'); return jsonb_build_object(
  'profiles',coalesce((select jsonb_agg(to_jsonb(x) order by x.internal_label) from (select p.*,d.profile_id is not null is_default from tongs.brand_profiles p left join tongs.workspace_default_brand_profiles d on d.workspace_id=p.workspace_id and d.profile_id=p.id where p.workspace_id=p_workspace_id and (p_include_archived or p.archived_at is null))x),'[]'::jsonb),
  'revisions',coalesce((select jsonb_agg(to_jsonb(r) order by r.profile_id,r.revision desc) from tongs.brand_profile_revisions r where r.workspace_id=p_workspace_id),'[]'::jsonb),
  'assets',coalesce((select jsonb_agg(to_jsonb(a)) from tongs.brand_assets a where a.workspace_id=p_workspace_id),'[]'::jsonb),
  'asset_revisions',coalesce((select jsonb_agg(to_jsonb(ar) order by ar.asset_id,ar.revision desc) from tongs.brand_asset_revisions ar where ar.workspace_id=p_workspace_id),'[]'::jsonb)); end $$;

create or replace function tongs.get_workpiece_brand_binding(p_workspace_id uuid,p_workpiece_id uuid) returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_id uuid; begin perform tongs.assert_workspace_role(p_workspace_id,'viewer'); select id into v_id from tongs.workpiece_brand_bindings where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id order by revision desc limit 1; return case when v_id is null then null else tongs.brand_binding_json(v_id) end; end $$;

-- Existing thumbnail templates become revision-1 Brand Profiles. Lifecycle/default are kept outside content hashes.
insert into tongs.brand_profiles(id,workspace_id,internal_label,legacy_template_id,archived_at,created_at,updated_at,created_by,updated_by)
select gen_random_uuid(),workspace_id,name,id,archived_at,created_at,updated_at,updated_by,updated_by from tongs.workspace_thumbnail_brand_templates on conflict(workspace_id,legacy_template_id) do nothing;
insert into tongs.brand_profile_revisions(workspace_id,profile_id,revision,rules_json,content_hash,state,eligible_for_new_use,validation_json,verified_at,created_at,created_by)
select p.workspace_id,p.id,1,jsonb_build_object('public_identity',jsonb_build_object('program_name',p.internal_label,'tagline',null),'palette',jsonb_build_object('primary','#111827','secondary','#F8FAFC','accent','#F97316'),'typography',jsonb_build_object('heading_family',coalesce(t.template_json#>>'{title_style,font_preset}','bold_sans'),'body_family','sans-serif','heading_weight',700,'body_weight',400),'logo',jsonb_build_object('placement',coalesce(t.template_json#>>'{layout,title_position}','bottom_right'),'watermark_opacity',0.7),'audio',jsonb_build_object('music_volume',0.2,'ducking',0.35),'asset_revision_ids','{}'::jsonb),
  tongs.brand_rules_hash(jsonb_build_object('public_identity',jsonb_build_object('program_name',p.internal_label,'tagline',null),'palette',jsonb_build_object('primary','#111827','secondary','#F8FAFC','accent','#F97316'),'typography',jsonb_build_object('heading_family',coalesce(t.template_json#>>'{title_style,font_preset}','bold_sans'),'body_family','sans-serif','heading_weight',700,'body_weight',400),'logo',jsonb_build_object('placement',coalesce(t.template_json#>>'{layout,title_position}','bottom_right'),'watermark_opacity',0.7),'audio',jsonb_build_object('music_volume',0.2,'ducking',0.35),'asset_revision_ids','{}'::jsonb)),
  case when p.archived_at is null then 'committed' else 'archived' end,p.archived_at is null,jsonb_build_object('valid',true,'bindable',p.archived_at is null,'errors','[]'::jsonb,'asset_revision_ids','[]'::jsonb),now(),p.created_at,p.created_by
from tongs.brand_profiles p join tongs.workspace_thumbnail_brand_templates t on t.id=p.legacy_template_id where not exists(select 1 from tongs.brand_profile_revisions r where r.profile_id=p.id);
insert into tongs.workspace_default_brand_profiles(workspace_id,profile_id,selected_at,selected_by)
select t.workspace_id,p.id,t.updated_at,t.updated_by from tongs.workspace_thumbnail_brand_templates t join tongs.brand_profiles p on p.legacy_template_id=t.id and p.workspace_id=t.workspace_id join tongs.brand_profile_revisions r on r.profile_id=p.id and r.revision=1
where t.is_default and t.archived_at is null and tongs.brand_revision_is_bindable(t.workspace_id,p.id,r.id) on conflict(workspace_id) do nothing;

do $$ declare t text; begin foreach t in array array['brand_profiles','brand_assets','brand_asset_revisions','brand_profile_revisions','workspace_default_brand_profiles','workpiece_brand_bindings','workpiece_brand_binding_operations'] loop
 execute format('alter table tongs.%I enable row level security',t);
 execute format('create policy %I on tongs.%I for select to authenticated using (tongs.has_workspace_role(workspace_id,''viewer''))',t||'_select',t);
 execute format('grant select on tongs.%I to authenticated',t); execute format('grant all on tongs.%I to service_role',t); end loop; end $$;
create policy brand_profiles_write on tongs.brand_profiles for all to authenticated using(tongs.has_workspace_role(workspace_id,'editor')) with check(tongs.has_workspace_role(workspace_id,'editor') and updated_by=auth.uid());
create policy brand_assets_write on tongs.brand_assets for insert to authenticated with check(tongs.has_workspace_role(workspace_id,'editor') and created_by=auth.uid());
create policy brand_asset_revisions_write on tongs.brand_asset_revisions for insert to authenticated with check(tongs.has_workspace_role(workspace_id,'editor') and created_by=auth.uid());

revoke all on function tongs.create_brand_profile(uuid,text,jsonb,text),tongs.append_brand_profile_revision(uuid,uuid,jsonb,text),tongs.set_workspace_default_brand_profile(uuid,uuid),tongs.clear_workspace_default_brand_profile(uuid),tongs.rename_brand_profile(uuid,uuid,text),tongs.reserve_brand_asset_revision(uuid,uuid,uuid,text,text,text,text,text,text),tongs.finalize_brand_asset_revision(uuid,uuid,text,text,bigint,int,int,bigint),tongs.set_brand_profile_archived(uuid,uuid,boolean,boolean,uuid),tongs.resolve_workpiece_brand_default(uuid,uuid,text,text),tongs.mutate_workpiece_brand_binding(uuid,uuid,text,text,text,int,uuid,uuid),tongs.list_workspace_brand_library(uuid,boolean),tongs.get_workpiece_brand_binding(uuid,uuid) from public;
grant execute on function tongs.create_brand_profile(uuid,text,jsonb,text),tongs.append_brand_profile_revision(uuid,uuid,jsonb,text),tongs.set_workspace_default_brand_profile(uuid,uuid),tongs.clear_workspace_default_brand_profile(uuid),tongs.rename_brand_profile(uuid,uuid,text),tongs.reserve_brand_asset_revision(uuid,uuid,uuid,text,text,text,text,text,text),tongs.finalize_brand_asset_revision(uuid,uuid,text,text,bigint,int,int,bigint),tongs.set_brand_profile_archived(uuid,uuid,boolean,boolean,uuid),tongs.resolve_workpiece_brand_default(uuid,uuid,text,text),tongs.mutate_workpiece_brand_binding(uuid,uuid,text,text,text,int,uuid,uuid),tongs.list_workspace_brand_library(uuid,boolean),tongs.get_workpiece_brand_binding(uuid,uuid) to authenticated,service_role;
commit;
