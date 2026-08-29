-- Canonical immutable Source identity, revision, workpiece citation, and legacy adoption authority.
begin;

create table tongs.sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  stable_key text not null check(length(btrim(stable_key)) between 1 and 240),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(workspace_id,stable_key),
  unique(id,workspace_id)
);

create table tongs.source_revisions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null,
  workspace_id uuid not null,
  revision bigint not null check(revision>0),
  previous_revision_id uuid,
  previous_revision bigint,
  source_type text not null check(length(btrim(source_type))>0),
  title text not null check(length(btrim(title))>0),
  author_creator text,
  publisher text,
  published_at timestamptz,
  canonical_url text,
  document_identity text,
  canonical_asset_revision_id uuid references tongs.assets(id),
  canonical_asset_content_hash text check(canonical_asset_content_hash is null or canonical_asset_content_hash~'^[0-9a-f]{64}$'),
  metadata_json jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata_json)='object'),
  provenance_json jsonb not null default '{}'::jsonb check(jsonb_typeof(provenance_json)='object'),
  metadata_contract_version text not null check(length(btrim(metadata_contract_version))>0),
  provenance_contract_version text not null check(length(btrim(provenance_contract_version))>0),
  content_hash text not null check(content_hash~'^[0-9a-f]{64}$'),
  immutable_revision_hash text not null check(immutable_revision_hash~'^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(source_id,revision),
  unique(id,workspace_id,source_id,revision),
  unique(source_id,immutable_revision_hash),
  foreign key(source_id,workspace_id) references tongs.sources(id,workspace_id) on delete cascade,
  foreign key(previous_revision_id,workspace_id,source_id,previous_revision)
    references tongs.source_revisions(id,workspace_id,source_id,revision),
  check((previous_revision_id is null)=(previous_revision is null)),
  check((canonical_asset_revision_id is null)=(canonical_asset_content_hash is null)),
  check(canonical_url is not null or document_identity is not null or canonical_asset_revision_id is not null),
  check((revision=1 and previous_revision_id is null) or (revision>1 and previous_revision=revision-1))
);

create table tongs.source_sequences (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  source_id uuid not null,
  current_source_revision_id uuid not null,
  current_source_revision bigint not null check(current_source_revision>0),
  updated_at timestamptz not null default now(),
  primary key(workspace_id,source_id),
  foreign key(source_id,workspace_id) references tongs.sources(id,workspace_id) on delete cascade,
  foreign key(current_source_revision_id,workspace_id,source_id,current_source_revision)
    references tongs.source_revisions(id,workspace_id,source_id,revision)
);

create table tongs.workpiece_source_link_revisions (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null,
  workspace_id uuid not null,
  workpiece_id uuid not null,
  revision bigint not null check(revision>0),
  previous_revision_id uuid,
  previous_revision bigint,
  source_id uuid not null,
  source_revision_id uuid not null,
  source_revision bigint not null check(source_revision>0),
  relationship_type text not null check(length(btrim(relationship_type))>0),
  script_approval_id uuid,
  script_approval_revision bigint,
  citation_anchor_json jsonb not null default '{}'::jsonb check(jsonb_typeof(citation_anchor_json)='object'),
  document_locator_json jsonb not null default '{}'::jsonb check(jsonb_typeof(document_locator_json)='object'),
  media_range_json jsonb not null default '{}'::jsonb check(jsonb_typeof(media_range_json)='object'),
  quotation_excerpt_hash text check(quotation_excerpt_hash is null or quotation_excerpt_hash~'^[0-9a-f]{64}$'),
  relationship_note text,
  provenance_json jsonb not null default '{}'::jsonb check(jsonb_typeof(provenance_json)='object'),
  content_hash text not null check(content_hash~'^[0-9a-f]{64}$'),
  immutable_revision_hash text not null check(immutable_revision_hash~'^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(workspace_id,workpiece_id,link_id,revision),
  unique(id,workspace_id,workpiece_id,link_id,revision),
  unique(link_id,immutable_revision_hash),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  foreign key(source_revision_id,workspace_id,source_id,source_revision)
    references tongs.source_revisions(id,workspace_id,source_id,revision),
  foreign key(previous_revision_id,workspace_id,workpiece_id,link_id,previous_revision)
    references tongs.workpiece_source_link_revisions(id,workspace_id,workpiece_id,link_id,revision),
  foreign key(script_approval_id,workspace_id,workpiece_id,script_approval_revision)
    references tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision),
  check((previous_revision_id is null)=(previous_revision is null)),
  check((script_approval_id is null)=(script_approval_revision is null)),
  check((revision=1 and previous_revision_id is null) or (revision>1 and previous_revision=revision-1)),
  check(media_range_json='{}'::jsonb or (
    jsonb_typeof(media_range_json->'start_ms')='number'
    and jsonb_typeof(media_range_json->'end_ms')='number'
    and (media_range_json->>'start_ms')::bigint>=0
    and (media_range_json->>'end_ms')::bigint>(media_range_json->>'start_ms')::bigint
  ))
);

