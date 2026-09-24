import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(
  new URL("../src/components/visuals/CanonicalReferenceMaterialPanel.tsx", import.meta.url),
  "utf8",
);
const authority = readFileSync(
  new URL("../src/lib/hearth-reference-visual-authority.ts", import.meta.url),
  "utf8",
);
const collections = readFileSync(
  new URL("../src/lib/hearth-reference-visual-collections.ts", import.meta.url),
  "utf8",
);

const saveRights = panel.slice(
  panel.indexOf("async function saveLinkedVisualRights"),
  panel.indexOf("async function acquireLinkedVisual"),
);
const acquire = panel.slice(
  panel.indexOf("async function acquireLinkedVisual"),
  panel.indexOf("async function begin("),
);

test("rights save and archival acquisition are separate creator actions", () => {
  assert.match(panel, />Save rights</);
  assert.match(panel, />Acquire image</);
  assert.doesNotMatch(panel, /Save rights and add image/);
  assert.match(saveRights, /commitReferenceVisualRights/);
  assert.equal((saveRights.match(/commitReferenceVisualRights/g) ?? []).length, 1);
  assert.doesNotMatch(saveRights, /acquireReferenceVisual|reference-visuals\/acquire|renderReferenceVisual/);
});

test("unchanged saved rights are recovered and never duplicated", () => {
  assert.match(panel, /setRightsStatus\(typeof rights\?\.rights_status/);
  assert.match(panel, /setRightsAcknowledged\(rights\?\.creator_acknowledged_responsibility === true\)/);
  assert.match(panel, /setRightsSaved\(Boolean\(rights\)\)/);
  assert.match(saveRights, /if \(rightsDraftMatches\(opportunity\)\)/);
  assert.match(saveRights, /rights_declaration_revision_id/);
  assert.match(saveRights, /setDrawer\(null\)/);
});

test("acquisition rereads and binds current rights and Source collection authority", () => {
  const reread = acquire.indexOf("readCanonicalReferenceVisualCollections");
  const request = acquire.indexOf("acquireReferenceVisual");
  assert.ok(reread >= 0 && reread < request);
  assert.match(acquire, /current\.rights/);
  assert.match(acquire, /current\.sourceSetRevisionId/);
  assert.match(authority, /source_set_revision_id:args\.opportunity\.sourceSetRevisionId/);
  assert.match(collections, /sourceSetRevisionId:str\(set\?\.id\)/);
});

test("non-archival material keeps saved rights and cannot cross the acquisition boundary", () => {
  assert.match(acquire, /current\.subtype !== "archival_still"/);
  assert.match(acquire, /rights remain saved and no archival image was acquired/);
  assert.match(authority, /reference_visual_archival_subtype_required/);
  assert.doesNotMatch(saveRights, /fetch\(|tongsFetch|OpenAI|Luna|provider/i);
});
