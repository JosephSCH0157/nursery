-- Canonical proposal/result persistence for paid text routes whose creator-facing
-- endpoints previously returned an ephemeral response. Pricing and rollout are
-- deliberately unchanged by this migration.

begin;

create table tongs.hearth_research_synthesis_results (
  id uuid primary key default gen_random_uuid(), operation_id text not null unique,
  reservation_id uuid not null unique, user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  request_fingerprint text not null check(request_fingerprint~'^[0-9a-f]{64}$'), provider_request_id text,
  input_units bigint not null check(input_units>=0), output_units bigint not null check(output_units>=0),
  result_json jsonb not null check(jsonb_typeof(result_json)='object'), created_at timestamptz not null default now()
);
create table tongs.hammer_transcript_cleanup_assist_results (
  id uuid primary key default gen_random_uuid(), operation_id text not null unique,
  reservation_id uuid not null unique, user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  request_fingerprint text not null check(request_fingerprint~'^[0-9a-f]{64}$'), provider_request_id text,
  input_units bigint not null check(input_units>=0), output_units bigint not null check(output_units>=0),
  result_json jsonb not null check(jsonb_typeof(result_json)='object'), created_at timestamptz not null default now()
);
create table tongs.quench_metadata_assist_results (
  id uuid primary key default gen_random_uuid(), operation_id text not null unique,
  reservation_id uuid not null unique, user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  request_fingerprint text not null check(request_fingerprint~'^[0-9a-f]{64}$'), provider_request_id text,
  input_units bigint not null check(input_units>=0), output_units bigint not null check(output_units>=0),
  result_json jsonb not null check(jsonb_typeof(result_json)='object'), created_at timestamptz not null default now()
);

do $$ declare n text; begin foreach n in array array[
  'hearth_research_synthesis_results','hammer_transcript_cleanup_assist_results','quench_metadata_assist_results'
] loop
  execute format('alter table tongs.%I enable row level security',n);
  execute format('alter table tongs.%I force row level security',n);
  execute format('revoke all on tongs.%I from public,anon,authenticated,service_role',n);
  execute format('grant select on tongs.%I to service_role',n);
  execute format('create trigger %I before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()',n||'_immutable',n);
end loop; end $$;

create or replace function tongs._assert_openai_text_domain_result_context(
  p_route_code text,p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,p_request_fingerprint text
) returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform tongs._require_pricing_service_role();
  if not exists(select 1 from tongs.episodes e where e.id=p_workpiece_id and e.workspace_id=p_workspace_id)
    or not exists(select 1 from tongs.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=p_user_id)
    or not (
      exists(select 1 from tongs.openai_text_funding_bindings b join tongs.funding_reservations r on r.id=b.reservation_id
        join tongs.customer_spending_quotes q on q.id=r.quote_id where b.route_code=p_route_code and b.operation_id=p_operation_id
          and b.reservation_id=p_reservation_id and r.user_id=p_user_id and q.workspace_id=p_workspace_id and q.request_fingerprint=p_request_fingerprint)
      or exists(select 1 from tongs.openai_text_test_certification_operations o
        join tongs.openai_text_test_certification_reservations r on r.operation_record_id=o.id
        join tongs.openai_text_test_certification_batches b on b.id=o.batch_id
        where o.route_code=p_route_code and o.operation_id=p_operation_id and r.id=p_reservation_id
          and b.user_id=p_user_id and b.workspace_id=p_workspace_id and o.request_fingerprint=p_request_fingerprint)
    ) then raise exception 'exact paid route domain-result context required' using errcode='42501'; end if;
end $$;

