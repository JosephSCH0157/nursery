import assert from "node:assert/strict";import test from "node:test";
import {isQuenchCanonicalReleaseProjection} from "../src/core/canonical-release-projection.types";
test("canonical Quench projection rejects legacy and synthetic packets",()=>{
  assert.equal(isQuenchCanonicalReleaseProjection({release_packet_id:"mock"}),false);
  assert.equal(isQuenchCanonicalReleaseProjection({contract_version:"forge.quench-release-projection.v2",workspace_id:"w",workpiece_id:"p",hammer:{},metadata:{},thumbnails:{}}),true);
});
