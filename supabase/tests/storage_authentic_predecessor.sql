-- Fixed read-only H444 observation, also valid after 445/446. Return hashes and
-- prerequisite counts only; never export financial rows or Storage object keys.
with protected(value) as (
 select 'scope|'||to_jsonb(x)::text from tongs.customer_paid_execution_scope_authorizations x
 union all select 'activation|'||to_jsonb(x)::text from tongs.owner_paid_execution_canary_activation_revisions x
 union all select 'capacity|'||to_jsonb(x)::text from tongs.hammer_first_transcription_capacity_authorities x
 union all select 'hammer_activation|'||to_jsonb(x)::text from tongs.hammer_first_transcription_activation_authorities x
 union all select 'budget|'||to_jsonb(x)::text from tongs.owner_operating_budgets x
 union all select 'budget_revision|'||to_jsonb(x)::text from tongs.owner_operating_budget_revisions x
 union all select 'funding_preference|'||to_jsonb(x)::text from tongs.ai_funding_preference_revisions x
 union all select 'openai_binding|'||to_jsonb(x)::text from tongs.openai_text_funding_bindings x
 union all select 'runway_binding|'||to_jsonb(x)::text from tongs.runway_funding_bindings x
 union all select 'aggregate_assignment|'||to_jsonb(x)::text from tongs.paid_execution_aggregate_assignments x
 union all select 'aggregate_policy|'||to_jsonb(x)::text from tongs.restricted_beta_policy_revisions x
 union all select 'aggregate_capability|'||to_jsonb(x)::text from tongs.restricted_beta_policy_capabilities x
 union all select 'cost_evidence|'||to_jsonb(x)::text from tongs.restricted_beta_cost_evidence_revisions x
 union all select 'quote|'||to_jsonb(x)::text from tongs.customer_spending_quotes x
 union all select 'reservation|'||to_jsonb(x)::text from tongs.funding_reservations x
 union all select 'operation|'||to_jsonb(x)::text from tongs.hammer_transcription_operations x
 union all select 'attempt|'||to_jsonb(x)::text from tongs.hammer_transcription_provider_attempts x
 union all select 'supplier_expense|'||to_jsonb(x)::text from tongs.supplier_expenses x
 union all select 'journal_event|'||to_jsonb(x)::text from tongs.accounting_journal_events x
 union all select 'journal_entry|'||to_jsonb(x)::text from tongs.accounting_journal_entries x
 union all select 'billing_subscription|'||to_jsonb(x)::text from tongs.billing_subscriptions x
 union all select 'service_receipt|'||to_jsonb(x)::text from tongs.subscription_cycle_receipts x
 union all select 'financial_mode|'||to_jsonb(x)::text from tongs.financial_runtime_environment_revisions x
 union all select 'pricing|'||to_jsonb(x)::text from tongs.private_pricing_revisions x
 union all select 'rollout|'||to_jsonb(x)::text from tongs.openai_text_rollout_revisions x
 union all select 'cost_policy|'||to_jsonb(x)::text from tongs.openai_text_cost_policy_revisions x
 union all select 'rate_condition|'||to_jsonb(x)::text from tongs.openai_text_rate_condition_revisions x
)
select jsonb_build_object(
 'lineage',(select lineage from forge_meta.database_lineage where singleton),
 'lineageSha256',(select encode(extensions.digest(to_jsonb(l)::text,'sha256'),'hex') from forge_meta.database_lineage l where singleton),
 'versions',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
 'historyColumns',(select jsonb_agg(column_name order by column_name) from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations'),
 'originalHistorySha256',(select encode(extensions.digest(coalesce(string_agg(to_jsonb(h)::text,E'\n' order by version),''),'sha256'),'hex') from supabase_migrations.schema_migrations h where version<='20261111201029'),
 'financialSha256',(select encode(extensions.digest(coalesce(string_agg(value,E'\n' order by value collate "C"),''),'sha256'),'hex') from protected),
 'storageSha256',(select encode(extensions.digest(coalesce(string_agg((to_jsonb(o)-'last_accessed_at')::text,E'\n' order by id),''),'sha256'),'hex') from storage.objects o),
 'financialMode',tongs._current_financial_environment(),
 'requiredFinancialRecords',jsonb_build_object(
   'pricing',(select count(*) from tongs.private_pricing_revisions),
   'rollout',(select count(*) from tongs.openai_text_rollout_revisions),
   'costPolicy',(select count(*) from tongs.openai_text_cost_policy_revisions),
   'rateCondition',(select count(*) from tongs.openai_text_rate_condition_revisions))
)::text as observation;
