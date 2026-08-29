-- Durable, replay-safe Thumbnail V3 brand setup authority.
begin;

create table tongs.thumbnail_brand_setup_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  operation_id uuid not null,
  operation_fingerprint text not null check(operation_fingerprint~'^[a-f0-9]{64}$'),
  state text not null default 'pending' check(state in('pending','asset_ready','profile_committed','binding_committed','verified')),
  failed_stage text null check(failed_stage is null or failed_stage in('asset_ready','profile_committed','binding_committed','verified')),
  failure_code text null,
  failure_message text null,
  logo_role text not null check(logo_role in('transparent_logo','primary_logo','watermark_logo')),
  requested_rules_json jsonb not null check(jsonb_typeof(requested_rules_json)='object'),
  logo_asset_revision_id uuid not null references tongs.brand_asset_revisions(id),
  logo_content_hash text null check(logo_content_hash is null or logo_content_hash~'^[a-f0-9]{64}$'),
  storage_bucket text not null,
  storage_key text not null,
  profile_id uuid not null references tongs.brand_profiles(id),
  profile_revision_id uuid null references tongs.brand_profile_revisions(id),
  profile_revision int null,
  profile_content_hash text null check(profile_content_hash is null or profile_content_hash~'^[a-f0-9]{64}$'),
  expected_binding_revision int not null check(expected_binding_revision>=0),
  previous_binding_id uuid null references tongs.workpiece_brand_bindings(id),
  previous_binding_revision int null,
  resulting_binding_id uuid null references tongs.workpiece_brand_bindings(id),
  resulting_binding_revision int null,
  prior_candidate_set_id uuid null references tongs.thumbnail_candidate_sets(id),
  prior_candidate_set_revision int null,
  prior_candidate_count int not null default 0,
  prior_candidate_content_hash text null,
  prior_thumbnail_count int not null default 0,
  prior_thumbnail_identity_hash text not null check(prior_thumbnail_identity_hash~'^[a-f0-9]{64}$'),
  resolved_style_source text null check(resolved_style_source is null or resolved_style_source='brand_profile'),
  renderer_verified_logo_revision_id uuid null references tongs.brand_asset_revisions(id),
  renderer_verified_storage_bucket text null,
  renderer_verified_storage_key text null,
  receipt_json jsonb null check(receipt_json is null or jsonb_typeof(receipt_json)='object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,operation_id),
  constraint thumbnail_brand_setup_failure_shape check(
    (failed_stage is null and failure_code is null and failure_message is null)
    or (failed_stage is not null and failure_code is not null and failure_message is not null)
  ),
  constraint thumbnail_brand_setup_stage_shape check(
    (state='pending' and logo_content_hash is null and profile_revision_id is null and resulting_binding_id is null and receipt_json is null)
    or (state='asset_ready' and logo_content_hash is not null and profile_revision_id is null and resulting_binding_id is null and receipt_json is null)
    or (state='profile_committed' and logo_content_hash is not null and profile_revision_id is not null and profile_revision is not null and profile_content_hash is not null and resulting_binding_id is null and receipt_json is null)
    or (state='binding_committed' and logo_content_hash is not null and profile_revision_id is not null and resulting_binding_id is not null and resulting_binding_revision is not null and receipt_json is null)
    or (state='verified' and logo_content_hash is not null and profile_revision_id is not null and resulting_binding_id is not null and resolved_style_source='brand_profile' and renderer_verified_logo_revision_id is not null and renderer_verified_storage_bucket is not null and renderer_verified_storage_key is not null and receipt_json is not null and failed_stage is null)
  )
);

create index thumbnail_brand_setup_workpiece_idx on tongs.thumbnail_brand_setup_operations(workspace_id,workpiece_id,created_at desc);
alter table tongs.thumbnail_brand_setup_operations enable row level security;
create policy thumbnail_brand_setup_select on tongs.thumbnail_brand_setup_operations for select to authenticated
  using(tongs.has_workspace_role(workspace_id,'viewer'));
