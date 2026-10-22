begin transaction read only;

with expected_scopes(
  id, scope_key, platform, adapter_id, execution_context, state,
  current_capability_revision_id
) as (
  values
    ('81000000-0000-4000-8000-000000000001'::uuid,
     'system:youtube:intent-only', 'youtube', 'forge.youtube', 'intent_only',
     'active', '82000000-0000-4000-8000-000000000001'::uuid),
    ('81000000-0000-4000-8000-000000000002'::uuid,
     'system:podcast-host:intent-only', 'podcast_host', 'forge.transistor',
     'intent_only', 'active',
     '82000000-0000-4000-8000-000000000003'::uuid),
    ('81000000-0000-4000-8000-000000000003'::uuid,
     'system:rumble:manual-handoff', 'rumble', 'forge.rumble.manual',
     'manual_handoff', 'active',
     '82000000-0000-4000-8000-000000000004'::uuid)
),
expected_capabilities(
  id, destination_scope_id, revision, contract_version, capabilities_json,
  content_hash, adapter_version
) as (
  values
    ('82000000-0000-4000-8000-000000000001'::uuid,
     '81000000-0000-4000-8000-000000000001'::uuid, 1,
     'forge.quench-destination-capabilities.v1',
     '{"supports_experiment_intent":true,"supports_thumbnail_selection":true,"supports_thumbnail_rotation":false,"supports_schedule":true,"supports_premiere":true,"supports_video":true,"supports_audio_only":false}'::jsonb,
     '118f69cf914db6006c871c17f918f4a4d90de6a537f6c5aba657cb10de69b261',
     'stub-v1'),
    ('82000000-0000-4000-8000-000000000002'::uuid,
     '81000000-0000-4000-8000-000000000002'::uuid, 1,
     'forge.quench-destination-capabilities.v1',
     '{"supports_experiment_intent":true,"supports_thumbnail_selection":true,"supports_thumbnail_rotation":false,"supports_schedule":true,"supports_premiere":false,"supports_video":false,"supports_audio_only":true}'::jsonb,
     '6e990e4f264d95641fc1272c3598453e555d617498c09a297e6865f656c3efff',
     'stub-v1'),
    ('82000000-0000-4000-8000-000000000003'::uuid,
     '81000000-0000-4000-8000-000000000002'::uuid, 2,
     'forge.quench-destination-capabilities.v1',
     '{"provider":"transistor","audio_upload":true,"episode_draft_create":true,"episode_publish":true,"episode_schedule":true,"supports_experiment_intent":false,"supports_thumbnail_selection":false,"supports_thumbnail_rotation":false,"supports_schedule":true,"supports_premiere":false,"supports_video":false,"supports_audio_only":true,"host_owns_rss":true,"host_owns_directory_distribution":true,"forge_rss_hosting":false,"direct_spotify_upload":false,"idempotent_episode_create":false}'::jsonb,
     'a024a5df42d0208d0d937af74e4af1b09c1a6f32c4f84a6f3130834f25a6f7d6',
     '1.0.0'),
    ('82000000-0000-4000-8000-000000000004'::uuid,
     '81000000-0000-4000-8000-000000000003'::uuid, 1,
     'forge.quench-manual-destination-capabilities.v1',
     '{"provider":"rumble","release_profiles":["video_episode"],"manual_video_upload":true,"manual_metadata_entry":true,"manual_thumbnail_upload":true,"manual_visibility_selection":true,"manual_schedule_intent":true,"creator_decides_channel":true,"creator_decides_licensing":true,"creator_decides_monetization":true,"creator_decides_syndication":true,"creator_decides_premiere":true,"api_authentication":false,"api_video_upload":false,"api_status_read":false,"api_delete":false,"idempotent_create":false,"safe_automatic_retry":false,"allowed_result_hosts":["rumble.com","www.rumble.com"]}'::jsonb,
     'e510a87bd6a3f8d077dceccaf9a67154a5b62fef73a902d4c95c93c12ae449cb',
     '1.0.0')
),
scope_matches as (
  select count(*)::integer as matched
  from expected_scopes e
  join tongs.quench_destination_scopes a
    on (a.id, a.scope_key, a.platform, a.adapter_id, a.execution_context,
        a.state, a.current_capability_revision_id)
     = (e.id, e.scope_key, e.platform, e.adapter_id, e.execution_context,
        e.state, e.current_capability_revision_id)
  where a.workspace_id is null
    and a.connection_ref is null
    and a.created_by is null
),
capability_matches as (
  select count(*)::integer as matched
  from expected_capabilities e
  join tongs.quench_destination_capability_revisions a
    on (a.id, a.destination_scope_id, a.revision, a.contract_version,
        a.capabilities_json, a.content_hash, a.adapter_version)
     = (e.id, e.destination_scope_id, e.revision, e.contract_version,
        e.capabilities_json, e.content_hash, e.adapter_version)
  where a.created_by is null
)
select
  (select matched from scope_matches) as exact_scope_matches,
  (select matched from capability_matches) as exact_capability_matches,
  not exists (
    select 1
    from expected_scopes e
    join tongs.quench_destination_scopes a on a.id = e.id
    where a.workspace_id is not null
       or a.connection_ref is not null
       or a.created_by is not null
  ) as no_scope_customer_or_connection_state,
  not exists (
    select 1
    from expected_capabilities e
    join tongs.quench_destination_capability_revisions a on a.id = e.id
    where a.created_by is not null
  ) as no_capability_customer_state;

rollback;
