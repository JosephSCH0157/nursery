import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import test from "node:test";

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

test("raw Hammer read-file envelope parsers cannot expand without an explicit audit", () => {
  const sourceRoot = resolve("src");
  const rawConsumers = walk(sourceRoot)
    .filter((path) => {
      const source = readFileSync(path, "utf8");
      return source.includes("read-file?") && /(root|row)\?\.exists|root\.exists/.test(source);
    })
    .map((path) => relative(sourceRoot, path).replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(rawConsumers, [
    "app/hammerRecordingCardThumbnail.ts",
    "diagnostics/hammerIngestDiagnosticsRead.ts",
    "lib/hammerPreparedReleasePackageApi.ts",
    "lib/hammerQuenchReleasePacketApi.ts",
    "lib/hammerSnapshotArtifactApi.ts",
    "lib/hammerSourceDeskMediaApi.ts",
  ]);
  const historySource = readFileSync(resolve("src/lib/hammerHistoryArtifactApi.ts"), "utf8");
  assert.match(historySource, /parseTongsReadFileResponse/);
  assert.doesNotMatch(historySource, /(root|row)\?\.exists|root\.exists/);
});
