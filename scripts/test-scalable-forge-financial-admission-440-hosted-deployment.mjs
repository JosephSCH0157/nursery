import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CERTIFIED_PAYLOAD_COMMIT, FORGE_PROJECT_REF, PREDECESSOR_VERSION,
  RECOVERY_APPROVAL_PREFIX, TARGET_FILENAME, TARGET_SHA256, TARGET_VERSION,
  recoveryUseMarkerName, validateHostedState, validateOperatorAuthorization,
  validatePostVerifyState, validateRecoveryEvidence,
} from "./lib/scalable-forge-financial-admission-440-hosted-deployment-policy.mjs";

const NOW = new Date("2026-11-05T12:00:00Z");
const wrapper = readFileSync(new URL("./invoke-scalable-forge-financial-admission-440-hosted-deployment.ps1", import.meta.url), "utf8");
const postverifySql = readFileSync(new URL("../supabase/tests/scalable_forge_financial_admission_440_hosted_postverify.sql", import.meta.url), "utf8");
const token = "owner-issued-token-not-stored-in-repository";
const tokenHash = createHash("sha256").update(token).digest("hex");
const containment = {
  hammerRolloutRevision:3, hammerRolloutMode:"halt_new", lunaRolloutRevision:13, lunaRolloutMode:"halt_new",
  effectiveActivations:0, effectiveCapacityAuthorities:0, effectiveScopes:0, effectiveTestScopes:0,
  effectiveLiveScopes:0, operations:0, providerAttempts:0, unresolvedOperations:0, unresolvedAttempts:0,
  aggregateExposureLimitMicros:10840000, supplierCeilingMicros:38589, supportingCeilingMicros:6000, maximumAttempts:1, automaticRetries:0,
  fundedNetPolicyCount:0, fundedNetAssignmentCount:0, nonLegacyPolicyCount:0, allPoliciesLegacyGross:true,
  scalableContractOk:false, observabilityContractOk:false, scalableAclOk:false, observabilityAclOk:false,
};
const preState = () => ({projectRef:FORGE_PROJECT_REF, lineage:"historical-v1", certifiedPayloadCommit:CERTIFIED_PAYLOAD_COMMIT,
  payloadProvenanceOk:true, installedCount:439, hostedHead:PREDECESSOR_VERSION, pendingVersions:[TARGET_VERSION],
  migrationSha256:TARGET_SHA256, databasePasswordAvailable:true, ...containment});
const postState = () => ({...preState(), installedCount:440, hostedHead:TARGET_VERSION, pendingVersions:[],
  scalableContractOk:true, observabilityContractOk:true, scalableAclOk:true, observabilityAclOk:true});
const observation = () => ({schema:"forge.supabase-management-backup-observation.v1",project_ref:FORGE_PROJECT_REF,
  endpoint:`/v1/projects/${FORGE_PROJECT_REF}/database/backups`,http_status:200,observed_at:"2026-11-05T11:59:00.000Z",
  response_date:"2026-11-05T11:58:59.000Z",response_sha256:"a".repeat(64),backup_id:"backup-440",
  backup_status:"COMPLETED",backup_timestamp:"2026-11-05T06:30:00.000Z",recovery_method:"daily_physical_backup",pitr_enabled:false});
const recovery = () => ({schema:"forge.hosted-recovery-readiness.v2",verification_source:"supabase_management_api",
  project_ref:FORGE_PROJECT_REF,backup_kind:"daily",verified_at:"2026-11-05T11:59:00.000Z",latest_restorable_at:"2026-11-05T06:30:00.000Z",
  recovery_operator:"named recovery operator",restore_authorizer:"named restore authorizer",
  owner_approval_reference:`${RECOVERY_APPROVAL_PREFIX}WINDOW-01`,restore_scope_acknowledged:true,unrelated_data_impact_acknowledged:true,
  management_api:{endpoint:`/v1/projects/${FORGE_PROJECT_REF}/database/backups`,backup_id:"backup-440",backup_status:"COMPLETED",
    backup_timestamp:"2026-11-05T06:30:00.000Z",recovery_method:"daily_physical_backup",response_sha256:"a".repeat(64),observed_at:"2026-11-05T11:59:00.000Z"}});

test("accepts the exact predecessor and independently committed payload", () => {
  assert.deepEqual(validateHostedState(preState(),{action:"Preflight",operator:"release operator"}),{operator:"release operator"});
});

test("Apply requires an owner-issued token matching an out-of-band SHA-256 commitment", () => {
  assert.deepEqual(validateHostedState(preState(),{action:"Apply",operator:"release operator",authorization:token,authorizationSha256:tokenHash}),{operator:"release operator"});
  for (const options of [{action:"Apply",operator:"release operator"},{action:"Apply",operator:"release operator",authorization:token,authorizationSha256:"0".repeat(64)},{action:"Apply",operator:"release operator",authorization:"wrong",authorizationSha256:tokenHash}])
    assert.throws(()=>validateHostedState(preState(),options));
});

test("rejects predecessor, target, count, migration, provenance, and pending-set drift", () => {
  for (const mutate of [
    s=>{s.hostedHead="20261104143249"}, s=>{s.installedCount=438}, s=>{s.pendingVersions=[]},
    s=>{s.pendingVersions=[TARGET_VERSION,"20261106000000"]}, s=>{s.pendingVersions=["20261106000000"]},
    s=>{s.migrationSha256="0".repeat(64)}, s=>{s.certifiedPayloadCommit="0".repeat(40)}, s=>{s.payloadProvenanceOk=false},
  ]) { const state=preState(); mutate(state); assert.throws(()=>validateHostedState(state,{action:"Preflight",operator:"release operator"})); }
});

