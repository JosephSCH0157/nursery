-- Slice A2: reproducible legacy public billing and Stripe compatibility.
-- This migration does not move or rewrite financial data.
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
      ('ai_credit_packs', '8284eb97d7a6f41aa512280d0ce7acbb'),
      ('ai_credit_topups', '887bdb3a662b74216774e693a02af5e4'),
      ('ai_credit_topups_id_seq', '43014a59d2bea1810a8c4742e83cfa23'),
      ('billing_catalog', '57eaa8b91a4dc2229679c62f9bcc0956'),
      ('billing_customers', '1fcd2415a5ab00ea8971be746270b42b'),
      ('billing_events', '51e63f70e893210bbd86568a0f3c977a'),
      ('billing_one_time_purchases', '16407f7f61f96670771fea63747f324a'),
      ('billing_subscriptions', '11d86218c9196fb5c856613ae4b20320'),
      ('forge_memberships', 'a06907ff863925b666d5746cbe284739'),
      ('stripe_event_log', 'c3547bf5403a03e1b8915d356ab28824')
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
      ('public.recompute_account_balances(uuid)', '18bacbe6951f35196eb8fdbf34db33b2'),
      ('public.record_billing_event(uuid,text,text,text,jsonb,text,text,timestamptz)', '9611a1e4a64119d78b7e1c3ca4717178'),
      ('public.upsert_billing_customer(uuid,text,text)', 'e797673391c7e5df89c4479d4f0798c2'),
      ('public.upsert_billing_one_time_purchase(uuid,text,text,text,text,text,text,text,integer,integer,text,jsonb)', '95afe8c991761f7fe045b4308ddd7a89'),
      ('public.upsert_billing_subscription(uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,timestamptz,timestamptz,integer,jsonb)', '9f948c0ef12d59b0adff5b6774c6e985')
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
      ('public.billing_catalog.trg_billing_catalog_updated_at', 'e29156de837ca53fd776307bb97d0e3a'),
      ('public.billing_customers.trg_billing_customers_updated_at', '48189ef17f1b44b86aa1607ad9fb72ad'),
      ('public.billing_one_time_purchases.trg_billing_one_time_purchases_updated_at', '68a3d1c45c7734f01d40394a8a61db7f'),
      ('public.billing_subscriptions.trg_billing_subscriptions_updated_at', '37c3020146f676131f7690172262adaa')
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
  from unnest(array['ai_credit_packs','ai_credit_topups','billing_catalog','billing_customers','billing_events','billing_one_time_purchases','billing_subscriptions','forge_memberships','stripe_event_log']) name
  where to_regclass(format('public.%I', name)) is not null;
  if existing_count not in (0, 9) then
    raise exception 'Slice A2 partial legacy financial relation set detected (% of 9); refusing non-atomic repair', existing_count using errcode = '55000';
  end if;
end
$state$;

do $create$
begin
  if to_regclass('public.ai_credit_packs') is null then
    execute $ddl$
