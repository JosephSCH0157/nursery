begin;

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('ac000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-cost-customer@example.test', '', now(), now(), now()),
  ('ac000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-cost-operator@example.test', '', now(), now(), now());

insert into tongs.platform_operators(user_id, reason, granted_by)
values ('ac000000-0000-4000-8000-000000000002', 'owner-cost authority test', 'ac000000-0000-4000-8000-000000000002');

insert into tongs.orgs(id, name, created_by)
values ('ac000000-0000-4000-8000-000000000009', 'Owner cost test org', 'ac000000-0000-4000-8000-000000000002');
insert into tongs.workspaces(id, name, created_by, org_id)
values ('ac000000-0000-4000-8000-000000000010', 'Owner cost test workspace', 'ac000000-0000-4000-8000-000000000002', 'ac000000-0000-4000-8000-000000000009');
insert into tongs.episodes(id, workspace_id, label, created_by, creation_origin)
values ('ac000000-0000-4000-8000-000000000011', 'ac000000-0000-4000-8000-000000000010', 'Owner cost test workpiece', 'ac000000-0000-4000-8000-000000000002', 'owner_cost_test');
insert into tongs.recording_sessions(id, workspace_id, title, starts_at, status, created_by)
values ('ac000000-0000-4000-8000-000000000012', 'ac000000-0000-4000-8000-000000000010', 'Owner cost test session', '2026-09-28T12:00:00Z', 'planned', 'ac000000-0000-4000-8000-000000000002');

set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '';
set local role service_role;

do $$
declare
  v_result jsonb;
  v_attempt_history jsonb;
  v_operation_created_at constant timestamptz := '2026-09-28T12:00:00Z';
  v_attempt_at constant timestamptz := '2026-09-28T12:01:00Z';
