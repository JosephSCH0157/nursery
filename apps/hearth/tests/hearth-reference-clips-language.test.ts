import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`[ok] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

run("visual panels use Reference Clip user-facing language", () => {
  const referenceClipPanel = readSource("src/components/visuals/ReferenceClipPlanPanel.tsx");
  const brollPanel = readSource("src/components/visuals/BrollPlanPanel.tsx");
  const mediaMapPanel = readSource("src/components/visuals/EpisodeMediaMapPanel.tsx");
  const hearthShell = readSource("src/routes/HearthShell.tsx");

  assert.equal(/\bCDC\b/.test(referenceClipPanel), false);
  assert.equal(/\bCDC\b/.test(mediaMapPanel), false);
  assert.equal(/\bCDC\b/.test(hearthShell), false);

  assert.equal(referenceClipPanel.includes("Reference Clip"), true);
  assert.equal(referenceClipPanel.includes("Generate in Forge"), true);
  assert.equal(referenceClipPanel.includes("Prompt Pack"), true);
  assert.equal(referenceClipPanel.includes("Open Manual Bridge Provider"), true);
  assert.equal(referenceClipPanel.includes("Attach Result URL"), true);
  assert.equal(referenceClipPanel.includes("Manual Bridge State"), true);
  assert.equal(referenceClipPanel.includes("Manual Bridge Provider"), true);
  assert.equal(referenceClipPanel.includes("Manual Bridge Note"), true);
  assert.equal(referenceClipPanel.includes("Regenerate (stub)"), false);
  assert.equal(referenceClipPanel.includes("Download Source Brief"), true);
  assert.equal(brollPanel.includes("Open Provider"), true);
  assert.equal(brollPanel.includes("Attach Result URL"), true);
  assert.equal(brollPanel.includes("Manual bridge"), true);
  assert.equal(mediaMapPanel.includes("Reference Clip"), true);
  assert.equal(hearthShell.includes("Reference Clip"), true);
  assert.equal(referenceClipPanel.includes("Automated round-trip"), false);
  assert.equal(brollPanel.includes("Automated round-trip"), false);
});
