-- Provider-neutral manual publication handoffs. No provider execution occurs here.
begin;

alter table tongs.quench_destination_scopes drop constraint quench_destination_scopes_platform_check;
alter table tongs.quench_destination_scopes drop constraint quench_destination_scopes_adapter_id_check;
alter table tongs.quench_destination_scopes drop constraint quench_destination_scopes_execution_context_check;
alter table tongs.quench_destination_scopes add constraint quench_destination_scopes_platform_check check(platform in('youtube','podcast_host','rumble'));
alter table tongs.quench_destination_scopes add constraint quench_destination_scopes_adapter_id_check check(adapter_id in('forge.youtube','forge.transistor','forge.rumble.manual'));
alter table tongs.quench_destination_scopes add constraint quench_destination_scopes_execution_context_check check(execution_context in('intent_only','manual_handoff'));

insert into tongs.quench_destination_scopes(id,scope_key,platform,adapter_id,execution_context,state)
values('81000000-0000-4000-8000-000000000003','system:rumble:manual-handoff','rumble','forge.rumble.manual','manual_handoff','active');
insert into tongs.quench_destination_capability_revisions(id,destination_scope_id,revision,contract_version,capabilities_json,content_hash,adapter_version)
select '82000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000003',1,
 'forge.quench-manual-destination-capabilities.v1',caps,encode(extensions.digest(convert_to(caps::text,'UTF8'),'sha256'),'hex'),'1.0.0'
from (values ('{"provider":"rumble","release_profiles":["video_episode"],"manual_video_upload":true,"manual_metadata_entry":true,"manual_thumbnail_upload":true,"manual_visibility_selection":true,"manual_schedule_intent":true,"creator_decides_channel":true,"creator_decides_licensing":true,"creator_decides_monetization":true,"creator_decides_syndication":true,"creator_decides_premiere":true,"api_authentication":false,"api_video_upload":false,"api_status_read":false,"api_delete":false,"idempotent_create":false,"safe_automatic_retry":false,"allowed_result_hosts":["rumble.com","www.rumble.com"]}'::jsonb))x(caps);
update tongs.quench_destination_scopes set current_capability_revision_id='82000000-0000-4000-8000-000000000004' where id='81000000-0000-4000-8000-000000000003';

create table tongs.manual_handoff_snapshots(
 id uuid primary key default gen_random_uuid(), prepare_key uuid not null unique,
 authority_fingerprint text not null check(authority_fingerprint~'^[a-f0-9]{64}$'),
 workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
 workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
 manifest_snapshot_id uuid not null, manifest_content_hash text not null check(manifest_content_hash~'^[a-f0-9]{64}$'),
 release_decision_id uuid not null, release_decision_scope_id uuid not null references tongs.quench_destination_scopes(id),
 release_decision_revision integer not null check(release_decision_revision>0), release_decision_content_hash text not null check(release_decision_content_hash~'^[a-f0-9]{64}$'),
 destination_capability_revision_id uuid not null, destination_capability_revision integer not null check(destination_capability_revision>0),
 destination_capability_content_hash text not null check(destination_capability_content_hash~'^[a-f0-9]{64}$'),
 handoff_contract_version text not null, handoff_snapshot jsonb not null check(jsonb_typeof(handoff_snapshot)='object'),
 handoff_content_hash text not null check(handoff_content_hash~'^[a-f0-9]{64}$'), prepared_by uuid not null references auth.users(id), prepared_at timestamptz not null default now(),
 unique(id,workspace_id,workpiece_id), foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id),
 foreign key(manifest_snapshot_id,workspace_id,workpiece_id) references tongs.quench_release_manifest_snapshots(id,workspace_id,workpiece_id),
 foreign key(release_decision_id,workspace_id,workpiece_id,release_decision_scope_id) references tongs.quench_release_decision_revisions(id,workspace_id,workpiece_id,destination_scope_id),
 foreign key(destination_capability_revision_id,release_decision_scope_id) references tongs.quench_destination_capability_revisions(id,destination_scope_id)
);
create table tongs.manual_handoff_confirmation_receipts(
 id uuid primary key default gen_random_uuid(), manual_handoff_snapshot_id uuid not null references tongs.manual_handoff_snapshots(id) on delete cascade,
 revision integer not null check(revision>0), supersedes_receipt_id uuid null,
 outcome text not null check(outcome='creator_confirmed'), result_url text not null check(result_url~'^https://'),
 evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence_json)='object'), confirmed_by uuid not null references auth.users(id), confirmed_at timestamptz not null default now(),
 unique(manual_handoff_snapshot_id,revision), unique(id,manual_handoff_snapshot_id),
 foreign key(supersedes_receipt_id,manual_handoff_snapshot_id) references tongs.manual_handoff_confirmation_receipts(id,manual_handoff_snapshot_id),
 check((revision=1 and supersedes_receipt_id is null)or(revision>1 and supersedes_receipt_id is not null))
);

