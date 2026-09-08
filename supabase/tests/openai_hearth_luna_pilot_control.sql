begin;

alter table tongs.workspaces add column created_by uuid references auth.users(id) on delete restrict;
create table tongs.workspace_members (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null, invited_by uuid references auth.users(id) on delete set null,
  primary key(workspace_id,user_id)
);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('bd000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','luna-pilot@example.test','',now(),now(),now());
insert into tongs.workspaces(id,name,created_by)
values('bd000000-0000-4000-8000-000000000010','Luna pilot proof','bd000000-0000-4000-8000-000000000001');
insert into tongs.workspace_members(workspace_id,user_id,role,invited_by)
values('bd000000-0000-4000-8000-000000000010','bd000000-0000-4000-8000-000000000001','owner','bd000000-0000-4000-8000-000000000001');
insert into tongs.platform_operators(user_id,reason,granted_by)
values('bd000000-0000-4000-8000-000000000001','isolated Luna proof','bd000000-0000-4000-8000-000000000001');

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='bd000000-0000-4000-8000-000000000001';
set local role authenticated;
select tongs.commit_private_markup_rule_revision(
  'bd000000-0000-4000-8000-000000000019',0,3300,'[]','approved Luna markup proof');

reset role;
insert into tongs.paid_execution_control_revisions(
  revision,pricing_activation_enabled,reservation_shadow_enabled,customer_settlement_enabled,
  owner_budget_spending_enabled,provider_execution_enabled,reason
)
select revision+1,true,true,false,true,true,'isolated Luna pilot controls'
from tongs.paid_execution_control_revisions order by revision desc limit 1;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

select tongs.activate_owner_hearth_chat_luna_pilot(
  'bd000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000010',
  'bd000000-0000-4000-8000-000000000020','bd000000-0000-4000-8000-000000000021',
  'bd000000-0000-4000-8000-000000000022','bd000000-0000-4000-8000-000000000019',
  'bd000000-0000-4000-8000-000000000023','bd000000-0000-4000-8000-000000000024',
  now()+interval '23 hours','isolated Luna activation');

select tongs.prepare_owner_hearth_chat_luna_pilot(
  'bd000000-0000-4000-8000-000000000030','bd000000-0000-4000-8000-000000000031',
  'bd000000-0000-4000-8000-000000000032','bd000000-0000-4000-8000-000000000001',
  'luna-isolated-operation-0001','bd000000-0000-4000-8000-000000000010',
  'bd000000-0000-4000-8000-000000000020','bd000000-0000-4000-8000-000000000022',
  repeat('a',64),'luna-acceptance-0001','luna-reservation-0001',now()+interval '1 hour');

do $$ begin
  if (select mode from tongs._current_openai_text_rollout('hearth.chat_completion'))<>'enforce' then
    raise exception 'Luna rollout not enforced'; end if;
  if (select reserved_wholesale_spend_micros from tongs.funding_reservations
      where id='bd000000-0000-4000-8000-000000000032')<>11015 then
    raise exception 'Luna reservation ceiling changed'; end if;
  if exists(select 1 from tongs.private_pricing_publications p
      where p.pricing_revision_id='bd000000-0000-4000-8000-000000000022') then
    raise exception 'Luna pricing was published'; end if;
  begin
    perform tongs.prepare_owner_hearth_chat_luna_pilot(
      'bd000000-0000-4000-8000-000000000040','bd000000-0000-4000-8000-000000000041',
      'bd000000-0000-4000-8000-000000000042','bd000000-0000-4000-8000-000000000001',
      'luna-isolated-operation-0002','bd000000-0000-4000-8000-000000000010',
      'bd000000-0000-4000-8000-000000000020','bd000000-0000-4000-8000-000000000022',
      repeat('b',64),'luna-acceptance-0002','luna-reservation-0002',now()+interval '1 hour');
    raise exception 'second Luna reservation was allowed';
  exception when raise_exception then
    if sqlerrm='second Luna reservation was allowed' then raise; end if;
  end;
