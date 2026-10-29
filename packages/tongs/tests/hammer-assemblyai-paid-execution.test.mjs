import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HammerAssemblyAiPaidExecutionCoordinator,
  HammerAssemblyAiQuoteRequiredError,
  calculateHammerFirstTranscriptionQuote,
  normalizeAssemblyAiCanonicalTranscript,
} from "../dist/server/hammer-assemblyai-paid-execution.js";
import {
  fingerprintHammerAssemblyAiRequest,
  resolveHammerAssemblyAiSourceAuthority,
} from "../dist/server/hammer-assemblyai-transcription.js";
import {
  HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY,
  fingerprintHammerAssemblyAiCapacityEvidence,
} from "../dist/server/hammer-assemblyai-resource-policy.js";

const IDs = {
  user: "71daf61b-57b3-4e5f-a8c8-64befecb5950",
  workspace: "cc5478ff-37be-403e-824c-467fa7da061e",
  workpiece: "21d16d6a-905b-491e-8761-028789612ae5",
  recording: "4cc846e3-187c-46d9-8733-e7402488236c",
  revision: "9c991aa7-f551-4f03-a4d6-41eb40ef81ec",
  completion: "bf67d649-1bc2-44ba-9a33-783b3ab523ea",
};
const SOURCE_SHA = "595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24";
const activationSql = readFileSync(new URL(
  "../../../supabase/migrations/20261029004958_hammer_first_transcription_activation.sql",
  import.meta.url,
), "utf8");
const ownerFundingSql = readFileSync(new URL(
  "../../../supabase/migrations/20261029172356_hammer_owner_funded_first_transcription.sql",
  import.meta.url,
), "utf8");
const hammerPrepHandler = readFileSync(new URL(
  "../../../apps/nursery/scripts/mw-hammer-prep.ts",
  import.meta.url,
), "utf8");

function source() {
  return resolveHammerAssemblyAiSourceAuthority({
    completionId: IDs.completion,
    mediaRevision: 1,
    mediaPath: HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactMediaPath,
    mediaHash: SOURCE_SHA,
    completionEvidence: {
      artifact_validation: {
        path: HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactMediaPath,
        bytes: 120_617_428,
        sha256: SOURCE_SHA,
      },
      canonical_media_verification: {
        bytes: 120_617_428,
        sha256: SOURCE_SHA,
        source: "trusted_tongs_storage_readback",
        duration_ms: 603_848,
        content_type: "video/webm;codecs=vp9,opus",
        has_audio_stream: true,
        probe_implementation: "ffprobe:tongs-runtime",
      },
    },
  });
}

function capacity() {
  const now = Date.now();
  const evidence = {
    checkedAt: new Date(now - 30_000).toISOString(),
    expiresAt: new Date(now + 3_600_000).toISOString(),
    netlify: {
      plan: "pro",
      remainingCreditsMicrounits: HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.requiredNetlifyCreditsMicrounits,
    },
    supabase: {
      plan: "pro",
      spendCapEnabled: true,
      remainingUncachedEgressBytes: HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.requiredSupabaseEgressBytes,
      remainingDatabaseBytes: HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumPersistenceBytes,
    },
    activeHammerOperationCount: 0,
  };
  return { ...evidence, evidenceSha256: fingerprintHammerAssemblyAiCapacityEvidence(evidence) };
}

function signedUrl() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ exp: Math.floor((Date.now() + 3_600_000) / 1_000) })}.fixture`;
  return `https://wtvdjndyxegudufrompx.supabase.co/storage/v1/object/sign/${HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactStorageBucket}/${HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactStorageObjectPath}?token=${token}`;
}

function input(acceptance = null) {
  const resolvedSource = source();
  return {
    userId: IDs.user,
    workspaceId: IDs.workspace,
    workpieceId: IDs.workpiece,
    canonicalRecordingId: IDs.recording,
    recordingRevisionId: IDs.revision,
    source: resolvedSource,
    requestFingerprint: fingerprintHammerAssemblyAiRequest({
      workspaceId: IDs.workspace,
      workpieceId: IDs.workpiece,
      canonicalRecordingId: IDs.recording,
      recordingRevisionId: IDs.revision,
      source: resolvedSource,
    }),
    capacityEvidence: capacity(),
    audioUrl: signedUrl(),
    projectRef: "wtvdjndyxegudufrompx",
    acceptance,
  };
}

test("the certified 603.848-second operation produces exactly the reviewed 12-Credit quote", () => {
  const quote = calculateHammerFirstTranscriptionQuote(603_848n);
  assert.deepEqual(quote, {
    sourceDurationMs: 603_848n,
    billableDurationMs: 604_000n,
    supplierCeilingMicros: 38_589n,
    supportingCeilingMicros: 6_000n,
    completeWholesaleCeilingMicros: 44_589n,
    targetCustomerChargeMicros: 59_304n,
    customerCreditUnits: 12n,
    customerChargeMicros: 60_000n,
  });
});