grant select on tongs.thumbnail_brand_setup_operations to authenticated;
grant all on tongs.thumbnail_brand_setup_operations to service_role;
revoke insert,update,delete on tongs.thumbnail_brand_setup_operations from authenticated;

create or replace function tongs.reject_thumbnail_brand_setup_direct_mutation() returns trigger
language plpgsql set search_path=pg_catalog,tongs as $$
begin
  if tg_op='UPDATE' and (new.operation_id<>old.operation_id or new.operation_fingerprint<>old.operation_fingerprint
    or new.workspace_id<>old.workspace_id or new.workpiece_id<>old.workpiece_id or new.created_by<>old.created_by) then
    raise exception 'Thumbnail brand setup operation identity is immutable.' using errcode='55000';
  end if;
  if old.state='verified' then raise exception 'Verified thumbnail brand setup receipts are terminal and immutable.' using errcode='55000';end if;
  if current_setting('tongs.thumbnail_brand_setup_transition',true)='on' then return case when tg_op='DELETE' then old else new end; end if;
  raise exception 'Thumbnail brand setup operations may only change through canonical RPCs.' using errcode='55000';
end $$;
create trigger trg_thumbnail_brand_setup_controlled before update or delete on tongs.thumbnail_brand_setup_operations
for each row execute function tongs.reject_thumbnail_brand_setup_direct_mutation();

