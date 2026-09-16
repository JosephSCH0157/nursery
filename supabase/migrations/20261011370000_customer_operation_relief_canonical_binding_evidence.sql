-- Funding reservations carry the quote-qualified billing operation identity,
-- while canonical OpenAI results carry the provider binding operation identity.
-- Prove their relationship through the immutable funding binding instead of
-- incorrectly requiring the two intentionally different strings to be equal.
begin;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef(
    'tongs.correct_customer_operation_relief(uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint,text,text,text,uuid,jsonb)'::regprocedure
  ) into definition;
  changed:=replace(
    definition,
    $old$  if not found or v_result.reservation_id<>v_reservation.id
     or v_result.operation_id<>v_reservation.operation_id
     or v_result.user_id<>v_reservation.user_id then$old$,
    $new$  if not found or v_result.reservation_id<>v_reservation.id
     or v_result.user_id<>v_reservation.user_id
     or not exists (
       select 1 from tongs.openai_text_funding_bindings binding
       where binding.reservation_id=v_reservation.id
         and binding.operation_id=v_result.operation_id
         and binding.route_code=v_result.route_code
         and binding.credential_funding='forge'
     ) then$new$
  );
  if changed=definition or position('binding.operation_id=v_result.operation_id' in changed)=0 then
    raise exception 'relief correction evidence predicate changed upstream; explicit review required';
  end if;
  execute changed;
end $$;

comment on function tongs.correct_customer_operation_relief(
  uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint,text,text,text,uuid,jsonb
) is 'Operator-authorized, idempotent correction of a linked purchased-credit relief with canonical result evidence joined through its immutable Forge funding binding.';

notify pgrst,'reload schema';
commit;