test("quote presentation stops before reservation or provider execution", async () => {
  const calls = [];
  const gate = {
    async rpc(name) {
      calls.push(name);
      return { data: {
        quote_id: "10000000-0000-4000-8000-000000000001",
        operation_id: "hammer-assemblyai:20000000-0000-4000-8000-000000000001",
        quote_hash: "a".repeat(64),
        request_fingerprint: "b".repeat(64),
        customer_credit_units: 12,
        maximum_customer_charge_micros: 60_000,
        funding_eligible: true,
        funding_label: "Forge Credits",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        accepted: false,
      }, error: null };
    },
  };
  let providerCalls = 0;
  const coordinator = new HammerAssemblyAiPaidExecutionCoordinator(gate, gate, {
    async submit() { providerCalls += 1; throw new Error("must not submit"); },
    async read() { providerCalls += 1; throw new Error("must not poll"); },
  });
  await assert.rejects(() => coordinator.execute(input()), HammerAssemblyAiQuoteRequiredError);
  assert.deepEqual(calls, ["create_hammer_first_transcription_quote"]);
  assert.equal(providerCalls, 0);
});

test("database attempt denial stops before the AssemblyAI transport", async () => {
  let providerCalls = 0;
  const quoteId = "10000000-0000-4000-8000-000000000001";
  const quoteHash = "a".repeat(64);
  const gate = {
    async rpc(name) {
      if (name === "create_hammer_first_transcription_quote") return { data: {
        quote_id: quoteId, operation_id: "hammer-assemblyai:20000000-0000-4000-8000-000000000001",
        quote_hash: quoteHash, request_fingerprint: input().requestFingerprint, customer_credit_units: 12,
        maximum_customer_charge_micros: 60_000, funding_eligible: true,
        funding_label: "Forge Credits", expires_at: new Date(Date.now() + 60_000).toISOString(), accepted: true,
      }, error: null };
      if (name === "accept_quote") return { data: { accepted: true }, error: null };
      if (name === "reserve_hammer_first_transcription_quote") return { data: { operation_id: "20000000-0000-4000-8000-000000000001" }, error: null };
      if (name === "authorize_hammer_first_transcription_attempt") return { data: {
        provider_execution_authorized: false,
        reason: "test_funding_real_provider_forbidden",
      }, error: null };
      throw new Error(`unexpected RPC ${name}`);
    },
  };
  const coordinator = new HammerAssemblyAiPaidExecutionCoordinator(gate, gate, {
    async submit() { providerCalls += 1; throw new Error("must not submit"); },
    async read() { providerCalls += 1; throw new Error("must not poll"); },
  });
  await assert.rejects(() => coordinator.execute(input({
    quoteId, quoteHash,
    operationId: "hammer-assemblyai:20000000-0000-4000-8000-000000000001",
    requestFingerprint: input().requestFingerprint,
  })), /not authorized/);
  assert.equal(providerCalls, 0);
});

test("owner sponsorship presents the reviewed reference quote with zero customer debit", async () => {
  const gate = {
    async rpc(name) {
      assert.equal(name, "create_hammer_first_transcription_quote");
      return { data: {
        quote_id: "10000000-0000-4000-8000-000000000001",
        operation_id: "hammer-assemblyai:20000000-0000-4000-8000-000000000001",
        quote_hash: "a".repeat(64), request_fingerprint: input().requestFingerprint,
        customer_credit_units: 0, maximum_customer_charge_micros: 0,
        reference_customer_credit_units: 12, funding_source: "owner_budget",
        funding_eligible: true, funding_label: "Owner-sponsored certification; no customer charge",
        expires_at: new Date(Date.now() + 60_000).toISOString(), accepted: false,
      }, error: null };
    },
  };
  const coordinator = new HammerAssemblyAiPaidExecutionCoordinator(gate, gate, {
    async submit() { throw new Error("must not submit"); },
    async read() { throw new Error("must not poll"); },
  });
  await assert.rejects(() => coordinator.execute(input()), (error) => {
    assert.ok(error instanceof HammerAssemblyAiQuoteRequiredError);
    assert.equal(error.quote.customerCreditUnits, 0);
    assert.equal(error.quote.maximumCustomerChargeMicros, 0);
    assert.equal(error.quote.referenceCustomerCreditUnits, 12);
    assert.equal(error.quote.fundingSource, "owner_budget");
    return true;
  });
});

test("canonical normalization binds provider utterances to the exact recording", () => {
  const resolvedSource = source();
  const authorization = {
    activation: "authorized",
    operationId: "operation",
    reservationId: "reservation",
    requestFingerprint: "a".repeat(64),
    workspaceId: IDs.workspace,
    workpieceId: IDs.workpiece,
    canonicalRecordingId: IDs.recording,
    recordingRevisionId: IDs.revision,
    source: resolvedSource,
    model: "universal-3-5-pro",
    maximumProviderAttempts: 1,
    fundingSource: "customer",
    acceptedCustomerChargeMicros: 60_000,
    completeWholesaleCeilingMicros: 44_589,
  };
  const transcript = normalizeAssemblyAiCanonicalTranscript({
    text: "Welcome to Gasoline.",
    utterances: [{ speaker: "A", start: 0, end: 900, text: "Welcome to Gasoline." }],
  }, authorization, "provider-request-1");
  assert.equal(transcript.schema_version, "2");
  assert.equal(transcript.recording.media_sha256, SOURCE_SHA);
  assert.equal(transcript.provider.provider_request_id, "provider-request-1");
  assert.equal(transcript.segments.length, 1);
});

