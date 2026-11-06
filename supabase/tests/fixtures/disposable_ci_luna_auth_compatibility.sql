-- Disposable CI compatibility only; never a migration or hosted operation.
-- The reviewed predecessor fixture predates Auth's non-null string scanner.
begin;
do $guard$
begin
  if current_database() <> 'postgres'
     or current_setting('forge.ci_luna_auth_fixture',true) is distinct from 'disposable-baseline-v1'
     or not exists(select 1 from forge_meta.database_lineage where singleton and lineage='baseline-v1')
     or (select max(version) from supabase_migrations.schema_migrations) is distinct from '20261105025313'
     or not exists(select 1 from tongs.openai_text_rollout_revisions
                   where route_code='hearth.chat_completion' and revision=13 and mode='halt_new'
                     and cost_policy_revision_id='10000000-0000-4000-8000-000000000011')
     or (select count(*) from auth.users
         where id='fe000000-0000-4000-8000-000000000001'
           and email='provider-alignment-certification@example.test'
           and encrypted_password='' and aud='authenticated' and role='authenticated') <> 1 then
    raise exception 'Auth compatibility requires the exact disposable Luna fixture' using errcode='42501';
  end if;
end $guard$;
-- Empty tokens grant no login credential. Do not touch any other principal.
update auth.users set
  confirmation_token=coalesce(confirmation_token,''),
  recovery_token=coalesce(recovery_token,''),
  email_change_token_current=coalesce(email_change_token_current,''),
  email_change_token_new=coalesce(email_change_token_new,''),
  email_change=coalesce(email_change,''),
  phone_change_token=coalesce(phone_change_token,''),
  phone_change=coalesce(phone_change,''),
  reauthentication_token=coalesce(reauthentication_token,'')
where id='fe000000-0000-4000-8000-000000000001';
commit;