create table tongs.workpiece_source_link_sequences (
  workspace_id uuid not null,
  workpiece_id uuid not null,
  link_id uuid not null,
  current_link_revision_id uuid not null,
  current_link_revision bigint not null check(current_link_revision>0),
  updated_at timestamptz not null default now(),
  primary key(workspace_id,workpiece_id,link_id),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  foreign key(current_link_revision_id,workspace_id,workpiece_id,link_id,current_link_revision)
    references tongs.workpiece_source_link_revisions(id,workspace_id,workpiece_id,link_id,revision)
);

create table tongs.source_operation_receipts (
  operation_id text primary key check(operation_id~'^forge:source:[a-zA-Z0-9._:-]{8,180}$'),
  operation_fingerprint text not null check(operation_fingerprint~'^[0-9a-f]{64}$'),
  operation_type text not null check(operation_type in('source_revision','workpiece_link','legacy_adoption')),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid,
  source_id uuid,
  link_id uuid,
  normalized_inputs_json jsonb not null check(jsonb_typeof(normalized_inputs_json)='object'),
  state text not null check(state in('committed','failed')),
  result_source_revision_id uuid,
  result_link_revision_id uuid,
  failure_code text,
  failure_message text,
  receipt_json jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  foreign key(source_id,workspace_id) references tongs.sources(id,workspace_id),
  check(state<>'committed' or receipt_json is not null),
  check(state<>'failed' or failure_code is not null)
);

create index source_revisions_workspace_idx on tongs.source_revisions(workspace_id,source_id,revision desc);
create index workpiece_source_links_workpiece_idx on tongs.workpiece_source_link_revisions(workspace_id,workpiece_id,link_id,revision desc);

create or replace function tongs.reject_source_immutable_mutation() returns trigger
language plpgsql set search_path=pg_catalog,tongs as $$
begin raise exception '% is immutable',tg_table_name using errcode='55000'; end $$;

do $$ declare v_table text; begin
 foreach v_table in array array['sources','source_revisions','workpiece_source_link_revisions'] loop
  execute format('create trigger %I before update or delete on tongs.%I for each row execute function tongs.reject_source_immutable_mutation()',v_table||'_immutable',v_table);
 end loop;
end $$;

create or replace function tongs.guard_source_operation_receipt() returns trigger
language plpgsql set search_path=pg_catalog,tongs as $$
begin
 if tg_op='DELETE' then raise exception 'Source operation receipts are durable' using errcode='55000'; end if;
 if old.state='committed' then raise exception 'Committed Source operation receipt is immutable' using errcode='55000'; end if;
 if new.operation_id<>old.operation_id or new.operation_fingerprint<>old.operation_fingerprint
    or new.operation_type<>old.operation_type or new.workspace_id<>old.workspace_id
    or new.workpiece_id is distinct from old.workpiece_id or new.created_by<>old.created_by
    or new.created_at<>old.created_at then
  raise exception 'Source operation identity is immutable' using errcode='55000';
 end if;
 return new;
