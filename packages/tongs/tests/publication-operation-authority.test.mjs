import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const sql=await readFile(new URL("../../../supabase/migrations/20260828120000_tongs_publication_operation_authority_s5_3b.sql",import.meta.url),"utf8");
const contract=await readFile(new URL("../src/publication-operation-authority.ts",import.meta.url),"utf8");

test("S5-3B freezes one exact publication authority before attempts",()=>{
  for(const table of ["publication_operations","publication_attempts","publication_receipts","publication_reconciliation_events"])assert.match(sql,new RegExp(`create table tongs\\.${table}`));
  assert.match(sql,/manifest_snapshot_id[\s\S]+release_decision_id[\s\S]+executable_destination_id[\s\S]+destination_capability_revision_id/);
  assert.match(sql,/v_existing\.manifest_snapshot_id<>p_manifest_snapshot_id[\s\S]+v_existing\.destination_capability_revision_id<>p_destination_capability_revision_id[\s\S]+publication_operation_idempotency_conflict/);
  assert.match(sql,/trg_publication_operations_immutable/);
});

test("attempt retries preserve operation identity and fail closed on unknown outcomes",()=>{
  assert.match(sql,/unique\(publication_operation_id, attempt_number\)/);
  assert.match(sql,/publication_attempts_one_active_idx/);
  assert.match(sql,/v_latest\.state='outcome_unknown'[\s\S]+publication_external_reconciliation_required/);
  assert.match(sql,/v_latest\.state not in\('confirmed_failure','recoverable_failure'\)[\s\S]+publication_safe_retry_unavailable/);
  assert.match(sql,/credential_generation_id/);
});

test("terminal evidence creates immutable complete receipts",()=>{
  assert.match(sql,/insert into tongs\.publication_receipts[\s\S]+manifest_snapshot_id[\s\S]+release_decision_id[\s\S]+executable_destination_id[\s\S]+destination_capability_revision_id/);
  assert.match(sql,/trg_publication_receipts_immutable/);
  assert.match(sql,/state='outcome_unknown'[\s\S]+reconciliation_required/);
});

test("public contracts separate operation attempts receipts and credentials",()=>{
  for(const name of ["PublicationOperationAuthority","PublicationAttempt","PublicationReceipt","PublicationAttemptState","PublicationOperationState","PublicationAuthorityError"])assert.match(contract,new RegExp(`type ${name}`));
  assert.match(contract,/credentialGenerationId/);
  assert.doesNotMatch(contract,/refreshToken|accessToken|encrypted_refresh_token|encrypted_access_token/);
});

test("procedural SQL terminators are valid",()=>{assert.doesNotMatch(sql,/\bend\s+\$\$;/);assert.doesNotMatch(sql,/^\s*end\s*$\r?\n\s*\$[A-Za-z0-9_]*\$;/m);});