begin
  v_result := tongs.establish_owner_cost_operation(
    'ac000000-0000-4000-8000-000000000100', 'anvil:test:transcription:0001', repeat('1',64),
    'live', 'production', 'anvil', 'transcription',
    'ac000000-0000-4000-8000-000000000010', null,
    'ac000000-0000-4000-8000-000000000012', null, null, null,
    '{"route":"not-yet-wired"}', v_operation_created_at
  );
  if (v_result->>'replay')::boolean then raise exception 'first owner-cost operation was a replay'; end if;
  v_result := tongs.establish_owner_cost_operation(
    'ac000000-0000-4000-8000-000000000100', 'anvil:test:transcription:0001', repeat('1',64),
    'live', 'production', 'anvil', 'transcription',
    'ac000000-0000-4000-8000-000000000010', null,
    'ac000000-0000-4000-8000-000000000012', null, null, null,
    '{"route":"not-yet-wired"}', v_operation_created_at
  );
  if not (v_result->>'replay')::boolean then raise exception 'operation replay was not idempotent'; end if;
  begin
    perform tongs.establish_owner_cost_operation(
      'ac000000-0000-4000-8000-000000000100', 'anvil:test:transcription:0001', repeat('2',64),
      'live', 'production', 'anvil', 'transcription',
      'ac000000-0000-4000-8000-000000000010', null,
      'ac000000-0000-4000-8000-000000000012', null, null, null, '{}', v_operation_created_at
    );
    raise exception 'conflicting operation replay succeeded';
  exception when unique_violation then null; end;

  if (select count(*) from tongs.owner_cost_operations where operation_key = 'anvil:test:transcription:0001') <> 1 then
    raise exception 'operation establishment duplicated';
  end if;
  if (select workpiece_id from tongs.owner_cost_operations where operation_id = 'ac000000-0000-4000-8000-000000000100') is not null then
    raise exception 'missing optional workpiece attribution was invented';
  end if;

  v_result := tongs.authorize_owner_cost_provider_attempt(
    'ac000000-0000-4000-8000-000000000200', 'ac000000-0000-4000-8000-000000000100', 1,
    'provider-attempt-0001', repeat('3',64), 'openai', 'audio-transcription', 'whisper-1', 'whisper-1',
    repeat('4',64), '{"authorization":"private"}', v_attempt_at
  );
  if not (v_result->>'authorized')::boolean then raise exception 'first provider attempt was not authorized'; end if;
  v_result := tongs.authorize_owner_cost_provider_attempt(
    'ac000000-0000-4000-8000-000000000200', 'ac000000-0000-4000-8000-000000000100', 1,
    'provider-attempt-0001', repeat('3',64), 'openai', 'audio-transcription', 'whisper-1', 'whisper-1',
    repeat('4',64), '{"authorization":"private"}', v_attempt_at
  );
  if not (v_result->>'replay')::boolean or (v_result->>'authorized')::boolean then
    raise exception 'attempt replay could authorize a second provider call';
  end if;
  if (select count(*) from tongs.owner_cost_attempt_events where attempt_id = 'ac000000-0000-4000-8000-000000000200' and lifecycle_state = 'authorized') <> 1 then
    raise exception 'attempt authorization evidence duplicated';
  end if;

  v_result := tongs.append_owner_cost_attempt_event(
    'ac000000-0000-4000-8000-000000000201', 'ac000000-0000-4000-8000-000000000200', 2,
    'submitted', 'provider-request-0001', '{}', '{"request":"private"}', '2026-09-28T12:02:00Z'
  );
  if not (v_result->>'provider_submission_created')::boolean then raise exception 'submission signal missing'; end if;
  v_result := tongs.append_owner_cost_attempt_event(
    'ac000000-0000-4000-8000-000000000201', 'ac000000-0000-4000-8000-000000000200', 2,
    'submitted', 'provider-request-0001', '{}', '{"request":"private"}', '2026-09-28T12:02:00Z'
  );
  if not (v_result->>'replay')::boolean or (v_result->>'provider_submission_created')::boolean then
    raise exception 'submitted replay could create another provider call';
  end if;
  perform tongs.append_owner_cost_attempt_event(
    'ac000000-0000-4000-8000-000000000202', 'ac000000-0000-4000-8000-000000000200', 3,
    'submission_unknown', 'provider-request-0001', '{}', '{"ambiguity":true}', '2026-09-28T12:03:00Z'
  );
  perform tongs.append_owner_cost_attempt_event(
    'ac000000-0000-4000-8000-000000000203', 'ac000000-0000-4000-8000-000000000200', 4,
    'response_captured', 'provider-request-0001', '{"seconds":60}', '{"response":"private"}', '2026-09-28T12:04:00Z'
  );
  perform tongs.append_owner_cost_attempt_event(
    'ac000000-0000-4000-8000-000000000204', 'ac000000-0000-4000-8000-000000000200', 5,
    'succeeded', 'provider-request-0001', '{"seconds":60}', '{}', '2026-09-28T12:05:00Z'
  );
  begin
    perform tongs.append_owner_cost_attempt_event(
      'ac000000-0000-4000-8000-000000000205', 'ac000000-0000-4000-8000-000000000200', 6,
      'submitted', 'provider-request-0002', '{}', '{}', '2026-09-28T12:06:00Z'
    );
    raise exception 'terminal attempt was rearmed';
  exception when check_violation then null; end;

  v_attempt_history := (select jsonb_agg(to_jsonb(e) order by event_sequence) from tongs.owner_cost_attempt_events e where e.attempt_id = 'ac000000-0000-4000-8000-000000000200');

  v_result := tongs.record_owner_cost_valuation(
    'ac000000-0000-4000-8000-000000000300', 'valuation-transcription-estimate-0001',
    'ac000000-0000-4000-8000-000000000200', 'transcription', null,
    'estimated', 1000, 'usd', 'evidence_only', null, '{}', '{"estimate":"private"}', '2026-09-28T12:06:00Z'
  );
  if v_result->'journal_event_id' <> 'null'::jsonb then raise exception 'evidence-only estimate created journal authority'; end if;
  if exists (select 1 from tongs.accounting_journal_events where id = 'ac000000-0000-4000-8000-000000000300') then
    raise exception 'evidence-only valuation reached the journal';
  end if;

  v_result := tongs.record_owner_cost_valuation(
    'ac000000-0000-4000-8000-000000000301', 'valuation-transcription-usage-0001',
    'ac000000-0000-4000-8000-000000000200', 'transcription', 'ac000000-0000-4000-8000-000000000300',
    'usage_calculated', 800, 'usd', 'journal_recognized', null, '{"seconds":60}', '{}', '2026-09-28T12:07:00Z'
  );
  if (v_result->>'journal_adjustment_micros')::bigint <> 800 then raise exception 'initial recognition delta is wrong'; end if;
  v_result := tongs.record_owner_cost_valuation(
    'ac000000-0000-4000-8000-000000000301', 'valuation-transcription-usage-0001',
    'ac000000-0000-4000-8000-000000000200', 'transcription', 'ac000000-0000-4000-8000-000000000300',
    'usage_calculated', 800, 'usd', 'journal_recognized', null, '{"seconds":60}', '{}', '2026-09-28T12:07:00Z'
  );
  if not (v_result->>'replay')::boolean then raise exception 'valuation replay was not idempotent'; end if;
  if (select count(*) from tongs.accounting_journal_events where source_type = 'owner_cost_valuation' and source_id = 'ac000000-0000-4000-8000-000000000301') <> 1 then
    raise exception 'valuation replay duplicated journal expense';
  end if;

  v_result := tongs.record_owner_cost_valuation(
    'ac000000-0000-4000-8000-000000000302', 'valuation-transcription-provider-0001',
    'ac000000-0000-4000-8000-000000000200', 'transcription', 'ac000000-0000-4000-8000-000000000301',
    'provider_reported', 700, 'usd', 'journal_recognized', null, '{"seconds":60}', '{"provider":"private"}', '2026-09-28T12:08:00Z'
  );
  if (v_result->>'journal_adjustment_micros')::bigint <> -100 then raise exception 'downward journal adjustment is wrong'; end if;
  v_result := tongs.record_owner_cost_valuation(
    'ac000000-0000-4000-8000-000000000303', 'valuation-transcription-invoice-0001',
    'ac000000-0000-4000-8000-000000000200', 'transcription', 'ac000000-0000-4000-8000-000000000302',
    'invoice_reconciled', 900, 'usd', 'journal_recognized', 'invoice-line-42', '{"seconds":60}', '{"invoice":"private"}', '2026-09-28T12:09:00Z'
  );
  if (v_result->>'journal_adjustment_micros')::bigint <> 200 then raise exception 'invoice adjustment is wrong'; end if;
  if (select count(*) from tongs.owner_cost_valuations where attempt_id = 'ac000000-0000-4000-8000-000000000200') <> 4 then
    raise exception 'valuation history was overwritten';
  end if;
  begin
    perform tongs.record_owner_cost_valuation(
      'ac000000-0000-4000-8000-000000000304', 'valuation-negative-invalid-0001',
      'ac000000-0000-4000-8000-000000000200', 'transcription', 'ac000000-0000-4000-8000-000000000303',
      'invoice_reconciled', -1, 'usd', 'journal_recognized', 'invoice-line-43', '{}', '{}', '2026-09-28T12:10:00Z'
    );
    raise exception 'negative absolute valuation succeeded';
  exception when invalid_parameter_value then null; end;
  begin
    perform tongs.record_owner_cost_valuation(
      'ac000000-0000-4000-8000-000000000305', 'valuation-basis-regression-0001',
      'ac000000-0000-4000-8000-000000000200', 'transcription', 'ac000000-0000-4000-8000-000000000303',
      'estimated', 950, 'usd', 'evidence_only', null, '{}', '{}', '2026-09-28T12:10:00Z'
    );
    raise exception 'valuation basis regression succeeded';
  exception when check_violation then null; end;

  perform tongs.link_owner_cost_operation(
    'ac000000-0000-4000-8000-000000000400', 'ac000000-0000-4000-8000-000000000100',
    'late-workpiece-link-0001', 'workpiece', null, 'ac000000-0000-4000-8000-000000000011',
    null, null, null, null, '{"learned_after_attempt":true}', '2026-09-28T12:11:00Z'
  );
  if (select jsonb_agg(to_jsonb(e) order by event_sequence) from tongs.owner_cost_attempt_events e where e.attempt_id = 'ac000000-0000-4000-8000-000000000200') <> v_attempt_history then
    raise exception 'late attribution mutated provider execution history';
  end if;

  if (select coalesce(sum(j.amount_micros), 0) from tongs.accounting_journal_entries j
      where j.account_code = 'forge_operating_expense' and j.event_id in (
        select v.journal_event_id from tongs.owner_cost_valuations v where v.attempt_id = 'ac000000-0000-4000-8000-000000000200'
      )) <> 900 then
    raise exception 'canonical journal does not reconstruct the final recognized expense';
  end if;
  if (tongs.read_owner_cost_summary('live', 'usd')#>>'{totals_from_canonical_journal,0,recognized_expense_micros}')::bigint <> 900 then
    raise exception 'owner-cost summary is not journal-derived';
  end if;
  if jsonb_array_length(tongs.read_owner_cost_summary('test', 'usd')->'totals_from_canonical_journal') <> 0 then
    raise exception 'live owner cost contaminated test reporting';
  end if;
  if exists (select 1 from tongs.verify_owner_cost_reconstruction()) then
    raise exception 'owner-cost reconstruction verifier found a discrepancy';
  end if;
  if exists (select 1 from tongs.verify_accounting_reconstruction()) then
    raise exception 'canonical accounting journal became unbalanced';
  end if;
end;
$$;

do $$
declare v_fk_targets text[];
begin
  select array_agg(distinct confrelid::regclass::text order by confrelid::regclass::text)
  into v_fk_targets
  from pg_constraint
  where contype = 'f' and conrelid in (
    'tongs.owner_cost_operations'::regclass, 'tongs.owner_cost_operation_links'::regclass
  );
  if not (v_fk_targets @> array[
    'tongs.workspaces', 'tongs.episodes', 'tongs.recording_sessions',
    'tongs.recording_capture_authorities', 'tongs.anvil_capture_executions',
    'tongs.anvil_recording_completion_requests'
  ]) then raise exception 'canonical Forge identity foreign keys are incomplete: %', v_fk_targets; end if;

  if has_table_privilege('authenticated', 'tongs.owner_cost_operations', 'select')
     or has_table_privilege('authenticated', 'tongs.owner_cost_valuations', 'select')
     or has_table_privilege('anon', 'tongs.owner_cost_attempt_events', 'select')
     or not has_table_privilege('service_role', 'tongs.owner_cost_valuations', 'select') then
    raise exception 'owner-cost direct table grants violate privacy boundary';
  end if;
  if has_function_privilege('authenticated',
      'tongs.record_owner_cost_valuation(uuid,text,uuid,text,uuid,text,bigint,text,text,text,jsonb,jsonb,timestamptz)', 'execute')
     or has_function_privilege('anon', 'tongs.read_owner_cost_operation(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'tongs.read_owner_cost_operation(uuid)', 'execute') then
    raise exception 'owner-cost RPC grants violate intended boundary';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'tongs' and tablename like 'owner_cost_%') then
    raise exception 'owner-cost table acquired a customer-visible RLS policy';
  end if;

  if exists (
    select 1 from pg_constraint c
    where c.contype = 'f' and c.conrelid in (
      'tongs.owner_cost_operations'::regclass, 'tongs.owner_cost_provider_attempts'::regclass,
      'tongs.owner_cost_attempt_events'::regclass, 'tongs.owner_cost_valuations'::regclass,
      'tongs.owner_cost_operation_links'::regclass
    ) and lower(c.confrelid::regclass::text) ~ '(credit|quote|reservation|price|balance|charge|allowance|settlement|stripe)'
  ) then raise exception 'owner-cost schema depends on customer-finance authority'; end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'tongs' and p.proname like '%owner_cost%'
      and lower(pg_get_functiondef(p.oid)) ~ '(customer_credits|ai_credit_quotes|funding_reservations|customer_price|customer_balance|stripe|customer_charge|paid_allowance|settlement)'
  ) then raise exception 'owner-cost RPC depends on prohibited customer-finance semantics'; end if;

  if exists (
    with required_index(relation_name, column_name) as (
      values
        ('tongs.owner_cost_operations'::regclass, 'owner_operating_budget_id'::text),
        ('tongs.owner_cost_valuations'::regclass, 'prior_valuation_id'::text),
        ('tongs.owner_cost_operation_links'::regclass, 'workspace_id'::text),
        ('tongs.owner_cost_operation_links'::regclass, 'workpiece_id'::text),
        ('tongs.owner_cost_operation_links'::regclass, 'recording_session_id'::text),
        ('tongs.owner_cost_operation_links'::regclass, 'recording_capture_authority_id'::text),
        ('tongs.owner_cost_operation_links'::regclass, 'anvil_capture_execution_id'::text),
        ('tongs.owner_cost_operation_links'::regclass, 'anvil_recording_completion_id'::text)
    )
    select 1
    from required_index required
    where not exists (
      select 1
      from pg_index index_metadata
      join pg_class index_relation on index_relation.oid = index_metadata.indexrelid
      join pg_am access_method on access_method.oid = index_relation.relam
      where index_metadata.indrelid = required.relation_name
        and index_metadata.indisvalid
        and index_metadata.indisready
        and access_method.amname = 'btree'
        and pg_get_indexdef(index_metadata.indexrelid, 1, true) = required.column_name
    )
  ) then raise exception 'owner-cost foreign-key index advisory remains unresolved'; end if;
