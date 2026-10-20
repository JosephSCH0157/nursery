\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.slice_a_relation_fingerprint(p_relation regclass)
returns text language sql stable as $$
  select md5(jsonb_build_object(
    'relkind', c.relkind,
    'owner', pg_get_userbyid(c.relowner),
    'rls', c.relrowsecurity,
    'force_rls', c.relforcerowsecurity,
    'options', coalesce(to_jsonb(c.reloptions), '[]'::jsonb),
    'columns', coalesce((select jsonb_agg(jsonb_build_object(
      'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
      'notnull', a.attnotnull, 'default', pg_get_expr(d.adbin, d.adrelid),
      'identity', a.attidentity, 'generated', a.attgenerated) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped), '[]'::jsonb),
    'constraints', coalesce((select jsonb_agg(jsonb_build_object(
      'name', con.conname, 'type', con.contype,
      'definition', pg_get_constraintdef(con.oid, true)) order by con.conname)
      from pg_constraint con where con.conrelid=c.oid), '[]'::jsonb),
    'indexes', coalesce((select jsonb_agg(pg_get_indexdef(i.indexrelid) order by ci.relname)
      from pg_index i join pg_class ci on ci.oid=i.indexrelid where i.indrelid=c.oid), '[]'::jsonb),
    'policies', coalesce((select jsonb_agg(jsonb_build_object(
      'name', p.polname, 'permissive', p.polpermissive, 'cmd', p.polcmd,
      'roles', (select jsonb_agg(pg_get_userbyid(x) order by pg_get_userbyid(x)) from unnest(p.polroles) x),
      'qual', pg_get_expr(p.polqual,p.polrelid), 'check', pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname)
      from pg_policy p where p.polrelid=c.oid), '[]'::jsonb),
    'acl', coalesce((select jsonb_agg(jsonb_build_object(
      'grantee', case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
      'grantor', pg_get_userbyid(a.grantor), 'privilege', a.privilege_type,
      'grantable', a.is_grantable) order by case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end, a.privilege_type)
      from aclexplode(coalesce(c.relacl, acldefault(case when c.relkind='S' then 's'::"char" else 'r'::"char" end,c.relowner))) a), '[]'::jsonb),
    'viewdef', case when c.relkind in ('v','m') then pg_get_viewdef(c.oid,true) end,
    'sequence', case when c.relkind='S' then (select to_jsonb(s)-'seqrelid' from pg_sequence s where s.seqrelid=c.oid) end
  )::text)
  from pg_class c where c.oid=p_relation;
$$;

create or replace function pg_temp.slice_a_function_fingerprint(p_function regprocedure)
returns text language sql stable as $$
  select md5(jsonb_build_object(
    'definition', replace(pg_get_functiondef(p.oid), E'\r\n', E'\n'),
    'owner', pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
    'config', coalesce(to_jsonb(p.proconfig),'[]'::jsonb),
    'volatility', p.provolatile, 'parallel', p.proparallel,
    'strict', p.proisstrict, 'leakproof', p.proleakproof,
    'acl', coalesce((select jsonb_agg(jsonb_build_object(
      'grantee', case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
      'grantor', pg_get_userbyid(a.grantor), 'privilege', a.privilege_type,
      'grantable', a.is_grantable) order by case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end, a.privilege_type)
      from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a), '[]'::jsonb)
  )::text) from pg_proc p where p.oid=p_function;
$$;

create or replace function pg_temp.slice_a_trigger_fingerprint(p_schema text,p_table text,p_trigger text)
returns text language sql stable as $$
  select md5(jsonb_build_object('definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled)::text)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and n.nspname=p_schema and c.relname=p_table and t.tgname=p_trigger;
$$;

do $$
declare
  item record;
  actual text;
  parts text[];
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r') <> 18 then
    raise exception 'Slice A public table count differs from production';
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='v') <> 2 then
    raise exception 'Slice A public view count differs from production';
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='S') <> 2 then
    raise exception 'Slice A public sequence count differs from production';
  end if;

  for item in select * from (values
    ('account_balances','66c9cd33b8b2ce68f7a1eee37a4eba7e'),
    ('account_identities','84688674f914621cee056e9257c4b5ae'),
    ('account_overview_v','27791be7c1613ce4d7cf07b0ca108d70'),
    ('ai_credit_packs','8284eb97d7a6f41aa512280d0ce7acbb'),
    ('ai_credit_topups','887bdb3a662b74216774e693a02af5e4'),
    ('ai_credit_topups_id_seq','43014a59d2bea1810a8c4742e83cfa23'),
    ('billing_catalog','57eaa8b91a4dc2229679c62f9bcc0956'),
    ('billing_customers','1fcd2415a5ab00ea8971be746270b42b'),
    ('billing_events','51e63f70e893210bbd86568a0f3c977a'),
    ('billing_one_time_purchases','16407f7f61f96670771fea63747f324a'),
    ('billing_subscriptions','11d86218c9196fb5c856613ae4b20320'),
    ('display_pair_sessions','d0eb3a02b086a6d663a5635d00228ac4'),
    ('forge_memberships','a06907ff863925b666d5746cbe284739'),
    ('plans','8b6c9e061604a42449317827873cf5eb'),
    ('profiles','da96c81b5e4a71436ce621f2116e3a52'),
    ('profiles_id_seq','43014a59d2bea1810a8c4742e83cfa23'),
    ('stripe_event_log','c3547bf5403a03e1b8915d356ab28824'),
    ('tp_profiles','d548806d7b147d18aab0898ade6478e8'),
    ('user_plans','63651f0af431732a2b64ffe8e3d73585'),
    ('workpiece_events','31df6f10b7a21346abd0617d3c79a34d'),
    ('workpiece_files','819fd4ef47cfc5b04debb20d99155f58'),
    ('workspaces','d1b8b644315a46726eccf24e7927bd41')
  ) expected(name,fingerprint) loop
    actual := pg_temp.slice_a_relation_fingerprint(to_regclass(format('public.%I',item.name)));
    if actual is distinct from item.fingerprint then
      raise exception 'Slice A relation fingerprint mismatch for public.%: expected %, got %',item.name,item.fingerprint,actual;
    end if;
  end loop;

  for item in select * from (values
    ('public.auto_assign_trial_plan()','af69f9917bf39a065ec3ed0d39c35075'),
    ('public.ensure_account_balance_row(uuid)','a1b7685613975f0e17bb0a6c1313ace7'),
    ('public.ensure_profile_for_user(uuid,text)','be578dcff8c6243653889379c943bc1b'),
    ('public.get_my_plan()','9b87adb316bc53ce4fa8e24fd65a5f1b'),
    ('public.handle_new_user()','654de3745cc64b79795168d6800a0c3c'),
    ('public.handle_new_user_account_bootstrap()','545f11983d2f9155bd0e0cf6d1b0e3c0'),
    ('public.handle_new_user_default_plan()','cc56457c0f1f4556841f759a60a4a575'),
    ('public.recompute_account_balances(uuid)','18bacbe6951f35196eb8fdbf34db33b2'),
    ('public.record_billing_event(uuid,text,text,text,jsonb,text,text,timestamptz)','9611a1e4a64119d78b7e1c3ca4717178'),
    ('public.rls_auto_enable()','77d04866e30b218b27f20e5c35e33590'),
    ('public.set_updated_at()','47736f7b59af52b151c15ffc24de64a9'),
    ('public.start_trial_on_first_login()','fb9460227aced932951ecd56d5e1dcba'),
    ('public.upsert_billing_customer(uuid,text,text)','e797673391c7e5df89c4479d4f0798c2'),
    ('public.upsert_billing_one_time_purchase(uuid,text,text,text,text,text,text,text,integer,integer,text,jsonb)','95afe8c991761f7fe045b4308ddd7a89'),
    ('public.upsert_billing_subscription(uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,timestamptz,timestamptz,integer,jsonb)','9f948c0ef12d59b0adff5b6774c6e985')
  ) expected(signature,fingerprint) loop
    actual := pg_temp.slice_a_function_fingerprint(to_regprocedure(item.signature));
    if actual is distinct from item.fingerprint then
      raise exception 'Slice A function fingerprint mismatch for %: expected %, got %',item.signature,item.fingerprint,actual;
    end if;
  end loop;

  for item in select * from (values
    ('auth.users.on_auth_user_created','49d88f3262e258aeff37d46420393a3b'),
    ('public.account_balances.trg_account_balances_updated_at','04d13135df53a3000f7ac787fb408d4c'),
    ('public.billing_catalog.trg_billing_catalog_updated_at','e29156de837ca53fd776307bb97d0e3a'),
    ('public.billing_customers.trg_billing_customers_updated_at','48189ef17f1b44b86aa1607ad9fb72ad'),
    ('public.billing_one_time_purchases.trg_billing_one_time_purchases_updated_at','68a3d1c45c7734f01d40394a8a61db7f'),
    ('public.billing_subscriptions.trg_billing_subscriptions_updated_at','37c3020146f676131f7690172262adaa'),
    ('public.tp_profiles.trg_tp_profiles_updated_at','fa8bd5af83f97bd68a30cbcdb32dc813')
  ) expected(identity,fingerprint) loop
    parts := string_to_array(item.identity,'.');
    actual := pg_temp.slice_a_trigger_fingerprint(parts[1],parts[2],parts[3]);
    if actual is distinct from item.fingerprint then
      raise exception 'Slice A trigger fingerprint mismatch for %: expected %, got %',item.identity,item.fingerprint,actual;
    end if;
  end loop;

  select md5(jsonb_build_object('event',e.evtevent,'owner',pg_get_userbyid(e.evtowner),
    'function',e.evtfoid::regprocedure::text,'enabled',e.evtenabled,'tags',e.evttags)::text)
  into actual from pg_event_trigger e where e.evtname='ensure_rls';
  if actual is distinct from 'fe1377ad0217836c084f25bbb2331a3a' then
    raise exception 'Slice A event trigger fingerprint mismatch: expected %, got %','fe1377ad0217836c084f25bbb2331a3a',actual;
  end if;

  if pg_get_serial_sequence('public.profiles','id') <> 'public.profiles_id_seq' then
    raise exception 'profiles identity sequence ownership differs from production';
  end if;
  if pg_get_serial_sequence('public.ai_credit_topups','id') <> 'public.ai_credit_topups_id_seq' then
    raise exception 'ai_credit_topups identity sequence ownership differs from production';
  end if;
end
$$;

rollback;

select 'FORGE_PUBLIC_SLICE_A_CATALOG_PARITY_PASSED' as result;
