import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname);

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "dist"].includes(entry.name)) return [];
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(target) : /\.tsx?$/.test(entry.name) ? [target] : [];
  });
}

test("@forge/shared publishes its canonical public surfaces", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.exports).sort(), [
    ".",
    "./episode-workspace",
    "./hearth-visual-styles",
    "./henry",
    "./reference-visual-readiness",
    "./script-tags",
  ]);
  assert.deepEqual(manifest.exports["./reference-visual-readiness"], {
    types: "./dist/reference-visual-readiness.d.ts",
    import: "./dist/reference-visual-readiness.js",
    default: "./dist/reference-visual-readiness.js",
  });
  const index = fs.readFileSync(path.join(root, "index.ts"), "utf8");
  for (const publicModule of ["script-tags", "episode-workspace", "henry", "hearth-visual-styles", "reference-visual-readiness"]) {
    assert.match(index, new RegExp(`\\./${publicModule}`));
  }
});

test("@forge/shared cannot depend on application implementations", () => {
  for (const file of sourceFiles(root)) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /(?:from|import\s*\()[\s\S]*?["'][^"']*(?:apps\/|@nursery\/)/, path.relative(root, file));
  }
});
