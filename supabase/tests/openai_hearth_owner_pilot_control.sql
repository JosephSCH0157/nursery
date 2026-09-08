begin;

-- The compact billing-only baseline omits the production workspace ownership
-- columns and membership table. Add their compatible shape inside this rolled
-- back proof transaction so the production authorization path is exercised.
alter table tongs.workspaces add column created_by uuid references auth.users(id) on delete restrict;
create table tongs.workspace_members (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  invited_by uuid references auth.users(id) on delete set null,
  primary key(workspace_id,user_id)
);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('bf000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','owner-pilot@example.test','',now(),now(),now());
insert into tongs.workspaces(id,name,created_by)
values('bf000000-0000-4000-8000-000000000010','Owner pilot proof','bf000000-0000-4000-8000-000000000001');
insert into tongs.workspace_members(workspace_id,user_id,role,invited_by)
values('bf000000-0000-4000-8000-000000000010','bf000000-0000-4000-8000-000000000001','owner','bf000000-0000-4000-8000-000000000001');
insert into tongs.platform_operators(user_id,reason,granted_by)
values('bf000000-0000-4000-8000-000000000001','isolated owner pilot proof','bf000000-0000-4000-8000-000000000001');

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='bf000000-0000-4000-8000-000000000001';
set local role authenticated;
select tongs.commit_private_markup_rule_revision(
  'bf000000-0000-4000-8000-000000000019',0,3300,'[]','approved isolated markup');

reset role;
insert into tongs.paid_execution_control_revisions(
  revision,pricing_activation_enabled,reservation_shadow_enabled,customer_settlement_enabled,
  owner_budget_spending_enabled,provider_execution_enabled,reason
)
select revision+1,true,true,false,true,true,'isolated owner pilot controls'
from tongs.paid_execution_control_revisions order by revision desc limit 1;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

select tongs.activate_owner_hearth_chat_pilot(
  'bf000000-0000-4000-8000-000000000001','bf000000-0000-4000-8000-000000000010',
  'bf000000-0000-4000-8000-000000000020','bf000000-0000-4000-8000-000000000021',
  'bf000000-0000-4000-8000-000000000022','bf000000-0000-4000-8000-000000000019',
  'bf000000-0000-4000-8000-000000000023','bf000000-0000-4000-8000-000000000024',
  now()+interval '23 hours','isolated exact owner pilot activation');

do $$ begin
  if (select status from tongs.owner_operating_budget_revisions
      where budget_id='bf000000-0000-4000-8000-000000000020' order by revision desc limit 1)<>'active' then
    raise exception 'owner budget was not activated';
  end if;
  if (select maximum_amount_micros from tongs.owner_operating_budget_revisions
      where budget_id='bf000000-0000-4000-8000-000000000020' order by revision desc limit 1)<>30000 then
    raise exception 'owner budget cap changed';
  end if;
  if (select mode from tongs._current_openai_text_rollout('hearth.chat_completion'))<>'enforce' then
    raise exception 'owner pilot rollout was not enforced';
  end if;
  if (select lifecycle_state from tongs.openai_text_failure_loss_policy_revisions
      where route_code='hearth.chat_completion' and environment='production' order by revision desc limit 1)<>'active' then
    raise exception 'failure loss cap was not activated';
  end if;
  if (select customer_settlement_enabled from tongs.paid_execution_control_revisions
      order by revision desc limit 1) then
    raise exception 'customer settlement was activated';
  end if;
  if exists(select 1 from tongs.private_pricing_publications publication
      join tongs.private_pricing_revisions revision on revision.id=publication.pricing_revision_id
      where revision.id='bf000000-0000-4000-8000-000000000022') then
    raise exception 'owner pilot pricing was published';
  end if;
end $$;

select tongs.close_owner_hearth_chat_pilot(
  'bf000000-0000-4000-8000-000000000001','bf000000-0000-4000-8000-000000000020',
  'isolated owner pilot closure');
do $$ begin
  if (select status from tongs.owner_operating_budget_revisions
      where budget_id='bf000000-0000-4000-8000-000000000020' order by revision desc limit 1)<>'closed' then
    raise exception 'owner budget was not closed';
  end if;
  if (select mode from tongs._current_openai_text_rollout('hearth.chat_completion'))<>'halt_new' then
    raise exception 'owner pilot route did not halt new submissions';
  end if;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='bf000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  if has_table_privilege('authenticated','tongs.openai_text_activation_decisions','select') then
    raise exception 'activation decision leaked to authenticated users';
  end if;
  begin
    perform tongs.activate_owner_hearth_chat_pilot(null,null,null,null,null,null,null,null,now()+interval '1 hour','blocked');
    raise exception 'authenticated caller activated owner pilot';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
