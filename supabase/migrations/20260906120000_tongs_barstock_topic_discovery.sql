-- Bar-Stock timely topic discovery authority. Suggestions are not Sparks until accepted.
begin;

create table tongs.workspace_discovery_preferences (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  genre text not null,
  topic_interests text[] not null default '{}',
  editorial_scope text,
  language text,
  region text,
  enabled boolean not null default false,
  auto_refresh_authorized boolean not null default false,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id,user_id),
  check (length(btrim(genre)) between 1 and 120)
);

create table tongs.barstock_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  preference_revision bigint not null,
  preference_hash text not null,
  operation_key text not null,
  trigger_kind text not null check(trigger_kind in ('automatic','manual')),
  status text not null check(status in ('leased','refreshing','ready','partial','empty','failed','superseded')),
  attempt_count integer not null default 1 check(attempt_count between 1 and 2),
  provider_call_count integer not null default 0 check(provider_call_count between 0 and 4),
  model_call_count integer not null default 0 check(model_call_count between 0 and 1),
  lease_token_hash text not null,
  lease_expires_at timestamptz not null,
  first_provider_call_at timestamptz,
  generated_at timestamptz,
  fresh_until timestamptz,
  failure_reason text,
  policy_snapshot jsonb not null default '{}',
  usage_snapshot jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,user_id,operation_key)
);
create index barstock_discovery_runs_budget_idx on tongs.barstock_discovery_runs(workspace_id,user_id,first_provider_call_at desc) where first_provider_call_at is not null;

create table tongs.barstock_discovery_provider_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references tongs.barstock_discovery_runs(id) on delete cascade,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  request_key text not null,
  created_at timestamptz not null default now(),
  unique(run_id,request_key)
);

create table tongs.barstock_discovery_stories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(workspace_id,user_id,fingerprint)
);

create table tongs.barstock_discovery_story_revisions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references tongs.barstock_discovery_stories(id) on delete cascade,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null check(revision > 0),
  headline text not null,
  summary text not null,
  suggested_angle text not null,
  timeliness_reason text not null,
  event_at timestamptz,
  evidence_class text not null check(evidence_class in ('single_authoritative','corroborated','limited')),
  contradiction_state text not null default 'none' check(contradiction_state in ('none','disputed','unresolved')),
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique(story_id,revision), unique(story_id,content_hash)
);

create table tongs.barstock_discovery_sources (
  id uuid primary key default gen_random_uuid(),
  story_revision_id uuid not null references tongs.barstock_discovery_story_revisions(id) on delete cascade,
  ordinal integer not null check(ordinal >= 0),
  original_url text not null,
  canonical_url text not null,
  title text not null,
  publisher text,
  author text,
  published_at timestamptz,
  event_at timestamptz,
  retrieved_at timestamptz not null,
  supporting_excerpt text,
  excerpt_hash text,
  extraction_status text not null,
  authority_class text not null,
  syndication_cluster text not null,
  unique(story_revision_id,ordinal), unique(story_revision_id,canonical_url)
);

create table tongs.barstock_discovery_batch_members (
  run_id uuid not null references tongs.barstock_discovery_runs(id) on delete cascade,
  ordinal integer not null check(ordinal between 0 and 4),
  story_revision_id uuid not null references tongs.barstock_discovery_story_revisions(id),
  primary key(run_id,ordinal), unique(run_id,story_revision_id)
);

create table tongs.barstock_discovery_dismissals (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references tongs.barstock_discovery_stories(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '14 days'),
  primary key(workspace_id,user_id,story_id)
);

create table tongs.barstock_discovery_acceptances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references tongs.barstock_discovery_stories(id),
  story_revision_id uuid not null references tongs.barstock_discovery_story_revisions(id),
  operation_key text not null,
  spark_id uuid not null,
  workpiece_id uuid not null,
  selected_angle text not null,
  accepted_at timestamptz not null default now(),
  unique(workspace_id,user_id,story_id), unique(workspace_id,user_id,operation_key)
);