create or replace function tongs.thumbnail_brand_setup_json(p_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,tongs as $$
  select to_jsonb(o)-'requested_rules_json' from tongs.thumbnail_brand_setup_operations o where o.id=p_id
$$;

create or replace function tongs.thumbnail_brand_setup_asset_hash(p_workspace_id uuid,p_workpiece_id uuid) returns text
language sql stable security definer set search_path=pg_catalog,tongs as $$
  select encode(extensions.digest(convert_to(coalesce(jsonb_agg(jsonb_build_array(a.id,a.asset_kind,a.status,a.content_hash,a.storage_bucket,a.storage_key) order by a.id),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')
  from tongs.assets a where a.workspace_id=p_workspace_id and a.workpiece_id=p_workpiece_id and a.asset_kind in('thumbnail_image','thumbnail_composite')
$$;

create or replace function tongs.begin_thumbnail_brand_setup(
  p_workspace_id uuid,p_workpiece_id uuid,p_operation_id uuid,p_operation_fingerprint text,p_profile_id uuid,
  p_asset_id uuid,p_logo_role text,p_internal_label text,p_filename text,p_mime_type text,p_requested_rules jsonb,p_expected_binding_revision int
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_user uuid:=auth.uid();v_existing tongs.thumbnail_brand_setup_operations%rowtype;v_asset uuid;v_asset_revision tongs.brand_asset_revisions%rowtype;
 v_asset_revision_number int;v_key text;v_binding tongs.workpiece_brand_bindings%rowtype;v_set tongs.thumbnail_candidate_sets%rowtype;v_id uuid:=gen_random_uuid();
begin
 if v_user is null then raise exception 'Not authenticated' using errcode='42501';end if;perform tongs.assert_workspace_role(p_workspace_id,'editor');
 if p_operation_fingerprint!~'^[a-f0-9]{64}$' then raise exception 'Invalid operation fingerprint' using errcode='22023';end if;
 if p_logo_role not in('transparent_logo','primary_logo','watermark_logo') then raise exception 'Unsupported thumbnail logo role' using errcode='22023';end if;
 if jsonb_typeof(p_requested_rules)<>'object' then raise exception 'Brand rules must be an object' using errcode='22023';end if;
 if not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id) then raise exception 'Workpiece does not belong to workspace' using errcode='22023';end if;
 if not exists(select 1 from tongs.brand_profiles where id=p_profile_id and workspace_id=p_workspace_id and archived_at is null) then raise exception 'Profile unavailable' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_operation_id::text||':thumbnail-brand-setup',0));
 select * into v_existing from tongs.thumbnail_brand_setup_operations where workspace_id=p_workspace_id and operation_id=p_operation_id;
 if found then if v_existing.operation_fingerprint<>p_operation_fingerprint then raise exception 'Operation identity was reused with a different payload.' using errcode='22023';end if;return tongs.thumbnail_brand_setup_json(v_existing.id);end if;
 select * into v_binding from tongs.workpiece_brand_bindings where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id order by revision desc limit 1;
 if coalesce(v_binding.revision,0)<>p_expected_binding_revision then raise exception 'Expected binding revision is stale.' using errcode='40001';end if;
 select * into v_set from tongs.thumbnail_candidate_sets where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id order by revision desc limit 1;
 v_asset:=p_asset_id;
 if v_asset is null then v_asset:=gen_random_uuid();insert into tongs.brand_assets(id,workspace_id,profile_id,role,internal_label,created_by)values(v_asset,p_workspace_id,p_profile_id,p_logo_role,btrim(p_internal_label),v_user);
 elsif not exists(select 1 from tongs.brand_assets where id=v_asset and workspace_id=p_workspace_id and profile_id=p_profile_id and role=p_logo_role and archived_at is null) then raise exception 'Asset unavailable or role mismatch' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||v_asset::text,0));
 select coalesce(max(revision),0)+1 into v_asset_revision_number from tongs.brand_asset_revisions where asset_id=v_asset;
 v_key:=format('workspaces/%s/assets/branding/%s/%s/r%s/%s',p_workspace_id,p_profile_id,v_asset,v_asset_revision_number,regexp_replace(p_filename,'[^A-Za-z0-9._-]+','-','g'));
 insert into tongs.brand_asset_revisions(workspace_id,asset_id,revision,role,state,storage_key,mime_type,operation_id,operation_fingerprint,created_by)
 values(p_workspace_id,v_asset,v_asset_revision_number,p_logo_role,'pending',v_key,p_mime_type,p_operation_id::text,p_operation_fingerprint,v_user) returning * into v_asset_revision;
 insert into tongs.thumbnail_brand_setup_operations(id,workspace_id,workpiece_id,operation_id,operation_fingerprint,state,logo_role,requested_rules_json,logo_asset_revision_id,storage_bucket,storage_key,profile_id,expected_binding_revision,previous_binding_id,previous_binding_revision,prior_candidate_set_id,prior_candidate_set_revision,prior_candidate_count,prior_candidate_content_hash,prior_thumbnail_count,prior_thumbnail_identity_hash,created_by)
 values(v_id,p_workspace_id,p_workpiece_id,p_operation_id,p_operation_fingerprint,'pending',p_logo_role,p_requested_rules,v_asset_revision.id,v_asset_revision.storage_bucket,v_asset_revision.storage_key,p_profile_id,p_expected_binding_revision,v_binding.id,v_binding.revision,v_set.id,v_set.revision,coalesce(v_set.candidate_count,0),v_set.content_hash,(select count(*) from tongs.assets where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and asset_kind in('thumbnail_image','thumbnail_composite')),tongs.thumbnail_brand_setup_asset_hash(p_workspace_id,p_workpiece_id),v_user);
 return tongs.thumbnail_brand_setup_json(v_id);
end $$;

create or replace function tongs.mark_thumbnail_brand_asset_ready(
 p_workspace_id uuid,p_operation_id uuid,p_operation_fingerprint text,p_actor_id uuid,p_content_hash text,p_bytes bigint,p_width int default null,p_height int default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.thumbnail_brand_setup_operations%rowtype;v_asset tongs.brand_asset_revisions%rowtype;
begin if not exists(select 1 from tongs.workspace_members where workspace_id=p_workspace_id and user_id=p_actor_id and tongs.workspace_role_rank(role)>=tongs.workspace_role_rank('editor')) then raise exception 'Insufficient workspace role (requires editor)' using errcode='42501';end if;select * into v_op from tongs.thumbnail_brand_setup_operations where workspace_id=p_workspace_id and operation_id=p_operation_id for update;
 if not found then raise exception 'Thumbnail brand setup operation not found' using errcode='P0002';end if;if v_op.operation_fingerprint<>p_operation_fingerprint then raise exception 'Operation identity was reused with a different payload.' using errcode='22023';end if;
 if v_op.state<>'pending' then return tongs.thumbnail_brand_setup_json(v_op.id);end if;
 select * into v_asset from tongs.brand_asset_revisions where id=v_op.logo_asset_revision_id for update;
 if v_asset.state='ready' and (v_asset.content_hash<>p_content_hash or v_asset.bytes<>p_bytes) then raise exception 'Ready asset readback mismatch' using errcode='22023';end if;
 if v_asset.state<>'ready' then
  if p_content_hash!~'^[a-f0-9]{64}$' or p_bytes<=0 then raise exception 'Verified hash and bytes are required' using errcode='22023';end if;
  perform set_config('tongs.brand_controlled_transition','on',true);update tongs.brand_asset_revisions set state='ready',content_hash=p_content_hash,bytes=p_bytes,width=p_width,height=p_height,ready_at=now(),failure_message=null where id=v_asset.id;perform set_config('tongs.brand_controlled_transition','off',true);
 end if;
 perform set_config('tongs.thumbnail_brand_setup_transition','on',true);update tongs.thumbnail_brand_setup_operations set state='asset_ready',logo_content_hash=p_content_hash,failed_stage=null,failure_code=null,failure_message=null,updated_at=now() where id=v_op.id;perform set_config('tongs.thumbnail_brand_setup_transition','off',true);
 return tongs.thumbnail_brand_setup_json(v_op.id);
end $$;

create or replace function tongs.commit_thumbnail_brand_profile_stage(p_workspace_id uuid,p_operation_id uuid,p_operation_fingerprint text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.thumbnail_brand_setup_operations%rowtype;v_rules jsonb;v_result jsonb;v_revision tongs.brand_profile_revisions%rowtype;
begin perform tongs.assert_workspace_role(p_workspace_id,'editor');select * into v_op from tongs.thumbnail_brand_setup_operations where workspace_id=p_workspace_id and operation_id=p_operation_id for update;
 if not found then raise exception 'Thumbnail brand setup operation not found' using errcode='P0002';end if;if v_op.operation_fingerprint<>p_operation_fingerprint then raise exception 'Operation identity was reused with a different payload.' using errcode='22023';end if;
 if v_op.state in('profile_committed','binding_committed','verified') then return tongs.thumbnail_brand_setup_json(v_op.id);end if;if v_op.state<>'asset_ready' then raise exception 'Asset stage is incomplete' using errcode='55000';end if;
 v_rules:=jsonb_strip_nulls(jsonb_set(v_op.requested_rules_json,'{asset_revision_ids}',
  (coalesce(v_op.requested_rules_json->'asset_revision_ids','{}'::jsonb)-array['transparent_logo','primary_logo','watermark_logo'])
  ||jsonb_build_object(v_op.logo_role,v_op.logo_asset_revision_id),true));
 v_result:=tongs.append_brand_profile_revision(p_workspace_id,v_op.profile_id,v_rules,p_operation_id::text);
 select * into v_revision from tongs.brand_profile_revisions where id=(v_result->>'profile_revision_id')::uuid;
 if v_revision.id is null or not tongs.brand_revision_is_bindable(p_workspace_id,v_op.profile_id,v_revision.id) then
  perform set_config('tongs.thumbnail_brand_setup_transition','on',true);update tongs.thumbnail_brand_setup_operations set failed_stage='profile_committed',failure_code='profile_not_bindable',failure_message='The committed profile revision is not bindable.',updated_at=now() where id=v_op.id;perform set_config('tongs.thumbnail_brand_setup_transition','off',true);return tongs.thumbnail_brand_setup_json(v_op.id);
 end if;
 perform set_config('tongs.thumbnail_brand_setup_transition','on',true);update tongs.thumbnail_brand_setup_operations set state='profile_committed',profile_revision_id=v_revision.id,profile_revision=v_revision.revision,profile_content_hash=v_revision.content_hash,failed_stage=null,failure_code=null,failure_message=null,updated_at=now() where id=v_op.id;perform set_config('tongs.thumbnail_brand_setup_transition','off',true);
 return tongs.thumbnail_brand_setup_json(v_op.id);
end $$;

create or replace function tongs.commit_thumbnail_brand_binding_stage(p_workspace_id uuid,p_operation_id uuid,p_operation_fingerprint text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.thumbnail_brand_setup_operations%rowtype;v_current tongs.workpiece_brand_bindings%rowtype;v_target tongs.brand_profile_revisions%rowtype;v_binding tongs.workpiece_brand_bindings%rowtype;v_assets uuid[];
begin perform tongs.assert_workspace_role(p_workspace_id,'editor');perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_operation_id::text||':thumbnail-brand-setup',0));select * into v_op from tongs.thumbnail_brand_setup_operations where workspace_id=p_workspace_id and operation_id=p_operation_id for update;
 if not found then raise exception 'Thumbnail brand setup operation not found' using errcode='P0002';end if;if v_op.operation_fingerprint<>p_operation_fingerprint then raise exception 'Operation identity was reused with a different payload.' using errcode='22023';end if;
 if v_op.state in('binding_committed','verified') then return tongs.thumbnail_brand_setup_json(v_op.id);end if;if v_op.state<>'profile_committed' then raise exception 'Profile stage is incomplete' using errcode='55000';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||v_op.workpiece_id::text||':brand',0));select * into v_current from tongs.workpiece_brand_bindings where workspace_id=p_workspace_id and workpiece_id=v_op.workpiece_id order by revision desc limit 1;
 if coalesce(v_current.revision,0)<>v_op.expected_binding_revision then perform set_config('tongs.thumbnail_brand_setup_transition','on',true);update tongs.thumbnail_brand_setup_operations set failed_stage='binding_committed',failure_code='revision_conflict',failure_message='Expected binding revision is stale.',updated_at=now() where id=v_op.id;perform set_config('tongs.thumbnail_brand_setup_transition','off',true);return tongs.thumbnail_brand_setup_json(v_op.id);end if;
 select * into v_target from tongs.brand_profile_revisions where id=v_op.profile_revision_id;if not tongs.brand_revision_is_bindable(p_workspace_id,v_op.profile_id,v_target.id) then perform set_config('tongs.thumbnail_brand_setup_transition','on',true);update tongs.thumbnail_brand_setup_operations set failed_stage='binding_committed',failure_code='target_not_bindable',failure_message='Target profile revision is not bindable.',updated_at=now() where id=v_op.id;perform set_config('tongs.thumbnail_brand_setup_transition','off',true);return tongs.thumbnail_brand_setup_json(v_op.id);end if;
 select coalesce(array_agg(value::uuid),'{}') into v_assets from jsonb_each_text(coalesce(v_target.rules_json->'asset_revision_ids','{}'::jsonb));
 insert into tongs.workpiece_brand_bindings(workspace_id,workpiece_id,revision,state,profile_id,profile_revision_id,profile_revision,profile_content_hash,asset_revision_ids,mutation_reason,operation_id,operation_fingerprint,previous_binding_id,created_by)
 values(p_workspace_id,v_op.workpiece_id,coalesce(v_current.revision,0)+1,'profile',v_op.profile_id,v_target.id,v_target.revision,v_target.content_hash,v_assets,'select_profile_revision',p_operation_id::text||':binding',p_operation_fingerprint,v_current.id,auth.uid()) returning * into v_binding;
 perform set_config('tongs.thumbnail_brand_setup_transition','on',true);update tongs.thumbnail_brand_setup_operations set state='binding_committed',resulting_binding_id=v_binding.id,resulting_binding_revision=v_binding.revision,failed_stage=null,failure_code=null,failure_message=null,updated_at=now() where id=v_op.id;perform set_config('tongs.thumbnail_brand_setup_transition','off',true);
 return tongs.thumbnail_brand_setup_json(v_op.id);