end $$;

select tongs.halt_owner_hearth_chat_luna_pilot(
  'bd000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000020',
  'isolated Luna emergency halt');

do $$ begin
  if (select mode from tongs._current_openai_text_rollout('hearth.chat_completion'))<>'halt_new' then
    raise exception 'Luna emergency halt did not stop new submissions'; end if;
  if (select status from tongs.owner_operating_budget_revisions
      where budget_id='bd000000-0000-4000-8000-000000000020' order by revision desc limit 1)<>'active' then
    raise exception 'Luna emergency halt closed the budget'; end if;
end $$;

select tongs.release_operation(
  'bd000000-0000-4000-8000-000000000032','luna-isolated-release-0001',
  'isolated proof cleanup','{}');

select tongs.rearm_owner_hearth_chat_luna_pilot(
  'bd000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000020',
  'isolated no-provider reservation replacement');

select tongs.prepare_owner_hearth_chat_luna_pilot(
  'bd000000-0000-4000-8000-000000000050','bd000000-0000-4000-8000-000000000051',
  'bd000000-0000-4000-8000-000000000052','bd000000-0000-4000-8000-000000000001',
  'luna-isolated-operation-0003','bd000000-0000-4000-8000-000000000010',
  'bd000000-0000-4000-8000-000000000020','bd000000-0000-4000-8000-000000000022',
  repeat('c',64),'luna-acceptance-0003','luna-reservation-0003',now()+interval '1 hour');

-- An unresolved cost from a superseded loss-policy revision remains recorded,
-- but must not consume this separately capped policy revision's concurrency.
reset role;
insert into tongs.openai_text_failure_exposure_holds(
  id,reservation_id,route_code,attempt_key,attempt_number,loss_policy_revision_id,
  authorized_exposure_micros,lease_expires_at
) values (
  'bd000000-0000-4000-8000-000000000060','bd000000-0000-4000-8000-000000000032',
  'hearth.chat_completion','luna-old-policy-attempt-0001',1,
  '20000000-0000-4000-8000-000000000001',20668,now()+interval '2 minutes'
);
insert into tongs.openai_text_failure_exposure_events(
  id,hold_id,sequence,event_key,event_type,actual_supplier_cost_micros,evidence_json
) values (
  'bd000000-0000-4000-8000-000000000061','bd000000-0000-4000-8000-000000000060',
  1,'luna-old-policy-attempt-0001:loss:failure','failure_realized',null,'{}'
);
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

do $$ declare v_attempt jsonb; begin
  v_attempt:=tongs.authorize_openai_text_provider_attempt(
    'bd000000-0000-4000-8000-000000000052','luna-current-policy-attempt-0001',1::smallint,
    11015::bigint,120,'{}'::jsonb);
  if coalesce((v_attempt->>'provider_execution_authorized')::boolean,false) is not true then
    raise exception 'superseded loss policy incorrectly blocked current pilot'; end if;
end $$;

select tongs.close_openai_text_failure_exposure(
  'bd000000-0000-4000-8000-000000000052','luna-current-policy-attempt-0001',
  'success_released',0,'{}');
select tongs.release_operation(
  'bd000000-0000-4000-8000-000000000052','luna-isolated-release-0003',
  'isolated rearm proof cleanup','{}');
select tongs.close_owner_hearth_chat_luna_pilot(
  'bd000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000020',
  'isolated Luna closure');

do $$ begin
  if (select status from tongs.owner_operating_budget_revisions
      where budget_id='bd000000-0000-4000-8000-000000000020' order by revision desc limit 1)<>'closed' then
    raise exception 'Luna budget not closed'; end if;
  if (select mode from tongs._current_openai_text_rollout('hearth.chat_completion'))<>'halt_new' then
    raise exception 'Luna route not halted'; end if;
end $$;

rollback;
