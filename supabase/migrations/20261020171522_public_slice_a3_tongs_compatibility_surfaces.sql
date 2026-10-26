-- Slice A3: reproducible public compatibility surfaces backed by Tongs.
begin;

create temporary table slice_a_fingerprint_context (id integer) on commit drop;

create or replace function pg_temp.slice_a_relation_fingerprint(p_relation regclass)
returns text
language sql
stable
as $fingerprint$
  select md5(jsonb_build_object(
    'relkind', c.relkind,
    'owner', pg_get_userbyid(c.relowner),
    'rls', c.relrowsecurity,
    'force_rls', c.relforcerowsecurity,
    'options', coalesce(to_jsonb(c.reloptions), '[]'::jsonb),
    'columns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', a.attname,
        'type', format_type(a.atttypid, a.atttypmod),
        'notnull', a.attnotnull,
        'default', pg_get_expr(d.adbin, d.adrelid),
        'identity', a.attidentity,
        'generated', a.attgenerated
      ) order by a.attnum)
      from pg_attribute a
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    ), '[]'::jsonb),
    'constraints', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', con.conname,
        'type', con.contype,
        'definition', pg_get_constraintdef(con.oid, true)
      ) order by con.conname)
      from pg_constraint con where con.conrelid = c.oid
    ), '[]'::jsonb),
    'indexes', coalesce((
      select jsonb_agg(pg_get_indexdef(i.indexrelid) order by ci.relname)
      from pg_index i join pg_class ci on ci.oid = i.indexrelid
      where i.indrelid = c.oid
    ), '[]'::jsonb),
    'policies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.polname,
        'permissive', p.polpermissive,
        'cmd', p.polcmd,
        'roles', (select jsonb_agg(pg_get_userbyid(x) order by pg_get_userbyid(x)) from unnest(p.polroles) x),
        'qual', pg_get_expr(p.polqual, p.polrelid),
        'check', pg_get_expr(p.polwithcheck, p.polrelid)
      ) order by p.polname)
      from pg_policy p where p.polrelid = c.oid
    ), '[]'::jsonb),
    'acl', coalesce((
      select jsonb_agg(jsonb_build_object(
        'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
        'grantor', pg_get_userbyid(a.grantor),
        'privilege', a.privilege_type,
        'grantable', a.is_grantable
      ) order by case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end, a.privilege_type)
      from aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's'::"char" else 'r'::"char" end, c.relowner))) a
    ), '[]'::jsonb),
    'viewdef', case when c.relkind in ('v','m') then pg_get_viewdef(c.oid, true) end,
    'sequence', case when c.relkind = 'S' then (
      select to_jsonb(s) - 'seqrelid' from pg_sequence s where s.seqrelid = c.oid
    ) end
  )::text)
  from pg_class c
  where c.oid = p_relation;
$fingerprint$;

create or replace function pg_temp.slice_a_function_fingerprint(p_function regprocedure)
returns text
language sql
stable
as $fingerprint$
  select md5(jsonb_build_object(
    'definition', replace(pg_get_functiondef(p.oid), E'\r\n', E'\n'),
    'owner', pg_get_userbyid(p.proowner),
    'security_definer', p.prosecdef,
    'config', coalesce(to_jsonb(p.proconfig), '[]'::jsonb),
    'volatility', p.provolatile,
    'parallel', p.proparallel,
    'strict', p.proisstrict,
    'leakproof', p.proleakproof,
    'acl', coalesce((
      select jsonb_agg(jsonb_build_object(
        'grantee', case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
        'grantor', pg_get_userbyid(a.grantor),
        'privilege', a.privilege_type,
        'grantable', a.is_grantable
      ) order by case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end, a.privilege_type)
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    ), '[]'::jsonb)
  )::text)
  from pg_proc p
  where p.oid = p_function;
$fingerprint$;

create or replace function pg_temp.slice_a_trigger_fingerprint(
  p_schema text,
  p_table text,
  p_trigger text
)
returns text
language sql
stable
as $fingerprint$
  select md5(jsonb_build_object(
    'definition', pg_get_triggerdef(t.oid, true),
    'enabled', t.tgenabled
  )::text)
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal
    and n.nspname = p_schema
    and c.relname = p_table
    and t.tgname = p_trigger;
$fingerprint$;

do $validate$
declare
  item record;
  actual text;
  relation_oid regclass;
  function_oid regprocedure;
  parts text[];
