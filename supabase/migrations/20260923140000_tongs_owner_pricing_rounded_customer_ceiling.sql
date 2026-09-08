-- Keep owner pricing previews and reports aligned with the authoritative quote rounding rule.
-- Customer quote terms are unchanged; this corrects owner-only reporting of those terms.

begin;

alter function tongs.preview_private_price(uuid)
  rename to _preview_private_price_before_rounded_customer_ceiling;

create or replace function tongs.preview_private_price(p_pricing_revision_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_result jsonb;
  v_revision tongs.private_pricing_revisions%rowtype;
  v_rounded bigint;
  v_profit bigint;
begin
  v_result:=tongs._preview_private_price_before_rounded_customer_ceiling(p_pricing_revision_id);
  select * into v_revision from tongs.private_pricing_revisions where id=p_pricing_revision_id;
  if v_revision.markup_basis_points is null then return v_result; end if;
  v_rounded:=tongs.round_customer_price_micros(
    v_revision.full_cost_ceiling_micros::numeric*(10000::numeric+v_revision.markup_basis_points)/10000::numeric,
    v_revision.currency
  );
  v_profit:=v_rounded-v_revision.full_cost_ceiling_micros;
  return v_result || jsonb_build_object(
    'unrounded_cost_plus_markup_micros',v_revision.customer_price_ceiling_micros,
    'customer_price_ceiling_micros',v_rounded,
    'expected_margin_micros',v_profit,
    'expected_margin_percentage',case when v_rounded=0 then null
      else round(100::numeric*v_profit::numeric/v_rounded::numeric,4) end
  );
end $$;

alter function tongs.read_owner_billing_console(integer)
  rename to _read_owner_billing_console_before_rounded_customer_ceiling;

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
  ) rounded on revision.markup_basis_points is not null;
  return jsonb_set(v_result,'{pricing_revisions}',v_pricing,true);
end $$;

revoke all on function tongs._preview_private_price_before_rounded_customer_ceiling(uuid)
  from public,anon,authenticated,service_role;
revoke all on function tongs._read_owner_billing_console_before_rounded_customer_ceiling(integer)
  from public,anon,authenticated,service_role;
revoke all on function tongs.preview_private_price(uuid) from public,anon;
revoke all on function tongs.read_owner_billing_console(integer) from public,anon;
grant execute on function tongs._preview_private_price_before_rounded_customer_ceiling(uuid) to service_role;
grant execute on function tongs._read_owner_billing_console_before_rounded_customer_ceiling(integer) to service_role;
grant execute on function tongs.preview_private_price(uuid) to authenticated,service_role;
grant execute on function tongs.read_owner_billing_console(integer) to authenticated,service_role;

comment on function tongs.preview_private_price(uuid) is
  'Operator-only preview using the same rounded customer ceiling captured by authoritative quotes.';
comment on function tongs.read_owner_billing_console(integer) is
  'Operator-only billing console with rounded customer prices and contribution values aligned to authoritative quote terms.';

notify pgrst,'reload schema';
commit;
