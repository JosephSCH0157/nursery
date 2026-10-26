begin transaction read only;
set local statement_timeout = '30s';

with history as (
  select
    version,
    statements,
    name,
    created_by,
    idempotency_key,
    rollback,
    concat_ws(
      E'\n',
      coalesce(array_to_string(statements, E'\n'), ''),
      coalesce(name, ''),
      coalesce(created_by, ''),
      coalesce(idempotency_key, ''),
      coalesce(array_to_string(rollback, E'\n'), '')
    ) as scan_text
  from supabase_migrations.schema_migrations
), summary as (
  select
    count(*) as row_count,
    min(version) as min_version,
    max(version) as max_version,
    encode(extensions.digest(convert_to(
      string_agg(
        jsonb_build_array(version, statements, name, created_by, idempotency_key, rollback)::text,
        E'\n' order by version
      ),
      'UTF8'
    ), 'sha256'), 'hex') as all_columns_sha256,
    encode(extensions.digest(convert_to(
      string_agg(jsonb_build_array(version, version)::text, E'\n' order by version),
      'UTF8'
    ), 'sha256'), 'hex') as version_sha256,
    encode(extensions.digest(convert_to(
      string_agg(jsonb_build_array(version, statements)::text, E'\n' order by version),
      'UTF8'
    ), 'sha256'), 'hex') as statements_sha256,
    encode(extensions.digest(convert_to(
      string_agg(jsonb_build_array(version, name)::text, E'\n' order by version),
      'UTF8'
    ), 'sha256'), 'hex') as name_sha256,
    encode(extensions.digest(convert_to(
      string_agg(jsonb_build_array(version, created_by)::text, E'\n' order by version),
      'UTF8'
    ), 'sha256'), 'hex') as created_by_sha256,
    encode(extensions.digest(convert_to(
      string_agg(jsonb_build_array(version, idempotency_key)::text, E'\n' order by version),
      'UTF8'
    ), 'sha256'), 'hex') as idempotency_key_sha256,
    encode(extensions.digest(convert_to(
      string_agg(jsonb_build_array(version, rollback)::text, E'\n' order by version),
      'UTF8'
    ), 'sha256'), 'hex') as rollback_sha256,
    coalesce(sum(octet_length(scan_text)), 0) as scanned_bytes,
    count(*) filter (where statements is null) as statements_null_rows,
    count(*) filter (where name is null) as name_null_rows,
    count(*) filter (where created_by is null) as created_by_null_rows,
    count(*) filter (where idempotency_key is null) as idempotency_key_null_rows,
    count(*) filter (where rollback is null) as rollback_null_rows,
    count(distinct created_by) filter (where created_by is not null) as created_by_distinct_count,
    count(*) filter (
      where created_by ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    ) as created_by_email_shape_rows,
    count(*) filter (
      where scan_text ~* '(postgres(?:ql)?|mysql|redis|amqps?)://[^[:space:]''"]+:[^[:space:]''"]+@'
    ) as credentialed_connection_uri_rows,
    count(*) filter (
      where scan_text ~* '(sk_(live|test)_[A-Za-z0-9]{16,}|sk-(proj-)?[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})'
    ) as provider_key_rows,
    count(*) filter (
      where scan_text ~ 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
    ) as jwt_rows,
    count(*) filter (
      where scan_text ~* '-----BEGIN[[:space:]]+(RSA |EC |OPENSSH )?PRIVATE KEY-----'
    ) as private_key_rows,
    count(*) filter (
      where scan_text ~* '(password|passwd|api[_-]?key|secret|token)[[:space:]]*[:=][[:space:]]*[''"][^''"]{8,}[''"]'
    ) as literal_secret_assignment_rows,
    count(*) filter (
      where scan_text ~* '(localhost|127\.0\.0\.1|10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|192\.168\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3})'
    ) as private_network_endpoint_rows,
    count(*) filter (
      where scan_text ~* '(db\.[a-z0-9-]+\.supabase\.co|[a-z0-9.-]*pooler\.supabase\.com|[a-z0-9.-]+\.rds\.amazonaws\.com|privatelink|\.internal([/:]|$)|\.local([/:]|$))'
    ) as database_or_pooler_endpoint_rows,
    count(*) filter (
      where scan_text ~* '(current_setting|vault\.|get_secret|environment|env[_ (]|placeholder)'
    ) as configuration_reference_rows
  from history
)
select jsonb_build_object(
  'transaction_read_only', current_setting('transaction_read_only'),
  'columns', (
    select jsonb_agg(
      jsonb_build_object(
        'ordinal', ordinal_position,
        'name', column_name,
        'type', data_type,
        'udt', udt_name,
        'nullable', is_nullable
      ) order by ordinal_position
    )
    from information_schema.columns
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
  ),
  'summary', to_jsonb(summary)
) as gate5c_history_sensitivity_preflight
from summary;

commit;
