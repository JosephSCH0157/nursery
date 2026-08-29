begin;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'auth'
      and table_name = 'hooks'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'hooks'
      and column_name = 'enabled'
  ) then
    execute 'update auth.hooks set enabled = false where enabled is true';
  end if;
end
$$;

commit;
