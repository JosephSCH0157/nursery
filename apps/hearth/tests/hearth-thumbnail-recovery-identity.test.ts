import assert from "node:assert/strict";
import test from "node:test";
import { findRecoveredConceptSet } from "../src/lib/hearth-production-repo";

const recovered = {
  id: "set-1", name: "Recovered", created_at: "2026-07-16T12:00:00.000Z", state: "active" as const,
  approved_script_version: 3, generation_provenance: { source: "hearth_generation" },
  prompt_schema_version: "hearth-thumbnail-concepts-v1", source_response_hash: "a".repeat(64), concept_revision_ids: [],
};

test("thumbnail recovery identity requires hash, artifact timestamp, and script version", () => {
  assert.equal(findRecoveredConceptSet({ sets: [recovered], sourceResponseHash: "a".repeat(64), generatedAt: recovered.created_at, scriptVersion: 3 })?.id, "set-1");
  assert.equal(findRecoveredConceptSet({ sets: [recovered], sourceResponseHash: "b".repeat(64), generatedAt: recovered.created_at, scriptVersion: 3 }), null);
  assert.equal(findRecoveredConceptSet({ sets: [recovered], sourceResponseHash: "a".repeat(64), generatedAt: "2026-07-16T12:01:00.000Z", scriptVersion: 3 }), null);
  assert.equal(findRecoveredConceptSet({ sets: [recovered], sourceResponseHash: "a".repeat(64), generatedAt: recovered.created_at, scriptVersion: 4 }), null);
});
