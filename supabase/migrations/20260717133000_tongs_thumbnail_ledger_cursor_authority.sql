-- Complete the append-only provider cursor authority and correct empty freshness projection.
begin;

create or replace function tongs.append_thumbnail_ledger_ingestion_cursor(p_workspace_id uuid,p_provider text,p_publication_id text,
  p_cursor_identity text,p_cursor_json jsonb,p_status text,p_last_success_at timestamptz,p_last_error text)
returns table(cursor_id uuid,disposition text) language plpgsql security definer set search_path=tongs,public as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  perform tongs.assert_workspace_role(p_workspace_id,'editor');
  select id into v_id from tongs.thumbnail_ledger_ingestion_cursors where workspace_id=p_workspace_id and provider=p_provider
    and publication_id=p_publication_id and cursor_identity=p_cursor_identity order by recorded_at desc limit 1;
  if v_id is not null then return query select v_id,'existing'::text; return; end if;
  insert into tongs.thumbnail_ledger_ingestion_cursors(workspace_id,provider,publication_id,cursor_identity,cursor_json,status,last_success_at,last_error,created_by)
  values(p_workspace_id,p_provider,p_publication_id,p_cursor_identity,p_cursor_json,p_status,p_last_success_at,p_last_error,v_user) returning id into v_id;
  return query select v_id,'created'::text;
end $$;

create or replace function tongs.get_thumbnail_ledger_ingestion_cursor(p_workspace_id uuid,p_provider text,p_publication_id text)
returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_result jsonb;
begin perform tongs.assert_workspace_role(p_workspace_id,'viewer');
  select to_jsonb(x) into v_result from (select cursor_identity,cursor_json,status,last_success_at,last_error,recorded_at
    from tongs.thumbnail_ledger_ingestion_cursors where workspace_id=p_workspace_id and provider=p_provider and publication_id=p_publication_id
    order by recorded_at desc limit 1)x;
  return coalesce(v_result,'null'::jsonb);
end $$;

create or replace function tongs.list_thumbnail_ledger_intelligence(p_workspace_id uuid,p_limit int default 100)
returns table(launch_intervals jsonb,performance_observations jsonb,analyses jsonb,experiments jsonb,freshness jsonb)
language plpgsql security definer set search_path=tongs,public as $$ begin perform tongs.assert_workspace_role(p_workspace_id,'viewer'); return query select
  coalesce((select jsonb_agg(to_jsonb(x) order by started_at desc) from (select * from tongs.thumbnail_launch_intervals where workspace_id=p_workspace_id order by started_at desc limit least(greatest(p_limit,1),500))x),'[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(x) order by collected_at desc) from (select * from tongs.thumbnail_performance_observations where workspace_id=p_workspace_id order by collected_at desc limit least(greatest(p_limit,1),500))x),'[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from (select * from tongs.thumbnail_ledger_analyses where workspace_id=p_workspace_id order by created_at desc limit least(greatest(p_limit,1),500))x),'[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from (select * from tongs.thumbnail_launch_experiments where workspace_id=p_workspace_id order by created_at desc limit least(greatest(p_limit,1),500))x),'[]'::jsonb),
  coalesce((select to_jsonb(x) from (select max(last_success_at) last_collected_at,case when count(*)=0 then 'unavailable' when bool_or(status='disconnected') then 'disconnected' when max(last_success_at)<now()-interval '48 hours' then 'stale' else 'current' end state from tongs.thumbnail_ledger_ingestion_cursors where workspace_id=p_workspace_id)x),'{"last_collected_at":null,"state":"unavailable"}'::jsonb); end $$;

revoke all on function tongs.append_thumbnail_ledger_ingestion_cursor(uuid,text,text,text,jsonb,text,timestamptz,text),tongs.get_thumbnail_ledger_ingestion_cursor(uuid,text,text) from public;
grant execute on function tongs.append_thumbnail_ledger_ingestion_cursor(uuid,text,text,text,jsonb,text,timestamptz,text),tongs.get_thumbnail_ledger_ingestion_cursor(uuid,text,text) to authenticated,service_role;
commit;
