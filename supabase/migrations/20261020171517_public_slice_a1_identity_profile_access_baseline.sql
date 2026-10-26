-- Slice A1: reproducible public identity, profile, account and display compatibility.
-- Existing objects are fingerprinted before any DDL. Missing objects are created
-- with their complete production-equivalent security contract in this transaction.
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
      ('account_balances', '66c9cd33b8b2ce68f7a1eee37a4eba7e'),
      ('account_identities', '84688674f914621cee056e9257c4b5ae'),
      ('account_overview_v', '27791be7c1613ce4d7cf07b0ca108d70'),
      ('display_pair_sessions', 'd0eb3a02b086a6d663a5635d00228ac4'),
      ('plans', '8b6c9e061604a42449317827873cf5eb'),
      ('profiles', 'da96c81b5e4a71436ce621f2116e3a52'),
      ('profiles_id_seq', '43014a59d2bea1810a8c4742e83cfa23'),
      ('tp_profiles', 'd548806d7b147d18aab0898ade6478e8'),
      ('user_plans', '63651f0af431732a2b64ffe8e3d73585')
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
      ('public.auto_assign_trial_plan()', 'af69f9917bf39a065ec3ed0d39c35075'),
      ('public.ensure_account_balance_row(uuid)', 'a1b7685613975f0e17bb0a6c1313ace7'),
      ('public.ensure_profile_for_user(uuid,text)', 'be578dcff8c6243653889379c943bc1b'),
      ('public.get_my_plan()', '9b87adb316bc53ce4fa8e24fd65a5f1b'),
      ('public.handle_new_user()', '654de3745cc64b79795168d6800a0c3c'),
      ('public.handle_new_user_account_bootstrap()', '545f11983d2f9155bd0e0cf6d1b0e3c0'),
      ('public.handle_new_user_default_plan()', 'cc56457c0f1f4556841f759a60a4a575'),
      ('public.set_updated_at()', '47736f7b59af52b151c15ffc24de64a9'),
      ('public.start_trial_on_first_login()', 'fb9460227aced932951ecd56d5e1dcba')
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

  for item in select * from (values
      ('auth.users.on_auth_user_created', '49d88f3262e258aeff37d46420393a3b'),
      ('public.account_balances.trg_account_balances_updated_at', '04d13135df53a3000f7ac787fb408d4c'),
      ('public.tp_profiles.trg_tp_profiles_updated_at', 'fa8bd5af83f97bd68a30cbcdb32dc813')
  ) expected(identity, fingerprint)
  loop
    parts := string_to_array(item.identity, '.');
    actual := pg_temp.slice_a_trigger_fingerprint(parts[1], parts[2], parts[3]);
    if actual is null then
      continue;
    end if;
    if actual is distinct from item.fingerprint then
      raise exception 'Slice A incompatible trigger %: expected %, got %', item.identity, item.fingerprint, actual using errcode = '55000';
    end if;
  end loop;
end
$validate$;

do $state$
declare
  existing_count integer;
begin
  select count(*) into existing_count
  from unnest(array['account_balances','account_identities','account_overview_v','display_pair_sessions','plans','tp_profiles','user_plans']) name
  where to_regclass(format('public.%I', name)) is not null;
  if existing_count not in (0, 7) then
    raise exception 'Slice A1 partial legacy relation set detected (% of 7); refusing non-atomic repair', existing_count using errcode = '55000';
  end if;
end
$state$;

do $create$
begin
  if to_regclass('public.profiles') is null then
    execute $ddl$
CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "display_name" "text",
    "tier" "text" DEFAULT '"free"'::"text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "settings_rev" bigint DEFAULT 0 NOT NULL,
    "settings_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "asr_settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "asr_calibration_profiles" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "asr_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_legacy" boolean DEFAULT false NOT NULL,
    "anvil_paid" boolean DEFAULT false NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "subscription_status" "text",
    "current_period_end" timestamp with time zone,
    "email" "text",
    "avatar_url" "text",
    "updated_at" timestamp with time zone
);

ALTER TABLE "public"."profiles" OWNER TO "postgres";

ALTER TABLE "public"."profiles" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."profiles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

CREATE INDEX "profiles_settings_gin" ON "public"."profiles" USING "gin" ("settings");

