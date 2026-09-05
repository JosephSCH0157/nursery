-- Quench V1 podcast-host boundary. The selected host show is executable;
-- RSS feeds and directory listings are provider-owned outcomes, never destinations.
begin;

alter table tongs.quench_destination_scopes drop constraint quench_destination_scopes_platform_check;
alter table tongs.quench_destination_scopes drop constraint quench_destination_scopes_adapter_id_check;

update tongs.quench_destination_scopes
set scope_key='system:podcast-host:intent-only', platform='podcast_host', adapter_id='forge.transistor'
where platform='rss' and adapter_id='forge.rss';

alter table tongs.quench_destination_scopes add constraint quench_destination_scopes_platform_check
  check(platform in('youtube','podcast_host'));
alter table tongs.quench_destination_scopes add constraint quench_destination_scopes_adapter_id_check
  check(adapter_id in('forge.youtube','forge.transistor'));

-- A previous push may have committed this file before failing to insert its
-- migration-history row (the original timestamp collided with another file).
-- Reuse only an exact immutable seed; never overwrite conflicting authority.
do $capability_seed$
declare
  caps jsonb := '{"provider":"transistor","audio_upload":true,"episode_draft_create":true,"episode_publish":true,"episode_schedule":true,"supports_experiment_intent":false,"supports_thumbnail_selection":false,"supports_thumbnail_rotation":false,"supports_schedule":true,"supports_premiere":false,"supports_video":false,"supports_audio_only":true,"host_owns_rss":true,"host_owns_directory_distribution":true,"forge_rss_hosting":false,"direct_spotify_upload":false,"idempotent_episode_create":false}'::jsonb;
  expected_hash text;
begin
expected_hash := encode(extensions.digest(convert_to(caps::text,'UTF8'),'sha256'),'hex');
insert into tongs.quench_destination_capability_revisions(
  id,destination_scope_id,revision,contract_version,
  capabilities_json,content_hash,adapter_version
)
select '82000000-0000-4000-8000-000000000003'::uuid,
  '81000000-0000-4000-8000-000000000002'::uuid,2,
  'forge.quench-destination-capabilities.v1',caps,
  expected_hash,'1.0.0'
on conflict (id) do nothing;
if not exists (
  select 1 from tongs.quench_destination_capability_revisions r
  where r.id='82000000-0000-4000-8000-000000000003'::uuid
    and r.destination_scope_id='81000000-0000-4000-8000-000000000002'::uuid
    and r.revision=2
    and r.contract_version='forge.quench-destination-capabilities.v1'
    and r.capabilities_json=caps and r.content_hash=expected_hash
    and r.adapter_version='1.0.0'
) then
  raise exception 'Existing podcast-host capability differs from the expected immutable seed';
end if;
end $capability_seed$;
update tongs.quench_destination_scopes
set current_capability_revision_id='82000000-0000-4000-8000-000000000003'::uuid
where id='81000000-0000-4000-8000-000000000002'::uuid;

-- Capability history is immutable. New executable Transistor shows must persist
-- this exact, evidence-based shape through the existing destination authority RPC.
comment on table tongs.publishing_executable_destinations is
  'Executable provider destinations. Podcast V1 targets a user-linked Transistor show; RSS and directories are not destinations.';
comment on column tongs.publishing_destination_capability_revisions.capabilities_json is
  'Observed provider capabilities. Transistor V1: audio_upload, episode_draft_create, episode_publish, episode_schedule, host_owns_rss, host_owns_directory_distribution; no direct Spotify or Forge RSS.';

-- Fail closed at the operation boundary if a generic rss_host destination is
-- paired with the retired RSS surface or claims unsupported ownership.
create or replace function tongs.quench_podcast_host_capability_is_compatible(p_capabilities jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $$
  select coalesce(p_capabilities->>'provider','')='transistor'
    and coalesce((p_capabilities->>'audio_upload')::boolean,false)
    and coalesce((p_capabilities->>'episode_draft_create')::boolean,false)
    and coalesce((p_capabilities->>'episode_publish')::boolean,false)
    and coalesce((p_capabilities->>'host_owns_rss')::boolean,false)
    and not coalesce((p_capabilities->>'forge_rss_hosting')::boolean,true)
    and not coalesce((p_capabilities->>'direct_spotify_upload')::boolean,true);
$$;
revoke all on function tongs.quench_podcast_host_capability_is_compatible(jsonb) from public,anon;
grant execute on function tongs.quench_podcast_host_capability_is_compatible(jsonb) to authenticated,service_role;

-- Patch the existing operation authority without weakening its immutable
-- manifest/decision/destination bindings.
do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('tongs.establish_publication_operation(uuid,uuid,uuid,uuid,text,uuid,integer,uuid,uuid,text,jsonb)'::regprocedure)
  into v_definition;
  v_definition := replace(v_definition,
    $find$(v_destination.provider='rss_host' and v_scope.platform<>'rss')$find$,
    $replace$(v_destination.provider='rss_host' and v_scope.platform<>'podcast_host')$replace$);
  if position($find$if v_scope.platform='podcast_host' and not tongs.quench_podcast_host_capability_is_compatible(v_cap.capabilities_json) then return jsonb_build_object('disposition','blocked','code','publication_capability_incompatible'); end if;$find$ in v_definition)=0 then
    v_definition := replace(v_definition,
      $find$if v_scope.platform='youtube' and coalesce(v_cap.capabilities_json->'video_upload','false'::jsonb)<>'true'::jsonb then return jsonb_build_object('disposition','blocked','code','publication_capability_incompatible'); end if;$find$,
      $replace$if v_scope.platform='youtube' and coalesce(v_cap.capabilities_json->'video_upload','false'::jsonb)<>'true'::jsonb then return jsonb_build_object('disposition','blocked','code','publication_capability_incompatible'); end if; if v_scope.platform='podcast_host' and not tongs.quench_podcast_host_capability_is_compatible(v_cap.capabilities_json) then return jsonb_build_object('disposition','blocked','code','publication_capability_incompatible'); end if;$replace$);
  end if;
  if position($find$v_scope.platform<>'podcast_host'$find$ in v_definition)=0
    or position($find$quench_podcast_host_capability_is_compatible$find$ in v_definition)=0 then
    raise exception 'Podcast-host operation authority patch failed';
  end if;
  execute v_definition;
end $migration$;

commit;