CREATE TABLE IF NOT EXISTS "public"."billing_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "stripe_event_id" "text" NOT NULL,
    "stripe_env" "text" DEFAULT 'live'::"text" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "error_text" "text",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_events_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'processed'::"text", 'failed'::"text"]))),
    CONSTRAINT "billing_events_stripe_env_check" CHECK (("stripe_env" = ANY (ARRAY['test'::"text", 'live'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."billing_customers" (
    "user_id" "uuid" NOT NULL,
    "stripe_customer_id" "text" NOT NULL,
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."billing_one_time_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_checkout_session_id" "text",
    "stripe_payment_intent_id" "text",
    "stripe_product_id" "text",
    "stripe_price_id" "text",
    "stripe_env" "text" DEFAULT 'live'::"text" NOT NULL,
    "purchase_kind" "text" NOT NULL,
    "pack_code" "text",
    "quantity" integer DEFAULT 1 NOT NULL,
    "amount_paid_cents" integer,
    "currency" "text" DEFAULT 'usd'::"text",
    "status" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_one_time_purchases_purchase_kind_check" CHECK (("purchase_kind" = 'ai_credits'::"text")),
    CONSTRAINT "billing_one_time_purchases_stripe_env_check" CHECK (("stripe_env" = ANY (ARRAY['test'::"text", 'live'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."billing_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text" NOT NULL,
    "stripe_subscription_item_id" "text",
    "stripe_product_id" "text",
    "stripe_price_id" "text" NOT NULL,
    "stripe_env" "text" DEFAULT 'live'::"text" NOT NULL,
    "subscription_kind" "text" NOT NULL,
    "plan_code" "text",
    "storage_level" "text",
    "addon_code" "text",
    "interval_code" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "status" "text" NOT NULL,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "canceled_at" timestamp with time zone,
    "trial_start" timestamp with time zone,
    "trial_end" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_subscriptions_stripe_env_check" CHECK (("stripe_env" = ANY (ARRAY['test'::"text", 'live'::"text"]))),
    CONSTRAINT "billing_subscriptions_subscription_kind_check" CHECK (("subscription_kind" = ANY (ARRAY['forge_plan'::"text", 'storage_pack'::"text", 'seat_addon'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."ai_credit_packs" (
    "id" "text" NOT NULL,
    "stripe_price_id" "text" NOT NULL,
    "token_grant" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."ai_credit_topups" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stripe_event_id" "text" NOT NULL,
    "stripe_session_id" "text",
    "stripe_payment_intent_id" "text",
    "stripe_price_id" "text" NOT NULL,
    "token_grant" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS "public"."ai_credit_topups_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS "public"."billing_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" NOT NULL,
    "forge_key" "text" NOT NULL,
    "stripe_env" "text" NOT NULL,
    "stripe_product_id" "text",
    "stripe_price_id" "text",
    "stripe_coupon_id" "text",
    "forge_plan_id" "text",
    "forge_interval" "text",
    "forge_storage_level" "text",
    "forge_pack_type" "text",
    "forge_pack_id" "text",
    "forge_addon" "text",
    "bytes_entitled" bigint,
    "ai_credits" bigint,
    "seat_quantity" integer,
    "percent_off" numeric(5,2),
    "coupon_scope" "text",
    "coupon_duration" "text",
    "active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_catalog_kind_check" CHECK (("kind" = ANY (ARRAY['forge_plan'::"text", 'storage_pack'::"text", 'seat_addon'::"text", 'ai_credit_pack'::"text", 'coupon'::"text"]))),
    CONSTRAINT "billing_catalog_price_or_coupon_chk" CHECK ((("stripe_price_id" IS NOT NULL) OR ("stripe_coupon_id" IS NOT NULL))),
    CONSTRAINT "billing_catalog_stripe_env_check" CHECK (("stripe_env" = ANY (ARRAY['test'::"text", 'live'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."forge_memberships" (
    "user_id" "uuid" NOT NULL,
    "stripe_mode" "text" DEFAULT 'live'::"text" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "stripe_status" "text",
    "stripe_price_id" "text",
    "current_period_end" timestamp with time zone,
    "last_stripe_event_id" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."stripe_event_log" (
    "event_id" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_type" "text",
    "livemode" boolean DEFAULT false,
    "received_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."billing_events" OWNER TO "postgres";

ALTER TABLE "public"."billing_customers" OWNER TO "postgres";

ALTER TABLE "public"."billing_one_time_purchases" OWNER TO "postgres";

ALTER TABLE "public"."billing_subscriptions" OWNER TO "postgres";

ALTER TABLE "public"."ai_credit_packs" OWNER TO "postgres";

ALTER TABLE "public"."ai_credit_topups" OWNER TO "postgres";

ALTER SEQUENCE "public"."ai_credit_topups_id_seq" OWNER TO "postgres";

ALTER TABLE "public"."billing_catalog" OWNER TO "postgres";

ALTER TABLE "public"."forge_memberships" OWNER TO "postgres";

ALTER TABLE "public"."stripe_event_log" OWNER TO "postgres";

ALTER SEQUENCE "public"."ai_credit_topups_id_seq" OWNED BY "public"."ai_credit_topups"."id";

ALTER TABLE ONLY "public"."ai_credit_topups" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ai_credit_topups_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."ai_credit_packs"
    ADD CONSTRAINT "ai_credit_packs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."ai_credit_packs"
    ADD CONSTRAINT "ai_credit_packs_stripe_price_id_key" UNIQUE ("stripe_price_id");

ALTER TABLE ONLY "public"."ai_credit_topups"
    ADD CONSTRAINT "ai_credit_topups_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."ai_credit_topups"
    ADD CONSTRAINT "ai_credit_topups_stripe_event_id_key" UNIQUE ("stripe_event_id");

ALTER TABLE ONLY "public"."billing_catalog"
    ADD CONSTRAINT "billing_catalog_forge_key_key" UNIQUE ("forge_key");

ALTER TABLE ONLY "public"."billing_catalog"
    ADD CONSTRAINT "billing_catalog_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."billing_customers"
    ADD CONSTRAINT "billing_customers_pkey" PRIMARY KEY ("user_id");

ALTER TABLE ONLY "public"."billing_customers"
    ADD CONSTRAINT "billing_customers_stripe_customer_id_key" UNIQUE ("stripe_customer_id");

ALTER TABLE ONLY "public"."billing_events"
    ADD CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."billing_events"
    ADD CONSTRAINT "billing_events_stripe_event_id_key" UNIQUE ("stripe_event_id");

ALTER TABLE ONLY "public"."billing_one_time_purchases"
    ADD CONSTRAINT "billing_one_time_purchases_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."billing_one_time_purchases"
    ADD CONSTRAINT "billing_one_time_purchases_stripe_payment_intent_id_key" UNIQUE ("stripe_payment_intent_id");

ALTER TABLE ONLY "public"."billing_subscriptions"
    ADD CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."billing_subscriptions"
    ADD CONSTRAINT "billing_subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");

ALTER TABLE ONLY "public"."billing_subscriptions"
    ADD CONSTRAINT "billing_subscriptions_stripe_subscription_item_id_key" UNIQUE ("stripe_subscription_item_id");

ALTER TABLE ONLY "public"."forge_memberships"
    ADD CONSTRAINT "forge_memberships_pkey" PRIMARY KEY ("user_id");

ALTER TABLE ONLY "public"."forge_memberships"
    ADD CONSTRAINT "forge_memberships_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");

ALTER TABLE ONLY "public"."stripe_event_log"
    ADD CONSTRAINT "stripe_event_log_pkey" PRIMARY KEY ("event_id");

ALTER TABLE ONLY "public"."billing_customers"
    ADD CONSTRAINT "billing_customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."billing_events"
    ADD CONSTRAINT "billing_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."billing_one_time_purchases"
    ADD CONSTRAINT "billing_one_time_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."billing_subscriptions"
    ADD CONSTRAINT "billing_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."forge_memberships"
    ADD CONSTRAINT "forge_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

CREATE INDEX "ai_credit_topups_user_id_idx" ON "public"."ai_credit_topups" USING "btree" ("user_id");

CREATE INDEX "forge_memberships_status_idx" ON "public"."forge_memberships" USING "btree" ("stripe_status");

CREATE INDEX "forge_memberships_stripe_customer_idx" ON "public"."forge_memberships" USING "btree" ("stripe_customer_id");

CREATE INDEX "idx_billing_catalog_env" ON "public"."billing_catalog" USING "btree" ("stripe_env");

CREATE INDEX "idx_billing_catalog_kind" ON "public"."billing_catalog" USING "btree" ("kind");

CREATE INDEX "idx_billing_catalog_stripe_price_id" ON "public"."billing_catalog" USING "btree" ("stripe_price_id");

CREATE INDEX "idx_billing_catalog_stripe_product_id" ON "public"."billing_catalog" USING "btree" ("stripe_product_id");

CREATE INDEX "idx_billing_customers_email" ON "public"."billing_customers" USING "btree" ("email");

CREATE INDEX "idx_billing_events_status" ON "public"."billing_events" USING "btree" ("status");

CREATE INDEX "idx_billing_events_type" ON "public"."billing_events" USING "btree" ("event_type");

CREATE INDEX "idx_billing_events_user_id" ON "public"."billing_events" USING "btree" ("user_id");

CREATE INDEX "idx_billing_one_time_purchases_kind" ON "public"."billing_one_time_purchases" USING "btree" ("purchase_kind");

CREATE INDEX "idx_billing_one_time_purchases_status" ON "public"."billing_one_time_purchases" USING "btree" ("status");

CREATE INDEX "idx_billing_one_time_purchases_user_id" ON "public"."billing_one_time_purchases" USING "btree" ("user_id");

CREATE INDEX "idx_billing_subscriptions_kind" ON "public"."billing_subscriptions" USING "btree" ("subscription_kind");

CREATE INDEX "idx_billing_subscriptions_price" ON "public"."billing_subscriptions" USING "btree" ("stripe_price_id");

CREATE INDEX "idx_billing_subscriptions_status" ON "public"."billing_subscriptions" USING "btree" ("status");

CREATE INDEX "idx_billing_subscriptions_user_id" ON "public"."billing_subscriptions" USING "btree" ("user_id");

CREATE UNIQUE INDEX "stripe_event_log_event_id_uq" ON "public"."stripe_event_log" USING "btree" ("event_id");

CREATE OR REPLACE FUNCTION "public"."recompute_account_balances"("p_user_id" "uuid") RETURNS "public"."account_balances"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_plan_code text;
  v_plan_status text;
  v_storage_level text;
  v_storage_bytes bigint := 0;
  v_seat_addons integer := 0;
  v_ai_credits bigint := 0;
  v_founders_club boolean := false;
  v_has_founder_discount boolean := false;
  v_result public.account_balances;
begin
  perform public.ensure_account_balance_row(p_user_id);

  -- active plan
  select bs.plan_code, bs.status
  into v_plan_code, v_plan_status
  from public.billing_subscriptions bs
  where bs.user_id = p_user_id
    and bs.subscription_kind = 'forge_plan'
    and bs.status in ('trialing', 'active', 'past_due')
  order by
    case bs.status
      when 'active' then 1
      when 'trialing' then 2
      when 'past_due' then 3
      else 99
    end,
    bs.updated_at desc
  limit 1;

  -- largest active storage pack
  select
    bs.storage_level,
    coalesce(max(bc.bytes_entitled), 0)
  into v_storage_level, v_storage_bytes
  from public.billing_subscriptions bs
  join public.billing_catalog bc
    on bc.stripe_price_id = bs.stripe_price_id
   and bc.stripe_env = bs.stripe_env
  where bs.user_id = p_user_id
    and bs.subscription_kind = 'storage_pack'
    and bs.status in ('trialing', 'active', 'past_due')
  group by bs.storage_level
  order by coalesce(max(bc.bytes_entitled), 0) desc
  limit 1;

  -- seat add-ons
  select coalesce(sum(bs.quantity), 0)
  into v_seat_addons
  from public.billing_subscriptions bs
  where bs.user_id = p_user_id
    and bs.subscription_kind = 'seat_addon'
    and bs.status in ('trialing', 'active', 'past_due');

  -- AI credits purchased
  select coalesce(sum(coalesce(bc.ai_credits, 0) * coalesce(otp.quantity, 1)), 0)
  into v_ai_credits
  from public.billing_one_time_purchases otp
  join public.billing_catalog bc
    on bc.stripe_price_id = otp.stripe_price_id
   and bc.stripe_env = otp.stripe_env
  where otp.user_id = p_user_id
    and otp.purchase_kind = 'ai_credits'
    and otp.status in ('paid', 'succeeded', 'complete');

  -- Founders Club flag:
  -- currently left as app-controlled/manual until your user-tier system is wired in.
  -- update this later from canonical membership/user tier tables.
  v_founders_club := false;
  v_has_founder_discount := false;

  update public.account_balances ab
     set active_plan_code = v_plan_code,
         active_plan_status = v_plan_status,
         active_storage_level = v_storage_level,
         storage_bytes_entitled = coalesce(v_storage_bytes, 0),
         seat_count_entitled = 1 + coalesce(v_seat_addons, 0),
         ai_credit_balance = coalesce(v_ai_credits, 0),
         founders_club = v_founders_club,
         has_founder_discount = v_has_founder_discount,
         updated_at = now()
   where ab.user_id = p_user_id;

  select *
  into v_result
  from public.account_balances
  where user_id = p_user_id;

  return v_result;
end;
$$;

ALTER FUNCTION "public"."recompute_account_balances"("p_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."record_billing_event"("p_user_id" "uuid" DEFAULT NULL::"uuid", "p_stripe_event_id" "text" DEFAULT NULL::"text", "p_stripe_env" "text" DEFAULT 'live'::"text", "p_event_type" "text" DEFAULT NULL::"text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb", "p_status" "text" DEFAULT 'received'::"text", "p_error_text" "text" DEFAULT NULL::"text", "p_processed_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "public"."billing_events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.billing_events;
begin
  if p_stripe_event_id is null then
    raise exception 'p_stripe_event_id is required';
  end if;

  if p_event_type is null then
    raise exception 'p_event_type is required';
  end if;

  insert into public.billing_events (
    user_id,
    stripe_event_id,
    stripe_env,
    event_type,
    payload,
    status,
    error_text,
    processed_at
  )
  values (
    p_user_id,
    p_stripe_event_id,
    coalesce(p_stripe_env, 'live'),
    p_event_type,
    coalesce(p_payload, '{}'::jsonb),
    coalesce(p_status, 'received'),
    p_error_text,
    p_processed_at
  )
  on conflict (stripe_event_id) do update
    set user_id = excluded.user_id,
        stripe_env = excluded.stripe_env,
        event_type = excluded.event_type,
        payload = excluded.payload,
        status = excluded.status,
        error_text = excluded.error_text,
        processed_at = excluded.processed_at
  returning * into v_row;

  return v_row;
end;
$$;

ALTER FUNCTION "public"."record_billing_event"("p_user_id" "uuid", "p_stripe_event_id" "text", "p_stripe_env" "text", "p_event_type" "text", "p_payload" "jsonb", "p_status" "text", "p_error_text" "text", "p_processed_at" timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."upsert_billing_customer"("p_user_id" "uuid", "p_stripe_customer_id" "text", "p_email" "text" DEFAULT NULL::"text") RETURNS "public"."billing_customers"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.billing_customers;
begin
  insert into public.billing_customers (
    user_id,
    stripe_customer_id,
    email
  )
  values (
    p_user_id,
    p_stripe_customer_id,
    p_email
  )
  on conflict (user_id) do update
    set stripe_customer_id = excluded.stripe_customer_id,
        email = coalesce(excluded.email, public.billing_customers.email),
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

ALTER FUNCTION "public"."upsert_billing_customer"("p_user_id" "uuid", "p_stripe_customer_id" "text", "p_email" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."upsert_billing_one_time_purchase"("p_user_id" "uuid", "p_stripe_customer_id" "text" DEFAULT NULL::"text", "p_stripe_checkout_session_id" "text" DEFAULT NULL::"text", "p_stripe_payment_intent_id" "text" DEFAULT NULL::"text", "p_stripe_product_id" "text" DEFAULT NULL::"text", "p_stripe_price_id" "text" DEFAULT NULL::"text", "p_stripe_env" "text" DEFAULT 'live'::"text", "p_status" "text" DEFAULT NULL::"text", "p_quantity" integer DEFAULT 1, "p_amount_paid_cents" integer DEFAULT NULL::integer, "p_currency" "text" DEFAULT 'usd'::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."billing_one_time_purchases"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_catalog public.billing_catalog;
  v_row public.billing_one_time_purchases;
begin
  if p_stripe_payment_intent_id is null then
    raise exception 'p_stripe_payment_intent_id is required';
  end if;

  if p_stripe_price_id is null then
    raise exception 'p_stripe_price_id is required';
  end if;

  if p_status is null then
    raise exception 'p_status is required';
  end if;

  select *
    into v_catalog
  from public.billing_catalog
  where stripe_price_id = p_stripe_price_id
    and stripe_env = p_stripe_env
    and kind = 'ai_credit_pack'
  limit 1;

  if v_catalog.id is null then
    raise exception 'No AI billing_catalog row found for stripe_price_id=% stripe_env=%',
      p_stripe_price_id, p_stripe_env;
  end if;

  insert into public.billing_one_time_purchases (
    user_id,
    stripe_customer_id,
    stripe_checkout_session_id,
    stripe_payment_intent_id,
    stripe_product_id,
    stripe_price_id,
    stripe_env,
    purchase_kind,
    pack_code,
    quantity,
    amount_paid_cents,
    currency,
    status,
    metadata
  )
  values (
    p_user_id,
    p_stripe_customer_id,
    p_stripe_checkout_session_id,
    p_stripe_payment_intent_id,
    coalesce(p_stripe_product_id, v_catalog.stripe_product_id),
    p_stripe_price_id,
    p_stripe_env,
    'ai_credits',
    v_catalog.forge_pack_id,
    coalesce(p_quantity, 1),
    p_amount_paid_cents,
    coalesce(p_currency, 'usd'),
    p_status,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (stripe_payment_intent_id) do update
    set user_id = excluded.user_id,
        stripe_customer_id = excluded.stripe_customer_id,
        stripe_checkout_session_id = excluded.stripe_checkout_session_id,
        stripe_product_id = excluded.stripe_product_id,
        stripe_price_id = excluded.stripe_price_id,
        stripe_env = excluded.stripe_env,
        purchase_kind = excluded.purchase_kind,
        pack_code = excluded.pack_code,
        quantity = excluded.quantity,
        amount_paid_cents = excluded.amount_paid_cents,
        currency = excluded.currency,
        status = excluded.status,
        metadata = excluded.metadata,
        updated_at = now()
  returning * into v_row;

  perform public.recompute_account_balances(p_user_id);

  return v_row;
end;
$$;

ALTER FUNCTION "public"."upsert_billing_one_time_purchase"("p_user_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_checkout_session_id" "text", "p_stripe_payment_intent_id" "text", "p_stripe_product_id" "text", "p_stripe_price_id" "text", "p_stripe_env" "text", "p_status" "text", "p_quantity" integer, "p_amount_paid_cents" integer, "p_currency" "text", "p_metadata" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."upsert_billing_subscription"("p_user_id" "uuid", "p_stripe_customer_id" "text" DEFAULT NULL::"text", "p_stripe_subscription_id" "text" DEFAULT NULL::"text", "p_stripe_subscription_item_id" "text" DEFAULT NULL::"text", "p_stripe_product_id" "text" DEFAULT NULL::"text", "p_stripe_price_id" "text" DEFAULT NULL::"text", "p_stripe_env" "text" DEFAULT 'live'::"text", "p_status" "text" DEFAULT NULL::"text", "p_current_period_start" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_current_period_end" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_cancel_at_period_end" boolean DEFAULT false, "p_canceled_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_trial_start" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_trial_end" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_quantity" integer DEFAULT 1, "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."billing_subscriptions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_catalog public.billing_catalog;
  v_row public.billing_subscriptions;
begin
  if p_stripe_subscription_id is null then
    raise exception 'p_stripe_subscription_id is required';
  end if;

  if p_stripe_price_id is null then
    raise exception 'p_stripe_price_id is required';
  end if;

  if p_status is null then
    raise exception 'p_status is required';
  end if;

  select *
    into v_catalog
  from public.billing_catalog
  where stripe_price_id = p_stripe_price_id
    and stripe_env = p_stripe_env
    and kind in ('forge_plan', 'storage_pack', 'seat_addon')
  limit 1;

  if v_catalog.id is null then
    raise exception 'No billing_catalog row found for stripe_price_id=% stripe_env=%',
      p_stripe_price_id, p_stripe_env;
  end if;

  insert into public.billing_subscriptions (
    user_id,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_subscription_item_id,
    stripe_product_id,
    stripe_price_id,
    stripe_env,
    subscription_kind,
    plan_code,
    storage_level,
    addon_code,
    interval_code,
    quantity,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    canceled_at,
    trial_start,
    trial_end,
    metadata
  )
  values (
    p_user_id,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_stripe_subscription_item_id,
    coalesce(p_stripe_product_id, v_catalog.stripe_product_id),
    p_stripe_price_id,
    p_stripe_env,
    v_catalog.kind,
    v_catalog.forge_plan_id,
    v_catalog.forge_storage_level,
    v_catalog.forge_addon,
    coalesce(v_catalog.forge_interval, 'monthly'),
    coalesce(p_quantity, 1),
    p_status,
    p_current_period_start,
    p_current_period_end,
    coalesce(p_cancel_at_period_end, false),
    p_canceled_at,
    p_trial_start,
    p_trial_end,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (stripe_subscription_id) do update
    set user_id = excluded.user_id,
        stripe_customer_id = excluded.stripe_customer_id,
        stripe_subscription_item_id = excluded.stripe_subscription_item_id,
        stripe_product_id = excluded.stripe_product_id,
        stripe_price_id = excluded.stripe_price_id,
        stripe_env = excluded.stripe_env,
        subscription_kind = excluded.subscription_kind,
        plan_code = excluded.plan_code,
        storage_level = excluded.storage_level,
        addon_code = excluded.addon_code,
        interval_code = excluded.interval_code,
        quantity = excluded.quantity,
        status = excluded.status,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        canceled_at = excluded.canceled_at,
        trial_start = excluded.trial_start,
        trial_end = excluded.trial_end,
        metadata = excluded.metadata,
        updated_at = now()
  returning * into v_row;

  perform public.recompute_account_balances(p_user_id);

  return v_row;
end;
$$;

ALTER FUNCTION "public"."upsert_billing_subscription"("p_user_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text", "p_stripe_subscription_item_id" "text", "p_stripe_product_id" "text", "p_stripe_price_id" "text", "p_stripe_env" "text", "p_status" "text", "p_current_period_start" timestamp with time zone, "p_current_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_canceled_at" timestamp with time zone, "p_trial_start" timestamp with time zone, "p_trial_end" timestamp with time zone, "p_quantity" integer, "p_metadata" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE TRIGGER "trg_billing_catalog_updated_at" BEFORE UPDATE ON "public"."billing_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_billing_customers_updated_at" BEFORE UPDATE ON "public"."billing_customers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_billing_one_time_purchases_updated_at" BEFORE UPDATE ON "public"."billing_one_time_purchases" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_billing_subscriptions_updated_at" BEFORE UPDATE ON "public"."billing_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

ALTER TABLE "public"."ai_credit_packs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_credit_packs_select_authenticated" ON "public"."ai_credit_packs" FOR SELECT TO "authenticated" USING (true);

ALTER TABLE "public"."ai_credit_topups" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_credit_topups_select_own" ON "public"."ai_credit_topups" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));

ALTER TABLE "public"."billing_catalog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_catalog_select_authenticated" ON "public"."billing_catalog" FOR SELECT TO "authenticated" USING (true);

ALTER TABLE "public"."billing_customers" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_customers_select_own" ON "public"."billing_customers" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));

ALTER TABLE "public"."billing_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_events_select_own" ON "public"."billing_events" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));

ALTER TABLE "public"."billing_one_time_purchases" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_one_time_purchases_select_own" ON "public"."billing_one_time_purchases" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));

ALTER TABLE "public"."billing_subscriptions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_subscriptions_select_own" ON "public"."billing_subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));

CREATE POLICY "block client writes" ON "public"."forge_memberships" TO "authenticated" USING (false) WITH CHECK (false);

ALTER TABLE "public"."forge_memberships" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forge_memberships_no_client_write" ON "public"."forge_memberships" TO "authenticated" USING (false) WITH CHECK (false);

CREATE POLICY "forge_memberships_select_own" ON "public"."forge_memberships" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));

CREATE POLICY "no client writes" ON "public"."forge_memberships" TO "authenticated" USING (false) WITH CHECK (false);

ALTER TABLE "public"."stripe_event_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stripe_event_log_service_role_all" ON "public"."stripe_event_log" TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "users can read their membership" ON "public"."forge_memberships" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));

CREATE POLICY "users read their membership" ON "public"."forge_memberships" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));

REVOKE ALL ON FUNCTION "public"."recompute_account_balances"("p_user_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."recompute_account_balances"("p_user_id" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."recompute_account_balances"("p_user_id" "uuid") FROM "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_account_balances"("p_user_id" "uuid") TO "service_role";

GRANT ALL ON TABLE "public"."billing_events" TO "anon";
GRANT ALL ON TABLE "public"."billing_events" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_events" TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_billing_event"("p_user_id" "uuid", "p_stripe_event_id" "text", "p_stripe_env" "text", "p_event_type" "text", "p_payload" "jsonb", "p_status" "text", "p_error_text" "text", "p_processed_at" timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."record_billing_event"("p_user_id" "uuid", "p_stripe_event_id" "text", "p_stripe_env" "text", "p_event_type" "text", "p_payload" "jsonb", "p_status" "text", "p_error_text" "text", "p_processed_at" timestamp with time zone) FROM "anon";
REVOKE ALL ON FUNCTION "public"."record_billing_event"("p_user_id" "uuid", "p_stripe_event_id" "text", "p_stripe_env" "text", "p_event_type" "text", "p_payload" "jsonb", "p_status" "text", "p_error_text" "text", "p_processed_at" timestamp with time zone) FROM "authenticated";
GRANT ALL ON FUNCTION "public"."record_billing_event"("p_user_id" "uuid", "p_stripe_event_id" "text", "p_stripe_env" "text", "p_event_type" "text", "p_payload" "jsonb", "p_status" "text", "p_error_text" "text", "p_processed_at" timestamp with time zone) TO "service_role";

GRANT ALL ON TABLE "public"."billing_customers" TO "anon";
GRANT ALL ON TABLE "public"."billing_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_customers" TO "service_role";

REVOKE ALL ON FUNCTION "public"."upsert_billing_customer"("p_user_id" "uuid", "p_stripe_customer_id" "text", "p_email" "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."upsert_billing_customer"("p_user_id" "uuid", "p_stripe_customer_id" "text", "p_email" "text") FROM "anon";
REVOKE ALL ON FUNCTION "public"."upsert_billing_customer"("p_user_id" "uuid", "p_stripe_customer_id" "text", "p_email" "text") FROM "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_billing_customer"("p_user_id" "uuid", "p_stripe_customer_id" "text", "p_email" "text") TO "service_role";

GRANT ALL ON TABLE "public"."billing_one_time_purchases" TO "anon";
GRANT ALL ON TABLE "public"."billing_one_time_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_one_time_purchases" TO "service_role";

REVOKE ALL ON FUNCTION "public"."upsert_billing_one_time_purchase"("p_user_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_checkout_session_id" "text", "p_stripe_payment_intent_id" "text", "p_stripe_product_id" "text", "p_stripe_price_id" "text", "p_stripe_env" "text", "p_status" "text", "p_quantity" integer, "p_amount_paid_cents" integer, "p_currency" "text", "p_metadata" "jsonb") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."upsert_billing_one_time_purchase"("p_user_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_checkout_session_id" "text", "p_stripe_payment_intent_id" "text", "p_stripe_product_id" "text", "p_stripe_price_id" "text", "p_stripe_env" "text", "p_status" "text", "p_quantity" integer, "p_amount_paid_cents" integer, "p_currency" "text", "p_metadata" "jsonb") FROM "anon";
REVOKE ALL ON FUNCTION "public"."upsert_billing_one_time_purchase"("p_user_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_checkout_session_id" "text", "p_stripe_payment_intent_id" "text", "p_stripe_product_id" "text", "p_stripe_price_id" "text", "p_stripe_env" "text", "p_status" "text", "p_quantity" integer, "p_amount_paid_cents" integer, "p_currency" "text", "p_metadata" "jsonb") FROM "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_billing_one_time_purchase"("p_user_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_checkout_session_id" "text", "p_stripe_payment_intent_id" "text", "p_stripe_product_id" "text", "p_stripe_price_id" "text", "p_stripe_env" "text", "p_status" "text", "p_quantity" integer, "p_amount_paid_cents" integer, "p_currency" "text", "p_metadata" "jsonb") TO "service_role";

GRANT ALL ON TABLE "public"."billing_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."billing_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_subscriptions" TO "service_role";

REVOKE ALL ON FUNCTION "public"."upsert_billing_subscription"("p_user_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text", "p_stripe_subscription_item_id" "text", "p_stripe_product_id" "text", "p_stripe_price_id" "text", "p_stripe_env" "text", "p_status" "text", "p_current_period_start" timestamp with time zone, "p_current_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_canceled_at" timestamp with time zone, "p_trial_start" timestamp with time zone, "p_trial_end" timestamp with time zone, "p_quantity" integer, "p_metadata" "jsonb") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."upsert_billing_subscription"("p_user_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text", "p_stripe_subscription_item_id" "text", "p_stripe_product_id" "text", "p_stripe_price_id" "text", "p_stripe_env" "text", "p_status" "text", "p_current_period_start" timestamp with time zone, "p_current_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_canceled_at" timestamp with time zone, "p_trial_start" timestamp with time zone, "p_trial_end" timestamp with time zone, "p_quantity" integer, "p_metadata" "jsonb") FROM "anon";
REVOKE ALL ON FUNCTION "public"."upsert_billing_subscription"("p_user_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text", "p_stripe_subscription_item_id" "text", "p_stripe_product_id" "text", "p_stripe_price_id" "text", "p_stripe_env" "text", "p_status" "text", "p_current_period_start" timestamp with time zone, "p_current_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_canceled_at" timestamp with time zone, "p_trial_start" timestamp with time zone, "p_trial_end" timestamp with time zone, "p_quantity" integer, "p_metadata" "jsonb") FROM "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_billing_subscription"("p_user_id" "uuid", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text", "p_stripe_subscription_item_id" "text", "p_stripe_product_id" "text", "p_stripe_price_id" "text", "p_stripe_env" "text", "p_status" "text", "p_current_period_start" timestamp with time zone, "p_current_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_canceled_at" timestamp with time zone, "p_trial_start" timestamp with time zone, "p_trial_end" timestamp with time zone, "p_quantity" integer, "p_metadata" "jsonb") TO "service_role";

REVOKE ALL ON TABLE "public"."ai_credit_packs" FROM "anon";
GRANT ALL ON TABLE "public"."ai_credit_packs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_credit_packs" TO "service_role";

GRANT ALL ON TABLE "public"."ai_credit_topups" TO "anon";
GRANT ALL ON TABLE "public"."ai_credit_topups" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_credit_topups" TO "service_role";

GRANT ALL ON SEQUENCE "public"."ai_credit_topups_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ai_credit_topups_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ai_credit_topups_id_seq" TO "service_role";

REVOKE ALL ON TABLE "public"."billing_catalog" FROM "anon";
GRANT ALL ON TABLE "public"."billing_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_catalog" TO "service_role";

GRANT ALL ON TABLE "public"."forge_memberships" TO "anon";
GRANT ALL ON TABLE "public"."forge_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."forge_memberships" TO "service_role";

REVOKE ALL ON TABLE "public"."stripe_event_log" FROM "anon";
REVOKE ALL ON TABLE "public"."stripe_event_log" FROM "authenticated";
GRANT ALL ON TABLE "public"."stripe_event_log" TO "service_role";
$ddl$;
    raise notice 'Slice A created missing legacy financial contract';
  end if;
end
$create$;

do $validate$
declare
  item record;
  actual text;
  relation_oid regclass;
  function_oid regprocedure;
  parts text[];
begin
  for item in select * from (values
      ('ai_credit_packs', '8284eb97d7a6f41aa512280d0ce7acbb'),
      ('ai_credit_topups', '887bdb3a662b74216774e693a02af5e4'),
      ('ai_credit_topups_id_seq', '43014a59d2bea1810a8c4742e83cfa23'),
      ('billing_catalog', '57eaa8b91a4dc2229679c62f9bcc0956'),
      ('billing_customers', '1fcd2415a5ab00ea8971be746270b42b'),
      ('billing_events', '51e63f70e893210bbd86568a0f3c977a'),
      ('billing_one_time_purchases', '16407f7f61f96670771fea63747f324a'),
      ('billing_subscriptions', '11d86218c9196fb5c856613ae4b20320'),
      ('forge_memberships', 'a06907ff863925b666d5746cbe284739'),
      ('stripe_event_log', 'c3547bf5403a03e1b8915d356ab28824')
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
      ('public.recompute_account_balances(uuid)', '18bacbe6951f35196eb8fdbf34db33b2'),
      ('public.record_billing_event(uuid,text,text,text,jsonb,text,text,timestamptz)', '9611a1e4a64119d78b7e1c3ca4717178'),
      ('public.upsert_billing_customer(uuid,text,text)', 'e797673391c7e5df89c4479d4f0798c2'),
      ('public.upsert_billing_one_time_purchase(uuid,text,text,text,text,text,text,text,integer,integer,text,jsonb)', '95afe8c991761f7fe045b4308ddd7a89'),
      ('public.upsert_billing_subscription(uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,timestamptz,timestamptz,integer,jsonb)', '9f948c0ef12d59b0adff5b6774c6e985')
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
      ('public.billing_catalog.trg_billing_catalog_updated_at', 'e29156de837ca53fd776307bb97d0e3a'),
      ('public.billing_customers.trg_billing_customers_updated_at', '48189ef17f1b44b86aa1607ad9fb72ad'),
      ('public.billing_one_time_purchases.trg_billing_one_time_purchases_updated_at', '68a3d1c45c7734f01d40394a8a61db7f'),
      ('public.billing_subscriptions.trg_billing_subscriptions_updated_at', '37c3020146f676131f7690172262adaa')
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
