select jsonb_build_object(
  'execution_user', current_user,
  'transaction_read_only', current_setting('transaction_read_only'),
  'schema_usage', has_schema_privilege(current_user, 'supabase_migrations', 'USAGE'),
  'table_select', has_table_privilege(current_user, 'supabase_migrations.schema_migrations', 'SELECT'),
  'six_columns_select', (
    select bool_and(has_column_privilege(
      current_user,
      'supabase_migrations.schema_migrations',
      column_name,
      'SELECT'
    ))
    from unnest(array[
      'version','statements','name','created_by','idempotency_key','rollback'
    ]) as requested(column_name)
  ),
  'zero_row_projection_count', (
    select count(*)
    from (
      select version, statements, name, created_by, idempotency_key, rollback
      from supabase_migrations.schema_migrations
      where false
    ) as no_history_rows
  ),
  'digest_available', encode(
    extensions.digest(convert_to('forge-gate5d-read-only-probe', 'UTF8'), 'sha256'),
    'hex'
  ) = '1cb32399d94e7da0a0d001d5856287097f10443621279dbb2c3abdd8db3b232b'
) as gate5d_read_only_probe;
