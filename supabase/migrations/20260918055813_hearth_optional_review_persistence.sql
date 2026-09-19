-- Optional Hearth review is advisory, but creator dispositions are durable.
-- Identity intentionally ignores report/source-file ordinals so a byte-identical
-- canonical script and deterministic finding keep the same creator disposition.
begin;

create or replace function tongs.hearth_preflight_finding_basis_hash(p_finding jsonb)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, tongs, extensions
as $function$
  select encode(
    extensions.digest(
      convert_to(
        lower(btrim(coalesce(p_finding->>'code',''))) || chr(31) ||
        lower(btrim(coalesce(p_finding->>'category',''))) || chr(31) ||
        regexp_replace(
          lower(btrim(coalesce(nullif(p_finding->>'excerpt',''),p_finding->>'message',''))),
          '[[:space:]]+',
          ' ',
          'g'
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$function$;

revoke all on function tongs.hearth_preflight_finding_basis_hash(jsonb) from public, anon;

alter table tongs.hearth_editorial_preflight_findings
  add column finding_basis_hash text
  generated always as (tongs.hearth_preflight_finding_basis_hash(finding_json)) stored;

alter table tongs.hearth_editorial_preflight_findings
  add constraint hearth_preflight_finding_basis_hash_shape
  check (finding_basis_hash ~ '^[0-9a-f]{64}$');

create index hearth_preflight_finding_basis_lookup_idx
  on tongs.hearth_editorial_preflight_findings(
    workspace_id, workpiece_id, finding_basis_hash, report_revision
  );

create index hearth_preflight_report_basis_lookup_idx
  on tongs.hearth_editorial_preflight_reports(
    workspace_id, workpiece_id, script_content_hash, checker_contract_version, revision
  );

create or replace function tongs.acknowledge_hearth_preflight_finding_v1(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_report_id uuid,
  p_finding_key text,
  p_action text,
  p_note text,
  p_operation_id text
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,tongs
as $function$
declare
  v_user uuid:=auth.uid();
  v_finding tongs.hearth_editorial_preflight_findings%rowtype;
  v_report tongs.hearth_editorial_preflight_reports%rowtype;
  v_ack tongs.hearth_preflight_finding_acknowledgements%rowtype;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then
    return jsonb_build_object('disposition','denied');
  end if;
  select * into v_ack
  from tongs.hearth_preflight_finding_acknowledgements
  where operation_id=p_operation_id;
  if found then
    return jsonb_build_object('disposition','duplicate','acknowledgement',to_jsonb(v_ack));
  end if;
  select r.* into v_report
  from tongs.hearth_editorial_preflight_reports r
  join tongs.workpiece_hearth_preflight_sequences s
    on s.current_report_id=r.id and s.current_revision=r.revision
  join tongs.workpiece_files wf
    on wf.workpiece_id=r.workpiece_id
    and wf.path=r.source_file_path
    and lower(wf.hash_value)=r.script_content_hash
  where r.id=p_report_id
    and r.workspace_id=p_workspace_id
    and r.workpiece_id=p_workpiece_id
    and (
      r.research_artifact_id is null
      or exists(
        select 1
        from tongs.workpiece_hearth_research_sequences rs
        join tongs.hearth_research_artifact_revisions ra on ra.id=rs.current_artifact_id
        where rs.workspace_id=r.workspace_id
          and rs.workpiece_id=r.workpiece_id
          and ra.id=r.research_artifact_id
          and ra.artifact_content_hash=r.research_artifact_hash
      )
    );
  if not found then
    return jsonb_build_object('disposition','stale','reason','preflight_not_current');
  end if;
  select * into v_finding
  from tongs.hearth_editorial_preflight_findings
  where report_id=p_report_id
    and finding_key=p_finding_key
    and workspace_id=p_workspace_id
    and workpiece_id=p_workpiece_id;
  if not found then
    return jsonb_build_object('disposition','not_found','reason','finding_not_found');
  end if;
  if p_action not in ('acknowledge','resolve')
    or (v_finding.severity='blocker' and p_action<>'resolve') then
    return jsonb_build_object('disposition','invalid','reason','blocking_findings_require_resolution');
  end if;

  -- An identical advisory decision already made for the same script bytes and
  -- checker contract is the durable decision. A prior resolve also dominates
  -- a later acknowledge request. Do not manufacture a report-local duplicate.
  select a.* into v_ack
  from tongs.hearth_preflight_finding_acknowledgements a
  join tongs.hearth_editorial_preflight_findings prior_finding
    on prior_finding.report_id=a.report_id
    and prior_finding.ordinal=a.finding_ordinal
  join tongs.hearth_editorial_preflight_reports prior_report
    on prior_report.id=prior_finding.report_id
  where prior_report.workspace_id=p_workspace_id
    and prior_report.workpiece_id=p_workpiece_id
    and prior_report.script_content_hash=v_report.script_content_hash
    and prior_report.checker_contract_version=v_report.checker_contract_version
    and prior_finding.finding_basis_hash=v_finding.finding_basis_hash
    and (a.action=p_action or a.action='resolve')
  order by case when a.action='resolve' then 1 else 0 end desc, a.acted_at desc
  limit 1;
  if found then
    return jsonb_build_object('disposition','duplicate','acknowledgement',to_jsonb(v_ack));
  end if;

  insert into tongs.hearth_preflight_finding_acknowledgements(
    workspace_id,workpiece_id,report_id,report_revision,finding_ordinal,
    action,note,operation_id,acted_by
  ) values(
    p_workspace_id,p_workpiece_id,p_report_id,v_finding.report_revision,
    v_finding.ordinal,p_action,nullif(btrim(coalesce(p_note,'')),''),p_operation_id,v_user
  ) returning * into v_ack;
  return jsonb_build_object('disposition','saved','acknowledgement',to_jsonb(v_ack));
end;
$function$;

create or replace function tongs.review_hearth_editorial_preflight_v1(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_report_id uuid,
  p_operation_id text
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,tongs
as $function$
declare
  v_user uuid:=auth.uid();
  v_report tongs.hearth_editorial_preflight_reports%rowtype;
  v_receipt tongs.hearth_preflight_review_receipts%rowtype;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then
    return jsonb_build_object('disposition','denied');
  end if;
  select * into v_receipt
  from tongs.hearth_preflight_review_receipts
  where operation_id=p_operation_id or report_id=p_report_id;
  if found then
    return jsonb_build_object('disposition','duplicate','review',to_jsonb(v_receipt));
  end if;
  select r.* into v_report
  from tongs.hearth_editorial_preflight_reports r
  join tongs.workpiece_hearth_preflight_sequences s
    on s.current_report_id=r.id and s.current_revision=r.revision
  join tongs.workpiece_files wf
    on wf.workpiece_id=r.workpiece_id
    and wf.path=r.source_file_path
    and lower(wf.hash_value)=r.script_content_hash
  where r.id=p_report_id
    and r.workspace_id=p_workspace_id
    and r.workpiece_id=p_workpiece_id
    and (
      r.research_artifact_id is null
      or exists(
        select 1
        from tongs.workpiece_hearth_research_sequences rs
        join tongs.hearth_research_artifact_revisions ra on ra.id=rs.current_artifact_id
        where rs.workspace_id=r.workspace_id
          and rs.workpiece_id=r.workpiece_id
          and ra.id=r.research_artifact_id
          and ra.artifact_content_hash=r.research_artifact_hash
      )
    );
  if not found then
    return jsonb_build_object('disposition','stale','reason','preflight_not_current');
  end if;
  if exists(
    select 1
    from tongs.hearth_editorial_preflight_findings current_finding
    where current_finding.report_id=v_report.id
      and current_finding.severity in ('blocker','warning')
      and not exists(
        select 1
        from tongs.hearth_preflight_finding_acknowledgements a
        join tongs.hearth_editorial_preflight_findings prior_finding
          on prior_finding.report_id=a.report_id
          and prior_finding.ordinal=a.finding_ordinal
        join tongs.hearth_editorial_preflight_reports prior_report
          on prior_report.id=prior_finding.report_id
        where prior_report.workspace_id=v_report.workspace_id
          and prior_report.workpiece_id=v_report.workpiece_id
          and prior_report.script_content_hash=v_report.script_content_hash
          and prior_report.checker_contract_version=v_report.checker_contract_version
          and prior_finding.finding_basis_hash=current_finding.finding_basis_hash
          and (
            (current_finding.severity='blocker' and a.action='resolve')
            or (current_finding.severity='warning' and a.action in ('acknowledge','resolve'))
          )
      )
  ) then
    return jsonb_build_object('disposition','blocked','reason','findings_unhandled');
  end if;
  insert into tongs.hearth_preflight_review_receipts(
    workspace_id,workpiece_id,report_id,report_revision,script_content_hash,
    research_artifact_id,research_artifact_hash,operation_id,reviewed_by
  ) values(
    p_workspace_id,p_workpiece_id,v_report.id,v_report.revision,v_report.script_content_hash,
    v_report.research_artifact_id,v_report.research_artifact_hash,p_operation_id,v_user
  ) returning * into v_receipt;
  return jsonb_build_object('disposition','reviewed','review',to_jsonb(v_receipt));
end;
$function$;

create or replace function tongs.read_current_hearth_preflight_v1(
  p_workspace_id uuid,
  p_workpiece_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,tongs
as $function$
declare
  v_user uuid:=auth.uid();
  v_report tongs.hearth_editorial_preflight_reports%rowtype;
  v_file tongs.workpiece_files%rowtype;
  v_research tongs.hearth_research_artifact_revisions%rowtype;
  v_review tongs.hearth_preflight_review_receipts%rowtype;
  v_stale text[]:='{}';
  v_report_hash text;
  v_projection_hash text;
  v_finding_count int;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'viewer') then
    return jsonb_build_object('disposition','denied');
  end if;
  select r.* into v_report
  from tongs.hearth_editorial_preflight_reports r
  join tongs.workpiece_hearth_preflight_sequences s on s.current_report_id=r.id
  where s.workspace_id=p_workspace_id
    and s.workpiece_id=p_workpiece_id
    and s.current_revision=r.revision;
  if not found then
    if exists(
      select 1 from tongs.workpiece_hearth_preflight_sequences
      where workspace_id=p_workspace_id
        and workpiece_id=p_workpiece_id
        and current_report_id is not null
    ) then
      return jsonb_build_object('disposition','integrity_error','reason','current_pointer_mismatch');
    end if;
    return jsonb_build_object('disposition','empty','report',null);
  end if;
  v_report_hash:=encode(extensions.digest(convert_to(v_report.report_json::text,'UTF8'),'sha256'),'hex');
  v_projection_hash:=encode(extensions.digest(convert_to(coalesce(v_report.report_json->'findings','[]'::jsonb)::text,'UTF8'),'sha256'),'hex');
  v_finding_count:=jsonb_array_length(coalesce(v_report.report_json->'findings','[]'::jsonb));
  if v_report_hash<>v_report.report_content_hash then
    return jsonb_build_object('disposition','integrity_error','reason','canonical_report_hash_mismatch');
  end if;
  if v_projection_hash<>v_report.projection_content_hash
    or (select count(*) from tongs.hearth_editorial_preflight_findings where report_id=v_report.id)<>v_finding_count then
    return jsonb_build_object('disposition','integrity_error','reason','finding_projection_count_mismatch');
  end if;
  if exists(
    select 1
    from tongs.hearth_editorial_preflight_findings f
    cross join lateral (select (v_report.report_json->'findings')->f.ordinal item) j
    where f.report_id=v_report.id
      and (
        j.item is null
        or f.content_hash<>encode(extensions.digest(convert_to(j.item::text,'UTF8'),'sha256'),'hex')
        or f.finding_key is distinct from coalesce(nullif(j.item->>'id',''),'finding-'||f.ordinal::text)
        or f.finding_code is distinct from coalesce(nullif(j.item->>'code',''),'unknown')
        or f.severity is distinct from coalesce(nullif(j.item->>'severity',''),'warning')
        or f.category is distinct from coalesce(nullif(j.item->>'category',''),'editorial')
        or f.message is distinct from coalesce(nullif(j.item->>'message',''),'Unspecified producer finding.')
        or f.finding_basis_hash<>tongs.hearth_preflight_finding_basis_hash(j.item)
      )
  ) then
    return jsonb_build_object('disposition','integrity_error','reason','finding_projection_mismatch');
  end if;
  select * into v_file
  from tongs.workpiece_files
  where workpiece_id=p_workpiece_id and path=v_report.source_file_path;
  if not found or lower(v_file.hash_value)<>v_report.script_content_hash then
    v_stale:=array_append(v_stale,'script_changed');
  end if;
  if v_report.research_artifact_id is not null then
    select r.* into v_research
    from tongs.hearth_research_artifact_revisions r
    join tongs.workpiece_hearth_research_sequences s on s.current_artifact_id=r.id
    where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id;
    if not found
      or v_research.id<>v_report.research_artifact_id
      or v_research.artifact_content_hash<>v_report.research_artifact_hash then
      v_stale:=array_append(v_stale,'research_changed');
    end if;
  end if;
  select * into v_review
  from tongs.hearth_preflight_review_receipts
  where report_id=v_report.id;
  return jsonb_build_object(
    'disposition',case when cardinality(v_stale)>0 then 'stale' else 'current' end,
    'stale_reasons',to_jsonb(v_stale),
    'report',to_jsonb(v_report),
    'review',case when v_review.id is null then null else to_jsonb(v_review) end,
    'findings',(
      select coalesce(jsonb_agg(
        to_jsonb(current_finding) || jsonb_build_object(
          'latest_action',(
            select a.action
            from tongs.hearth_preflight_finding_acknowledgements a
            join tongs.hearth_editorial_preflight_findings prior_finding
              on prior_finding.report_id=a.report_id
              and prior_finding.ordinal=a.finding_ordinal
            join tongs.hearth_editorial_preflight_reports prior_report
              on prior_report.id=prior_finding.report_id
            where prior_report.workspace_id=v_report.workspace_id
              and prior_report.workpiece_id=v_report.workpiece_id
              and prior_report.script_content_hash=v_report.script_content_hash
              and prior_report.checker_contract_version=v_report.checker_contract_version
              and prior_finding.finding_basis_hash=current_finding.finding_basis_hash
            order by case when a.action='resolve' then 1 else 0 end desc, a.acted_at desc
            limit 1
          )
        ) order by current_finding.ordinal
      ),'[]')
      from tongs.hearth_editorial_preflight_findings current_finding
      where current_finding.report_id=v_report.id
    )
  );
end;
$function$;

revoke all on function tongs.acknowledge_hearth_preflight_finding_v1(uuid,uuid,uuid,text,text,text,text),
  tongs.review_hearth_editorial_preflight_v1(uuid,uuid,uuid,text),
  tongs.read_current_hearth_preflight_v1(uuid,uuid)
from public, anon;
grant execute on function tongs.acknowledge_hearth_preflight_finding_v1(uuid,uuid,uuid,text,text,text,text),
  tongs.review_hearth_editorial_preflight_v1(uuid,uuid,uuid,text),
  tongs.read_current_hearth_preflight_v1(uuid,uuid)
to authenticated, service_role;

alter function tongs.acknowledge_hearth_preflight_finding_v1(uuid,uuid,uuid,text,text,text,text) owner to postgres;
alter function tongs.review_hearth_editorial_preflight_v1(uuid,uuid,uuid,text) owner to postgres;
alter function tongs.read_current_hearth_preflight_v1(uuid,uuid) owner to postgres;
alter function tongs.hearth_preflight_finding_basis_hash(jsonb) owner to postgres;

comment on column tongs.hearth_editorial_preflight_findings.finding_basis_hash is
  'Stable advisory identity for code/category plus normalized excerpt or message; combined with workpiece, script hash, and checker contract during disposition hydration.';
comment on table tongs.hearth_preflight_finding_acknowledgements is
  'Immutable creator advisory decisions. Current Hearth review hydrates matching decisions by stable finding basis; these rows never participate in approval or Ready authority.';

commit;
