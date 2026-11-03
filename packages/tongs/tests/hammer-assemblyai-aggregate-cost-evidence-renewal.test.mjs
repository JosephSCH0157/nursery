import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL(
  "../../../supabase/migrations/20261103173603_hammer_assemblyai_aggregate_cost_evidence_renewal.sql",
  import.meta.url,
), "utf8");
const renewal = readFileSync(new URL(
  "../../../scripts/invoke-hammer-capacity-authority-renewal.ps1",
  import.meta.url,
), "utf8");
const alignment = readFileSync(new URL(
  "../../../supabase/migrations/20261103185024_hammer_assemblyai_aggregate_envelope_alignment.sql",
  import.meta.url,
), "utf8");

test("successor evidence preserves the exact approved AssemblyAI economics", () => {
  assert.match(sql, /previous_policy\.aggregate_forge_exposure_limit_micros<>44589/);
  assert.match(sql, /p_policy_id,'production',next_policy_revision,'active'/);
  assert.match(sql, /'base_rate_micros_per_hour',210000/);
  assert.match(sql, /'speaker_diarization_rate_micros_per_hour',20000/);
  assert.match(sql, /'supplier_rate_micros_per_hour',230000/);
  assert.match(sql, /per_operation_supplier_ceiling_micros=38589/);
  assert.match(sql, /per_operation_supporting_ceiling_micros=6000/);
  assert.match(sql, /maximum_attempts=1/);
  assert.match(sql, /'automatic_retries',0/);
  assert.doesNotMatch(sql, /customer_spending_quotes\s*\(/i);
  assert.doesNotMatch(sql, /funding_reservations\s*\(/i);
  assert.doesNotMatch(sql, /hammer_transcription_provider_attempts\s*\(/i);
  assert.match(sql, /_require_pricing_service_role/);
  assert.match(sql, /not tongs\.is_platform_operator/);
});
test("renewals resolve fresh exact aggregate authority instead of copying stale policy identity", () => {
  assert.match(sql, /create or replace function tongs\._current_hammer_first_transcription_aggregate_policy\(\)/);
  assert.match(sql, /e\.valid_until>clock_timestamp\(\)/);
  assert.match(sql, /e\.observed_at>=clock_timestamp\(\)-make_interval/);
  assert.match(sql, /order by p\.revision desc/);
  assert.match(sql, /previous\.pricing_revision_id,tongs\._current_hammer_first_transcription_aggregate_policy\(\),/);
  assert.match(renewal, /bounded financial or capacity evidence no longer admits execution/);
});

test("alignment fixes only the aggregate envelope while preserving exact operation economics", () => {
  assert.match(alignment, /previous_policy\.aggregate_forge_exposure_limit_micros<>44589/);
  assert.match(alignment, /'production',next_policy_revision,'active',10840000,0,1,86400,86400/);
  assert.match(alignment, /per_operation_supplier_ceiling_micros<>38589/);
  assert.match(alignment, /per_operation_supporting_ceiling_micros<>6000/);
  assert.match(alignment, /maximum_attempts<>1/);
  assert.match(alignment, /'automatic_retries'\)::integer<>0/);
  assert.match(alignment, /customer_payment_micros',0/);
  assert.match(alignment, /customer_credit_units',0/);
  assert.doesNotMatch(alignment, /customer_spending_quotes\s*\(/i);
  assert.doesNotMatch(alignment, /funding_reservations\s*\(/i);
  assert.doesNotMatch(alignment, /hammer_transcription_operations\s*\(/i);
  assert.doesNotMatch(alignment, /hammer_transcription_provider_attempts\s*\(/i);
});

test("alignment is service-only and resolver requires exact fresh authority", () => {
  assert.match(alignment, /_require_pricing_service_role/);
  assert.match(alignment, /not tongs\.is_platform_operator/);
  assert.match(alignment, /revoke all[\s\S]*from public,anon,authenticated/);
  assert.match(alignment, /grant execute[\s\S]*to service_role/);
  assert.match(alignment, /e\.valid_until>clock_timestamp\(\)/);
  assert.match(alignment, /e\.observed_at>=clock_timestamp\(\)-make_interval/);
  assert.match(alignment, /aggregate_forge_exposure_limit_micros=10840000/);
  assert.match(alignment, /per_operation_supplier_ceiling_micros=38589/);
  assert.match(alignment, /per_operation_supporting_ceiling_micros=6000/);
  assert.match(alignment, /exact_model_or_sku='universal-3-5-pro:diarization'/);
});
