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