create or replace function tongs.persist_hearth_research_synthesis_result(
  p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,p_request_fingerprint text,
  p_provider_request_id text,p_input_units bigint,p_output_units bigint,p_result_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r tongs.hearth_research_synthesis_results%rowtype;
begin
  perform tongs._assert_openai_text_domain_result_context('hearth.research_synthesis',p_operation_id,p_reservation_id,p_user_id,p_workspace_id,p_workpiece_id,p_request_fingerprint);
  select * into r from tongs.hearth_research_synthesis_results where reservation_id=p_reservation_id;
  if not found then insert into tongs.hearth_research_synthesis_results(operation_id,reservation_id,user_id,workspace_id,workpiece_id,request_fingerprint,provider_request_id,input_units,output_units,result_json)
    values(btrim(p_operation_id),p_reservation_id,p_user_id,p_workspace_id,p_workpiece_id,p_request_fingerprint,nullif(btrim(coalesce(p_provider_request_id,'')),''),p_input_units,p_output_units,p_result_json) returning * into r; end if;
  return r.result_json||jsonb_build_object('domain_result_id',r.id,'provider_request_id',r.provider_request_id,'input_units',r.input_units,'output_units',r.output_units);
end $$;
create or replace function tongs.read_hearth_research_synthesis_result(p_operation_id text,p_reservation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$ declare r tongs.hearth_research_synthesis_results%rowtype; begin
  perform tongs._require_pricing_service_role(); select * into r from tongs.hearth_research_synthesis_results where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id;
  if not found then raise exception 'research synthesis result not found' using errcode='P0002'; end if;
  return r.result_json||jsonb_build_object('domain_result_id',r.id,'provider_request_id',r.provider_request_id,'input_units',r.input_units,'output_units',r.output_units);
end $$;

create or replace function tongs.persist_hammer_transcript_cleanup_assist_result(
  p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,p_request_fingerprint text,
  p_provider_request_id text,p_input_units bigint,p_output_units bigint,p_result_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r tongs.hammer_transcript_cleanup_assist_results%rowtype;
begin
  perform tongs._assert_openai_text_domain_result_context('hammer.transcript_cleanup',p_operation_id,p_reservation_id,p_user_id,p_workspace_id,p_workpiece_id,p_request_fingerprint);
  select * into r from tongs.hammer_transcript_cleanup_assist_results where reservation_id=p_reservation_id;
  if not found then insert into tongs.hammer_transcript_cleanup_assist_results(operation_id,reservation_id,user_id,workspace_id,workpiece_id,request_fingerprint,provider_request_id,input_units,output_units,result_json)
    values(btrim(p_operation_id),p_reservation_id,p_user_id,p_workspace_id,p_workpiece_id,p_request_fingerprint,nullif(btrim(coalesce(p_provider_request_id,'')),''),p_input_units,p_output_units,p_result_json) returning * into r; end if;
  return r.result_json||jsonb_build_object('domain_result_id',r.id,'provider_request_id',r.provider_request_id,'input_units',r.input_units,'output_units',r.output_units);
end $$;
create or replace function tongs.read_hammer_transcript_cleanup_assist_result(p_operation_id text,p_reservation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$ declare r tongs.hammer_transcript_cleanup_assist_results%rowtype; begin
  perform tongs._require_pricing_service_role(); select * into r from tongs.hammer_transcript_cleanup_assist_results where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id;
  if not found then raise exception 'cleanup assist result not found' using errcode='P0002'; end if;
  return r.result_json||jsonb_build_object('domain_result_id',r.id,'provider_request_id',r.provider_request_id,'input_units',r.input_units,'output_units',r.output_units);
end $$;

create or replace function tongs.persist_quench_metadata_assist_result(
  p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,p_request_fingerprint text,
  p_provider_request_id text,p_input_units bigint,p_output_units bigint,p_result_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r tongs.quench_metadata_assist_results%rowtype;
begin
  perform tongs._assert_openai_text_domain_result_context('quench.metadata',p_operation_id,p_reservation_id,p_user_id,p_workspace_id,p_workpiece_id,p_request_fingerprint);
  select * into r from tongs.quench_metadata_assist_results where reservation_id=p_reservation_id;
  if not found then insert into tongs.quench_metadata_assist_results(operation_id,reservation_id,user_id,workspace_id,workpiece_id,request_fingerprint,provider_request_id,input_units,output_units,result_json)
    values(btrim(p_operation_id),p_reservation_id,p_user_id,p_workspace_id,p_workpiece_id,p_request_fingerprint,nullif(btrim(coalesce(p_provider_request_id,'')),''),p_input_units,p_output_units,p_result_json) returning * into r; end if;
  return r.result_json||jsonb_build_object('domain_result_id',r.id,'provider_request_id',r.provider_request_id,'input_units',r.input_units,'output_units',r.output_units);
end $$;
create or replace function tongs.read_quench_metadata_assist_result(p_operation_id text,p_reservation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$ declare r tongs.quench_metadata_assist_results%rowtype; begin
  perform tongs._require_pricing_service_role(); select * into r from tongs.quench_metadata_assist_results where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id;
  if not found then raise exception 'metadata assist result not found' using errcode='P0002'; end if;
  return r.result_json||jsonb_build_object('domain_result_id',r.id,'provider_request_id',r.provider_request_id,'input_units',r.input_units,'output_units',r.output_units);
end $$;

create or replace function tongs.read_hammer_shorts_discovery_paid_result(p_operation_id text,p_reservation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare d tongs.hammer_shorts_discoveries%rowtype; p tongs.hammer_shorts_ai_proposals%rowtype; u jsonb;
begin
  perform tongs._require_pricing_service_role();
  select * into d from tongs.hammer_shorts_discoveries where operation_id=btrim(p_operation_id) and state='completed';
  if not found or not (
    exists(select 1 from tongs.openai_text_funding_bindings b
      where b.reservation_id=p_reservation_id and b.operation_id=d.operation_id and b.route_code='shorts.discovery')
    or exists(select 1 from tongs.openai_text_test_certification_reservations r
      join tongs.openai_text_test_certification_operations o on o.id=r.operation_record_id
      where r.id=p_reservation_id and o.operation_id=d.operation_id and o.route_code='shorts.discovery')
  )
    then raise exception 'completed Shorts paid result not found' using errcode='P0002'; end if;
  select * into p from tongs.hammer_shorts_ai_proposals where discovery_id=d.id;
  u:=coalesce(p.proposal_json->'provider_usage','{}'::jsonb);
  return jsonb_build_object(
    'data',jsonb_build_object('discovery',to_jsonb(d),'candidates',(select coalesce(jsonb_agg(to_jsonb(c) order by c.rank),'[]'::jsonb) from tongs.hammer_short_candidates c where c.discovery_id=d.id)),
    'resolution',jsonb_build_object('outcome',d.outcome,'rejected','[]'::jsonb),
    'provider_request_id',p.provider_request_id,
    'input_units',coalesce((u->>'input_units')::bigint,0),'output_units',coalesce((u->>'output_units')::bigint,0)
  );
end $$;

revoke all on function tongs._assert_openai_text_domain_result_context(text,text,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function tongs.persist_hearth_research_synthesis_result(text,uuid,uuid,uuid,uuid,text,text,bigint,bigint,jsonb),tongs.read_hearth_research_synthesis_result(text,uuid) from public,anon,authenticated;
revoke all on function tongs.persist_hammer_transcript_cleanup_assist_result(text,uuid,uuid,uuid,uuid,text,text,bigint,bigint,jsonb),tongs.read_hammer_transcript_cleanup_assist_result(text,uuid) from public,anon,authenticated;
revoke all on function tongs.persist_quench_metadata_assist_result(text,uuid,uuid,uuid,uuid,text,text,bigint,bigint,jsonb),tongs.read_quench_metadata_assist_result(text,uuid) from public,anon,authenticated;
revoke all on function tongs.read_hammer_shorts_discovery_paid_result(text,uuid) from public,anon,authenticated;
grant execute on function tongs.persist_hearth_research_synthesis_result(text,uuid,uuid,uuid,uuid,text,text,bigint,bigint,jsonb),tongs.read_hearth_research_synthesis_result(text,uuid) to service_role;
grant execute on function tongs.persist_hammer_transcript_cleanup_assist_result(text,uuid,uuid,uuid,uuid,text,text,bigint,bigint,jsonb),tongs.read_hammer_transcript_cleanup_assist_result(text,uuid) to service_role;
grant execute on function tongs.persist_quench_metadata_assist_result(text,uuid,uuid,uuid,uuid,text,text,bigint,bigint,jsonb),tongs.read_quench_metadata_assist_result(text,uuid) to service_role;
grant execute on function tongs.read_hammer_shorts_discovery_paid_result(text,uuid) to service_role;

notify pgrst,'reload schema';
commit;
