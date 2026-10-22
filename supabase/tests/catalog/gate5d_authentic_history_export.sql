begin transaction read only;
set local statement_timeout = '60s';

with history as materialized (
  select version, statements, name, created_by, idempotency_key, rollback
  from supabase_migrations.schema_migrations
  order by version
), payload as (
  select string_agg(
    jsonb_build_array(version, statements, name, created_by, idempotency_key, rollback)::text,
    E'\n' order by version
  ) as body
  from history
), summary as (
  select
    count(*) as row_count,
    min(version) as min_version,
    max(version) as max_version,
    encode(extensions.digest(convert_to(payload.body, 'UTF8'), 'sha256'), 'hex') as all_columns_sha256,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version, version)::text, E'\n' order by version), 'UTF8'), 'sha256'), 'hex') as version_sha256,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version, statements)::text, E'\n' order by version), 'UTF8'), 'sha256'), 'hex') as statements_sha256,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version, name)::text, E'\n' order by version), 'UTF8'), 'sha256'), 'hex') as name_sha256,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version, created_by)::text, E'\n' order by version), 'UTF8'), 'sha256'), 'hex') as created_by_sha256,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version, idempotency_key)::text, E'\n' order by version), 'UTF8'), 'sha256'), 'hex') as idempotency_key_sha256,
    encode(extensions.digest(convert_to(string_agg(jsonb_build_array(version, rollback)::text, E'\n' order by version), 'UTF8'), 'sha256'), 'hex') as rollback_sha256,
    encode(convert_to(payload.body, 'UTF8'), 'base64') as payload_base64
  from history cross join payload
  group by payload.body
)
select jsonb_build_object(
  'transaction_read_only', current_setting('transaction_read_only'),
  'columns', jsonb_build_array('version','statements','name','created_by','idempotency_key','rollback'),
  'row_count', row_count,
  'min_version', min_version,
  'max_version', max_version,
  'all_columns_sha256', all_columns_sha256,
  'version_sha256', version_sha256,
  'statements_sha256', statements_sha256,
  'name_sha256', name_sha256,
  'created_by_sha256', created_by_sha256,
  'idempotency_key_sha256', idempotency_key_sha256,
  'rollback_sha256', rollback_sha256,
  'payload_base64', payload_base64
) as gate5d_history_export
from summary;

commit;
