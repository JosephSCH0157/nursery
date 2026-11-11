-- Positive cash receipts remain immutable and unchanged. A paid service period
-- is separate authority; network refreshes are fenced before provider access.
begin;
create table tongs.subscription_refresh_fences (
 stripe_mode text not null check(stripe_mode in ('test','live')),
 subscription_id text not null, generation bigint not null check(generation>0),
 token uuid not null unique, event_id text not null,
 terminal_canceled boolean not null default false,
 primary key(stripe_mode,subscription_id)
);
create table tongs.subscription_refresh_commits (
 token uuid primary key, stripe_mode text not null, subscription_id text not null,
 generation bigint not null, event_id text not null, snapshot jsonb not null,
 service_period jsonb, committed_at timestamptz not null default clock_timestamp()
);
create table tongs.subscription_service_periods (
 stripe_mode text not null check(stripe_mode in ('test','live')), invoice_id text not null,
 user_id uuid not null references auth.users(id), subscription_id text not null,
 purchase_type text not null check(purchase_type in ('subscription','cloud_storage')),
 item_id text not null, period_start timestamptz not null, period_end timestamptz not null,
 evidence jsonb not null, source_refresh_token uuid not null references tongs.subscription_refresh_commits(token),
 check(period_end>period_start), primary key(stripe_mode,invoice_id)
);
alter table tongs.subscription_refresh_fences owner to postgres;
alter table tongs.subscription_refresh_commits owner to postgres;
alter table tongs.subscription_service_periods owner to postgres;
alter table tongs.subscription_refresh_fences enable row level security;
alter table tongs.subscription_refresh_commits enable row level security;
alter table tongs.subscription_service_periods enable row level security;
revoke all on tongs.subscription_refresh_fences,tongs.subscription_refresh_commits,tongs.subscription_service_periods from public,anon,authenticated,service_role;

create function tongs._immutable_subscription_evidence() returns trigger
language plpgsql set search_path=pg_catalog as $$begin
 raise exception 'subscription evidence is immutable' using errcode='42501';
end$$;
create trigger immutable_subscription_refresh_commits before update or delete on tongs.subscription_refresh_commits
 for each row execute function tongs._immutable_subscription_evidence();
create trigger immutable_subscription_service_periods before update or delete on tongs.subscription_service_periods
 for each row execute function tongs._immutable_subscription_evidence();