test("owner-funded migration is inert, exact, service-only, and preserves customer rules", () => {
  assert.match(ownerFundingSql, /owner-funded Hammer migration must remain financially inert/i);
  assert.match(ownerFundingSql, /owner-funded Hammer migration must not install a budget/i);
  assert.match(ownerFundingSql, /customer_payment_micros bigint not null check \(customer_payment_micros = 0\)/i);
  assert.match(ownerFundingSql, /customer_credit_units bigint not null check \(customer_credit_units = 0\)/i);
  assert.match(ownerFundingSql, /maximum_wholesale_exposure_micros bigint not null check \(maximum_wholesale_exposure_micros = 44589\)/i);
  assert.match(ownerFundingSql, /reference_customer_credit_units bigint not null check \(reference_customer_credit_units = 12\)/i);
  assert.match(ownerFundingSql, /tongs\.begin_owner_provider_attempt/i);
  assert.match(ownerFundingSql, /tongs\.settle_owner_operation/i);
  assert.match(ownerFundingSql, /canonical persistence and authoritative supplier reconciliation required before settlement; bounded owner evidence is required/i);
  assert.match(ownerFundingSql, /promotional_credit_offset_micros/i);
  assert.match(ownerFundingSql, /reservation_reconciliation_required',true/i);
  assert.match(ownerFundingSql, /automatic_retry_allowed',false/i);
  assert.match(ownerFundingSql, /exact economically backed Hammer Live funding required/i);
  assert.doesNotMatch(ownerFundingSql, /insert into tongs\.customer_deposits/i);
  assert.doesNotMatch(ownerFundingSql, /insert into tongs\.test_refill_grants/i);
});

test("activation migration is inert and binds one exact operation", () => {
  assert.match(activationSql, /inserts no provider rate, price, capacity fact/i);
  assert.match(activationSql, /first-transcription migration must remain financially inert/i);
  assert.doesNotMatch(activationSql, /insert into tongs\.customer_paid_execution_scope_authorizations/i);
  assert.doesNotMatch(activationSql, /insert into tongs\.paid_execution_control_revisions/i);
  assert.doesNotMatch(activationSql, /FORGE_HAMMER_ASSEMBLYAI_API_KEY|ASSEMBLYAI_API_KEY/);
  for (const value of [IDs.workspace, IDs.workpiece, IDs.recording, IDs.revision, IDs.completion, SOURCE_SHA]) {
    assert.match(activationSql, new RegExp(value));
  }
  assert.match(activationSql, /supplier_ceiling_micros=38589/i);
  assert.match(activationSql, /supporting_cost_ceiling_micros=6000/i);
  assert.match(activationSql, /complete_wholesale_ceiling_micros=44589/i);
  assert.match(activationSql, /customer_credit_units=12/i);
  assert.match(activationSql, /maximum_customer_charge_micros=60000/i);
  assert.match(activationSql, /maximum_provider_attempts=1/i);
  assert.match(activationSql, /automatic_retries=0/i);
  assert.match(activationSql, /activation_authority_id uuid not null unique/i);
});

test("database sequence preserves acceptance, aggregate admission, reconciliation, and service-only access", () => {
  assert.match(activationSql, /customer_spending_quote_acceptances/i);
  assert.match(activationSql, /tongs\.reserve_operation/i);
  assert.match(activationSql, /tongs\.reserve_restricted_beta_exposure/i);
  assert.match(activationSql, /tongs\.begin_paid_operation_aggregate_attempt/i);
  assert.match(activationSql, /tongs\.begin_provider_attempt/i);
  assert.match(activationSql, /test_funding_real_provider_forbidden/i);
  assert.match(activationSql, /canonical persistence and authoritative supplier reconciliation required before settlement/i);
  assert.match(activationSql, /release_operation\(operation\.reservation_id[\s\S]*customer-relief/i);
  assert.match(activationSql, /aggregate-failure'[\s\S]*operation\.supplier_ceiling_micros/i);
  assert.match(activationSql, /automatic_retry_allowed',false/i);
  assert.match(activationSql, /revoke all on function %s from public,anon,authenticated/i);
  assert.match(activationSql, /grant execute on function %s to service_role/i);
  assert.doesNotMatch(activationSql, /grant execute on function[\s\S]*to authenticated/i);
});

test("paid handler rejects local mappings before preparing a provider URL", () => {
  assert.match(hammerPrepHandler, /hammerTranscriptionProvider === "assemblyai"[\s\S]*"local_root_abs" in request[\s\S]*canonical_source_required/);
  const localRejection = hammerPrepHandler.indexOf('code: "canonical_source_required"');
  const signedUrl = hammerPrepHandler.indexOf("createSignedUrl(policy.exactStorageObjectPath");
  assert.ok(localRejection >= 0 && signedUrl > localRejection);
});
