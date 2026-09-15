import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_nursery";

const available = spawnSync("docker", ["info"], { encoding: "utf8" });
if (available.status !== 0) {
  throw new Error("Docker Desktop must be started manually before running this verification.");
}

const sql = String.raw`
begin;

insert into auth.users (id) values ('10000000-0000-4000-8000-000000000011');
insert into tongs.orgs (id, name, created_by) values (
  '90000000-0000-4000-8000-000000000011',
  'Topic Discovery Context Test',
  '10000000-0000-4000-8000-000000000011'
);
insert into tongs.workspaces (id, name, created_by, org_id) values (
  'a0000000-0000-4000-8000-000000000011',
  'Topic Discovery Context Test',
  '10000000-0000-4000-8000-000000000011',
  '90000000-0000-4000-8000-000000000011'
);
insert into tongs.workspace_discovery_preferences (
  workspace_id, user_id, genre, topic_interests, editorial_scope,
  language, region, enabled, auto_refresh_authorized, revision
) values (
  'a0000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011',
  'Trending', array['audio'], 'Creator news', 'English', 'US', true, true, 1
);
insert into tongs.barstock_discovery_runs (
  id, workspace_id, user_id, preference_revision, preference_hash,
  operation_key, trigger_kind, status, lease_token_hash, lease_expires_at,
  first_provider_call_at, generated_at, fresh_until
) values (
  'e0000000-0000-4000-8000-000000000011',
  'a0000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011',
  1, 'revision-1', 'revision-1-run', 'manual', 'ready', '', now(),
  now() - interval '12 hours', now() - interval '12 hours', now() - interval '6 hours'
);
insert into tongs.barstock_discovery_stories (
  id, workspace_id, user_id, fingerprint
) values
  ('f0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011', 'visible-story'),
  ('f0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011', 'dismissed-story');
insert into tongs.barstock_discovery_story_revisions (
  id, story_id, workspace_id, user_id, revision, headline, summary,
  suggested_angle, timeliness_reason, evidence_class, content_hash
) values
  ('f1000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011', 1, 'Previous visible result', 'A sufficiently detailed previous result summary for verification.', 'Visible angle', 'Recent', 'limited', 'visible-revision'),
  ('f1000000-0000-4000-8000-000000000012', 'f0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011', 1, 'Previous dismissed result', 'A sufficiently detailed dismissed result summary for verification.', 'Dismissed angle', 'Recent', 'limited', 'dismissed-revision');
insert into tongs.barstock_discovery_batch_members (run_id, ordinal, story_revision_id) values
  ('e0000000-0000-4000-8000-000000000011', 0, 'f1000000-0000-4000-8000-000000000011'),
  ('e0000000-0000-4000-8000-000000000011', 1, 'f1000000-0000-4000-8000-000000000012');
insert into tongs.barstock_discovery_acceptances (
  workspace_id, user_id, story_id, story_revision_id, operation_key,
  spark_id, workpiece_id, selected_angle
) values (
  'a0000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011',
  'f0000000-0000-4000-8000-000000000011',
  'f1000000-0000-4000-8000-000000000011',
  'accepted-visible',
  'c0000000-0000-4000-8000-000000000011',
  'd0000000-0000-4000-8000-000000000011',
  'Visible angle'
);
insert into tongs.barstock_discovery_dismissals (
  workspace_id, user_id, story_id, expires_at
) values (
  'a0000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011',
  'f0000000-0000-4000-8000-000000000012',
  now() + interval '1 day'
);

update tongs.workspace_discovery_preferences
set genre = 'Chicago Bears', revision = 2, updated_at = now()
where workspace_id = 'a0000000-0000-4000-8000-000000000011'
  and user_id = '10000000-0000-4000-8000-000000000011';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000011', true);

do $verify$
declare context jsonb;
begin
  context := tongs.get_my_barstock_discovery_context('a0000000-0000-4000-8000-000000000011');
  if (context #>> '{preference,revision}')::bigint <> 2
    or (context #>> '{run,preference_revision}')::bigint <> 1 then
    raise exception 'previous successful revision was not returned';
  end if;
  if jsonb_array_length(context->'stories') <> 1
    or context #>> '{stories,0,revision,headline}' <> 'Previous visible result'
    or (context #>> '{stories,0,accepted}')::boolean is not true then
    raise exception 'accepted or dismissed fallback-card filtering changed';
  end if;
end;
$verify$;

reset role;
insert into tongs.barstock_discovery_runs (
  id, workspace_id, user_id, preference_revision, preference_hash,
  operation_key, trigger_kind, status, lease_token_hash, lease_expires_at,
  generated_at, fresh_until
) values (
  'e0000000-0000-4000-8000-000000000012',
  'a0000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011',
  2, 'revision-2', 'revision-2-run', 'manual', 'empty', '', now(), now(), now() + interval '6 hours'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000011', true);
do $verify$
declare context jsonb;
begin
  context := tongs.get_my_barstock_discovery_context('a0000000-0000-4000-8000-000000000011');
  if (context #>> '{run,preference_revision}')::bigint <> 2 then
    raise exception 'current successful revision did not replace fallback';
  end if;
end;
$verify$;

reset role;
update tongs.workspace_discovery_preferences
set enabled = false, revision = 3, updated_at = now()
where workspace_id = 'a0000000-0000-4000-8000-000000000011'
  and user_id = '10000000-0000-4000-8000-000000000011';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000011', true);
do $verify$
declare context jsonb;
begin
  context := tongs.get_my_barstock_discovery_context('a0000000-0000-4000-8000-000000000011');
  if context->'run' <> 'null'::jsonb or jsonb_array_length(context->'stories') <> 0 then
    raise exception 'disabled preferences resurrected historical results';
  end if;
end;
$verify$;

reset role;
update tongs.workspace_discovery_preferences
set enabled = true, revision = 4, updated_at = now()
where workspace_id = 'a0000000-0000-4000-8000-000000000011'
  and user_id = '10000000-0000-4000-8000-000000000011';
delete from tongs.barstock_discovery_runs
where workspace_id = 'a0000000-0000-4000-8000-000000000011';

insert into tongs.barstock_discovery_runs (
  workspace_id, user_id, preference_revision, preference_hash, operation_key,
  trigger_kind, status, lease_token_hash, lease_expires_at, first_provider_call_at
) values (
  'a0000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011',
  4, 'six-hour', 'six-hour', 'manual', 'failed', '', now(), now() - interval '1 hour'
);
select set_config(
  'forge.test_expected',
  (select (max(first_provider_call_at) + interval '6 hours')::text
   from tongs.barstock_discovery_runs
   where workspace_id = 'a0000000-0000-4000-8000-000000000011'),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000011', true);
do $verify$
declare context jsonb; claim jsonb; expected timestamptz;
begin
  expected := current_setting('forge.test_expected')::timestamptz;
  context := tongs.get_my_barstock_discovery_context('a0000000-0000-4000-8000-000000000011');
  claim := tongs.claim_barstock_discovery_refresh('a0000000-0000-4000-8000-000000000011', 4, 'manual', 'six-hour-claim', 'lease');
  if (context->>'next_eligible_at')::timestamptz <> expected
    or claim->>'outcome' <> 'budget_blocked'
    or (claim->>'next_eligible_at')::timestamptz <> expected then
    raise exception 'six-hour eligibility boundary is incorrect';
  end if;
end;
$verify$;

reset role;
delete from tongs.barstock_discovery_runs
where workspace_id = 'a0000000-0000-4000-8000-000000000011';
insert into tongs.barstock_discovery_runs (
  workspace_id, user_id, preference_revision, preference_hash, operation_key,
  trigger_kind, status, lease_token_hash, lease_expires_at, first_provider_call_at
)
select
  'a0000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011',
  4, 'twenty-four-hour', 'twenty-four-hour-' || hours,
  'manual', 'failed', '', now(), now() - make_interval(hours => hours)
from unnest(array[7, 8, 9, 10]) as hours;
select set_config(
  'forge.test_expected',
  (select (min(first_provider_call_at) + interval '24 hours')::text
   from tongs.barstock_discovery_runs
   where workspace_id = 'a0000000-0000-4000-8000-000000000011'),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000011', true);
do $verify$
declare context jsonb; expected timestamptz;
begin
  expected := current_setting('forge.test_expected')::timestamptz;
  context := tongs.get_my_barstock_discovery_context('a0000000-0000-4000-8000-000000000011');
  if (context->>'next_eligible_at')::timestamptz <> expected then
    raise exception '24-hour eligibility boundary is incorrect';
  end if;
end;
$verify$;

reset role;
delete from tongs.barstock_discovery_runs
where workspace_id = 'a0000000-0000-4000-8000-000000000011';
insert into tongs.barstock_discovery_runs (
  workspace_id, user_id, preference_revision, preference_hash, operation_key,
  trigger_kind, status, lease_token_hash, lease_expires_at, first_provider_call_at
)
select
  'a0000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011',
  4, 'combined', 'combined-' || hours,
  'manual', 'failed', '', now(), now() - make_interval(hours => hours)
from unnest(array[1, 7, 8, 9]) as hours;
select set_config(
  'forge.test_expected',
  (select greatest(
    max(first_provider_call_at) filter (
      where first_provider_call_at > now() - interval '6 hours'
    ) + interval '6 hours',
    min(first_provider_call_at) + interval '24 hours'
  )::text
  from tongs.barstock_discovery_runs
  where workspace_id = 'a0000000-0000-4000-8000-000000000011'),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000011', true);
do $verify$
declare context jsonb; claim jsonb; expected timestamptz;
begin
  expected := current_setting('forge.test_expected')::timestamptz;
  context := tongs.get_my_barstock_discovery_context('a0000000-0000-4000-8000-000000000011');
  claim := tongs.claim_barstock_discovery_refresh('a0000000-0000-4000-8000-000000000011', 4, 'manual', 'combined-claim', 'lease');
  if (context->>'next_eligible_at')::timestamptz <> expected
    or claim->>'outcome' <> 'budget_blocked'
    or (claim->>'next_eligible_at')::timestamptz <> expected then
    raise exception 'combined eligibility did not choose the later boundary';
  end if;
end;
$verify$;

rollback;
`;

const result = spawnSync(
  "docker",
  ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
  { input: sql, encoding: "utf8" },
);

if (result.status !== 0) {
  throw new Error(`Topic-discovery context verification failed: ${result.stderr || result.stdout}`);
}

process.stdout.write("Bar-Stock topic-discovery context verification passed.\n");
