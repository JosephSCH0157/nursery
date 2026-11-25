-- PROPOSAL ONLY: NOT APPROVED -- EXECUTION PROHIBITED.
-- Independently authorized, one-shot MCP observation; no acquisition/restore.
-- protected CTE and fingerprint expression are identical to the governed H444 observation.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SET LOCAL transaction_timeout='60s';
SET LOCAL idle_in_transaction_session_timeout='60s';
SET LOCAL row_security=off;
SET LOCAL search_path=pg_catalog;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL work_mem='4MB';
SET LOCAL max_parallel_workers_per_gather=0;
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
), eligibility AS (
 SELECT coalesce(
   current_user='postgres' AND current_database()='postgres'
   AND current_setting('transaction_read_only')='on'
   AND current_setting('transaction_isolation')='repeatable read'
   AND (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid())
   AND (SELECT count(*)=1 AND bool_and(singleton AND lineage='historical-v1') FROM forge_meta.database_lineage)
   AND (SELECT count(*)=444 AND count(DISTINCT version)=444
     AND encode(extensions.digest(string_agg(version,E'\n' ORDER BY version),'sha256'),'hex')='b6642437f694d11e9ca29fb82046f556e699f7952a7e33f1f10916b71afeecc1'
     FROM supabase_migrations.schema_migrations)
   AND (SELECT count(*)=27 AND bool_and(c.relkind IN ('r','p') AND has_table_privilege(current_user,c.oid,'SELECT'))
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname||'.'||c.relname IN (
    'tongs.accounting_journal_entries',
    'tongs.accounting_journal_events',
    'tongs.ai_funding_preference_revisions',
    'tongs.billing_subscriptions',
    'tongs.customer_paid_execution_scope_authorizations',
    'tongs.customer_spending_quotes',
    'tongs.financial_runtime_environment_revisions',
    'tongs.funding_reservations',
    'tongs.hammer_first_transcription_activation_authorities',
    'tongs.hammer_first_transcription_capacity_authorities',
    'tongs.hammer_transcription_operations',
    'tongs.hammer_transcription_provider_attempts',
    'tongs.openai_text_cost_policy_revisions',
    'tongs.openai_text_funding_bindings',
    'tongs.openai_text_rate_condition_revisions',
    'tongs.openai_text_rollout_revisions',
    'tongs.owner_operating_budget_revisions',
    'tongs.owner_operating_budgets',
    'tongs.owner_paid_execution_canary_activation_revisions',
    'tongs.paid_execution_aggregate_assignments',
    'tongs.private_pricing_revisions',
    'tongs.restricted_beta_cost_evidence_revisions',
    'tongs.restricted_beta_policy_capabilities',
    'tongs.restricted_beta_policy_revisions',
    'tongs.runway_funding_bindings',
    'tongs.subscription_cycle_receipts',
    'tongs.supplier_expenses'
   )),false) AS ok
)
SELECT jsonb_build_object(
 'status',CASE WHEN e.ok THEN 'FINGERPRINT_OBSERVED_NOT_APPROVED' ELSE 'BLOCKED_SOURCE_OR_CAPABILITY' END,
 'financialSha256',CASE WHEN e.ok THEN
   (select encode(extensions.digest(coalesce(string_agg(value,E'\n' order by value collate "C"),''),'sha256'),'hex') from protected)
   ELSE NULL END,
 'relationCount',27,
 'observedAt',clock_timestamp(),
 'database',current_database(),'principal',current_user,
 'snapshotSha256',encode(extensions.digest(pg_current_snapshot()::text,'sha256'),'hex'),
 'readOnly',current_setting('transaction_read_only'),
 'isolation',current_setting('transaction_isolation'),
 'tls',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid())
) AS observation FROM eligibility e;
ROLLBACK;
