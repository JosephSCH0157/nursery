import assert from "node:assert/strict";import test from "node:test";
import {isQuenchCandidateSelectable,isQuenchCanonicalReleaseProjection,type QuenchCanonicalCandidate} from "../src/core/canonical-release-projection.types";
test("canonical Quench projection rejects legacy and synthetic packets",()=>{
  assert.equal(isQuenchCanonicalReleaseProjection({release_packet_id:"mock"}),false);
  assert.equal(isQuenchCanonicalReleaseProjection({contract_version:"forge.quench-release-projection.v2",workspace_id:"w",workpiece_id:"p",hammer:{},metadata:{},thumbnails:{}}),true);
});
test("candidate selectability fails closed on provenance mismatch and locked ineligible states",()=>{const candidate={authority_verified:true,eligibility_state:"current"} as QuenchCanonicalCandidate;assert.equal(isQuenchCandidateSelectable(candidate),true);assert.equal(isQuenchCandidateSelectable({...candidate,authority_verified:false}),false);for(const eligibility_state of ["historical_brand","requires_reapproval","blocked"] as const)assert.equal(isQuenchCandidateSelectable({...candidate,eligibility_state}),false);assert.equal(isQuenchCandidateSelectable({...candidate,eligibility_state:"approved_historical_brand"}),true);});
