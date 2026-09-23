import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceState=await readFile(new URL("../src/hooks/useSourcesState.ts",import.meta.url),"utf8");
const authority=await readFile(new URL("../src/lib/hearth-reference-clip-authority.ts",import.meta.url),"utf8");
const panel=await readFile(new URL("../src/components/visuals/CanonicalReferenceClipPanel.tsx",import.meta.url),"utf8");
const planner=await readFile(new URL("../../../packages/tongs/src/workpiece-commit-api.ts",import.meta.url),"utf8");

test("chat-added URL Sources enter canonical Tongs authority before the compatibility projection",()=>{
  assert.match(sourceState,/createCanonicalChatSource/);
  const canonicalAt=sourceState.indexOf("await createCanonicalChatSource");
  const legacyAt=sourceState.indexOf("await commitWorkspaceSource",canonicalAt);
  assert.ok(canonicalAt>=0&&legacyAt>canonicalAt);
  assert.match(authority,/relationship_type:\s*"script_research"/);
  assert.match(authority,/script_approval_id:\s*null/);
  assert.match(authority,/user_supplied:\s*true/);
  assert.match(authority,/legacy_hearth_source_id/);
});

test("unified planning freezes the canonical source catalog and materializes direct bindings",()=>{
  assert.match(planner,/read_workpiece_sources/);
  assert.match(planner,/source_catalog:\s*sourceCatalog/);
  assert.match(planner,/provider_contract_version:\s*UNIFIED_VISUAL_PLAN_PROVIDER_CONTRACT_VERSION/);
  assert.match(planner,/source_status:\s*direct\s*\?\s*"linked"\s*:\s*"unresolved"/);
  assert.match(planner,/commit_visual_source_attribution/);
  assert.match(planner,/commitAttributions\(\s*"image"/);
  assert.match(planner,/commitAttributions\(\s*"broll"/);
  assert.match(planner,/commit_reference_visual_source_set/);
  assert.match(planner,/validateUnifiedVisualPlan\(\s*plan,\s*scriptText,\s*new Set\(frozenCatalog/);
});

test("Reference Clip creation reads canonical provenance and explains attached, ambiguous, and supporting-only Sources",()=>{
  assert.match(authority,/read_current_visual_source_attributions/);
  assert.match(authority,/selection_required/);
  assert.match(authority,/supporting_only/);
  assert.match(panel,/Source already attached/);
  assert.match(panel,/Choose the source this idea came from/);
  assert.match(panel,/Hearth remembers why this clip exists/);
});
