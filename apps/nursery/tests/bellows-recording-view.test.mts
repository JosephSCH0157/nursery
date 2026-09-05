import assert from "node:assert/strict";
import test from "node:test";
import { deriveBellowsRecordingView } from "../src/lib/bellows/bellowsRecordingView.ts";

const idle = { phase: "idle", segment: null, partCount: 0, bytesHeldLocally: 0, uploadedPartCount: 0, message: "" } as const;

test("creator workflow is derived from authoritative observations", () => {
  assert.equal(deriveBellowsRecordingView({ hasWorkpiece:false, hasSession:true, devicesReady:false, capture:idle, packageSealed:false, hammerHandoffComplete:false, hasIntegrityFindings:false }), "create");
  assert.equal(deriveBellowsRecordingView({ hasWorkpiece:true, hasSession:true, devicesReady:false, capture:{...idle,phase:"recoverable",partCount:1}, packageSealed:false, hammerHandoffComplete:false, hasIntegrityFindings:false }), "recover");
  assert.equal(deriveBellowsRecordingView({ hasWorkpiece:true, hasSession:true, devicesReady:true, capture:idle, packageSealed:false, hammerHandoffComplete:false, hasIntegrityFindings:false, authorityNeedsRecovery:true }), "recover");
  assert.equal(deriveBellowsRecordingView({ hasWorkpiece:true, hasSession:true, devicesReady:true, capture:{...idle,phase:"recording"}, packageSealed:false, hammerHandoffComplete:false, hasIntegrityFindings:false }), "recording");
  assert.equal(deriveBellowsRecordingView({ hasWorkpiece:true, hasSession:true, devicesReady:true, capture:idle, packageSealed:true, hammerHandoffComplete:false, hasIntegrityFindings:false }), "hammer_handoff");
  assert.equal(deriveBellowsRecordingView({ hasWorkpiece:true, hasSession:true, devicesReady:true, capture:idle, packageSealed:true, hammerHandoffComplete:true, hasIntegrityFindings:false }), "complete");
});