do $$ declare n text; begin foreach n in array array['workspace_discovery_preferences','barstock_discovery_runs','barstock_discovery_provider_calls','barstock_discovery_stories','barstock_discovery_story_revisions','barstock_discovery_sources','barstock_discovery_batch_members','barstock_discovery_dismissals','barstock_discovery_acceptances'] loop execute format('alter table tongs.%I enable row level security',n); execute format('revoke all on tongs.%I from public,anon,authenticated',n); end loop; end $$;

create or replace function tongs.set_my_barstock_discovery_preferences(p_workspace_id uuid,p_expected_revision bigint,p_genre text,p_topic_interests text[] default '{}',p_editorial_scope text default null,p_language text default null,p_region text default null,p_enabled boolean default true,p_auto_refresh_authorized boolean default false) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare u uuid:=auth.uid(); r tongs.workspace_discovery_preferences%rowtype;
begin
 if u is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('outcome','denied'); end if;
 if nullif(btrim(p_genre),'') is null then return jsonb_build_object('outcome','invalid','reason','genre_required'); end if;
 insert into tongs.workspace_discovery_preferences(workspace_id,user_id,genre,topic_interests,editorial_scope,language,region,enabled,auto_refresh_authorized)
 values(p_workspace_id,u,btrim(p_genre),coalesce(p_topic_interests,'{}'),nullif(btrim(p_editorial_scope),''),nullif(btrim(p_language),''),nullif(btrim(p_region),''),p_enabled,p_auto_refresh_authorized)
 on conflict(workspace_id,user_id) do update set genre=excluded.genre,topic_interests=excluded.topic_interests,editorial_scope=excluded.editorial_scope,language=excluded.language,region=excluded.region,enabled=excluded.enabled,auto_refresh_authorized=excluded.auto_refresh_authorized,revision=workspace_discovery_preferences.revision+1,updated_at=now()
 where workspace_discovery_preferences.revision=p_expected_revision returning * into r;
 if r.user_id is null then return jsonb_build_object('outcome','revision_conflict'); end if;
 return jsonb_build_object('outcome','saved','preference',to_jsonb(r));
end$$;