CREATE INDEX "profiles_stripe_customer_id_idx" ON "public"."profiles" USING "btree" ("stripe_customer_id");

CREATE INDEX "profiles_stripe_subscription_id_idx" ON "public"."profiles" USING "btree" ("stripe_subscription_id");

CREATE UNIQUE INDEX "profiles_user_id_uniq" ON "public"."profiles" USING "btree" ("user_id");

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));

CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";
$ddl$;
    raise notice 'Slice A created missing public.profiles contract';
  end if;
end
$create$;

do $create$
begin
  if to_regclass('public.account_balances') is null then
    execute $ddl$
CREATE TABLE IF NOT EXISTS "public"."account_balances" (
    "user_id" "uuid" NOT NULL,
    "ai_credit_balance" bigint DEFAULT 0 NOT NULL,
    "storage_bytes_entitled" bigint DEFAULT 0 NOT NULL,
    "storage_bytes_used" bigint DEFAULT 0 NOT NULL,
    "seat_count_entitled" integer DEFAULT 1 NOT NULL,
    "active_plan_code" "text",
    "active_plan_status" "text",
    "active_storage_level" "text",
    "founders_club" boolean DEFAULT false NOT NULL,
    "has_founder_discount" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."account_identities" (
    "user_id" "uuid" NOT NULL,
    "email" "text"
);

CREATE TABLE IF NOT EXISTS "public"."display_pair_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_by" "uuid",
    "consumed_at" timestamp with time zone,
    "consumed_by" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_public" boolean DEFAULT true NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "price_monthly_cents" integer,
    "price_yearly_cents" integer,
    "iron_mine_access" boolean DEFAULT false NOT NULL,
    "max_projects" integer DEFAULT 1 NOT NULL,
    "max_recording_minutes_per_month" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_price_monthly_id" "text",
    "stripe_price_quarterly_id" "text"
);

CREATE TABLE IF NOT EXISTS "public"."tp_profiles" (
    "user_id" "uuid" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "profile" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."user_plans" (
    "user_id" "uuid" NOT NULL,
    "plan_id" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone,
    "is_founder" boolean DEFAULT false NOT NULL,
    "founder_discount_percent" integer,
    "founder_discount_notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text"
);

ALTER TABLE "public"."account_balances" OWNER TO "postgres";

ALTER TABLE "public"."account_identities" OWNER TO "postgres";

ALTER TABLE "public"."display_pair_sessions" OWNER TO "postgres";

ALTER TABLE "public"."plans" OWNER TO "postgres";

ALTER TABLE "public"."tp_profiles" OWNER TO "postgres";

ALTER TABLE "public"."user_plans" OWNER TO "postgres";

ALTER TABLE ONLY "public"."account_balances"
    ADD CONSTRAINT "account_balances_pkey" PRIMARY KEY ("user_id");

ALTER TABLE ONLY "public"."account_identities"
    ADD CONSTRAINT "account_identities_pkey" PRIMARY KEY ("user_id");

ALTER TABLE ONLY "public"."display_pair_sessions"
    ADD CONSTRAINT "display_pair_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."display_pair_sessions"
    ADD CONSTRAINT "display_pair_sessions_token_key" UNIQUE ("token");

ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."tp_profiles"
    ADD CONSTRAINT "tp_profiles_pkey" PRIMARY KEY ("user_id");

ALTER TABLE ONLY "public"."user_plans"
    ADD CONSTRAINT "user_plans_pkey" PRIMARY KEY ("user_id");

ALTER TABLE ONLY "public"."user_plans"
    ADD CONSTRAINT "user_plans_user_id_unique" UNIQUE ("user_id");

ALTER TABLE ONLY "public"."account_balances"
    ADD CONSTRAINT "account_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."account_identities"
    ADD CONSTRAINT "account_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."tp_profiles"
    ADD CONSTRAINT "tp_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."user_plans"
    ADD CONSTRAINT "user_plans_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");

ALTER TABLE ONLY "public"."user_plans"
    ADD CONSTRAINT "user_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

CREATE INDEX "display_pair_sessions_consumed_at_idx" ON "public"."display_pair_sessions" USING "btree" ("consumed_at");

CREATE INDEX "display_pair_sessions_expires_at_idx" ON "public"."display_pair_sessions" USING "btree" ("expires_at");