test("rejects funded-net authority and containment drift", () => {
  for (const mutate of [s=>{s.fundedNetPolicyCount=1},s=>{s.fundedNetAssignmentCount=1},s=>{s.nonLegacyPolicyCount=1},
    s=>{s.allPoliciesLegacyGross=false},s=>{s.hammerRolloutMode="enforce"},s=>{s.lunaRolloutMode="enforce"},
    s=>{s.effectiveActivations=1},s=>{s.effectiveCapacityAuthorities=1},s=>{s.effectiveScopes=1},s=>{s.operations=1},s=>{s.providerAttempts=1}]) {
    const state=preState(); mutate(state); assert.throws(()=>validateHostedState(state,{action:"Preflight",operator:"release operator"}));
  }
});

test("requires fresh correlated recovery evidence and explicit roles/change window", () => {
  assert.match(validateRecoveryEvidence(recovery(),NOW,observation()).recoveryUseKey,/^[0-9a-f]{64}$/);
  for (const mutate of [e=>{e.verified_at="2026-11-04T00:00:00Z";e.management_api.observed_at=e.verified_at},e=>{e.owner_approval_reference="wrong"},e=>{e.recovery_operator=""},e=>{e.restore_authorizer=""},e=>{e.restore_scope_acknowledged=false},e=>{e.unrelated_data_impact_acknowledged=false}]) {
    const evidence=recovery(); mutate(evidence); assert.throws(()=>validateRecoveryEvidence(evidence,NOW,observation()));
  }
});

test("independent PostVerify rejects history, contract, ACL, authority, and containment inconsistencies", () => {
  assert.equal(validatePostVerifyState(postState()),true);
  for (const mutate of [s=>{s.installedCount=439},s=>{s.pendingVersions=[TARGET_VERSION]},s=>{s.scalableContractOk=false},
    s=>{s.observabilityAclOk=false},s=>{s.fundedNetPolicyCount=1},s=>{s.fundedNetAssignmentCount=1},s=>{s.effectiveScopes=1}]) {
    const state=postState(); mutate(state); assert.throws(()=>validatePostVerifyState(state));
  }
});

test("single-use marker is target-specific and fail-closed", () => {
  assert.equal(recoveryUseMarkerName("a".repeat(64)),`scalable-forge-financial-admission-440-${"a".repeat(64)}.json`);
  assert.throws(()=>recoveryUseMarkerName("bad"));
  assert.match(wrapper,/\[IO\.FileMode\]::CreateNew/);
  assert.match(wrapper,/already consumed/);
  assert.match(wrapper,/Register-ApplyAuthorizationUse \$AuthorizationSha256/);
  assert.match(wrapper,/authorization-\$AuthorizationCommitment\.json/);
  assert.match(wrapper,/Apply authorization was already consumed/);
});

test("wrapper reaches Apply only after policy, exact dry run, and single-use registration", () => {
  const policy=wrapper.indexOf("$audit=Invoke-Policy");
  const dry=wrapper.indexOf("Assert-ForgeSupabaseDryRunPlan");
  const authConsume=wrapper.indexOf("Register-ApplyAuthorizationUse $AuthorizationSha256");
  const consume=wrapper.indexOf("Register-RecoveryEvidenceUse $audit.recoveryUseKey");
  const apply=wrapper.indexOf("Invoke-Supabase @('db','push','--linked','--workdir',$repo,'--agent=no')");
  assert.ok(policy>=0 && dry>policy && authConsume>dry && consume>authConsume && apply>consume);
  assert.match(wrapper,new RegExp(TARGET_FILENAME)); assert.match(wrapper,new RegExp(TARGET_SHA256));
  assert.doesNotMatch(wrapper,/--include-all|migration['"]?\s*,?['"]?repair|db['"]?\s*,?['"]?reset/i);
});

test("wrapper preserves protected authority with schema-addition normalization", () => {
  assert.match(wrapper,/Protected financial or execution authority changed/);
  for (const field of ["exposure_accounting_mode","net_forge_loss_limit_micros","emergency_platform_risk_limit_micros","provider_code","provider_gross_liquidity_limit_micros"])
    assert.match(wrapper,new RegExp(field));
});

test("PostVerify SQL independently inspects scalable contracts, ACLs, authority, and containment", () => {
  for (const term of ["funded_net_policy_count","funded_net_assignment_count","all_policies_legacy_gross","scalable_contract_ok",
    "observability_contract_ok","scalable_acl_ok","observability_acl_ok","effective_activations","effective_capacity_authorities",
    "effective_scopes","operations","provider_attempts","read_forge_cost_observability"])
    assert.match(postverifySql,new RegExp(term));
});

test("governance controls do not embed or generate an Apply token", () => {
  assert.doesNotMatch(wrapper,/APPLY-SCALABLE|APPLY-HAMMER/);
  assert.match(wrapper,/FORGE_440_APPLY_AUTHORIZATION_SHA256/);
  assert.throws(()=>validateOperatorAuthorization({action:"Apply",operator:"release operator",authorization:token}));
});
