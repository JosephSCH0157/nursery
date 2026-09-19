-- Historical simulator backfills retained cumulative processor-fee allocations
-- as immutable evidence. Clamp new allocations to the unallocated portion of
-- the current cumulative pro-rata target so those legacy rows cannot produce a
-- negative allocation while the ledger catches up.
begin;

do $$
declare
  definition text;
  changed text;
begin
  select pg_get_functiondef(
    'tongs.consume_customer_deposit(uuid,uuid,text,text,bigint,bigint,timestamptz,jsonb)'::regprocedure
  ) into definition;
  changed := replace(
    definition,
    'v_fee_allocation:=(v_fee*(v_consumed_micros+p_revenue_micros)/v_deposit.gross_amount_micros)-v_prior_fee_allocated;',
    'v_fee_allocation:=greatest((v_fee*(v_consumed_micros+p_revenue_micros)/v_deposit.gross_amount_micros)-least(v_prior_fee_allocated,(v_fee*(v_consumed_micros+p_revenue_micros)/v_deposit.gross_amount_micros)),0);'
  );
  if changed = definition then
    raise exception 'deposit fee-allocation formula changed upstream; explicit review required';
  end if;
  execute changed;
end $$;

notify pgrst, 'reload schema';
commit;

