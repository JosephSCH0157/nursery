begin;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute $sql$
      alter role authenticator
      set pgrst.db_schemas = 'public,graphql_public,tongs'
    $sql$;

    execute $sql$
      alter role authenticator
      set pgrst.db_extra_search_path = 'public,extensions,tongs'
    $sql$;
  end if;
end
$$;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';

commit;
