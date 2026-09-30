begin;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
  ('ce000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','credential-customer@example.test','',now(),now(),now()),
  ('ce000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','credential-operator@example.test','',now(),now(),now());
insert into tongs.platform_operators(user_id,reason,granted_by)
values ('ce000000-0000-4000-8000-000000000002','credential lifecycle test','ce000000-0000-4000-8000-000000000002');

set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

set local request.jwt.claim.role='';
do $$
declare v_gate jsonb;
begin
  v_gate:=tongs.read_credential_lifecycle_execution_gate(
    'UNTRACKED_SECRET_KEY_COMPATIBILITY','live','production'
  );
  if v_gate->>'status'<>'untracked' or not (v_gate->>'allowed')::boolean then
    raise exception 'Supabase secret API key role compatibility failed';
  end if;
end $$;
set local request.jwt.claim.role='service_role';

do $$
declare
  v_result jsonb;
  v_report jsonb;
begin
  v_result:=tongs.register_credential_lifecycle(
    'ce000000-0000-4000-8000-000000000100','runway','Hearth owner B-roll',
    'HEARTH_OWNER_RUNWAY_API_KEY','Hearth owner bounded B-roll','live','production',
    repeat('a',64),'2026-10-02T00:00:00Z','2026-10-02T00:10:00Z','2026-11-01T00:00:00Z',
    interval '7 days','active','deploy-old',repeat('b',40),
    '{"config_presence_verified":true,"route_configuration_verified":true,"non_paid_readiness_verified":true}',
    '{"expiration_evidence":"provider_supplied","provider_key_label":"forge-hearth-owner-broll"}',
    'ce000000-0000-4000-8000-000000000002','register-runway-old','2026-10-02T00:10:00Z'
  );
  if (v_result->>'replay')::boolean then raise exception 'first registration was replay'; end if;
  if (select rotation_due_at from tongs.credential_lifecycle_records where credential_id='ce000000-0000-4000-8000-000000000100')
     <> '2026-10-25T00:00:00Z'::timestamptz then
    raise exception 'rotation due was not calculated from actual expiration and lead time';
  end if;
  v_result:=tongs.register_credential_lifecycle(
    'ce000000-0000-4000-8000-000000000100','runway','Hearth owner B-roll',
    'HEARTH_OWNER_RUNWAY_API_KEY','Hearth owner bounded B-roll','live','production',
    repeat('a',64),'2026-10-02T00:00:00Z','2026-10-02T00:10:00Z','2026-11-01T00:00:00Z',
    interval '7 days','active','deploy-old',repeat('b',40),'{}','{}',
    'ce000000-0000-4000-8000-000000000002','register-runway-old','2026-10-02T00:10:00Z'
  );
  if not (v_result->>'replay')::boolean then raise exception 'registration was not idempotent'; end if;
  if v_result ? 'credential_identity_hash' then raise exception 'identity hash leaked from registration RPC'; end if;

  begin
    perform tongs.register_credential_lifecycle(
      'ce000000-0000-4000-8000-000000000101','openai','unsafe record','UNSAFE_API_KEY',
      'unsafe','live','production',repeat('c',64),null,null,'2026-11-01T00:00:00Z',
      interval '7 days','planned',null,null,'{}','{"api_key":"sk-raw-secret-material"}',
      'ce000000-0000-4000-8000-000000000002','register-unsafe','2026-10-02T00:10:00Z'
    );
    raise exception 'raw secret metadata was accepted';
  exception when invalid_parameter_value then null; end;

  perform tongs.refresh_credential_lifecycle_alerts('2026-10-24T23:59:59Z','ce000000-0000-4000-8000-000000000002');
  if exists(select 1 from tongs.credential_lifecycle_alerts) then raise exception 'premature alert created'; end if;
  perform tongs.refresh_credential_lifecycle_alerts('2026-10-25T00:00:00Z','ce000000-0000-4000-8000-000000000002');
  if (select lifecycle_status from tongs.credential_lifecycle_records where credential_id='ce000000-0000-4000-8000-000000000100')<>'rotation_due'
     or (select count(*) from tongs.credential_lifecycle_alerts where urgency='warning')<>1 then
    raise exception 'rotation due warning failed';
  end if;
  perform tongs.refresh_credential_lifecycle_alerts('2026-10-29T00:00:00Z','ce000000-0000-4000-8000-000000000002');
  perform tongs.refresh_credential_lifecycle_alerts('2026-10-31T00:00:00Z','ce000000-0000-4000-8000-000000000002');
  perform tongs.refresh_credential_lifecycle_alerts('2026-11-01T00:00:00Z','ce000000-0000-4000-8000-000000000002');
  perform tongs.refresh_credential_lifecycle_alerts('2026-11-01T00:00:00Z','ce000000-0000-4000-8000-000000000002');
  if (select lifecycle_status from tongs.credential_lifecycle_records where credential_id='ce000000-0000-4000-8000-000000000100')<>'expired'
     or (select count(*) from tongs.credential_lifecycle_alerts)<>4
     or not exists(select 1 from tongs.credential_lifecycle_alerts where urgency='urgent')
     or not exists(select 1 from tongs.credential_lifecycle_alerts where urgency='critical')
     or not exists(select 1 from tongs.credential_lifecycle_alerts where urgency='expired') then
    raise exception 'alert escalation or deduplication failed';
  end if;
  if exists(select 1 from tongs.credential_lifecycle_alerts where recommended_action ~* '(sk-|secret value|credential hash)') then
    raise exception 'alert exposed secret material';
  end if;
  v_result:=tongs.read_credential_lifecycle_execution_gate('HEARTH_OWNER_RUNWAY_API_KEY','live','production');
  if (v_result->>'allowed')::boolean or v_result->>'status'<>'expired' then
    raise exception 'expired credential did not fail closed';
  end if;

  perform tongs.register_credential_lifecycle(
    'ce000000-0000-4000-8000-000000000200','runway','Hearth owner B-roll',
    'HEARTH_OWNER_RUNWAY_API_KEY','Hearth owner bounded B-roll','live','production',
    repeat('d',64),'2026-10-30T00:00:00Z','2026-11-01T00:01:00Z',null,
    interval '7 days','planned','deploy-new',repeat('e',40),'{"config_presence_verified":true}','{}',
    'ce000000-0000-4000-8000-000000000002','register-runway-new','2026-11-01T00:01:00Z'
  );
  perform tongs.set_credential_lifecycle_deadline(
    'ce000000-0000-4000-8000-000000000200','2026-12-01T00:00:00Z',interval '7 days',
    '{"expiration_evidence":"provider_supplied"}','ce000000-0000-4000-8000-000000000002',
    'new-provider-deadline','2026-11-01T00:01:30Z');
  if (select rotation_due_at from tongs.credential_lifecycle_records where credential_id='ce000000-0000-4000-8000-000000000200')
     <> '2026-11-24T00:00:00Z'::timestamptz then
    raise exception 'explicit replacement deadline was not calculated correctly';
  end if;
  perform tongs.transition_credential_lifecycle(
    'ce000000-0000-4000-8000-000000000100','expired','replacement_ready',
    'ce000000-0000-4000-8000-000000000200',null,'{}','ce000000-0000-4000-8000-000000000002',
    'old-replacement-ready','2026-11-01T00:02:00Z');
  perform tongs.transition_credential_lifecycle(
    'ce000000-0000-4000-8000-000000000100','replacement_ready','replacement_active',
    'ce000000-0000-4000-8000-000000000200',null,'{"route_configuration_verified":true}',
    'ce000000-0000-4000-8000-000000000002','old-replacement-active','2026-11-01T00:03:00Z');
  perform tongs.transition_credential_lifecycle(
    'ce000000-0000-4000-8000-000000000100','replacement_active','revocation_pending',
    'ce000000-0000-4000-8000-000000000200',null,'{}','ce000000-0000-4000-8000-000000000002',
    'old-revocation-pending','2026-11-01T00:04:00Z');
  perform tongs.transition_credential_lifecycle(
    'ce000000-0000-4000-8000-000000000100','revocation_pending','revoked',null,
    '2026-11-01T00:05:00Z','{}','ce000000-0000-4000-8000-000000000002',
    'old-revocation-confirmed','2026-11-01T00:05:00Z');
  perform tongs.transition_credential_lifecycle(
    'ce000000-0000-4000-8000-000000000200','planned','active',null,null,
    '{"non_paid_readiness_verified":true}','ce000000-0000-4000-8000-000000000002',
    'new-active','2026-11-01T00:06:00Z');
  if (select replacement_credential_id from tongs.credential_lifecycle_records where credential_id='ce000000-0000-4000-8000-000000000100')
       is distinct from 'ce000000-0000-4000-8000-000000000200'::uuid
     or (select lifecycle_status from tongs.credential_lifecycle_records where credential_id='ce000000-0000-4000-8000-000000000100')<>'revoked'
     or (select lifecycle_status from tongs.credential_lifecycle_records where credential_id='ce000000-0000-4000-8000-000000000200')<>'active'
     or (select count(*) from tongs.credential_lifecycle_records)<>2 then
    raise exception 'replacement/revocation history failed';
  end if;
  v_result:=tongs.read_credential_lifecycle_execution_gate('HEARTH_OWNER_RUNWAY_API_KEY','live','production');
  if not (v_result->>'allowed')::boolean or v_result->>'status'<>'active' then
    raise exception 'active replacement was not selected';
  end if;
  select value into v_report from tongs.read_credential_lifecycle_report('2026-11-01T00:06:00Z',false) value limit 1;
  if v_report::text like '%'||repeat('a',64)||'%'
     or v_report->>'provider'<>'runway'
     or v_report->>'configuration_variable_name'<>'HEARTH_OWNER_RUNWAY_API_KEY'
     or jsonb_array_length(v_report#>'{codex_handoff,steps}')<>10 then
    raise exception 'operator report leaked identity or omitted handoff metadata';
  end if;
end;
$$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='ce000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  begin perform count(*) from tongs.credential_lifecycle_records; raise exception 'customer read lifecycle table';
  exception when insufficient_privilege then null; end;
  begin perform * from tongs.read_credential_lifecycle_report(now(),false); raise exception 'customer read lifecycle report';
  exception when insufficient_privilege then null; end;
  begin perform tongs.transition_credential_lifecycle(
    'ce000000-0000-4000-8000-000000000200','active','disabled',null,null,'{}',
    'ce000000-0000-4000-8000-000000000001','customer-transition','2026-11-01T00:07:00Z');
    raise exception 'customer modified lifecycle';
  exception when insufficient_privilege then null; end;
end $$;

set local request.jwt.claim.sub='ce000000-0000-4000-8000-000000000002';
do $$
declare v_count integer;
begin
  select count(*) into v_count from tongs.read_credential_lifecycle_report(now(),false);
  if v_count<>2 then raise exception 'operator report access failed'; end if;
end $$;

reset role;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
set local role anon;
do $$ begin
  begin perform * from tongs.read_credential_lifecycle_report(now(),false); raise exception 'anon read lifecycle report';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
