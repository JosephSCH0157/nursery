begin;

insert into auth.users(id,email)
values ('91111111-1111-4111-8111-111111111111','prompt-operation-key-test@example.invalid');

select set_config('request.jwt.claim.sub','91111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claim.role','authenticated',true);

insert into tongs.workspaces(id,created_by,name,org_id)
values (
  '92222222-2222-4222-8222-222222222222',
  '91111111-1111-4111-8111-111111111111',
  'Prompt operation key authority test',
  (select id from tongs.orgs where personal_owner_user_id='91111111-1111-4111-8111-111111111111')
);

insert into tongs.episodes(id,workspace_id,label)
values ('93333333-3333-4333-8333-333333333333','92222222-2222-4222-8222-222222222222','Prompt operation key authority episode');

do $test$
declare
  approval jsonb;
  image_map jsonb;
  owner_reserved jsonb;
  owner_replay jsonb;
  owner_conflict jsonb;
  historical_reserved jsonb;
  approval_id uuid;
  image_map_id uuid;
  owner_key text := 'hearth:visual.narrative_interpretation:test:' || repeat('a',64);
  owner_fingerprint text := repeat('1',64);
  historical_key text := 'forge:image-prompt:interpret:' || repeat('b',64);
  malformed text;
  malformed_keys text[] := array[
    'forge:visual.narrative_interpretation:test:' || repeat('a',64),
    'hearth:visual.narrative:test:' || repeat('a',64),
    'hearth:visual.narrative_interpretation:staging:' || repeat('a',64),
    'hearth:visual.narrative_interpretation:test:' || repeat('a',63),
    'hearth:visual.narrative_interpretation:test:' || repeat('a',65),
    'hearth:visual.narrative_interpretation:test:' || repeat('g',64),
    'hearth:visual.narrative_interpretationtest:' || repeat('a',64),
    'hearth:other:test:' || repeat('a',64),
    'arbitrary text'
  ];
begin
  approval := tongs.commit_script_approval_snapshot(
    '92222222-2222-4222-8222-222222222222','93333333-3333-4333-8333-333333333333',0,
    'script/script.md',1,'A canonical prompt authority fixture.','forge.script-approval.v1','v1',
    'forge:script-approval:test:promptkey01','91111111-1111-4111-8111-111111111111');
  assert approval->>'disposition'='committed';
  approval_id := (approval#>>'{approval,id}')::uuid;

  image_map := tongs.commit_image_map_revision(
    '92222222-2222-4222-8222-222222222222','93333333-3333-4333-8333-333333333333',0,null,approval_id,
    'forge.image-map-anchor.v1',
    '{"schema":"forge.image-map-authority.v1","entries":[{"id":"moment-owner-key","canonical_anchor_assessment":{"state":"current","reason":null,"exact_anchor":{"span_text":"A canonical prompt authority fixture."},"evidence":{"match_count":1}}}]}'::jsonb,
    'commit_image_map',array['moment-owner-key'],'{}','forge.image-map-operation.v1',
    'forge:image-map:test:promptkey01','91111111-1111-4111-8111-111111111111');
  assert image_map->>'disposition'='committed';
  image_map_id := (image_map#>>'{image_map_revision,id}')::uuid;

  owner_reserved := tongs.begin_image_prompt_interpretation(
    '92222222-2222-4222-8222-222222222222','93333333-3333-4333-8333-333333333333','moment-owner-key',
    image_map_id,approval_id,null,0,owner_key,owner_fingerprint,
    '{"source_context":{"focus":"fixture"},"creator_direction":"preserve intent"}'::jsonb,
    '91111111-1111-4111-8111-111111111111');
  assert owner_reserved->>'disposition'='reserved';

  owner_replay := tongs.begin_image_prompt_interpretation(
    '92222222-2222-4222-8222-222222222222','93333333-3333-4333-8333-333333333333','moment-owner-key',
    image_map_id,approval_id,null,0,owner_key,owner_fingerprint,
    '{"source_context":{"focus":"fixture"},"creator_direction":"preserve intent"}'::jsonb,
    '91111111-1111-4111-8111-111111111111');
  assert owner_replay->>'disposition'='replay';

  owner_conflict := tongs.begin_image_prompt_interpretation(
    '92222222-2222-4222-8222-222222222222','93333333-3333-4333-8333-333333333333','moment-owner-key',
    image_map_id,approval_id,null,0,owner_key,repeat('2',64),
    '{"source_context":{"focus":"fixture"},"creator_direction":"changed"}'::jsonb,
    '91111111-1111-4111-8111-111111111111');
  assert owner_conflict->>'disposition'='operation_identity_conflict';

  historical_reserved := tongs.begin_image_prompt_interpretation(
    '92222222-2222-4222-8222-222222222222','93333333-3333-4333-8333-333333333333','moment-owner-key',
    image_map_id,approval_id,null,0,historical_key,repeat('3',64),
    '{"source_context":{"focus":"fixture"},"creator_direction":"historical"}'::jsonb,
    '91111111-1111-4111-8111-111111111111');
  assert historical_reserved->>'disposition'='reserved';

  foreach malformed in array malformed_keys loop
    begin
      perform tongs.begin_image_prompt_interpretation(
        '92222222-2222-4222-8222-222222222222','93333333-3333-4333-8333-333333333333','moment-owner-key',
        image_map_id,approval_id,null,0,malformed,repeat('4',64),
        '{"source_context":{"focus":"fixture"},"creator_direction":"invalid"}'::jsonb,
        '91111111-1111-4111-8111-111111111111');
      raise exception 'malformed operation key unexpectedly accepted: %', malformed;
    exception when check_violation then
      null;
    end;
  end loop;

  assert (select count(*) from tongs.image_map_prompt_operation_receipts where operation_id=owner_key)=1;
  assert (select count(*) from tongs.image_map_prompt_operation_receipts where operation_id=historical_key)=1;
  assert not exists (
    select 1 from tongs.image_map_prompt_operation_receipts
    where operation_id !~ '^forge:image-prompt:[a-zA-Z0-9._:-]{8,180}$'
      and operation_id !~ '^hearth:visual\.narrative_interpretation:(test|live):[0-9a-f]{64}$'
  );
end
$test$;

rollback;