end $$;
create trigger source_operation_receipts_guard before update or delete on tongs.source_operation_receipts
for each row execute function tongs.guard_source_operation_receipt();

create or replace function tongs.commit_source_revision(
 p_workspace_id uuid,p_source_id uuid,p_stable_key text,p_expected_revision bigint,
 p_source_type text,p_title text,p_author_creator text,p_publisher text,p_published_at timestamptz,
 p_canonical_url text,p_document_identity text,p_canonical_asset_revision_id uuid,p_canonical_asset_content_hash text,
 p_metadata_json jsonb,p_provenance_json jsonb,p_metadata_contract_version text,p_provenance_contract_version text,
 p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.source_operation_receipts%rowtype; v_source tongs.sources%rowtype; v_seq tongs.source_sequences%rowtype;
 v_prev tongs.source_revisions%rowtype; v_rev tongs.source_revisions%rowtype; v_asset tongs.assets%rowtype;
 v_content_hash text; v_immutable_hash text; v_result jsonb; v_next bigint;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if auth.uid() is distinct from p_actor_id then raise exception 'Source actor must match authenticated creator' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into v_op from tongs.source_operation_receipts where operation_id=p_operation_id for update;
 if found then
  if v_op.operation_fingerprint<>p_operation_fingerprint or v_op.workspace_id<>p_workspace_id or v_op.operation_type<>'source_revision' then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  return v_op.receipt_json;
 end if;
 if p_source_id is null then
  insert into tongs.sources(workspace_id,stable_key,created_by) values(p_workspace_id,btrim(p_stable_key),p_actor_id)
  on conflict(workspace_id,stable_key) do nothing;
  select * into v_source from tongs.sources where workspace_id=p_workspace_id and stable_key=btrim(p_stable_key) for update;
 else
  select * into v_source from tongs.sources where id=p_source_id and workspace_id=p_workspace_id for update;
  if not found then return jsonb_build_object('disposition','source_not_found'); end if;
  if v_source.stable_key<>btrim(p_stable_key) then return jsonb_build_object('disposition','source_identity_conflict'); end if;
 end if;
 select * into v_seq from tongs.source_sequences where workspace_id=p_workspace_id and source_id=v_source.id for update;
 if found then
  if v_seq.current_source_revision<>p_expected_revision then return jsonb_build_object('disposition','source_revision_conflict','current_revision_id',v_seq.current_source_revision_id,'current_revision',v_seq.current_source_revision); end if;
  select * into v_prev from tongs.source_revisions where id=v_seq.current_source_revision_id;
 else
  if p_expected_revision<>0 then return jsonb_build_object('disposition','source_revision_conflict','current_revision',0); end if;
 end if;
 if p_canonical_asset_revision_id is not null then
  select * into v_asset from tongs.assets where id=p_canonical_asset_revision_id and workspace_id=p_workspace_id and status='ready';
  if not found then return jsonb_build_object('disposition','canonical_asset_not_ready'); end if;
  if v_asset.content_hash is distinct from lower(p_canonical_asset_content_hash) then return jsonb_build_object('disposition','canonical_asset_hash_conflict'); end if;
 end if;
 v_next:=coalesce(v_seq.current_source_revision,0)+1;
 v_content_hash:=encode(extensions.digest(convert_to(jsonb_strip_nulls(jsonb_build_object(
  'source_type',btrim(p_source_type),'title',btrim(p_title),'author_creator',nullif(btrim(p_author_creator),''),
  'publisher',nullif(btrim(p_publisher),''),'published_at',p_published_at,'canonical_url',nullif(btrim(p_canonical_url),''),
  'document_identity',nullif(btrim(p_document_identity),''),'canonical_asset_revision_id',p_canonical_asset_revision_id,
  'canonical_asset_content_hash',lower(p_canonical_asset_content_hash),'metadata_json',coalesce(p_metadata_json,'{}'::jsonb),
  'provenance_json',coalesce(p_provenance_json,'{}'::jsonb),'metadata_contract_version',p_metadata_contract_version,
  'provenance_contract_version',p_provenance_contract_version))::text,'UTF8'),'sha256'),'hex');
 v_immutable_hash:=encode(extensions.digest(convert_to(jsonb_build_object('source_id',v_source.id,'revision',v_next,'previous_revision_id',v_prev.id,'content_hash',v_content_hash)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.source_revisions(source_id,workspace_id,revision,previous_revision_id,previous_revision,source_type,title,author_creator,publisher,published_at,canonical_url,document_identity,canonical_asset_revision_id,canonical_asset_content_hash,metadata_json,provenance_json,metadata_contract_version,provenance_contract_version,content_hash,immutable_revision_hash,created_by)
 values(v_source.id,p_workspace_id,v_next,v_prev.id,v_prev.revision,btrim(p_source_type),btrim(p_title),nullif(btrim(p_author_creator),''),nullif(btrim(p_publisher),''),p_published_at,nullif(btrim(p_canonical_url),''),nullif(btrim(p_document_identity),''),p_canonical_asset_revision_id,lower(p_canonical_asset_content_hash),coalesce(p_metadata_json,'{}'::jsonb),coalesce(p_provenance_json,'{}'::jsonb),btrim(p_metadata_contract_version),btrim(p_provenance_contract_version),v_content_hash,v_immutable_hash,p_actor_id) returning * into v_rev;
 insert into tongs.source_sequences(workspace_id,source_id,current_source_revision_id,current_source_revision) values(p_workspace_id,v_source.id,v_rev.id,v_rev.revision)
 on conflict(workspace_id,source_id) do update set current_source_revision_id=excluded.current_source_revision_id,current_source_revision=excluded.current_source_revision,updated_at=now();
 v_result:=jsonb_build_object('disposition','committed','source',to_jsonb(v_source),'source_revision',to_jsonb(v_rev));
 insert into tongs.source_operation_receipts(operation_id,operation_fingerprint,operation_type,workspace_id,source_id,normalized_inputs_json,state,result_source_revision_id,receipt_json,created_by)
 values(p_operation_id,p_operation_fingerprint,'source_revision',p_workspace_id,v_source.id,jsonb_build_object('stable_key',p_stable_key,'expected_revision',p_expected_revision),'committed',v_rev.id,v_result,p_actor_id);
 return v_result;
end $$;

create or replace function tongs.commit_workpiece_source_link_revision(
 p_workspace_id uuid,p_workpiece_id uuid,p_link_id uuid,p_expected_revision bigint,
 p_source_revision_id uuid,p_source_revision bigint,p_relationship_type text,
 p_script_approval_id uuid,p_script_approval_revision bigint,p_citation_anchor_json jsonb,
 p_document_locator_json jsonb,p_media_range_json jsonb,p_quotation_excerpt_hash text,
 p_relationship_note text,p_provenance_json jsonb,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.source_operation_receipts%rowtype; v_source_rev tongs.source_revisions%rowtype;
 v_seq tongs.workpiece_source_link_sequences%rowtype; v_prev tongs.workpiece_source_link_revisions%rowtype;
 v_rev tongs.workpiece_source_link_revisions%rowtype; v_link uuid:=coalesce(p_link_id,gen_random_uuid());
 v_content_hash text; v_immutable_hash text; v_result jsonb; v_next bigint;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if auth.uid() is distinct from p_actor_id then raise exception 'Source-link actor must match authenticated creator' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into v_op from tongs.source_operation_receipts where operation_id=p_operation_id for update;
 if found then
  if v_op.operation_fingerprint<>p_operation_fingerprint or v_op.workspace_id<>p_workspace_id or v_op.workpiece_id is distinct from p_workpiece_id or v_op.operation_type<>'workpiece_link' then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  return v_op.receipt_json;
 end if;
 select * into v_source_rev from tongs.source_revisions where id=p_source_revision_id and workspace_id=p_workspace_id and revision=p_source_revision;
 if not found then return jsonb_build_object('disposition','source_revision_not_found'); end if;
 select * into v_seq from tongs.workpiece_source_link_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and link_id=v_link for update;
 if found then
  if v_seq.current_link_revision<>p_expected_revision then return jsonb_build_object('disposition','link_revision_conflict','current_revision_id',v_seq.current_link_revision_id,'current_revision',v_seq.current_link_revision); end if;
  select * into v_prev from tongs.workpiece_source_link_revisions where id=v_seq.current_link_revision_id;
 else
  if p_expected_revision<>0 then return jsonb_build_object('disposition','link_revision_conflict','current_revision',0); end if;
 end if;
 v_next:=coalesce(v_seq.current_link_revision,0)+1;
 v_content_hash:=encode(extensions.digest(convert_to(jsonb_strip_nulls(jsonb_build_object('source_revision_id',v_source_rev.id,'source_revision',v_source_rev.revision,'relationship_type',btrim(p_relationship_type),'script_approval_id',p_script_approval_id,'script_approval_revision',p_script_approval_revision,'citation_anchor',coalesce(p_citation_anchor_json,'{}'::jsonb),'document_locator',coalesce(p_document_locator_json,'{}'::jsonb),'media_range',coalesce(p_media_range_json,'{}'::jsonb),'quotation_excerpt_hash',lower(p_quotation_excerpt_hash),'relationship_note',nullif(btrim(p_relationship_note),''),'provenance',coalesce(p_provenance_json,'{}'::jsonb)))::text,'UTF8'),'sha256'),'hex');
 v_immutable_hash:=encode(extensions.digest(convert_to(jsonb_build_object('link_id',v_link,'revision',v_next,'previous_revision_id',v_prev.id,'content_hash',v_content_hash)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.workpiece_source_link_revisions(link_id,workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,source_id,source_revision_id,source_revision,relationship_type,script_approval_id,script_approval_revision,citation_anchor_json,document_locator_json,media_range_json,quotation_excerpt_hash,relationship_note,provenance_json,content_hash,immutable_revision_hash,created_by)
 values(v_link,p_workspace_id,p_workpiece_id,v_next,v_prev.id,v_prev.revision,v_source_rev.source_id,v_source_rev.id,v_source_rev.revision,btrim(p_relationship_type),p_script_approval_id,p_script_approval_revision,coalesce(p_citation_anchor_json,'{}'::jsonb),coalesce(p_document_locator_json,'{}'::jsonb),coalesce(p_media_range_json,'{}'::jsonb),lower(p_quotation_excerpt_hash),nullif(btrim(p_relationship_note),''),coalesce(p_provenance_json,'{}'::jsonb),v_content_hash,v_immutable_hash,p_actor_id) returning * into v_rev;
 insert into tongs.workpiece_source_link_sequences(workspace_id,workpiece_id,link_id,current_link_revision_id,current_link_revision) values(p_workspace_id,p_workpiece_id,v_link,v_rev.id,v_rev.revision)
 on conflict(workspace_id,workpiece_id,link_id) do update set current_link_revision_id=excluded.current_link_revision_id,current_link_revision=excluded.current_link_revision,updated_at=now();
 v_result:=jsonb_build_object('disposition','committed','link_revision',to_jsonb(v_rev),'source_revision',to_jsonb(v_source_rev));
 insert into tongs.source_operation_receipts(operation_id,operation_fingerprint,operation_type,workspace_id,workpiece_id,source_id,link_id,normalized_inputs_json,state,result_source_revision_id,result_link_revision_id,receipt_json,created_by)
 values(p_operation_id,p_operation_fingerprint,'workpiece_link',p_workspace_id,p_workpiece_id,v_source_rev.source_id,v_link,jsonb_build_object('expected_revision',p_expected_revision),'committed',v_source_rev.id,v_rev.id,v_result,p_actor_id);
 return v_result;
end $$;

create or replace function tongs.adopt_legacy_source(
 p_workspace_id uuid,p_workpiece_id uuid,p_legacy_source_id text,p_legacy_source_path text,p_legacy_source_revision bigint,p_legacy_source_hash text,
 p_legacy_links_path text,p_legacy_links_revision bigint,p_legacy_links_hash text,p_source_type text,p_title text,p_author_creator text,p_publisher text,
 p_published_at timestamptz,p_canonical_url text,p_document_identity text,p_relationship_type text,p_script_approval_id uuid,p_script_approval_revision bigint,
 p_citation_anchor_json jsonb,p_document_locator_json jsonb,p_media_range_json jsonb,p_quotation_excerpt_hash text,p_relationship_note text,
 p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.source_operation_receipts%rowtype; v_source tongs.sources%rowtype; v_rev tongs.source_revisions%rowtype;
 v_link tongs.workpiece_source_link_revisions%rowtype; v_source_hash text; v_source_immutable text; v_link_hash text; v_link_immutable text; v_link_id uuid; v_result jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if auth.uid() is distinct from p_actor_id then raise exception 'Legacy-adoption actor must match authenticated creator' using errcode='42501'; end if;
 if p_legacy_source_hash!~'^[0-9a-f]{64}$' or p_legacy_links_hash!~'^[0-9a-f]{64}$' or p_legacy_source_revision<1 or p_legacy_links_revision<1 then return jsonb_build_object('disposition','legacy_evidence_invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into v_op from tongs.source_operation_receipts where operation_id=p_operation_id for update;
 if found then
  if v_op.operation_fingerprint<>p_operation_fingerprint or v_op.workspace_id<>p_workspace_id or v_op.workpiece_id is distinct from p_workpiece_id or v_op.operation_type<>'legacy_adoption' then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  return v_op.receipt_json;
 end if;
 insert into tongs.sources(workspace_id,stable_key,created_by) values(p_workspace_id,'legacy:'||btrim(p_legacy_source_id),p_actor_id)
 on conflict(workspace_id,stable_key) do nothing;
 select * into v_source from tongs.sources where workspace_id=p_workspace_id and stable_key='legacy:'||btrim(p_legacy_source_id) for update;
 if exists(select 1 from tongs.source_sequences where workspace_id=p_workspace_id and source_id=v_source.id) then return jsonb_build_object('disposition','legacy_source_already_adopted'); end if;
 v_source_hash:=encode(extensions.digest(convert_to(jsonb_strip_nulls(jsonb_build_object('source_type',p_source_type,'title',p_title,'author_creator',p_author_creator,'publisher',p_publisher,'published_at',p_published_at,'canonical_url',p_canonical_url,'document_identity',p_document_identity,'legacy_path',p_legacy_source_path,'legacy_revision',p_legacy_source_revision,'legacy_hash',lower(p_legacy_source_hash)))::text,'UTF8'),'sha256'),'hex');
 v_source_immutable:=encode(extensions.digest(convert_to(jsonb_build_object('source_id',v_source.id,'revision',1,'content_hash',v_source_hash)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.source_revisions(source_id,workspace_id,revision,source_type,title,author_creator,publisher,published_at,canonical_url,document_identity,metadata_json,provenance_json,metadata_contract_version,provenance_contract_version,content_hash,immutable_revision_hash,created_by)
 values(v_source.id,p_workspace_id,1,btrim(p_source_type),btrim(p_title),nullif(btrim(p_author_creator),''),nullif(btrim(p_publisher),''),p_published_at,nullif(btrim(p_canonical_url),''),nullif(btrim(p_document_identity),''),'{}'::jsonb,jsonb_build_object('source','legacy_current_state','legacy_source_path',p_legacy_source_path,'legacy_source_revision',p_legacy_source_revision,'legacy_source_hash',lower(p_legacy_source_hash)),'forge.source.metadata.v1','forge.source.provenance.v1',v_source_hash,v_source_immutable,p_actor_id) returning * into v_rev;
 insert into tongs.source_sequences values(p_workspace_id,v_source.id,v_rev.id,1,now());
 v_link_id:=gen_random_uuid();
 v_link_hash:=encode(extensions.digest(convert_to(jsonb_strip_nulls(jsonb_build_object('source_revision_id',v_rev.id,'relationship_type',p_relationship_type,'script_approval_id',p_script_approval_id,'script_approval_revision',p_script_approval_revision,'citation_anchor',coalesce(p_citation_anchor_json,'{}'::jsonb),'document_locator',coalesce(p_document_locator_json,'{}'::jsonb),'media_range',coalesce(p_media_range_json,'{}'::jsonb),'quotation_excerpt_hash',lower(p_quotation_excerpt_hash),'relationship_note',p_relationship_note,'legacy_links_path',p_legacy_links_path,'legacy_links_revision',p_legacy_links_revision,'legacy_links_hash',lower(p_legacy_links_hash)))::text,'UTF8'),'sha256'),'hex');
 v_link_immutable:=encode(extensions.digest(convert_to(jsonb_build_object('link_id',v_link_id,'revision',1,'content_hash',v_link_hash)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.workpiece_source_link_revisions(link_id,workspace_id,workpiece_id,revision,source_id,source_revision_id,source_revision,relationship_type,script_approval_id,script_approval_revision,citation_anchor_json,document_locator_json,media_range_json,quotation_excerpt_hash,relationship_note,provenance_json,content_hash,immutable_revision_hash,created_by)
 values(v_link_id,p_workspace_id,p_workpiece_id,1,v_source.id,v_rev.id,1,btrim(p_relationship_type),p_script_approval_id,p_script_approval_revision,coalesce(p_citation_anchor_json,'{}'::jsonb),coalesce(p_document_locator_json,'{}'::jsonb),coalesce(p_media_range_json,'{}'::jsonb),lower(p_quotation_excerpt_hash),nullif(btrim(p_relationship_note),''),jsonb_build_object('source','legacy_current_state','legacy_links_path',p_legacy_links_path,'legacy_links_revision',p_legacy_links_revision,'legacy_links_hash',lower(p_legacy_links_hash)),v_link_hash,v_link_immutable,p_actor_id) returning * into v_link;
 insert into tongs.workpiece_source_link_sequences values(p_workspace_id,p_workpiece_id,v_link_id,v_link.id,1,now());
 v_result:=jsonb_build_object('disposition','committed','adoption','legacy_current_state','source',to_jsonb(v_source),'source_revision',to_jsonb(v_rev),'link_revision',to_jsonb(v_link));
 insert into tongs.source_operation_receipts(operation_id,operation_fingerprint,operation_type,workspace_id,workpiece_id,source_id,link_id,normalized_inputs_json,state,result_source_revision_id,result_link_revision_id,receipt_json,created_by)
 values(p_operation_id,p_operation_fingerprint,'legacy_adoption',p_workspace_id,p_workpiece_id,v_source.id,v_link_id,jsonb_build_object('legacy_source_path',p_legacy_source_path,'legacy_source_revision',p_legacy_source_revision,'legacy_source_hash',lower(p_legacy_source_hash),'legacy_links_path',p_legacy_links_path,'legacy_links_revision',p_legacy_links_revision,'legacy_links_hash',lower(p_legacy_links_hash)),'committed',v_rev.id,v_link.id,v_result,p_actor_id);
 return v_result;
end $$;

create or replace function tongs.read_current_source(p_workspace_id uuid,p_source_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,tongs as $$
 select case when not tongs.has_workspace_role(p_workspace_id,'viewer') then null else (
  select jsonb_build_object('source',to_jsonb(src),'sequence',to_jsonb(seq),'source_revision',to_jsonb(rev))
  from tongs.sources src join tongs.source_sequences seq on seq.workspace_id=src.workspace_id and seq.source_id=src.id
  join tongs.source_revisions rev on rev.id=seq.current_source_revision_id
  where src.workspace_id=p_workspace_id and src.id=p_source_id
 ) end
$$;

create or replace function tongs.read_workpiece_sources(p_workspace_id uuid,p_workpiece_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,tongs as $$
 select case when not tongs.has_workspace_role(p_workspace_id,'viewer') then null else jsonb_build_object(
  'workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,'links',coalesce((
   select jsonb_agg(jsonb_build_object('sequence',to_jsonb(seq),'link_revision',to_jsonb(link),'source_revision',to_jsonb(src_rev),'source',to_jsonb(src)) order by link.created_at)
   from tongs.workpiece_source_link_sequences seq
   join tongs.workpiece_source_link_revisions link on link.id=seq.current_link_revision_id
   join tongs.source_revisions src_rev on src_rev.id=link.source_revision_id
   join tongs.sources src on src.id=src_rev.source_id
   where seq.workspace_id=p_workspace_id and seq.workpiece_id=p_workpiece_id
  ),'[]'::jsonb)) end
$$;

create or replace function tongs.read_source_operation_receipt(p_workspace_id uuid,p_operation_id text) returns jsonb
language sql stable security definer set search_path=pg_catalog,tongs as $$
 select case when not tongs.has_workspace_role(p_workspace_id,'viewer') then null else (
  select to_jsonb(op) from tongs.source_operation_receipts op where op.workspace_id=p_workspace_id and op.operation_id=p_operation_id
 ) end
$$;

do $$ declare v_table text; begin
 foreach v_table in array array['sources','source_revisions','source_sequences','workpiece_source_link_revisions','workpiece_source_link_sequences','source_operation_receipts'] loop
  execute format('alter table tongs.%I enable row level security',v_table);
  execute format('create policy %I on tongs.%I for select to authenticated using(tongs.has_workspace_role(workspace_id,''viewer''))',v_table||'_viewer',v_table);
  execute format('revoke all on tongs.%I from public,anon,authenticated',v_table);
  execute format('grant select on tongs.%I to authenticated',v_table);
 end loop;
end $$;

revoke all on function tongs.commit_source_revision(uuid,uuid,text,bigint,text,text,text,text,timestamptz,text,text,uuid,text,jsonb,jsonb,text,text,text,text,uuid),
 tongs.commit_workpiece_source_link_revision(uuid,uuid,uuid,bigint,uuid,bigint,text,uuid,bigint,jsonb,jsonb,jsonb,text,text,jsonb,text,text,uuid),
 tongs.adopt_legacy_source(uuid,uuid,text,text,bigint,text,text,bigint,text,text,text,text,text,timestamptz,text,text,text,uuid,bigint,jsonb,jsonb,jsonb,text,text,text,text,uuid)
 from public,anon,authenticated;
grant execute on function tongs.commit_source_revision(uuid,uuid,text,bigint,text,text,text,text,timestamptz,text,text,uuid,text,jsonb,jsonb,text,text,text,text,uuid),
 tongs.commit_workpiece_source_link_revision(uuid,uuid,uuid,bigint,uuid,bigint,text,uuid,bigint,jsonb,jsonb,jsonb,text,text,jsonb,text,text,uuid),
 tongs.adopt_legacy_source(uuid,uuid,text,text,bigint,text,text,bigint,text,text,text,text,text,timestamptz,text,text,text,uuid,bigint,jsonb,jsonb,jsonb,text,text,text,text,uuid)
 to authenticated,service_role;
grant execute on function tongs.read_current_source(uuid,uuid),tongs.read_workpiece_sources(uuid,uuid),tongs.read_source_operation_receipt(uuid,text)
 to authenticated,service_role;

comment on table tongs.sources is 'Stable workspace-scoped Source identities. Source content lives in immutable source_revisions.';
comment on table tongs.source_revisions is 'Immutable canonical Source metadata and optional exact canonical asset-byte identity.';
comment on table tongs.workpiece_source_link_revisions is 'Immutable evidence describing how one workpiece uses one exact Source revision.';
comment on function tongs.adopt_legacy_source is 'Explicit replay-safe adoption of one current legacy Source and workpiece link. It never invents historical revisions.';

commit;