create function tongs.begin_subscription_refresh(p_subscription_id text,p_livemode boolean,p_event_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_mode text:=case when p_livemode then 'live' else 'test' end; v_row tongs.subscription_refresh_fences;
begin
 perform tongs._require_accounting_service_role();
 if p_livemode is null or nullif(trim(p_subscription_id),'') is null or nullif(trim(p_event_id),'') is null
   or v_mode is distinct from tongs._current_financial_environment() then raise exception 'invalid subscription refresh identity/mode' using errcode='22023'; end if;
 if exists(select 1 from tongs.subscription_refresh_fences where subscription_id=p_subscription_id and stripe_mode<>v_mode)
 then raise exception 'subscription mode conflict' using errcode='23514'; end if;
 insert into tongs.subscription_refresh_fences(stripe_mode,subscription_id,generation,token,event_id)
 values(v_mode,p_subscription_id,1,gen_random_uuid(),p_event_id)
 on conflict(stripe_mode,subscription_id) do update set generation=tongs.subscription_refresh_fences.generation+1,token=gen_random_uuid(),event_id=excluded.event_id
 returning * into v_row;
 return jsonb_build_object('token',v_row.token,'generation',v_row.generation);
end$$;

create function tongs._guard_subscription_refresh() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare v_subject text:=current_setting('forge.subscription_refresh_subject',true);
 v_token text:=current_setting('forge.subscription_refresh_token',true); v_user text:=current_setting('forge.subscription_refresh_user',true);
begin
 if not exists(select 1 from tongs.subscription_refresh_fences where subscription_id=new.stripe_subscription_id) then return new; end if;
 if not exists(select 1 from tongs.subscription_refresh_fences where subscription_id=v_subject and token::text=v_token
   and stripe_mode=tongs._current_financial_environment()) then
   raise exception 'fenced subscription requires authoritative refresh' using errcode='42501';
 end if;
 if new.stripe_subscription_id<>v_subject and not(tg_op='UPDATE' and new.purchase_type='subscription' and old.purchase_type='subscription'
    and new.status='replaced' and new.user_id=old.user_id and new.user_id::text=v_user) then
   raise exception 'subscription refresh scope mismatch' using errcode='42501';
 end if;
 return new;
end$$;
create trigger billing_subscription_refresh_guard before insert or update on tongs.billing_subscriptions
 for each row execute function tongs._guard_subscription_refresh();

create function tongs.commit_subscription_refresh(p_subscription_id text,p_livemode boolean,p_token uuid,p_snapshot jsonb,p_service_period jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_mode text:=case when p_livemode then 'live' else 'test' end;
 v_fence tongs.subscription_refresh_fences; v_previous tongs.billing_subscriptions;
 v_commit tongs.subscription_refresh_commits; v_period tongs.subscription_service_periods;
 v_user uuid:=(p_snapshot->>'user_id')::uuid; v_start timestamptz:=(p_snapshot->>'period_start')::timestamptz;
 v_end timestamptz:=(p_snapshot->>'period_end')::timestamptz;
begin
 perform tongs._require_accounting_service_role();
 if p_livemode is null or v_mode is distinct from tongs._current_financial_environment()
 or v_user is null or p_snapshot->>'id' is distinct from p_subscription_id
 or coalesce(p_snapshot->>'customer_id','')='' or coalesce(p_snapshot->>'price_id','')=''
 or coalesce(p_snapshot->>'status','') not in ('active','past_due','unpaid','canceled','trialing','paused','incomplete','incomplete_expired')
 or coalesce(p_snapshot->>'purchase_type','') not in ('subscription','cloud_storage')
 then raise exception 'invalid refreshed subscription' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('subscription-refresh-user:'||v_user::text,0));
 select * into v_fence from tongs.subscription_refresh_fences where stripe_mode=v_mode and subscription_id=p_subscription_id for update;
 if not found or v_fence.token is distinct from p_token then return jsonb_build_object('outcome','superseded'); end if;
 select * into v_commit from tongs.subscription_refresh_commits where token=p_token;
 if found then
   if v_commit.snapshot is distinct from p_snapshot or v_commit.service_period is distinct from p_service_period then
     raise exception 'subscription refresh replay conflict' using errcode='23505'; end if;
   return jsonb_build_object('outcome','committed','replay',true);
 end if;
 if v_fence.terminal_canceled and p_snapshot->>'status'<>'canceled' then
   raise exception 'authoritative cancellation is terminal' using errcode='23514'; end if;
 select * into v_previous from tongs.billing_subscriptions where stripe_subscription_id=p_subscription_id;
 if found and (v_previous.user_id<>v_user or v_previous.stripe_customer_id<>p_snapshot->>'customer_id'
   or v_previous.purchase_type<>p_snapshot->>'purchase_type') then raise exception 'subscription ownership/type changed' using errcode='23514'; end if;
 if p_service_period is not null then
   if p_snapshot->>'status'<>'active' or p_service_period->>'status' is distinct from 'paid'
     or p_service_period->>'subscription_id' is distinct from p_subscription_id
     or p_service_period->>'customer_id' is distinct from p_snapshot->>'customer_id'
     or p_service_period->>'stripe_mode' is distinct from v_mode
     or p_service_period->>'item_id' is distinct from p_snapshot->>'item_id'
     or p_service_period->>'price_id' is distinct from p_snapshot->>'price_id'
     or coalesce(p_service_period->>'invoice_id','')=''
     or coalesce(p_service_period->>'billing_reason','') not in ('subscription_create','subscription_cycle','subscription_update')
     or (p_service_period->>'amount_remaining')::bigint is distinct from 0::bigint
     or coalesce((p_service_period->>'amount_paid')::bigint,-1)<0
     or coalesce((p_service_period->>'price_amount')::bigint,0)<=0
     or (p_service_period->>'quantity')::integer is distinct from 1
     or v_start is null or v_end is null
     or (p_service_period->>'period_start')::timestamptz is null or (p_service_period->>'period_end')::timestamptz is null
     or (p_service_period->>'period_start')::timestamptz<v_start or (p_service_period->>'period_end')::timestamptz>v_end
     or (p_service_period->>'period_end')::timestamptz <= (p_service_period->>'period_start')::timestamptz
     or coalesce((p_service_period->>'trial_overlap')::boolean,true)
   then raise exception 'invalid paid subscription service period' using errcode='23514'; end if;
   select * into v_period from tongs.subscription_service_periods where stripe_mode=v_mode and invoice_id=p_service_period->>'invoice_id';
   if found and (v_period.user_id<>v_user or v_period.evidence is distinct from p_service_period) then
     raise exception 'paid service period replay conflict' using errcode='23505'; end if;
 end if;
 perform set_config('forge.subscription_refresh_subject',p_subscription_id,true);
 perform set_config('forge.subscription_refresh_token',p_token::text,true);
 perform set_config('forge.subscription_refresh_user',v_user::text,true);
 perform tongs.upsert_billing_subscription(v_user,p_snapshot->>'customer_id',p_subscription_id,p_snapshot->>'purchase_type',
   p_snapshot->>'item_id',p_snapshot->>'interval',p_snapshot->>'status',p_snapshot->>'price_id',v_start,v_end,
   coalesce((p_snapshot->>'cancel_at_period_end')::boolean,false),(p_snapshot->>'canceled_at')::timestamptz,coalesce(p_snapshot->'metadata','{}'::jsonb));
 perform set_config('forge.subscription_refresh_token','',true);
 insert into tongs.subscription_refresh_commits values(p_token,v_mode,p_subscription_id,v_fence.generation,v_fence.event_id,p_snapshot,p_service_period,clock_timestamp());
 if p_service_period is not null then
   insert into tongs.subscription_service_periods values(v_mode,p_service_period->>'invoice_id',v_user,p_subscription_id,
     p_snapshot->>'purchase_type',p_snapshot->>'item_id',(p_service_period->>'period_start')::timestamptz,
     (p_service_period->>'period_end')::timestamptz,p_service_period,p_token) on conflict do nothing;
 end if;
 if p_snapshot->>'status'='canceled' then update tongs.subscription_refresh_fences set terminal_canceled=true where stripe_mode=v_mode and subscription_id=p_subscription_id; end if;
 return jsonb_build_object('outcome','committed','replay',false);
end$$;

alter function tongs._immutable_subscription_evidence() owner to postgres;
alter function tongs._guard_subscription_refresh() owner to postgres;
alter function tongs.begin_subscription_refresh(text,boolean,text) owner to postgres;
alter function tongs.commit_subscription_refresh(text,boolean,uuid,jsonb,jsonb) owner to postgres;
revoke all on function tongs._immutable_subscription_evidence(),tongs._guard_subscription_refresh(),tongs.begin_subscription_refresh(text,boolean,text),tongs.commit_subscription_refresh(text,boolean,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function tongs.begin_subscription_refresh(text,boolean,text),tongs.commit_subscription_refresh(text,boolean,uuid,jsonb,jsonb) to service_role;

create or replace function tongs._storage_capacity_entitlement(p_owner uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  with periods as (
    select user_id,stripe_subscription_id,stripe_mode,purchase_type,plan_item_id,period_start,period_end from tongs.subscription_cycle_receipts
    union all
    select user_id,subscription_id,stripe_mode,purchase_type,item_id,period_start,period_end from tongs.subscription_service_periods
  ), eligible as (
    select s.*,
      coalesce((select max(tongs.billing_storage_entitled_bytes(r.plan_item_id))
        from periods r
        where r.user_id=s.user_id and r.stripe_subscription_id=s.stripe_subscription_id
          and r.stripe_mode=tongs._current_financial_environment()
          and r.purchase_type='cloud_storage' and r.period_start<=now() and r.period_end>now()),0) paid_pack_bytes,
      exists(select 1 from periods r
        where r.user_id=s.user_id and r.stripe_subscription_id=s.stripe_subscription_id
          and r.stripe_mode=tongs._current_financial_environment()
          and r.purchase_type='subscription' and tongs.billing_item_is_plan(r.plan_item_id)
          and r.period_start<=now() and r.period_end>now()) paid_membership
    from tongs.billing_subscriptions s where s.user_id=p_owner
      and s.status in ('active','past_due','unpaid')
      and s.current_period_end>now()
  ), totals as (
    select case when coalesce(bool_or(purchase_type='subscription' and tongs.billing_item_is_plan(item_id) and paid_membership),false)
      then 5368709120::bigint else 0::bigint end base_bytes,
      coalesce(sum(case when purchase_type='cloud_storage'
        then least(tongs.billing_storage_entitled_bytes(item_id),paid_pack_bytes) else 0 end),0)::bigint addon_bytes
    from eligible
  ) select jsonb_build_object('term','forge.storage-capacity.v1','base_bytes',base_bytes,
    'addon_bytes',addon_bytes,'total_bytes',base_bytes+addon_bytes,
    'financial_environment',tongs._current_financial_environment()) from totals
$$;
commit;
