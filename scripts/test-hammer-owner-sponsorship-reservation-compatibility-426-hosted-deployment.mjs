import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APPLY_AUTHORIZATION, FORGE_PROJECT_REF, TARGET_SHA256, TARGET_VERSION,
  validateHostedState, validateOperatorAuthorization, validateRecoveryEvidence,
} from "./lib/hammer-owner-sponsorship-reservation-compatibility-426-hosted-deployment-policy.mjs";

const state=()=>({projectRef:FORGE_PROJECT_REF,lineage:"historical-v1",installedCount:425,hostedHead:"20261029172356",pendingVersions:[TARGET_VERSION],migrationSha256:TARGET_SHA256,databasePasswordAvailable:true});
const recovery=()=>({schema:"forge.hosted-recovery-readiness.v1",project_ref:FORGE_PROJECT_REF,dashboard_verified:true,backup_kind:"daily",verified_at:"2026-10-30T09:00:00Z",latest_restorable_at:"2026-10-30T06:27:00Z",recovery_operator:"operator",restore_authorizer:"owner",owner_approval_reference:APPLY_AUTHORIZATION,restore_scope_acknowledged:true,unrelated_data_impact_acknowledged:true});

test("accepts only the exact 425 to 426 state",()=>{
  assert.doesNotThrow(()=>validateHostedState(state(),{action:"Apply",operator:"operator",authorization:APPLY_AUTHORIZATION}));
  assert.doesNotThrow(()=>validateRecoveryEvidence(recovery(),new Date("2026-10-30T09:30:00Z")));
});
for(const [name,mutate] of [["lineage",s=>s.lineage="baseline-v1"],["count",s=>s.installedCount=424],["head",s=>s.hostedHead="20261029154824"],["pending",s=>s.pendingVersions=[]],["hash",s=>s.migrationSha256="0".repeat(64)]]) test(`rejects ${name}`,()=>{const value=state();mutate(value);assert.throws(()=>validateHostedState(value,{action:"Apply",operator:"operator",authorization:APPLY_AUTHORIZATION}));});
test("requires the exact Apply authorization",()=>{
  assert.throws(()=>validateOperatorAuthorization({action:"Apply",operator:"operator"}));
  assert.deepEqual(validateOperatorAuthorization({action:"Apply",operator:"operator",authorization:APPLY_AUTHORIZATION}),{operator:"operator"});
});
test("rejects stale recovery evidence",()=>assert.throws(()=>validateRecoveryEvidence(recovery(),new Date("2026-11-01T09:30:00Z"))));
test("wrapper is linked-tail-only and independently verifies ACL and inactivity",()=>{
  const source=readFileSync(new URL("./invoke-hammer-owner-sponsorship-reservation-compatibility-426-hosted-deployment.ps1",import.meta.url),"utf8");
  assert.match(source,/@\('db','push','--linked','--workdir',\$repo,'--agent=no'\)/);
  assert.match(source,/@\('db','push','--linked','--dry-run','--workdir',\$repo,'--agent=no'\)/);
  assert.doesNotMatch(source,/--include-all|migration['"]?\s*,?['"]?repair|insert\s+into\s+supabase_migrations/i);
  assert.match(source,/owner_sponsorship_guard/);
  assert.match(source,/public_execute_denied/);
  assert.match(source,/provider_attempts/);
  assert.match(source,/customer_charge_micros/);
  assert.match(source,/funding_reservation_events/);
  assert.match(source,/event\.customer_charge_micros/);
  assert.doesNotMatch(source,/sum\(normal_maximum_charge_micros\)/);
});
