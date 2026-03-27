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
  const mediaMapPanel = readSource("src/components/visuals/EpisodeMediaMapPanel.tsx");
  const hearthShell = readSource("src/routes/HearthShell.tsx");

  assert.equal(/\bCDC\b/.test(referenceClipPanel), false);
  assert.equal(/\bCDC\b/.test(mediaMapPanel), false);
  assert.equal(/\bCDC\b/.test(hearthShell), false);

  assert.equal(referenceClipPanel.includes("Reference Clip"), true);
  assert.equal(mediaMapPanel.includes("Reference Clip"), true);
  assert.equal(hearthShell.includes("Reference Clip"), true);
});