create or replace function tongs.get_my_barstock_discovery_context(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,tongs as $$
declare u uuid:=auth.uid(); p tongs.workspace_discovery_preferences%rowtype; r tongs.barstock_discovery_runs%rowtype;
begin
 if u is null or not tongs.has_workspace_role(p_workspace_id,'viewer') then return jsonb_build_object('outcome','denied'); end if;
 select * into p from tongs.workspace_discovery_preferences where workspace_id=p_workspace_id and user_id=u;
 select * into r from tongs.barstock_discovery_runs where workspace_id=p_workspace_id and user_id=u and preference_revision=p.revision and status in('ready','partial','empty') order by generated_at desc nulls last limit 1;
 return jsonb_build_object('outcome','found','preference',case when p.user_id is null then null else to_jsonb(p) end,'run',case when r.id is null then null else to_jsonb(r) end,'stories',coalesce((select jsonb_agg(jsonb_build_object('ordinal',m.ordinal,'revision',to_jsonb(v),'story',to_jsonb(s),'sources',coalesce((select jsonb_agg(to_jsonb(src) order by src.ordinal) from tongs.barstock_discovery_sources src where src.story_revision_id=v.id),'[]'::jsonb),'accepted',a.id is not null) order by m.ordinal) from tongs.barstock_discovery_batch_members m join tongs.barstock_discovery_story_revisions v on v.id=m.story_revision_id join tongs.barstock_discovery_stories s on s.id=v.story_id left join tongs.barstock_discovery_acceptances a on a.workspace_id=p_workspace_id and a.user_id=u and a.story_id=s.id left join tongs.barstock_discovery_dismissals d on d.workspace_id=p_workspace_id and d.user_id=u and d.story_id=s.id and d.expires_at>now() where m.run_id=r.id and d.story_id is null),'[]'::jsonb));
end$$;

create or replace function tongs.dismiss_barstock_discovery_story(p_workspace_id uuid,p_story_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare u uuid:=auth.uid(); begin if u is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('outcome','denied');end if;
 if not exists(select 1 from tongs.barstock_discovery_stories where id=p_story_id and workspace_id=p_workspace_id and user_id=u) then return jsonb_build_object('outcome','not_found');end if;
 insert into tongs.barstock_discovery_dismissals(workspace_id,user_id,story_id) values(p_workspace_id,u,p_story_id) on conflict(workspace_id,user_id,story_id) do update set dismissed_at=now(),expires_at=now()+interval '14 days'; return jsonb_build_object('outcome','dismissed','expires_at',now()+interval '14 days'); end$$;

-- Claim/complete functions are service-mediated: browsers cannot forge discovery evidence.
create or replace function tongs.claim_barstock_discovery_refresh(p_workspace_id uuid,p_preference_revision bigint,p_trigger text,p_operation_key text,p_lease_token_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare u uuid:=auth.uid(); p tongs.workspace_discovery_preferences%rowtype; r tongs.barstock_discovery_runs%rowtype; c6 int; c24 int;
begin
 if u is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('outcome','denied'); end if;
 select * into p from tongs.workspace_discovery_preferences where workspace_id=p_workspace_id and user_id=u and revision=p_preference_revision;
 if p.user_id is null or not p.enabled or (p_trigger='automatic' and not p.auto_refresh_authorized) then return jsonb_build_object('outcome','not_authorized');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||u::text||':topic-discovery',0));
 select * into r from tongs.barstock_discovery_runs where workspace_id=p_workspace_id and user_id=u and operation_key=p_operation_key for update;
 if r.id is not null then
  if r.preference_revision<>p_preference_revision then return jsonb_build_object('outcome','operation_identity_conflict','run_id',r.id);end if;
  if r.status in('ready','partial','empty') then return jsonb_build_object('outcome','existing','run_id',r.id);end if;
  if r.lease_expires_at>now() then return jsonb_build_object('outcome','in_progress','run_id',r.id);end if;
  if r.attempt_count>=2 then return jsonb_build_object('outcome','attempts_exhausted','run_id',r.id);end if;
  update tongs.barstock_discovery_runs set attempt_count=attempt_count+1,status='leased',lease_token_hash=p_lease_token_hash,lease_expires_at=now()+interval '5 minutes',failure_reason=null,updated_at=now() where id=r.id returning * into r;
  return jsonb_build_object('outcome','claimed','run_id',r.id,'lease_expires_at',r.lease_expires_at,'recovered',true);
 end if;
 if exists(select 1 from tongs.barstock_discovery_runs where workspace_id=p_workspace_id and user_id=u and status in('leased','refreshing') and lease_expires_at>now()) then return jsonb_build_object('outcome','in_progress');end if;
 select count(*) filter(where first_provider_call_at>now()-interval '6 hours'),count(*) filter(where first_provider_call_at>now()-interval '24 hours') into c6,c24 from tongs.barstock_discovery_runs where workspace_id=p_workspace_id and user_id=u;
 if c6>=1 or c24>=4 then return jsonb_build_object('outcome','budget_blocked','next_eligible_at',(select min(first_provider_call_at)+interval '6 hours' from tongs.barstock_discovery_runs where workspace_id=p_workspace_id and user_id=u and first_provider_call_at>now()-interval '6 hours'));end if;
 insert into tongs.barstock_discovery_runs(workspace_id,user_id,preference_revision,preference_hash,operation_key,trigger_kind,status,lease_token_hash,lease_expires_at) values(p_workspace_id,u,p.revision,encode(extensions.digest(convert_to(to_jsonb(p)::text,'UTF8'),'sha256'),'hex'),p_operation_key,p_trigger,'leased',p_lease_token_hash,now()+interval '5 minutes') returning * into r;
 return jsonb_build_object('outcome','claimed','run_id',r.id,'lease_expires_at',r.lease_expires_at,'recovered',false); end$$;

create or replace function tongs.renew_barstock_discovery_lease(p_run_id uuid,p_lease_token_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
begin if auth.role()<>'service_role' then return jsonb_build_object('outcome','denied');end if; update tongs.barstock_discovery_runs set lease_expires_at=now()+interval '5 minutes',updated_at=now() where id=p_run_id and lease_token_hash=p_lease_token_hash and lease_expires_at>now() and status in('leased','refreshing'); return jsonb_build_object('outcome',case when found then 'renewed' else 'lease_lost' end);end$$;

create or replace function tongs.record_barstock_discovery_provider_call(p_run_id uuid,p_lease_token_hash text,p_provider text,p_request_key text) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare r tongs.barstock_discovery_runs%rowtype;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('outcome','denied');end if;
 select * into r from tongs.barstock_discovery_runs where id=p_run_id and lease_token_hash=p_lease_token_hash and lease_expires_at>now() and status in('leased','refreshing') for update;
 if r.id is null then return jsonb_build_object('outcome','lease_lost');end if;
 if r.provider_call_count>=4 then return jsonb_build_object('outcome','run_budget_exhausted');end if;
 insert into tongs.barstock_discovery_provider_calls(run_id,workspace_id,user_id,provider,request_key) values(r.id,r.workspace_id,r.user_id,p_provider,p_request_key) on conflict(run_id,request_key) do nothing;
 if found then update tongs.barstock_discovery_runs set provider_call_count=provider_call_count+1,first_provider_call_at=coalesce(first_provider_call_at,now()),status='refreshing',updated_at=now() where id=r.id returning * into r;end if;
 return jsonb_build_object('outcome','recorded','provider_call_count',r.provider_call_count);
end$$;

create or replace function tongs.complete_barstock_discovery_refresh(p_run_id uuid,p_lease_token_hash text,p_stories jsonb,p_usage jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs,extensions as $$
declare r tongs.barstock_discovery_runs%rowtype; item jsonb; src jsonb; s tongs.barstock_discovery_stories%rowtype; v tongs.barstock_discovery_story_revisions%rowtype; rev bigint; ord int:=0; sord int; h text;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('outcome','denied');end if;
 select * into r from tongs.barstock_discovery_runs where id=p_run_id and lease_token_hash=p_lease_token_hash and lease_expires_at>now() and status in('leased','refreshing') for update;
 if r.id is null then return jsonb_build_object('outcome','lease_lost');end if;
 if jsonb_typeof(p_stories)<>'array' or jsonb_array_length(p_stories)>5 then return jsonb_build_object('outcome','invalid_result');end if;
 for item in select value from jsonb_array_elements(p_stories) loop
  insert into tongs.barstock_discovery_stories(workspace_id,user_id,fingerprint) values(r.workspace_id,r.user_id,item->>'fingerprint') on conflict(workspace_id,user_id,fingerprint) do update set last_seen_at=now() returning * into s;
  h:=encode(digest(convert_to(jsonb_strip_nulls(item)::text,'UTF8'),'sha256'),'hex');
  select coalesce(max(revision),0)+1 into rev from tongs.barstock_discovery_story_revisions where story_id=s.id;
  insert into tongs.barstock_discovery_story_revisions(story_id,workspace_id,user_id,revision,headline,summary,suggested_angle,timeliness_reason,event_at,evidence_class,contradiction_state,content_hash)
  values(s.id,r.workspace_id,r.user_id,rev,item->>'headline',item->>'summary',item->>'suggested_angle',item->>'timeliness_reason',nullif(item->>'event_at','')::timestamptz,coalesce(item->>'evidence_class','limited'),coalesce(item->>'contradiction_state','none'),h)
  on conflict(story_id,content_hash) do nothing returning * into v;
  if v.id is null then select * into v from tongs.barstock_discovery_story_revisions where story_id=s.id and content_hash=h;end if;
  sord:=0;
  for src in select value from jsonb_array_elements(coalesce(item->'sources','[]')) loop
   insert into tongs.barstock_discovery_sources(story_revision_id,ordinal,original_url,canonical_url,title,publisher,author,published_at,event_at,retrieved_at,supporting_excerpt,excerpt_hash,extraction_status,authority_class,syndication_cluster)
   values(v.id,sord,src->>'original_url',src->>'canonical_url',src->>'title',nullif(src->>'publisher',''),nullif(src->>'author',''),nullif(src->>'published_at','')::timestamptz,nullif(src->>'event_at','')::timestamptz,coalesce(nullif(src->>'retrieved_at','')::timestamptz,now()),nullif(src->>'supporting_excerpt',''),nullif(src->>'excerpt_hash',''),coalesce(src->>'extraction_status','snippet'),coalesce(src->>'authority_class','general'),coalesce(src->>'syndication_cluster',src->>'canonical_url')) on conflict(story_revision_id,canonical_url) do nothing; sord:=sord+1;
  end loop;
  insert into tongs.barstock_discovery_batch_members(run_id,ordinal,story_revision_id) values(r.id,ord,v.id); ord:=ord+1;
 end loop;
 update tongs.barstock_discovery_runs set status=case when ord=0 then 'empty' else 'ready' end,generated_at=now(),fresh_until=now()+interval '6 hours',lease_token_hash='',lease_expires_at=now(),usage_snapshot=coalesce(p_usage,'{}'),updated_at=now() where id=r.id;
 return jsonb_build_object('outcome','completed','story_count',ord);
end$$;

create or replace function tongs.fail_barstock_discovery_refresh(p_run_id uuid,p_lease_token_hash text,p_reason text) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
begin if auth.role()<>'service_role' then return jsonb_build_object('outcome','denied');end if; update tongs.barstock_discovery_runs set status='failed',failure_reason=p_reason,lease_token_hash='',lease_expires_at=now(),updated_at=now() where id=p_run_id and lease_token_hash=p_lease_token_hash and lease_expires_at>now() and status in('leased','refreshing'); return jsonb_build_object('outcome',case when found then 'failed' else 'lease_lost' end);end$$;

create or replace function tongs.accept_barstock_discovery_story(p_workspace_id uuid,p_story_revision_id uuid,p_operation_key text) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs,extensions as $$
declare u uuid:=auth.uid(); v tongs.barstock_discovery_story_revisions%rowtype; a tongs.barstock_discovery_acceptances%rowtype; spark uuid:=gen_random_uuid(); workpiece uuid; src tongs.barstock_discovery_sources%rowtype; sr jsonb; lr jsonb; srid uuid; srrev bigint; stable text;
begin
 if u is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('outcome','denied');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||u::text||':'||p_operation_key,0));
 select * into a from tongs.barstock_discovery_acceptances where workspace_id=p_workspace_id and user_id=u and operation_key=p_operation_key;
 if a.id is not null then return jsonb_build_object('outcome','existing','spark_id',a.spark_id,'workpiece_id',a.workpiece_id,'story_revision_id',a.story_revision_id);end if;
 select * into v from tongs.barstock_discovery_story_revisions where id=p_story_revision_id and workspace_id=p_workspace_id and user_id=u;
 if v.id is null then return jsonb_build_object('outcome','not_found');end if;
 select * into a from tongs.barstock_discovery_acceptances where workspace_id=p_workspace_id and user_id=u and story_id=v.story_id;
 if a.id is not null then return jsonb_build_object('outcome','existing','spark_id',a.spark_id,'workpiece_id',a.workpiece_id,'story_revision_id',a.story_revision_id);end if;
 insert into tongs.barstock_sparks(id,workspace_id,created_by,title,body,tags,status,source,pinned,revision) values(spark,p_workspace_id,u,v.headline,v.summary,array['timely-topic'],'raw','link',false,1);
 workpiece:=tongs.create_episode_identity_internal(p_workspace_id,v.headline,u,'hearth_spark');
 update tongs.barstock_sparks set linked_workpiece_id=workpiece,status='forged',updated_at=now() where id=spark and workspace_id=p_workspace_id;
 for src in select * from tongs.barstock_discovery_sources where story_revision_id=v.id order by ordinal loop
  stable:='discovery-revision:'||v.id::text||':'||src.ordinal::text;
  sr:=tongs.commit_source_revision(p_workspace_id,null,stable,0,'webpage',src.title,src.author,src.publisher,src.published_at,src.canonical_url,null,null,null,jsonb_build_object('event_at',src.event_at),jsonb_build_object('origin','barstock_discovery','story_revision_id',v.id,'retrieved_at',src.retrieved_at,'supporting_excerpt',src.supporting_excerpt),'forge.source.metadata.v1','forge.source.provenance.v1','forge:source:discovery:'||v.id::text||':'||src.ordinal,encode(digest(convert_to(src.canonical_url,'UTF8'),'sha256'),'hex'),u);
  srid:=(sr#>>'{source_revision,id}')::uuid; srrev:=(sr#>>'{source_revision,revision}')::bigint;
  lr:=tongs.commit_workpiece_source_link_revision(p_workspace_id,workpiece,null,0,srid,srrev,'supports',null,null,'{}','{}','{}',src.excerpt_hash,v.suggested_angle,jsonb_build_object('origin','barstock_discovery','story_revision_id',v.id),'forge:source:discovery-link:'||v.id::text||':'||src.ordinal,encode(digest(convert_to(workpiece::text||src.canonical_url,'UTF8'),'sha256'),'hex'),u);
  if coalesce(lr->>'disposition','')<>'committed' then raise exception 'discovery source link failed';end if;
 end loop;
 insert into tongs.barstock_discovery_acceptances(workspace_id,user_id,story_id,story_revision_id,operation_key,spark_id,workpiece_id,selected_angle) values(p_workspace_id,u,v.story_id,v.id,p_operation_key,spark,workpiece,v.suggested_angle) returning * into a;
 return jsonb_build_object('outcome','created','spark_id',spark,'workpiece_id',workpiece,'story_revision_id',v.id);
end$$;

revoke all on function tongs.set_my_barstock_discovery_preferences(uuid,bigint,text,text[],text,text,text,boolean,boolean),tongs.get_my_barstock_discovery_context(uuid),tongs.dismiss_barstock_discovery_story(uuid,uuid),tongs.claim_barstock_discovery_refresh(uuid,bigint,text,text,text) from public,anon;
grant execute on function tongs.set_my_barstock_discovery_preferences(uuid,bigint,text,text[],text,text,text,boolean,boolean),tongs.get_my_barstock_discovery_context(uuid),tongs.dismiss_barstock_discovery_story(uuid,uuid),tongs.claim_barstock_discovery_refresh(uuid,bigint,text,text,text) to authenticated,service_role;
revoke all on function tongs.record_barstock_discovery_provider_call(uuid,text,text,text),tongs.complete_barstock_discovery_refresh(uuid,text,jsonb,jsonb),tongs.fail_barstock_discovery_refresh(uuid,text,text),tongs.accept_barstock_discovery_story(uuid,uuid,text) from public,anon;
revoke all on function tongs.renew_barstock_discovery_lease(uuid,text) from public,anon,authenticated;
grant execute on function tongs.renew_barstock_discovery_lease(uuid,text),tongs.record_barstock_discovery_provider_call(uuid,text,text,text),tongs.complete_barstock_discovery_refresh(uuid,text,jsonb,jsonb),tongs.fail_barstock_discovery_refresh(uuid,text,text) to service_role;
grant execute on function tongs.accept_barstock_discovery_story(uuid,uuid,text) to authenticated,service_role;

comment on table tongs.barstock_discovery_story_revisions is 'Immutable exact card revisions; acceptance must reference the revision the creator selected.';
comment on table tongs.barstock_discovery_runs is 'Rolling-budgeted, lease-owned discovery runs. Preference revisions never reset provider budgets.';
commit;
