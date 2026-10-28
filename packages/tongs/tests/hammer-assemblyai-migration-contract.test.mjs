import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../../../supabase/migrations/20261028092438_hammer_h2c_inactive_assemblyai_transcription.sql",
  import.meta.url,
), "utf8");

test("migration is forward-only, RLS-complete, and financially inactive", () => {
  assert.match(migration, /create table tongs\.hammer_transcription_provider_authorities/);
  assert.match(migration, /create table tongs\.hammer_transcription_operations/);
  assert.match(migration, /create table tongs\.hammer_transcription_stage_receipts/);
  assert.match(migration, /create table tongs\.hammer_canonical_transcripts_v2/);
  assert.match(migration, /execution_authorized boolean not null default false check \(execution_authorized = false\)/);
  assert.match(migration, /financial_environment text not null check \(financial_environment = 'test'\)/);
  assert.match(migration, /maximum_provider_attempts smallint not null default 1 check \(maximum_provider_attempts = 1\)/);
  assert.match(migration, /provider in \('openai','runway','assemblyai'\)/);
  assert.match(migration, /alter table tongs\.%I enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /\(select auth\.uid\(\)\) = user_id/);
  assert.match(migration, /operation\.id = hammer_transcription_provider_attempts\.operation_id/);
  assert.match(migration, /operation\.id = hammer_transcription_stage_receipts\.operation_id/);
  assert.match(migration, /canonical transcript persistence is required before settlement/i);
  assert.doesNotMatch(migration, /insert into tongs\.hammer_transcription_provider_authorities/i);
  assert.doesNotMatch(migration, /insert into tongs\.(customer_spending_quotes|funding_reservations|supplier_expenses)/i);
  assert.doesNotMatch(migration, /lifecycle_state[^\n]*'active'/i);
  assert.match(migration, /bind_inactive_hammer_assemblyai_operation/);
  assert.match(migration, /customer_spending_quote_acceptances/);
  assert.match(migration, /paid_operation_aggregate_bindings/);
  assert.match(migration, /quote\.normal_maximum_charge_micros<>quote\.customer_credit_units\*5000/);
  assert.match(migration, /ceil\(\(quote\.full_cost_ceiling_micros\*133::numeric\/100\)\/5000::numeric\)::bigint\*5000/);
});

test("source duration is resolved from immutable server completion evidence", () => {
  assert.match(migration, /resolve_hammer_transcription_source_authority/);
  assert.match(migration, /trusted_tongs_storage_readback/);
  assert.match(migration, /canonical_media_verification/);
  assert.doesNotMatch(migration, /browser_duration|HTMLMediaElement|loadedmetadata/i);
});

test("canonical persistence validates source and provider before settlement can exist", () => {
  assert.match(migration, /persist_hammer_canonical_transcript_v2/);
  assert.match(migration, /provider_request_id/);
  assert.match(migration, /universal-3-5-pro/);
  assert.match(migration, /recording,media_sha256/);
  assert.match(migration, /canonical_persisted/);
  assert.match(migration, /settled_at is null or canonical_transcript_id is not null/);
});
