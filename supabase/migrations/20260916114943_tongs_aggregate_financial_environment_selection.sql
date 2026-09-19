-- Select aggregate policy authority from the reservation's canonical financial
-- environment. Funding class describes economic backing and no longer encodes
-- Test versus Live after the unified financial-environment migration.
begin;

do $$
declare
  definition text;
  changed text;
begin
  select pg_get_functiondef(
    'tongs.acquire_openai_text_aggregate_admission(uuid,text,text)'::regprocedure
  ) into definition;
  changed := replace(
    definition,
    'environment:=case when funding_class=''test_customer'' then ''test'' else ''production'' end;',
    'environment:=case when r.funding_environment=''test'' then ''test'' else ''production'' end;'
  );
  if changed = definition then
    raise exception 'aggregate OpenAI environment selection changed upstream; explicit review required';
  end if;
  execute changed;
end $$;

notify pgrst, 'reload schema';
commit;

