begin;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('cf000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','credential-activation-operator@example.test','',now(),now(),now());
insert into tongs.platform_operators(user_id,reason,granted_by)
values ('cf000000-0000-4000-8000-000000000001','credential activation test',
  'cf000000-0000-4000-8000-000000000001');

set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

select tongs.register_credential_lifecycle(
  'cf000000-0000-4000-8000-000000000100','openai','activation backfill fixture',
  'FORGE_ACTIVATION_BACKFILL_TEST_KEY','activation backfill test','live','production',
  repeat('1',64),'2026-09-30T04:00:00Z',null,null,interval '7 days','planned',null,null,
  '{}','{}','cf000000-0000-4000-8000-000000000001','activation-backfill-register',
  '2026-09-30T04:01:00Z');
select tongs.transition_credential_lifecycle(
  'cf000000-0000-4000-8000-000000000100','planned','active',null,null,'{}',
  'cf000000-0000-4000-8000-000000000001','activation-backfill-active',
  '2026-09-30T04:02:03Z');

reset role;

-- Recreate the legacy defect, then exercise the migration's event-derived backfill.
update tongs.credential_lifecycle_records
set activated_at=null
where credential_id='cf000000-0000-4000-8000-000000000100';

with canonical_activation as (
  select e.credential_id, min(e.occurred_at) as activated_at
  from tongs.credential_lifecycle_events e
  join tongs.credential_lifecycle_records r on r.credential_id=e.credential_id
  where r.lifecycle_status in ('active','rotation_due')
    and r.activated_at is null
    and e.from_status='planned'
    and e.to_status='active'
    and e.event_type='status_transition'
  group by e.credential_id
)
update tongs.credential_lifecycle_records r
set activated_at=a.activated_at
from canonical_activation a
where r.credential_id=a.credential_id
  and r.activated_at is null;

do $$
begin
  if (select activated_at from tongs.credential_lifecycle_records
      where credential_id='cf000000-0000-4000-8000-000000000100')
       <> '2026-09-30T04:02:03Z'::timestamptz then
    raise exception 'backfill did not use the earliest canonical activation event';
  end if;
end;
$$;

insert into tongs.credential_lifecycle_records(
  credential_id,provider,credential_purpose,configuration_variable_name,affected_capability,
  financial_environment,runtime_environment,credential_identity_hash,lifecycle_status,
  metadata_json,created_by
) values (
  'cf000000-0000-4000-8000-000000000200','openai','orphan activation fixture',
  'FORGE_ORPHAN_ACTIVATION_TEST_KEY','orphan activation test','live','production',repeat('2',64),
  'active','{}','cf000000-0000-4000-8000-000000000001'
);

do $$
declare
  v_assertion_failed boolean := false;
begin
  begin
    if exists (
      select 1
      from tongs.credential_lifecycle_records r
      where r.lifecycle_status in ('active','rotation_due')
        and r.activated_at is null
        and not exists (
          select 1 from tongs.credential_lifecycle_events e
          where e.credential_id=r.credential_id
            and e.from_status='planned'
            and e.to_status='active'
            and e.event_type='status_transition'
        )
    ) then
      raise exception 'active credential lifecycle records lack canonical activation events'
        using errcode='23514';
    end if;
  exception when check_violation then
    v_assertion_failed := true;
  end;
  if not v_assertion_failed then
    raise exception 'orphan activation assertion did not fail closed';
  end if;
end;
$$;

rollback;
