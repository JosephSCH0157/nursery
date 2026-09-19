-- The internal service quote resolver needs the canonical Forge Credit count
-- already stored on the quote. Customer-facing serializers remain separately
-- constrained to the credit-only DTO.
begin;

do $$
declare
  definition text;
  changed text;
begin
  select pg_get_functiondef(
    'tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz)'::regprocedure
  ) into definition;
  changed := replace(
    definition,
    $old$'request_fingerprint',v_quote.request_fingerprint,'currency',v_quote.currency,'maximum_customer_charge_micros',$old$,
    $new$'request_fingerprint',v_quote.request_fingerprint,'currency',v_quote.currency,
  'customer_credit_units',v_quote.customer_credit_units,'maximum_customer_charge_micros',$new$
  );
  if changed = definition or position($needle$'customer_credit_units',v_quote.customer_credit_units$needle$ in changed) = 0 then
    raise exception 'customer OpenAI quote return shape changed upstream; explicit review required';
  end if;
  execute changed;
end $$;

notify pgrst, 'reload schema';
commit;

