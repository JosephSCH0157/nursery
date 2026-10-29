begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if value is not true then raise exception 'assertion failed: %',message; end if;
end $$;

select pg_temp.assert_true(
  to_regprocedure('tongs.install_brad_hammer_first_transcription_authority_bundle(uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)') is not null,
  'service-only Brad authority installer must exist'
);

select pg_temp.assert_true(
  (select prosecdef and proowner='postgres'::regrole
     from pg_proc where oid='tongs.install_brad_hammer_first_transcription_authority_bundle(uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)'::regprocedure),
  'installer must be a postgres-owned security definer'
);

select pg_temp.assert_true(
  not has_function_privilege('anon',
    'tongs.install_brad_hammer_first_transcription_authority_bundle(uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)','execute')
  and not has_function_privilege('authenticated',
    'tongs.install_brad_hammer_first_transcription_authority_bundle(uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)','execute')
  and has_function_privilege('service_role',
    'tongs.install_brad_hammer_first_transcription_authority_bundle(uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)','execute'),
  'installer execution must be service-role only'
);

select pg_temp.assert_true(
  not exists(select 1 from tongs.hammer_first_transcription_activation_authorities)
  and not exists(select 1 from tongs.hammer_scoped_live_funding_authorities)
  and not exists(select 1 from tongs.hammer_transcription_provider_authorities),
  'migration application must create no provider, activation, or scoped funding authority'
);

select pg_temp.assert_true(
  tongs._current_financial_environment()='test',
  'migration must preserve the global Test environment'
);

select pg_temp.assert_true(
  (select pg_get_functiondef(
    'tongs.install_brad_hammer_first_transcription_authority_bundle(uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)'::regprocedure
  )) like '%customer_credit_units'', 12%'
  and (select pg_get_functiondef(
    'tongs.install_brad_hammer_first_transcription_authority_bundle(uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)'::regprocedure
  )) like '%maximum_provider_attempts'', 1%'
  and (select pg_get_functiondef(
    'tongs.install_brad_hammer_first_transcription_authority_bundle(uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)'::regprocedure
  )) like '%automatic_retries'', 0%',
  'installer must retain the exact 12-Credit, one-attempt, zero-retry boundary'
);

rollback;
select 'FORGE_HAMMER_BRAD_FIRST_TRANSCRIPTION_AUTHORITY_BUNDLE_CONTRACT_PASSED' as result;