create or replace function tongs.manual_handoff_freshness(p_snapshot_id uuid) returns text language sql stable security definer set search_path=pg_catalog,tongs as $$
 select case when s.id is null then 'missing' when
  not exists(select 1 from tongs.quench_release_manifest_snapshots m where m.workspace_id=s.workspace_id and m.workpiece_id=s.workpiece_id and m.id=s.manifest_snapshot_id and m.snapshotted_at=(select max(m2.snapshotted_at) from tongs.quench_release_manifest_snapshots m2 where m2.workspace_id=s.workspace_id and m2.workpiece_id=s.workpiece_id))
  or not exists(select 1 from tongs.quench_release_decision_sequences q where q.workspace_id=s.workspace_id and q.workpiece_id=s.workpiece_id and q.destination_scope_id=s.release_decision_scope_id and q.current_decision_id=s.release_decision_id and q.current_revision=s.release_decision_revision)
  or not exists(select 1 from tongs.quench_destination_scopes d where d.id=s.release_decision_scope_id and d.current_capability_revision_id=s.destination_capability_revision_id and d.state='active') then 'stale' else 'current' end
 from (select * from tongs.manual_handoff_snapshots where id=p_snapshot_id)s;
$$;

create or replace function tongs.prepare_manual_handoff(p_prepare_key uuid,p_workspace_id uuid,p_workpiece_id uuid,p_manifest_snapshot_id uuid,p_manifest_content_hash text,p_release_decision_id uuid,p_release_decision_revision integer,p_destination_scope_id uuid,p_destination_capability_revision_id uuid,p_handoff_contract_version text,p_handoff_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs,extensions as $$
declare u uuid:=auth.uid(); e tongs.manual_handoff_snapshots%rowtype; m tongs.quench_release_manifest_snapshots%rowtype; d tongs.quench_release_decision_revisions%rowtype; s tongs.quench_destination_scopes%rowtype; c tongs.quench_destination_capability_revisions%rowtype; h text; f text; n uuid;
begin
 if u is null or not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'Not authorized to prepare manual handoff' using errcode='42501'; end if;
 if jsonb_typeof(p_handoff_snapshot)<>'object' or jsonb_typeof(p_handoff_snapshot->'media')<>'object' or jsonb_typeof(p_handoff_snapshot->'metadata')<>'object' then return jsonb_build_object('disposition','invalid','code','manual_handoff_snapshot_invalid'); end if;
 h:=encode(digest(convert_to(p_handoff_snapshot::text,'UTF8'),'sha256'),'hex');
 select * into e from tongs.manual_handoff_snapshots where prepare_key=p_prepare_key;
 if found then return case when e.workspace_id=p_workspace_id and e.workpiece_id=p_workpiece_id and e.manifest_snapshot_id=p_manifest_snapshot_id and e.manifest_content_hash=lower(p_manifest_content_hash) and e.release_decision_id=p_release_decision_id and e.release_decision_revision=p_release_decision_revision and e.release_decision_scope_id=p_destination_scope_id and e.destination_capability_revision_id=p_destination_capability_revision_id and e.handoff_contract_version=p_handoff_contract_version and e.handoff_content_hash=h then jsonb_build_object('disposition','replayed','manual_handoff_snapshot_id',e.id,'freshness',tongs.manual_handoff_freshness(e.id)) else jsonb_build_object('disposition','conflict','code','manual_handoff_prepare_key_reused') end; end if;
 select * into m from tongs.quench_release_manifest_snapshots where id=p_manifest_snapshot_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
 if not found or m.manifest_content_hash<>lower(p_manifest_content_hash) or not m.ready_for_quench or m.canonical_readiness_status<>'ready' then return jsonb_build_object('disposition','blocked','code','manual_handoff_manifest_invalid'); end if;
 if exists(select 1 from tongs.quench_release_manifest_snapshots newer where newer.workspace_id=p_workspace_id and newer.workpiece_id=p_workpiece_id and newer.snapshotted_at>m.snapshotted_at) then return jsonb_build_object('disposition','blocked','code','manual_handoff_manifest_stale'); end if;
 select * into d from tongs.quench_release_decision_revisions where id=p_release_decision_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and destination_scope_id=p_destination_scope_id and revision=p_release_decision_revision;
 if not found or d.manifest_snapshot_id<>m.id or d.manifest_content_hash<>m.manifest_content_hash or d.intent_state='cancelled' then return jsonb_build_object('disposition','blocked','code','manual_handoff_decision_invalid'); end if;
 if not exists(select 1 from tongs.quench_release_decision_sequences q where q.workspace_id=p_workspace_id and q.workpiece_id=p_workpiece_id and q.destination_scope_id=p_destination_scope_id and q.current_decision_id=d.id and q.current_revision=d.revision) then return jsonb_build_object('disposition','blocked','code','manual_handoff_decision_stale'); end if;
 select * into s from tongs.quench_destination_scopes where id=p_destination_scope_id and state='active'; select * into c from tongs.quench_destination_capability_revisions where id=p_destination_capability_revision_id and destination_scope_id=p_destination_scope_id;
 if s.id is null or c.id is null or s.execution_context<>'manual_handoff' or s.current_capability_revision_id<>c.id or d.capability_revision_id<>c.id or d.capability_content_hash<>c.content_hash then return jsonb_build_object('disposition','blocked','code','manual_handoff_destination_invalid'); end if;
 if not exists(select 1 from jsonb_array_elements_text(coalesce(c.capabilities_json->'release_profiles','[]'::jsonb))p(value) where value=p_handoff_snapshot->>'release_profile') then return jsonb_build_object('disposition','blocked','code','manual_handoff_profile_unsupported'); end if;
 if nullif(btrim(p_handoff_snapshot#>>'{media,video_asset_id}'),'') is null or nullif(btrim(p_handoff_snapshot#>>'{media,thumbnail_asset_id}'),'') is null or nullif(btrim(p_handoff_snapshot#>>'{metadata,title}'),'') is null or nullif(btrim(p_handoff_snapshot#>>'{metadata,description}'),'') is null or nullif(btrim(p_handoff_snapshot#>>'{metadata,category}'),'') is null or jsonb_typeof(p_handoff_snapshot#>'{metadata,tags}')<>'array' or jsonb_array_length(p_handoff_snapshot#>'{metadata,tags}')=0 or p_handoff_snapshot#>>'{metadata,visibility}' not in('private','unlisted','public') then return jsonb_build_object('disposition','invalid','code','manual_handoff_required_fields_missing'); end if;
 f:=encode(digest(convert_to(jsonb_build_object('manifest_id',m.id,'manifest_hash',m.manifest_content_hash,'decision_id',d.id,'decision_revision',d.revision,'decision_hash',d.decision_content_hash,'scope_id',s.id,'capability_id',c.id,'capability_revision',c.revision,'capability_hash',c.content_hash,'handoff_hash',h)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.manual_handoff_snapshots(prepare_key,authority_fingerprint,workspace_id,workpiece_id,manifest_snapshot_id,manifest_content_hash,release_decision_id,release_decision_scope_id,release_decision_revision,release_decision_content_hash,destination_capability_revision_id,destination_capability_revision,destination_capability_content_hash,handoff_contract_version,handoff_snapshot,handoff_content_hash,prepared_by) values(p_prepare_key,f,p_workspace_id,p_workpiece_id,m.id,m.manifest_content_hash,d.id,s.id,d.revision,d.decision_content_hash,c.id,c.revision,c.content_hash,p_handoff_contract_version,p_handoff_snapshot,h,u) returning id into n;
 return jsonb_build_object('disposition','prepared','manual_handoff_snapshot_id',n,'authority_fingerprint',f,'freshness','current');
end$$;

create or replace function tongs.confirm_manual_handoff(p_snapshot_id uuid,p_result_url text,p_supersedes_receipt_id uuid default null,p_evidence_json jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare u uuid:=auth.uid(); s tongs.manual_handoff_snapshots%rowtype; prior tongs.manual_handoff_confirmation_receipts%rowtype; cap jsonb; host text; rev integer; n uuid;
begin
 select * into s from tongs.manual_handoff_snapshots where id=p_snapshot_id for update; if not found then return jsonb_build_object('disposition','missing'); end if;
 if u is null or not tongs.has_workspace_role(s.workspace_id,'editor') then raise exception 'Not authorized to confirm manual handoff' using errcode='42501'; end if;
 if tongs.manual_handoff_freshness(s.id)<>'current' then return jsonb_build_object('disposition','blocked','code','manual_handoff_stale'); end if;
 host:=substring(lower(btrim(p_result_url)) from '^https://([^/:?#]+)'); select capabilities_json into cap from tongs.quench_destination_capability_revisions where id=s.destination_capability_revision_id;
 if host is null or not exists(select 1 from jsonb_array_elements_text(coalesce(cap->'allowed_result_hosts','[]'::jsonb))x where lower(x)=host) then return jsonb_build_object('disposition','invalid','code','manual_handoff_result_url_not_allowed'); end if;
 select * into prior from tongs.manual_handoff_confirmation_receipts where manual_handoff_snapshot_id=s.id order by revision desc limit 1;
 if found and (p_supersedes_receipt_id is null or p_supersedes_receipt_id<>prior.id) then return jsonb_build_object('disposition','conflict','code','manual_handoff_supersession_required','current_receipt_id',prior.id); end if;
 rev:=coalesce(prior.revision,0)+1; insert into tongs.manual_handoff_confirmation_receipts(manual_handoff_snapshot_id,revision,supersedes_receipt_id,outcome,result_url,evidence_json,confirmed_by) values(s.id,rev,prior.id,'creator_confirmed',btrim(p_result_url),coalesce(p_evidence_json,'{}'::jsonb),u) returning id into n;
 return jsonb_build_object('disposition','confirmed','receipt_id',n,'revision',rev,'outcome','creator_confirmed');
end$$;

create or replace function tongs.read_manual_handoffs(p_workspace_id uuid,p_workpiece_id uuid) returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
 select case when auth.uid() is null or not tongs.has_workspace_role(p_workspace_id,'viewer') then '[]'::jsonb else coalesce(jsonb_agg(jsonb_build_object('snapshot',to_jsonb(s),'freshness',tongs.manual_handoff_freshness(s.id),'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by r.revision),'[]'::jsonb)from tongs.manual_handoff_confirmation_receipts r where r.manual_handoff_snapshot_id=s.id))order by s.prepared_at desc),'[]'::jsonb)end from tongs.manual_handoff_snapshots s where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id;
$$;

create function tongs.reject_manual_handoff_immutable_mutation()returns trigger language plpgsql set search_path=pg_catalog as $$begin raise exception 'manual_handoff_immutable' using errcode='55000';end$$;
create trigger trg_manual_handoff_snapshots_immutable before update or delete on tongs.manual_handoff_snapshots for each row execute function tongs.reject_manual_handoff_immutable_mutation();
create trigger trg_manual_handoff_receipts_immutable before update or delete on tongs.manual_handoff_confirmation_receipts for each row execute function tongs.reject_manual_handoff_immutable_mutation();
alter table tongs.manual_handoff_snapshots enable row level security; alter table tongs.manual_handoff_confirmation_receipts enable row level security;
revoke all on tongs.manual_handoff_snapshots,tongs.manual_handoff_confirmation_receipts from public,anon,authenticated; grant select on tongs.manual_handoff_snapshots,tongs.manual_handoff_confirmation_receipts to authenticated; grant all on tongs.manual_handoff_snapshots,tongs.manual_handoff_confirmation_receipts to service_role;
create policy manual_handoff_snapshots_viewer on tongs.manual_handoff_snapshots for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy manual_handoff_receipts_viewer on tongs.manual_handoff_confirmation_receipts for select to authenticated using(exists(select 1 from tongs.manual_handoff_snapshots s where s.id=manual_handoff_snapshot_id and tongs.has_workspace_role(s.workspace_id,'viewer')));
revoke all on function tongs.prepare_manual_handoff(uuid,uuid,uuid,uuid,text,uuid,integer,uuid,uuid,text,jsonb),tongs.confirm_manual_handoff(uuid,text,uuid,jsonb),tongs.read_manual_handoffs(uuid,uuid),tongs.manual_handoff_freshness(uuid) from public,anon;
grant execute on function tongs.prepare_manual_handoff(uuid,uuid,uuid,uuid,text,uuid,integer,uuid,uuid,text,jsonb),tongs.confirm_manual_handoff(uuid,text,uuid,jsonb),tongs.read_manual_handoffs(uuid,uuid),tongs.manual_handoff_freshness(uuid) to authenticated,service_role;
comment on table tongs.manual_handoff_snapshots is 'Immutable provider-neutral manual handoff authority; stores prepared evidence, never local-file activity or credentials.';
comment on table tongs.manual_handoff_confirmation_receipts is 'Immutable creator-confirmed evidence. Later corrections supersede rather than mutate.';
commit;