begin
  for item in select * from (values
      ('workpiece_events', '31df6f10b7a21346abd0617d3c79a34d'),
      ('workpiece_files', '819fd4ef47cfc5b04debb20d99155f58'),
      ('workspaces', 'd1b8b644315a46726eccf24e7927bd41')
  ) expected(name, fingerprint)
  loop
    relation_oid := to_regclass(format('public.%I', item.name));
    if relation_oid is null then
      continue;
    end if;
    actual := pg_temp.slice_a_relation_fingerprint(relation_oid);
    if actual is distinct from item.fingerprint then
      raise exception 'Slice A incompatible relation public.%: expected %, got %', item.name, item.fingerprint, actual using errcode = '55000';
    end if;
  end loop;

  for item in select * from (values
      ('public.rls_auto_enable()', '77d04866e30b218b27f20e5c35e33590')
  ) expected(signature, fingerprint)
  loop
    function_oid := to_regprocedure(item.signature);
    if function_oid is null then
      continue;
    end if;
    actual := pg_temp.slice_a_function_fingerprint(function_oid);
    if actual is distinct from item.fingerprint then
      raise exception 'Slice A incompatible function %: expected %, got %', item.signature, item.fingerprint, actual using errcode = '55000';
    end if;
  end loop;

end
$validate$;

do $event_validate$
declare
  actual text;
begin
  select md5(jsonb_build_object(
    'event', e.evtevent,
    'owner', pg_get_userbyid(e.evtowner),
    'function', e.evtfoid::regprocedure::text,
    'enabled', e.evtenabled,
    'tags', e.evttags
  )::text)
  into actual
  from pg_event_trigger e
  where e.evtname = 'ensure_rls';

  if actual is not null and actual is distinct from 'fe1377ad0217836c084f25bbb2331a3a' then
    raise exception 'Slice A incompatible event trigger ensure_rls: expected %, got %',
      'fe1377ad0217836c084f25bbb2331a3a', actual using errcode = '55000';
  end if;
end
$event_validate$;

do $state$
declare
  existing_count integer;
begin
  select count(*) into existing_count
  from unnest(array['workpiece_events','workpiece_files']) name
  where to_regclass(format('public.%I', name)) is not null;
  if existing_count not in (0, 2) then
    raise exception 'Slice A3 partial workpiece compatibility set detected (% of 2); refusing non-atomic repair', existing_count using errcode = '55000';
  end if;
end
$state$;

do $create$
begin
  if to_regclass('public.workspaces') is null then
    execute $ddl$
CREATE OR REPLACE VIEW "public"."workspaces" WITH ("security_invoker"='true') AS
 SELECT "id",
    "name",
    "created_by",
    "created_at"
   FROM "tongs"."workspaces";

ALTER VIEW "public"."workspaces" OWNER TO "postgres";

REVOKE ALL ON TABLE "public"."workspaces" FROM "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";
$ddl$;
    raise notice 'Slice A created missing public.workspaces view contract';
  end if;
end
$create$;

do $create$
begin
  if to_regclass('public.workpiece_events') is null then
    execute $ddl$
CREATE TABLE IF NOT EXISTS "public"."workpiece_events" (
    "event_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workpiece_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tool_name" "text" NOT NULL,
    "tool_version" "text" NOT NULL,
    "actor_user_id" "uuid",
    "actor_display_name" "text",
    "event_name" "text" NOT NULL,
    "correlation_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."workpiece_files" (
    "workpiece_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "path" "text" NOT NULL,
    "type" "text" NOT NULL,
    "content_type" "text" NOT NULL,
    "bytes" bigint DEFAULT 0 NOT NULL,
    "hash_algo" "text" DEFAULT 'sha256'::"text" NOT NULL,
    "hash_value" "text" NOT NULL,
    "written_by_tool" "text" NOT NULL,
    "written_by_version" "text" NOT NULL,
    "lane" "text" DEFAULT 'forge-managed'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);

ALTER TABLE "public"."workpiece_events" OWNER TO "postgres";

ALTER TABLE "public"."workpiece_files" OWNER TO "postgres";

ALTER TABLE ONLY "public"."workpiece_events"
    ADD CONSTRAINT "workpiece_events_pkey" PRIMARY KEY ("event_id");

