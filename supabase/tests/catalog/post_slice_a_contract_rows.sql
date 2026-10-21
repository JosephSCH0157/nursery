with
target_namespaces as (
  select oid, nspname
  from pg_namespace
  where nspname in ('public', 'tongs')
),
context_namespaces as (
  select oid, nspname, nspowner, nspacl
  from pg_namespace
  where nspname in ('public', 'tongs', 'auth', 'storage', 'extensions')
),
objects(category, identity, canonical) as (
  select 'schema', n.nspname::text,
    jsonb_build_object(
      'name', n.nspname,
      'owner', pg_get_userbyid(n.nspowner),
      'acl', coalesce((select jsonb_agg(x::text order by x::text) from unnest(coalesce(n.nspacl, acldefault('n', n.nspowner))) x), '[]'::jsonb)
    )::text
  from context_namespaces n

  union all
  select 'extension', e.extname,
    jsonb_build_object(
      'name', e.extname,
      'version', e.extversion,
      'schema', n.nspname,
      'relocatable', e.extrelocatable
    )::text
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace

  union all
  select 'type', format('%I.%I', n.nspname, t.typname),
    jsonb_build_object(
      'schema', n.nspname,
      'name', t.typname,
      'owner', pg_get_userbyid(t.typowner),
      'kind', t.typtype,
      'category', t.typcategory,
      'preferred', t.typispreferred,
      'defined', t.typisdefined,
      'not_null', t.typnotnull,
      'base_type', case when t.typbasetype = 0 then null else format_type(t.typbasetype, t.typtypmod) end,
      'default', t.typdefault,
      'collation', case when t.typcollation = 0 then null else t.typcollation::regcollation::text end,
      'enum_labels', coalesce((select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid), '[]'::jsonb),
      'acl', coalesce((select jsonb_agg(x::text order by x::text) from unnest(coalesce(t.typacl, acldefault('T', t.typowner))) x), '[]'::jsonb)
    )::text
  from pg_type t
  join target_namespaces n on n.oid = t.typnamespace
  where not exists (select 1 from pg_class c where c.reltype = t.oid)

  union all
  select 'relation', format('%I.%I', n.nspname, c.relname),
    jsonb_build_object(
      'schema', n.nspname,
      'name', c.relname,
      'kind', c.relkind,
      'persistence', c.relpersistence,
      'owner', pg_get_userbyid(c.relowner),
      'rls', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity,
      'replica_identity', c.relreplident,
      'is_partition', c.relispartition,
      'partition_bound', pg_get_expr(c.relpartbound, c.oid, true),
      'options', coalesce(to_jsonb((select array_agg(x order by x) from unnest(coalesce(c.reloptions, '{}'::text[])) x)), '[]'::jsonb),
      'view_definition', case when c.relkind in ('v','m') then replace(pg_get_viewdef(c.oid, true), E'\r\n', E'\n') else null end,
      'acl', coalesce((select jsonb_agg(x::text order by x::text) from unnest(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's'::"char" else 'r'::"char" end, c.relowner))) x), '[]'::jsonb)
    )::text
  from pg_class c
  join target_namespaces n on n.oid = c.relnamespace
  where c.relkind in ('r','p','v','m','S','f')

  union all
  select 'column', format('%I.%I.%I', n.nspname, c.relname, a.attname),
    jsonb_build_object(
      'relation', format('%I.%I', n.nspname, c.relname),
      'ordinal', a.attnum,
      'name', a.attname,
      'type', format_type(a.atttypid, a.atttypmod),
      'not_null', a.attnotnull,
      'identity', a.attidentity,
      'generated', a.attgenerated,
      'collation', case when a.attcollation = 0 then null else a.attcollation::regcollation::text end,
      'default', replace(pg_get_expr(d.adbin, d.adrelid, true), E'\r\n', E'\n'),
      'acl', coalesce((select jsonb_agg(x::text order by x::text) from unnest(coalesce(a.attacl, '{}'::aclitem[])) x), '[]'::jsonb)
    )::text
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join target_namespaces n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where c.relkind in ('r','p','v','m','f') and a.attnum > 0 and not a.attisdropped

  union all
  select 'constraint', format('%s.%I', coalesce(con.conrelid::regclass::text, con.contypid::regtype::text), con.conname),
    jsonb_build_object(
      'name', con.conname,
      'type', con.contype,
      'relation', case when con.conrelid = 0 then null else con.conrelid::regclass::text end,
      'domain', case when con.contypid = 0 then null else con.contypid::regtype::text end,
      'referenced_relation', case when con.confrelid = 0 then null else con.confrelid::regclass::text end,
      'definition', replace(pg_get_constraintdef(con.oid, true), E'\r\n', E'\n'),
      'deferrable', con.condeferrable,
      'deferred', con.condeferred,
      'validated', con.convalidated,
      'local', con.conislocal,
      'inherit_count', con.coninhcount,
      'no_inherit', con.connoinherit
    )::text
  from pg_constraint con
  left join pg_class c on c.oid = con.conrelid
  left join pg_namespace n on n.oid = c.relnamespace
  left join pg_type t on t.oid = con.contypid
  left join pg_namespace tn on tn.oid = t.typnamespace
  where n.nspname in ('public','tongs') or tn.nspname in ('public','tongs')

  union all
  select 'index', format('%I.%I', n.nspname, i.relname),
    jsonb_build_object(
      'name', format('%I.%I', n.nspname, i.relname),
      'table', x.indrelid::regclass::text,
      'definition', replace(pg_get_indexdef(x.indexrelid, 0, true), E'\r\n', E'\n'),
      'unique', x.indisunique,
      'primary', x.indisprimary,
      'exclusion', x.indisexclusion,
      'immediate', x.indimmediate,
      'clustered', x.indisclustered,
      'valid', x.indisvalid,
      'ready', x.indisready,
      'live', x.indislive,
      'replica_identity', x.indisreplident
    )::text
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class c on c.oid = x.indrelid
  join target_namespaces n on n.oid = c.relnamespace

  union all
  select 'sequence', format('%I.%I', n.nspname, c.relname),
    jsonb_build_object(
      'type', format_type(s.seqtypid, null),
      'start', s.seqstart,
      'increment', s.seqincrement,
      'max', s.seqmax,
      'min', s.seqmin,
      'cache', s.seqcache,
      'cycle', s.seqcycle,
      'owned_by', coalesce((
        select format('%I.%I.%I', onsp.nspname, oc.relname, a.attname)
        from pg_depend dep
        join pg_class oc on oc.oid = dep.refobjid
        join pg_namespace onsp on onsp.oid = oc.relnamespace
        join pg_attribute a on a.attrelid = oc.oid and a.attnum = dep.refobjsubid
        where dep.classid = 'pg_class'::regclass and dep.objid = c.oid and dep.deptype in ('a','i')
        order by dep.deptype desc limit 1
      ), '')
    )::text
  from pg_sequence s
  join pg_class c on c.oid = s.seqrelid
  join target_namespaces n on n.oid = c.relnamespace

  union all
  select 'function', format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
    jsonb_build_object(
      'identity', format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
      'owner', pg_get_userbyid(p.proowner),
      'language', l.lanname,
      'kind', p.prokind,
      'returns', pg_get_function_result(p.oid),
      'argument_names', coalesce(to_jsonb(p.proargnames), '[]'::jsonb),
      'argument_modes', coalesce(to_jsonb(p.proargmodes), '[]'::jsonb),
      'volatility', p.provolatile,
      'strict', p.proisstrict,
      'security_definer', p.prosecdef,
      'leakproof', p.proleakproof,
      'parallel', p.proparallel,
      'configuration', coalesce(to_jsonb((select array_agg(x order by x) from unnest(coalesce(p.proconfig, '{}'::text[])) x)), '[]'::jsonb),
      'acl', coalesce((select jsonb_agg(x::text order by x::text) from unnest(coalesce(p.proacl, acldefault('f', p.proowner))) x), '[]'::jsonb),
      'definition', replace(replace(pg_get_functiondef(p.oid), E'\r\n', E'\n'), E'\r', E'\n')
    )::text
  from pg_proc p
  join target_namespaces n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang

  union all
  select 'trigger', format('%I.%I.%I', n.nspname, c.relname, t.tgname),
    jsonb_build_object(
      'relation', format('%I.%I', n.nspname, c.relname),
      'name', t.tgname,
      'enabled', t.tgenabled,
      'function', t.tgfoid::regprocedure::text,
      'definition', replace(pg_get_triggerdef(t.oid, true), E'\r\n', E'\n')
    )::text
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace pn on pn.oid = p.pronamespace
  where not t.tgisinternal
    and (n.nspname in ('public','tongs') or pn.nspname in ('public','tongs'))

  union all
  select 'event_trigger', e.evtname,
    jsonb_build_object(
      'name', e.evtname,
      'event', e.evtevent,
      'owner', pg_get_userbyid(e.evtowner),
      'function', e.evtfoid::regprocedure::text,
      'enabled', e.evtenabled,
      'tags', coalesce(to_jsonb((select array_agg(x order by x) from unnest(coalesce(e.evttags, '{}'::text[])) x)), '[]'::jsonb)
    )::text
  from pg_event_trigger e
  join pg_proc p on p.oid = e.evtfoid
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','tongs')

  union all
  select 'policy', format('%I.%I.%I', n.nspname, c.relname, p.polname),
    jsonb_build_object(
      'relation', format('%I.%I', n.nspname, c.relname),
      'name', p.polname,
      'permissive', p.polpermissive,
      'command', p.polcmd,
      'roles', coalesce((select jsonb_agg(coalesce(r.rolname, 'PUBLIC') order by coalesce(r.rolname, 'PUBLIC')) from unnest(p.polroles) role_oid left join pg_roles r on r.oid = role_oid), '[]'::jsonb),
      'using', pg_get_expr(p.polqual, p.polrelid, true),
      'check', pg_get_expr(p.polwithcheck, p.polrelid, true)
    )::text
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join target_namespaces n on n.oid = c.relnamespace

  union all
  select 'default_acl', format('%s:%s:%s', coalesce(n.nspname, '*'), r.rolname, d.defaclobjtype),
    jsonb_build_object(
      'schema', n.nspname,
      'owner', r.rolname,
      'object_type', d.defaclobjtype,
      'acl', coalesce((select jsonb_agg(x::text order by x::text) from unnest(coalesce(d.defaclacl, '{}'::aclitem[])) x), '[]'::jsonb)
    )::text
  from pg_default_acl d
  join pg_roles r on r.oid = d.defaclrole
  left join pg_namespace n on n.oid = d.defaclnamespace
  where n.nspname in ('public','tongs') or (n.oid is null and r.rolname in ('postgres','supabase_admin'))

  union all
  select 'role', r.rolname,
    jsonb_build_object(
      'name', r.rolname,
      'superuser', r.rolsuper,
      'inherit', r.rolinherit,
      'create_role', r.rolcreaterole,
      'create_db', r.rolcreatedb,
      'can_login', r.rolcanlogin,
      'replication', r.rolreplication,
      'bypass_rls', r.rolbypassrls,
      'connection_limit', r.rolconnlimit,
      'configuration', coalesce(to_jsonb((select array_agg(x order by x) from unnest(coalesce(r.rolconfig, '{}'::text[])) x)), '[]'::jsonb)
    )::text
  from pg_roles r
  where r.rolname in ('postgres','anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin')

  union all
  select 'role_membership', format('%I->%I', parent.rolname, member.rolname),
    jsonb_build_object(
      'role', parent.rolname,
      'member', member.rolname,
      'grantor', grantor.rolname,
      'admin_option', m.admin_option,
      'inherit_option', m.inherit_option,
      'set_option', m.set_option
    )::text
  from pg_auth_members m
  join pg_roles parent on parent.oid = m.roleid
  join pg_roles member on member.oid = m.member
  join pg_roles grantor on grantor.oid = m.grantor
  where parent.rolname in ('postgres','anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin')
     or member.rolname in ('postgres','anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin')

  union all
  select 'publication', p.pubname,
    jsonb_build_object(
      'name', p.pubname,
      'owner', pg_get_userbyid(p.pubowner),
      'all_tables', p.puballtables,
      'insert', p.pubinsert,
      'update', p.pubupdate,
      'delete', p.pubdelete,
      'truncate', p.pubtruncate,
      'via_partition_root', p.pubviaroot,
      'relations', coalesce((
        select jsonb_agg(format('%I.%I', rn.nspname, rc.relname) order by rn.nspname, rc.relname)
        from pg_publication_rel pr
        join pg_class rc on rc.oid = pr.prrelid
        join pg_namespace rn on rn.oid = rc.relnamespace
        where pr.prpubid = p.oid and rn.nspname in ('public','tongs')
      ), '[]'::jsonb)
    )::text
  from pg_publication p
  where p.puballtables or exists (
    select 1 from pg_publication_rel pr join pg_class c on c.oid = pr.prrelid
    join target_namespaces n on n.oid = c.relnamespace where pr.prpubid = p.oid
  )

  union all
  select 'dependency_set', 'public+tongs',
    jsonb_agg(jsonb_build_object('object', object_identity, 'referenced_object', referenced_identity, 'type', dependency_type)
      order by object_identity, referenced_identity, dependency_type)::text
  from (
    select pg_describe_object(d.classid,d.objid,d.objsubid) object_identity,
      pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) referenced_identity,
      d.deptype dependency_type
    from pg_depend d
    where (
      (d.classid = 'pg_class'::regclass and exists (select 1 from pg_class c join target_namespaces n on n.oid=c.relnamespace where c.oid=d.objid))
      or (d.refclassid = 'pg_class'::regclass and exists (select 1 from pg_class c join target_namespaces n on n.oid=c.relnamespace where c.oid=d.refobjid))
      or (d.classid = 'pg_proc'::regclass and exists (select 1 from pg_proc p join target_namespaces n on n.oid=p.pronamespace where p.oid=d.objid))
      or (d.refclassid = 'pg_proc'::regclass and exists (select 1 from pg_proc p join target_namespaces n on n.oid=p.pronamespace where p.oid=d.refobjid))
      or (d.classid = 'pg_type'::regclass and exists (select 1 from pg_type t join target_namespaces n on n.oid=t.typnamespace where t.oid=d.objid))
      or (d.refclassid = 'pg_type'::regclass and exists (select 1 from pg_type t join target_namespaces n on n.oid=t.typnamespace where t.oid=d.refobjid))
    )
  ) dependencies
)
select category, identity, canonical
from objects
order by category, identity, canonical;
