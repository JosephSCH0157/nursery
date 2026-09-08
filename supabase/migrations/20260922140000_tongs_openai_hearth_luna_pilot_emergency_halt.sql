-- Stop new Luna pilot submissions without disturbing an in-flight or unresolved reservation.
-- This migration changes no production rollout state by itself.
begin;

create or replace function tongs.halt_owner_hearth_chat_luna_pilot(
  p_operator_user_id uuid,p_budget_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_budget tongs.owner_operating_budgets%rowtype;
  v_budget_revision tongs.owner_operating_budget_revisions%rowtype;
  v_rollout tongs.openai_text_rollout_revisions%rowtype;
  v_next_rollout integer;
begin
  perform tongs._require_pricing_service_role();
  if p_operator_user_id is null or not tongs.is_platform_operator(p_operator_user_id)
     or p_budget_id is null or v_reason is null then
    raise exception 'invalid owner Luna pilot halt' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('owner-hearth-openai-luna-pilot',0));
  select * into v_budget from tongs.owner_operating_budgets where id=p_budget_id;
  select * into v_budget_revision from tongs.owner_operating_budget_revisions
    where budget_id=p_budget_id order by revision desc limit 1;
  if not found or v_budget.created_by<>p_operator_user_id or v_budget.environment<>'production'
     or lower(coalesce(v_budget.provider,''))<>'openai'
     or lower(coalesce(v_budget.route,''))<>'hearth.chat_completion'
     or lower(coalesce(v_budget.sku,''))<>'gpt-5.6-luna'
     or v_budget_revision.maximum_amount_micros<>11015 then
    raise exception 'exact owner Luna pilot budget not found' using errcode='P0002';
  end if;
  select * into v_rollout from tongs._current_openai_text_rollout('hearth.chat_completion');
  if v_rollout.mode<>'halt_new' then
    select coalesce(max(revision),0)+1 into v_next_rollout
      from tongs.openai_text_rollout_revisions where route_code='hearth.chat_completion';
    insert into tongs.openai_text_rollout_revisions(
      route_code,revision,mode,cost_policy_revision_id,reason,actor_id
    ) values (
      'hearth.chat_completion',v_next_rollout,'halt_new',v_rollout.cost_policy_revision_id,
      v_reason,p_operator_user_id
    );
  else
    v_next_rollout:=v_rollout.revision;
  end if;
  return jsonb_build_object(
    'budget_id',p_budget_id,'budget_status',v_budget_revision.status,
    'rollout_mode','halt_new','rollout_revision',v_next_rollout,
    'new_reservations_enabled',false,'existing_reservations_preserved',true
  );
end $$;

revoke all on function tongs.halt_owner_hearth_chat_luna_pilot(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function tongs.halt_owner_hearth_chat_luna_pilot(uuid,uuid,text)
  to service_role;

comment on function tongs.halt_owner_hearth_chat_luna_pilot(uuid,uuid,text) is
  'Emergency halt for the exact approved Luna owner pilot. Stops new submissions while preserving unresolved reservations and their budget.';

notify pgrst,'reload schema';
commit;
