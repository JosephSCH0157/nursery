import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(
  new URL("../src/components/visuals/CanonicalReferenceVisualPanel.tsx", import.meta.url),
  "utf8",
);
const authority = readFileSync(
  new URL("../src/lib/hearth-reference-visual-authority.ts", import.meta.url),
  "utf8",
);
const server = readFileSync(
  new URL("../../../packages/tongs/src/workpiece-commit-api.ts", import.meta.url),
  "utf8",
);

const saveRights = panel.slice(
  panel.indexOf("async function saveRights()"),
  panel.indexOf("async function saveSourceUse()"),
);
const acquire = panel.slice(
  panel.indexOf("async function acquire()"),
  panel.indexOf("async function acquireDiscoveredStill"),
);
const serverAcquire = server.slice(
  server.indexOf("async acquireReferenceVisual("),
  server.indexOf("async commitReferenceVisualSourceSet(", server.indexOf("async acquireReferenceVisual(")),
);

test("rights declaration and archival acquisition remain separate creator actions", () => {
  assert.match(panel, />Save rights declaration</);
  assert.match(panel, />Verify and add archival still</);
  assert.match(panel, />Verify and add this still</);
  assert.doesNotMatch(panel, /Save rights and add image/);
  assert.match(saveRights, /commitReferenceVisualRights/);
  assert.equal((saveRights.match(/commitReferenceVisualRights/g) ?? []).length, 1);
  assert.doesNotMatch(saveRights, /acquireReferenceVisual|reference-visuals\/acquire|renderReferenceVisual/);
});

test("rights declaration records explicit creator consent without bypassing access controls", () => {
  assert.match(panel, /I confirm that I am responsible for rights and permissions and did not bypass access controls/);
  assert.match(panel, /disabled=\{!!pending\|\|!rights\.acknowledged\}/);
  assert.match(saveRights, /creator_acknowledged_responsibility:rights\.acknowledged/);
  assert.match(saveRights, /access_controls_bypassed:false/);
  assert.match(authority, /p_source_set_revision_id:args\.opportunity\.sourceSetRevisionId/);
  assert.match(authority, /p_expected_revision:args\.opportunity\.rightsSequenceRevision/);
});

test("archival acquisition binds and validates exact current Source and rights revisions", () => {
  assert.match(acquire, /acquireReferenceVisual\(\{workspaceId,workpieceId,opportunity/);
  assert.match(authority, /source_set_revision_id:args\.opportunity\.sourceSetRevisionId/);
  assert.match(authority, /rights_declaration_revision_id:str\(args\.opportunity\.rights\.id\)/);
  assert.match(serverAcquire, /rights_declaration\.id !== input\.rights_declaration_revision_id/);
  assert.match(serverAcquire, /reference_visual_rights_revision_conflict/);
  assert.match(serverAcquire, /currentSourceSet\?\.id !== input\.source_set_revision_id/);
  assert.match(serverAcquire, /reference_visual_source_collection_revision_conflict/);
});

test("only archival subtypes can cross the acquisition boundary", () => {
  assert.match(authority, /args\.opportunity\.subtype!=="archival_still"&&args\.opportunity\.subtype!=="archival_sequence"/);
  assert.match(authority, /reference_visual_archival_subtype_required/);
  assert.match(serverAcquire, /\["archival_still", "archival_sequence"\]/);
  assert.match(serverAcquire, /reference_visual_archival_subtype_required/);
  assert.doesNotMatch(saveRights, /fetch\(|tongsFetch|OpenAI|Luna|provider/i);
});
