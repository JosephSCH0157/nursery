-- Preserve unpublished no-markup revisions while reporting rounded customer prices.

begin;

create or replace function tongs.read_owner_billing_console(p_limit integer default 250)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_result jsonb;
  v_pricing jsonb;
begin
  v_result:=tongs._read_owner_billing_console_before_rounded_customer_ceiling(p_limit);
  select coalesce(jsonb_agg(
    price.item || case
      when revision.markup_basis_points is null then '{}'::jsonb
      else jsonb_build_object(
        'unrounded_cost_plus_markup_micros',revision.customer_price_ceiling_micros,
        'customer_price_ceiling_micros',rounded.customer_price_micros,
        'expected_contribution_profit_micros',rounded.customer_price_micros-revision.full_cost_ceiling_micros,
        'expected_contribution_margin_percentage',case when rounded.customer_price_micros=0 then null
          else round(100::numeric*(rounded.customer_price_micros-revision.full_cost_ceiling_micros)::numeric
            /rounded.customer_price_micros::numeric,4) end
      )
    end order by price.ordinality
  ),'[]'::jsonb) into v_pricing
  from jsonb_array_elements(coalesce(v_result->'pricing_revisions','[]'::jsonb))
    with ordinality as price(item,ordinality)
  join tongs.private_pricing_revisions revision
    on revision.id=(price.item->>'pricing_revision_id')::uuid
  left join lateral (
    select tongs.round_customer_price_micros(
      revision.full_cost_ceiling_micros::numeric*(10000::numeric+revision.markup_basis_points)/10000::numeric,
      revision.currency
    ) as customer_price_micros
    where revision.markup_basis_points is not null
  ) rounded on true;
  return jsonb_set(v_result,'{pricing_revisions}',v_pricing,true);
end $$;

revoke all on function tongs.read_owner_billing_console(integer) from public,anon;
grant execute on function tongs.read_owner_billing_console(integer) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
