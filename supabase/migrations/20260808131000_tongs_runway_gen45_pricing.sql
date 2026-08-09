begin;

insert into tongs.ai_media_authorization_policies(id, policy_code, created_at)
values(
  '75000000-0000-4000-8000-000000000001'::uuid,
  'runway:gen4.5:text-to-video:standard',
  now()
)
on conflict (id) do nothing;

insert into tongs.ai_media_authorization_policy_revisions(
  id, policy_id, revision, previous_revision_id, provider, model_alias, model_snapshot, endpoint,
  request_kind, contract_version, prompt_max_utf8_bytes, authorization_text_contingency_micros,
  output_cost_contract_version, allowed_request_shapes, provenance_json, effective_from, effective_through,
  is_active, actor_id, content_hash, created_at
)
values(
  '76000000-0000-4000-8000-000000000001'::uuid,
  '75000000-0000-4000-8000-000000000001'::uuid,
  1,
  null,
  'runway',
  'gen4.5',
  'gen4.5',
  '/v1/text_to_video',
  'image_generation',
  'forge.paid-media.authority.v1',
  16384,
  0,
  'forge.paid-media.video-usage.v1',
  '{"media_kind":"video","generation_mode":"text_to_video","ratio_supported":true,"duration_seconds_supported":true}'::jsonb,
  '{"provider":"runway","api_version":"2024-11-06","provider_currency":"credit","credit_to_usd":0.01}'::jsonb,
  '2026-08-08T00:00:00Z'::timestamptz,
  null,
  true,
  null,
  encode(digest('runway:gen4.5:text-to-video:standard', 'sha256'), 'hex'),
  now()
)
on conflict (id) do nothing;

insert into tongs.ai_media_authorization_policy_sequences(policy_id, current_revision_id, current_revision, updated_at)
values(
  '75000000-0000-4000-8000-000000000001'::uuid,
  '76000000-0000-4000-8000-000000000001'::uuid,
  1,
  now()
)
on conflict (policy_id) do update
set current_revision_id = excluded.current_revision_id,
    current_revision = excluded.current_revision,
    updated_at = now();

insert into tongs.ai_pricing_policies(id, policy_code, created_at)
values(
  '77000000-0000-4000-8000-000000000001'::uuid,
  'runway:gen4.5:text-to-video:pricing',
  now()
)
on conflict (id) do nothing;

insert into tongs.ai_pricing_policy_revisions(
  id, policy_id, revision, previous_revision_id, provider, model, media_kind, generation_mode,
  billable_dimensions, provider_billing_unit, provider_price_micros_per_unit, provider_currency,
  forge_credit_conversion_numerator, forge_credit_conversion_denominator, markup_numerator, markup_denominator,
  addon_credits, effective_from, effective_through, is_active, price_source_type, price_source_reference,
  price_source_version, actor_id, content_hash, created_at, pricing_contract_version, model_snapshot, endpoint,
  customer_rounding_rule
)
values(
  '78000000-0000-4000-8000-000000000001'::uuid,
  '77000000-0000-4000-8000-000000000001'::uuid,
  1,
  null,
  'runway',
  'gen4.5',
  'video',
  'text_to_video',
  '{"unit":"second"}'::jsonb,
  'second',
  120000,
  'USD',
  140000,
  1,
  6,
  5,
  0,
  '2026-08-08T00:00:00Z'::timestamptz,
  null,
  true,
  'provider_documentation',
  'runway://video-generation-v1',
  '2024-11-06',
  null,
  encode(digest('runway:gen4.5:text-to-video:pricing', 'sha256'), 'hex'),
  now(),
  'scalar_v1',
  'gen4.5',
  '/v1/text_to_video',
  'ceiling_whole_credit'
)
on conflict (id) do nothing;

insert into tongs.ai_pricing_policy_sequences(policy_id, current_revision_id, current_revision, updated_at)
values(
  '77000000-0000-4000-8000-000000000001'::uuid,
  '78000000-0000-4000-8000-000000000001'::uuid,
  1,
  now()
)
on conflict (policy_id) do update
set current_revision_id = excluded.current_revision_id,
    current_revision = excluded.current_revision,
    updated_at = now();

insert into tongs.ai_pricing_rate_components(
  id, pricing_policy_revision_id, ordinal, component_kind, unit_kind, rate_numerator, rate_denominator,
  currency, metadata_json, content_hash, created_at
)
values(
  '79000000-0000-4000-8000-000000000001'::uuid,
  '78000000-0000-4000-8000-000000000001'::uuid,
  1,
  'video_output',
  'second',
  120000,
  1,
  'USD',
  '{"modality":"video","direction":"output","provider_credit_per_second":12,"provider_currency":"credit"}'::jsonb,
  encode(digest('video_output|second|120000|1', 'sha256'), 'hex'),
  now()
)
on conflict (id) do nothing;

commit;
