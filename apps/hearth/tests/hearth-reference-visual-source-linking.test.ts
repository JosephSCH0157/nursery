import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceAuthority = await readFile(new URL("../src/lib/hearth-reference-clip-authority.ts", import.meta.url), "utf8");
const visualAuthority = await readFile(new URL("../src/lib/hearth-reference-visual-authority.ts", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/components/visuals/CanonicalReferenceVisualPanel.tsx", import.meta.url), "utf8");

test("Reference Visuals author and reuse episode-owned canonical Sources", () => {
  assert.match(panel, /Choose existing Source/);
  assert.match(panel, /Add new Source/);
  assert.match(panel, /Publisher or organization/);
  assert.match(panel, /Creator note/);
  assert.match(visualAuthority, /createCanonicalWorkpieceSource/);
  assert.match(visualAuthority, /fulfill_reference_visual_opportunity/);
  assert.match(visualAuthority, /p_expected_opportunity_revision_id/);
  assert.match(visualAuthority, /p_expected_opportunity_revision/);
  assert.match(sourceAuthority, /commit-revision/);
  assert.match(sourceAuthority, /\/sources\/link/);
  assert.match(sourceAuthority, /readCanonicalWorkpieceSources/);
});

test("Reference Visual Source creation does not route through Source Clip authority", () => {
  const implementation = visualAuthority.slice(
    visualAuthority.indexOf("export async function createAndFulfillReferenceVisualSource"),
    visualAuthority.indexOf("export async function commitReferenceVisualEvidence"),
  );
  assert.doesNotMatch(implementation, /reference-clips|createReferenceClip|fulfillReferenceClip/);
  assert.doesNotMatch(implementation, /localStorage|cdc_plan|unified.*plan/i);
  assert.match(implementation, /readCanonicalReferenceVisuals/);
});

test("Source linkage remains separate from evidence, rights, rendering, and acquisition", () => {
  const implementation = visualAuthority.slice(
    visualAuthority.indexOf("export async function createAndFulfillReferenceVisualSource"),
    visualAuthority.indexOf("export async function commitReferenceVisualEvidence"),
  );
  assert.doesNotMatch(implementation, /commitReferenceVisualEvidence|commitReferenceVisualRights|renderReferenceVisual|acquireReferenceVisual/);
});
