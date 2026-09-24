-- Preserve the evolved shared quote implementation and change only its SKU
-- family lookup for the existing Thumbnail Base image product.
begin;

do $$
declare
  definition text;
  changed text;
begin
  select pg_get_functiondef(
    'tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz)'::regprocedure
  ) into definition;

  changed := regexp_replace(
    definition,
    'v_sku[[:space:]]*:=[[:space:]]*lower\([^;]*\);',
    'v_sku := lower((case when p_route_code = ''hearth.thumbnail_base_generation'' then ''openai-image:'' else ''openai-text:'' end) || p_route_code || '':'' || btrim(p_model) || '':'' || v_cost.id::text);',
    'i'
  );

  if changed = definition
     or position('hearth.thumbnail_base_generation' in changed) = 0
     or position('openai-image:' in changed) = 0
     or position('customer_credit_units' in changed) = 0
     or position('funding_environment' in changed) = 0
     or position('_openai_rollout_for_funding' in changed) = 0 then
    raise exception 'shared quote SKU insertion point or evolved quote contract changed; explicit review required';
  end if;

  execute changed;
end $$;

do $$
begin
  if exists (
    select 1 from tongs.customer_paid_execution_scope_authorizations
    where financial_environment = 'live'
      and route_code = 'hearth.thumbnail_base_generation'
      and status = 'active'
  ) then
    raise exception 'Live Thumbnail Base scope must remain absent';
  end if;
  if (select count(*) from tongs.customer_spending_quotes quote
      join tongs.openai_text_customer_quote_bindings binding on binding.quote_id = quote.id
      where binding.route_code = 'hearth.thumbnail_base_generation') <> 0 then
    raise exception 'Thumbnail Base quote must not predate this resolver repair';
  end if;
end $$;

comment on function tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz) is
  'Creates immutable paid OpenAI quotes; Thumbnail Base resolves its published openai-image SKU while all other routes retain their existing SKU family.';

commit;