CREATE INDEX "user_plans_plan_id_idx" ON "public"."user_plans" USING "btree" ("plan_id");

CREATE OR REPLACE VIEW "public"."account_overview_v" WITH ("security_invoker"='true') AS
 SELECT "ai"."user_id",
    "ai"."email",
    "p"."display_name",
    "p"."avatar_url",
    "p"."created_at" AS "profile_created_at",
    "ab"."active_plan_code",
    "ab"."active_plan_status",
    "ab"."active_storage_level",
    "ab"."storage_bytes_entitled",
    "ab"."storage_bytes_used",
    GREATEST(("ab"."storage_bytes_entitled" - "ab"."storage_bytes_used"), (0)::bigint) AS "storage_bytes_remaining",
    "ab"."ai_credit_balance",
    "ab"."seat_count_entitled",
    "ab"."founders_club",
    "ab"."has_founder_discount"
   FROM (("public"."account_identities" "ai"
     LEFT JOIN "public"."profiles" "p" ON (("p"."user_id" = "ai"."user_id")))
     LEFT JOIN "public"."account_balances" "ab" ON (("ab"."user_id" = "ai"."user_id")));

ALTER VIEW "public"."account_overview_v" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."auto_assign_trial_plan"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- If the user is effectively "already logged in" at creation time,
  -- start trial immediately. Otherwise default to free and let the
  -- first-login trigger start the trial.
  if new.last_sign_in_at is not null then
    insert into public.user_plans (
      user_id, plan_id, status, started_at, ends_at, is_founder, updated_at
    )
    values (
      new.id,
      'creator',
      'trialing',
      now(),
      now() + interval '30 days',
      false,
      now()
    )
    on conflict (user_id) do nothing;
  else
    insert into public.user_plans (
      user_id, plan_id, status, started_at, ends_at, is_founder, updated_at
    )
    values (
      new.id,
      'free',
      'active',
      now(),
      null,
      false,
      now()
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

ALTER FUNCTION "public"."auto_assign_trial_plan"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

CREATE OR REPLACE FUNCTION "public"."ensure_account_balance_row"("p_user_id" "uuid") RETURNS "public"."account_balances"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.account_balances;
begin
  insert into public.account_balances (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select *
  into v_row
  from public.account_balances
  where user_id = p_user_id;

  return v_row;
end;
$$;

ALTER FUNCTION "public"."ensure_account_balance_row"("p_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."ensure_profile_for_user"("p_user_id" "uuid", "p_email" "text" DEFAULT NULL::"text") RETURNS "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.profiles;
begin
  insert into public.profiles (user_id, email)
  values (p_user_id, p_email)
  on conflict (user_id) do update
    set email = coalesce(excluded.email, public.profiles.email)
  returning * into v_row;

  return v_row;
end;
$$;

ALTER FUNCTION "public"."ensure_profile_for_user"("p_user_id" "uuid", "p_email" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_my_plan"() RETURNS TABLE("plan_id" "text", "status" "text", "ends_at" timestamp with time zone, "is_founder" boolean, "founder_discount_percent" integer, "plan_name" "text", "price_monthly_cents" integer, "price_yearly_cents" integer, "iron_mine_access" boolean, "max_projects" integer, "max_recording_minutes_per_month" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    up.plan_id,
    up.status,
    up.ends_at,
    up.is_founder,
    up.founder_discount_percent,
    p.name as plan_name,
    p.price_monthly_cents,
    p.price_yearly_cents,
    p.iron_mine_access,
    p.max_projects,
    p.max_recording_minutes_per_month
  from public.user_plans up
  join public.plans p on p.id = up.plan_id
  where up.user_id = auth.uid()
    and up.status in ('active','trialing')
    and (up.ends_at is null or up.ends_at > now())
  order by up.started_at desc
  limit 1;
$$;

ALTER FUNCTION "public"."get_my_plan"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."handle_new_user_account_bootstrap"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.ensure_profile_for_user(new.id, new.email);
  perform public.ensure_account_balance_row(new.id);
  return new;
end;
$$;

ALTER FUNCTION "public"."handle_new_user_account_bootstrap"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."handle_new_user_default_plan"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
  insert into public.user_plans (user_id, plan_id)
  values (new.id, 'free')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

ALTER FUNCTION "public"."handle_new_user_default_plan"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."start_trial_on_first_login"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Only fire on the FIRST login event.
  if old.last_sign_in_at is null and new.last_sign_in_at is not null then

    -- Start trial only if user is currently on free/active (don’t overwrite founders/paid).
    update public.user_plans
    set
      plan_id = 'creator',
      status = 'trialing',
      started_at = now(),
      ends_at = now() + interval '30 days',
      updated_at = now()
    where user_id = new.id
      and plan_id = 'free'
      and status = 'active'
      and (ends_at is null or ends_at > now());

  end if;

  return new;
end;
$$;

ALTER FUNCTION "public"."start_trial_on_first_login"() OWNER TO "postgres";

CREATE OR REPLACE TRIGGER "trg_account_balances_updated_at" BEFORE UPDATE ON "public"."account_balances" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_tp_profiles_updated_at" BEFORE UPDATE ON "public"."tp_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

ALTER TABLE "public"."account_balances" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_balances_select_own" ON "public"."account_balances" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));

ALTER TABLE "public"."account_identities" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_identities_select_own" ON "public"."account_identities" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));

ALTER TABLE "public"."display_pair_sessions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read active plans" ON "public"."plans" FOR SELECT USING (("is_active" = true));

CREATE POLICY "read active public plans" ON "public"."plans" FOR SELECT USING (("is_active" = true));

CREATE POLICY "read own plan" ON "public"."user_plans" FOR SELECT USING (("auth"."uid"() = "user_id"));

ALTER TABLE "public"."tp_profiles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tp_profiles_insert_own" ON "public"."tp_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "tp_profiles_select_own" ON "public"."tp_profiles" FOR SELECT USING (("auth"."uid"() = "user_id"));

CREATE POLICY "tp_profiles_update_own" ON "public"."tp_profiles" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));

ALTER TABLE "public"."user_plans" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION "public"."auto_assign_trial_plan"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."auto_assign_trial_plan"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."auto_assign_trial_plan"() FROM "authenticated";
GRANT ALL ON FUNCTION "public"."auto_assign_trial_plan"() TO "service_role";

GRANT ALL ON TABLE "public"."account_balances" TO "anon";
GRANT ALL ON TABLE "public"."account_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."account_balances" TO "service_role";

REVOKE ALL ON FUNCTION "public"."ensure_account_balance_row"("p_user_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."ensure_account_balance_row"("p_user_id" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."ensure_account_balance_row"("p_user_id" "uuid") FROM "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_account_balance_row"("p_user_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."ensure_profile_for_user"("p_user_id" "uuid", "p_email" "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."ensure_profile_for_user"("p_user_id" "uuid", "p_email" "text") FROM "anon";
REVOKE ALL ON FUNCTION "public"."ensure_profile_for_user"("p_user_id" "uuid", "p_email" "text") FROM "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_profile_for_user"("p_user_id" "uuid", "p_email" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_my_plan"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_plan"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_plan"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."handle_new_user_account_bootstrap"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."handle_new_user_account_bootstrap"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."handle_new_user_account_bootstrap"() FROM "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_account_bootstrap"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."handle_new_user_default_plan"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."handle_new_user_default_plan"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."handle_new_user_default_plan"() FROM "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_default_plan"() TO "service_role";

GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."start_trial_on_first_login"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."start_trial_on_first_login"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."start_trial_on_first_login"() FROM "authenticated";
GRANT ALL ON FUNCTION "public"."start_trial_on_first_login"() TO "service_role";

GRANT ALL ON TABLE "public"."account_identities" TO "anon";
GRANT ALL ON TABLE "public"."account_identities" TO "authenticated";
GRANT ALL ON TABLE "public"."account_identities" TO "service_role";

REVOKE ALL ON TABLE "public"."account_overview_v" FROM "anon";
GRANT ALL ON TABLE "public"."account_overview_v" TO "authenticated";
GRANT ALL ON TABLE "public"."account_overview_v" TO "service_role";

GRANT ALL ON TABLE "public"."display_pair_sessions" TO "anon";
GRANT ALL ON TABLE "public"."display_pair_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."display_pair_sessions" TO "service_role";

GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";

GRANT ALL ON TABLE "public"."tp_profiles" TO "anon";
GRANT ALL ON TABLE "public"."tp_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."tp_profiles" TO "service_role";

GRANT ALL ON TABLE "public"."user_plans" TO "anon";
GRANT ALL ON TABLE "public"."user_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."user_plans" TO "service_role";
$ddl$;
    raise notice 'Slice A created missing identity/profile/access contract';
  end if;
end
$create$;

do $function$
begin
  if to_regprocedure('public.handle_new_user()') is null then
    execute $ddl$
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'tongs'
    AS $$
begin
  begin
    if pg_catalog.to_regclass('public.profiles') is not null then
      insert into public.profiles (user_id)
      values (new.id)
      on conflict (user_id) do nothing;
    end if;
  exception when others then
    raise warning '[handle_new_user] profile bootstrap failed for user %: % (%)', new.id, SQLERRM, SQLSTATE;
  end;

  begin
    if not exists (
      select 1
      from tongs.workspace_members
      where user_id = new.id
    ) then
      perform tongs.create_workspace_admin('My Workspace', new.id);
    end if;
  exception when others then
    raise warning '[handle_new_user] workspace bootstrap failed for user %: % (%)', new.id, SQLERRM, SQLSTATE;
  end;

  return new;
end;
$$;

ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";
$ddl$;
  end if;
end
$function$;

do $trigger$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname = 'auth' and c.relname = 'users' and t.tgname = 'on_auth_user_created'
  ) then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  end if;
end
$trigger$;

do $validate$
declare
  item record;
  actual text;
  relation_oid regclass;
  function_oid regprocedure;
  parts text[];
begin
  for item in select * from (values
      ('account_balances', '66c9cd33b8b2ce68f7a1eee37a4eba7e'),
      ('account_identities', '84688674f914621cee056e9257c4b5ae'),
      ('account_overview_v', '27791be7c1613ce4d7cf07b0ca108d70'),
      ('display_pair_sessions', 'd0eb3a02b086a6d663a5635d00228ac4'),
      ('plans', '8b6c9e061604a42449317827873cf5eb'),
      ('profiles', 'da96c81b5e4a71436ce621f2116e3a52'),
      ('profiles_id_seq', '43014a59d2bea1810a8c4742e83cfa23'),
      ('tp_profiles', 'd548806d7b147d18aab0898ade6478e8'),
      ('user_plans', '63651f0af431732a2b64ffe8e3d73585')
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
      ('public.auto_assign_trial_plan()', 'af69f9917bf39a065ec3ed0d39c35075'),
      ('public.ensure_account_balance_row(uuid)', 'a1b7685613975f0e17bb0a6c1313ace7'),
      ('public.ensure_profile_for_user(uuid,text)', 'be578dcff8c6243653889379c943bc1b'),
      ('public.get_my_plan()', '9b87adb316bc53ce4fa8e24fd65a5f1b'),
      ('public.handle_new_user()', '654de3745cc64b79795168d6800a0c3c'),
      ('public.handle_new_user_account_bootstrap()', '545f11983d2f9155bd0e0cf6d1b0e3c0'),
      ('public.handle_new_user_default_plan()', 'cc56457c0f1f4556841f759a60a4a575'),
      ('public.set_updated_at()', '47736f7b59af52b151c15ffc24de64a9'),
      ('public.start_trial_on_first_login()', 'fb9460227aced932951ecd56d5e1dcba')
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

  for item in select * from (values
      ('auth.users.on_auth_user_created', '49d88f3262e258aeff37d46420393a3b'),
      ('public.account_balances.trg_account_balances_updated_at', '04d13135df53a3000f7ac787fb408d4c'),
      ('public.tp_profiles.trg_tp_profiles_updated_at', 'fa8bd5af83f97bd68a30cbcdb32dc813')
  ) expected(identity, fingerprint)
  loop
    parts := string_to_array(item.identity, '.');
    actual := pg_temp.slice_a_trigger_fingerprint(parts[1], parts[2], parts[3]);
    if actual is null then
      raise exception 'Slice A required trigger is missing: %', item.identity using errcode = '55000';
    end if;
    if actual is distinct from item.fingerprint then
      raise exception 'Slice A incompatible trigger %: expected %, got %', item.identity, item.fingerprint, actual using errcode = '55000';
    end if;
  end loop;
end
$validate$;

commit;