end;
$$;

do $$
begin
  begin
    update tongs.owner_cost_valuations set amount_micros = 1 where valuation_id = 'ac000000-0000-4000-8000-000000000303';
    raise exception 'append-only valuation update succeeded';
  exception when insufficient_privilege or sqlstate '55000' then null; end;
  begin
    delete from tongs.owner_cost_attempt_events where attempt_id = 'ac000000-0000-4000-8000-000000000200';
    raise exception 'append-only provider evidence delete succeeded';
  exception when insufficient_privilege or sqlstate '55000' then null; end;
end;
$$;

reset role;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'ac000000-0000-4000-8000-000000000001';
set local role authenticated;

do $$
begin
  begin
    perform tongs.read_owner_cost_operation('ac000000-0000-4000-8000-000000000100');
    raise exception 'ordinary authenticated customer read owner-cost evidence';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.read_owner_cost_summary('live', 'usd');
    raise exception 'ordinary authenticated customer read owner-cost totals';
  exception when insufficient_privilege then null; end;
end;
$$;

reset role;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'ac000000-0000-4000-8000-000000000002';
set local role authenticated;

do $$
declare v_read jsonb;
begin
  v_read := tongs.read_owner_cost_operation('ac000000-0000-4000-8000-000000000100');
  if v_read#>>'{operation,operation_id}' <> 'ac000000-0000-4000-8000-000000000100'
     or jsonb_array_length(v_read->'attempts') <> 1
     or jsonb_array_length(v_read->'links') <> 1 then
    raise exception 'operator reconstruction read is incomplete: %', v_read;
  end if;
  if exists (select 1 from tongs.verify_owner_cost_reconstruction()) then
    raise exception 'operator reconstruction verification failed';
  end if;
end;
$$;

reset role;
rollback;