end $$;

create or replace function tongs.verify_thumbnail_brand_setup(p_workspace_id uuid,p_operation_id uuid,p_operation_fingerprint text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.thumbnail_brand_setup_operations%rowtype;v_asset tongs.brand_asset_revisions%rowtype;v_revision tongs.brand_profile_revisions%rowtype;v_binding tongs.workpiece_brand_bindings%rowtype;v_set tongs.thumbnail_candidate_sets%rowtype;v_count int;v_thumbnail_count int;v_thumbnail_hash text;v_receipt jsonb;
begin if not exists(select 1 from tongs.workspace_members where workspace_id=p_workspace_id and user_id=p_actor_id and tongs.workspace_role_rank(role)>=tongs.workspace_role_rank('editor')) then raise exception 'Insufficient workspace role (requires editor)' using errcode='42501';end if;select * into v_op from tongs.thumbnail_brand_setup_operations where workspace_id=p_workspace_id and operation_id=p_operation_id for update;
 if not found then raise exception 'Thumbnail brand setup operation not found' using errcode='P0002';end if;if v_op.operation_fingerprint<>p_operation_fingerprint then raise exception 'Operation identity was reused with a different payload.' using errcode='22023';end if;if v_op.state='verified' then return v_op.receipt_json;end if;if v_op.state<>'binding_committed' then raise exception 'Binding stage is incomplete' using errcode='55000';end if;
 select * into v_asset from tongs.brand_asset_revisions where id=v_op.logo_asset_revision_id;select * into v_revision from tongs.brand_profile_revisions where id=v_op.profile_revision_id;select * into v_binding from tongs.workpiece_brand_bindings where workspace_id=p_workspace_id and workpiece_id=v_op.workpiece_id order by revision desc limit 1;select * into v_set from tongs.thumbnail_candidate_sets where workspace_id=p_workspace_id and workpiece_id=v_op.workpiece_id order by revision desc limit 1;select count(*) into v_count from tongs.thumbnail_candidate_set_members where candidate_set_id=v_set.id;select count(*) into v_thumbnail_count from tongs.assets where workspace_id=p_workspace_id and workpiece_id=v_op.workpiece_id and asset_kind in('thumbnail_image','thumbnail_composite');v_thumbnail_hash:=tongs.thumbnail_brand_setup_asset_hash(p_workspace_id,v_op.workpiece_id);
 if v_asset.state<>'ready' or v_asset.role<>v_op.logo_role or v_asset.content_hash<>v_op.logo_content_hash or v_asset.storage_bucket<>v_op.storage_bucket or v_asset.storage_key<>v_op.storage_key or v_revision.id<>v_op.profile_revision_id or v_revision.content_hash<>v_op.profile_content_hash or v_revision.rules_json#>>array['asset_revision_ids',v_op.logo_role]<>v_asset.id::text or v_binding.id<>v_op.resulting_binding_id or v_binding.revision<>v_op.resulting_binding_revision or v_binding.profile_revision_id<>v_revision.id or not(v_op.logo_asset_revision_id=any(v_binding.asset_revision_ids)) or v_set.id is distinct from v_op.prior_candidate_set_id or v_set.revision is distinct from v_op.prior_candidate_set_revision or coalesce(v_set.candidate_count,0)<>v_op.prior_candidate_count or v_set.content_hash is distinct from v_op.prior_candidate_content_hash or coalesce(v_count,0)<>v_op.prior_candidate_count or v_thumbnail_count<>v_op.prior_thumbnail_count or v_thumbnail_hash<>v_op.prior_thumbnail_identity_hash then
  perform set_config('tongs.thumbnail_brand_setup_transition','on',true);update tongs.thumbnail_brand_setup_operations set failed_stage='verified',failure_code='canonical_readback_mismatch',failure_message='Canonical renderer or preservation evidence does not match the setup operation.',updated_at=now() where id=v_op.id;perform set_config('tongs.thumbnail_brand_setup_transition','off',true);return tongs.thumbnail_brand_setup_json(v_op.id);
 end if;
 v_receipt:=jsonb_build_object('schema_version','forge.thumbnail-brand-setup-receipt.v1','operation_id',v_op.operation_id,'workspace_id',p_workspace_id,'workpiece_id',v_op.workpiece_id,'logo',jsonb_build_object('asset_revision_id',v_asset.id,'role',v_asset.role,'content_hash',v_asset.content_hash,'storage_bucket',v_asset.storage_bucket,'storage_key',v_asset.storage_key),'profile',jsonb_build_object('profile_id',v_op.profile_id,'revision_id',v_revision.id,'revision',v_revision.revision,'content_hash',v_revision.content_hash),'binding',jsonb_build_object('id',v_binding.id,'revision',v_binding.revision),'renderer',jsonb_build_object('style_source','brand_profile','logo_asset_revision_id',v_asset.id,'storage_bucket',v_asset.storage_bucket,'storage_key',v_asset.storage_key),'preservation',jsonb_build_object('candidate_set_id',v_set.id,'candidate_set_revision',v_set.revision,'candidate_count',coalesce(v_set.candidate_count,0),'candidate_content_hash',v_set.content_hash,'thumbnail_count',v_thumbnail_count,'thumbnail_identity_hash',v_thumbnail_hash,'existing_thumbnails_unchanged',true,'existing_candidates_unchanged',true),'verified_at',now());
 perform set_config('tongs.thumbnail_brand_setup_transition','on',true);update tongs.thumbnail_brand_setup_operations set state='verified',resolved_style_source='brand_profile',renderer_verified_logo_revision_id=v_asset.id,renderer_verified_storage_bucket=v_asset.storage_bucket,renderer_verified_storage_key=v_asset.storage_key,receipt_json=v_receipt,failed_stage=null,failure_code=null,failure_message=null,updated_at=now() where id=v_op.id;perform set_config('tongs.thumbnail_brand_setup_transition','off',true);
 return v_receipt;
end $$;

create or replace function tongs.get_thumbnail_brand_setup_receipt(p_workspace_id uuid,p_operation_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.thumbnail_brand_setup_operations%rowtype;begin perform tongs.assert_workspace_role(p_workspace_id,'viewer');select * into v_op from tongs.thumbnail_brand_setup_operations where workspace_id=p_workspace_id and operation_id=p_operation_id;if not found then return null;end if;return case when v_op.state='verified' then v_op.receipt_json else tongs.thumbnail_brand_setup_json(v_op.id) end;end $$;

revoke all on function tongs.begin_thumbnail_brand_setup(uuid,uuid,uuid,text,uuid,uuid,text,text,text,text,jsonb,int),tongs.mark_thumbnail_brand_asset_ready(uuid,uuid,text,uuid,text,bigint,int,int),tongs.commit_thumbnail_brand_profile_stage(uuid,uuid,text),tongs.commit_thumbnail_brand_binding_stage(uuid,uuid,text),tongs.verify_thumbnail_brand_setup(uuid,uuid,text,uuid),tongs.get_thumbnail_brand_setup_receipt(uuid,uuid) from public;
revoke all on function tongs.mark_thumbnail_brand_asset_ready(uuid,uuid,text,uuid,text,bigint,int,int),tongs.verify_thumbnail_brand_setup(uuid,uuid,text,uuid) from authenticated;
revoke all on function tongs.thumbnail_brand_setup_json(uuid),tongs.thumbnail_brand_setup_asset_hash(uuid,uuid),tongs.reject_thumbnail_brand_setup_direct_mutation() from public;
grant execute on function tongs.begin_thumbnail_brand_setup(uuid,uuid,uuid,text,uuid,uuid,text,text,text,text,jsonb,int),tongs.commit_thumbnail_brand_profile_stage(uuid,uuid,text),tongs.commit_thumbnail_brand_binding_stage(uuid,uuid,text) to authenticated,service_role;
grant execute on function tongs.mark_thumbnail_brand_asset_ready(uuid,uuid,text,uuid,text,bigint,int,int) to service_role;
grant execute on function tongs.verify_thumbnail_brand_setup(uuid,uuid,text,uuid) to service_role;
grant execute on function tongs.get_thumbnail_brand_setup_receipt(uuid,uuid) to authenticated,service_role;

commit;