ALTER TABLE ONLY "public"."workpiece_files"
    ADD CONSTRAINT "workpiece_files_pkey" PRIMARY KEY ("workpiece_id", "path");

CREATE INDEX "workpiece_events_name_idx" ON "public"."workpiece_events" USING "btree" ("event_name");

CREATE INDEX "workpiece_events_workpiece_idx" ON "public"."workpiece_events" USING "btree" ("workpiece_id");

CREATE INDEX "workpiece_events_workspace_idx" ON "public"."workpiece_events" USING "btree" ("workspace_id");

CREATE INDEX "workpiece_files_path_idx" ON "public"."workpiece_files" USING "btree" ("path");

CREATE INDEX "workpiece_files_workspace_idx" ON "public"."workpiece_files" USING "btree" ("workspace_id");

ALTER TABLE "public"."workpiece_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workpiece_events_select_members" ON "public"."workpiece_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "tongs"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "workpiece_events"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))));

ALTER TABLE "public"."workpiece_files" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workpiece_files_select_members" ON "public"."workpiece_files" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "tongs"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "workpiece_files"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))));

GRANT ALL ON TABLE "public"."workpiece_events" TO "anon";
GRANT ALL ON TABLE "public"."workpiece_events" TO "authenticated";
GRANT ALL ON TABLE "public"."workpiece_events" TO "service_role";

GRANT ALL ON TABLE "public"."workpiece_files" TO "anon";
GRANT ALL ON TABLE "public"."workpiece_files" TO "authenticated";
GRANT ALL ON TABLE "public"."workpiece_files" TO "service_role";
$ddl$;
    raise notice 'Slice A created missing workpiece compatibility contract';
  end if;
end
$create$;

do $function$
begin
  if to_regprocedure('public.rls_auto_enable()') is null then
    execute $ddl$
CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";
$ddl$;
  end if;
end
$function$;

do $event$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    execute $ddl$
create event trigger ensure_rls
on ddl_command_end
when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
execute function public.rls_auto_enable();

alter event trigger ensure_rls owner to postgres;
$ddl$;
  end if;
end
$event$;

do $validate$
declare
  item record;
  actual text;
  relation_oid regclass;
  function_oid regprocedure;
  parts text[];
begin
  for item in select * from (values
      ('workpiece_events', '31df6f10b7a21346abd0617d3c79a34d'),
      ('workpiece_files', '819fd4ef47cfc5b04debb20d99155f58'),
      ('workspaces', 'd1b8b644315a46726eccf24e7927bd41')
  ) expected(name, fingerprint)
  loop
    relation_oid := to_regclass(format('public.%I', item.name));
    if relation_oid is null then
      raise exception 'Slice A required relation is missing: public.%', item.name using errcode = '55000';
    end if;
    actual := pg_temp.slice_a_relation_fingerprint(relation_oid);
    if actual is distinct from item.fingerprint then
      raise exception 'Slice A incompatible relation public.%: expected %, got %', item.name, item.fingerprint, actual using errcode = '55000';
    end if;
  end loop;

  for item in select * from (values
      ('public.rls_auto_enable()', '77d04866e30b218b27f20e5c35e33590')
  ) expected(signature, fingerprint)
  loop
    function_oid := to_regprocedure(item.signature);
    if function_oid is null then
      raise exception 'Slice A required function is missing: %', item.signature using errcode = '55000';
    end if;
    actual := pg_temp.slice_a_function_fingerprint(function_oid);
    if actual is distinct from item.fingerprint then
      raise exception 'Slice A incompatible function %: expected %, got %', item.signature, item.fingerprint, actual using errcode = '55000';
    end if;
  end loop;

end
$validate$;

do $event_validate$
declare
  actual text;
begin
  select md5(jsonb_build_object(
    'event', e.evtevent,
    'owner', pg_get_userbyid(e.evtowner),
    'function', e.evtfoid::regprocedure::text,
    'enabled', e.evtenabled,
    'tags', e.evttags
  )::text)
  into actual
  from pg_event_trigger e
  where e.evtname = 'ensure_rls';

  if actual is null or actual is distinct from 'fe1377ad0217836c084f25bbb2331a3a' then
    raise exception 'Slice A incompatible event trigger ensure_rls: expected %, got %',
      'fe1377ad0217836c084f25bbb2331a3a', actual using errcode = '55000';
  end if;
end
$event_validate$;

commit;
