import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assertRecordingAuthorityStage, recordingAuthorityPredecessorNames } from "./certify-anvil-recording-authority-repair.mjs";

const contract = JSON.parse(readFileSync(new URL("../docs/database/baseline/v1-recording-authority/successor-contract.v1.json", import.meta.url)));
const versions = contract.baselineSuccessor.versions;
const target = "20261027030139_anvil_recording_authority_repair.sql";
const names = versions.map((version) => version === "20261027030139" ? target : `${version}_fixture.sql`);

test("migration 419's predecessor excludes every later migration, including the guarded Luna migration", () => {
  const currentAndFuture = [...names, "20261028092438_hammer.sql", "20261104143249_align_provider_requests_and_luna_financial_authority.sql", "20270101000000_future.sql"];
  assert.deepEqual(recordingAuthorityPredecessorNames(currentAndFuture.reverse(), versions), names.slice(0, -1));
});

test("missing, duplicate, backdated and renamed target migrations fail closed", () => {
  for (const invalid of [names.slice(1), [...names, names[1]], [...names, "20261023000000_unreviewed.sql"], names.map((name) => name === target ? "20261027030139_other.sql" : name)]) {
    assert.throws(() => recordingAuthorityPredecessorNames(invalid, versions));
  }
  assert.throws(() => recordingAuthorityPredecessorNames(names, [...versions, "20261028092438"]));
});

test("staging rejects an injected later migration and byte drift without changing the expected manifest", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "forge-anvil-stage-test-"));
  const bytes = Buffer.from("-- immutable fixture\r\nselect 1;\r\n");
  const file = { name: names[0], sha256: createHash("sha256").update(bytes).digest("hex") };
  try {
    writeFileSync(path.join(directory, file.name), bytes);
    assert.doesNotThrow(() => assertRecordingAuthorityStage(directory, [file]));
    const later = path.join(directory, "20261104143249_later.sql");
    writeFileSync(later, "select 2;");
    assert.throws(() => assertRecordingAuthorityStage(directory, [file]), /names differ/);
    rmSync(later);
    writeFileSync(path.join(directory, file.name), bytes.toString().replaceAll("\r\n", "\n"));
    assert.throws(() => assertRecordingAuthorityStage(directory, [file]), /bytes differ/);
    rmSync(path.join(directory, file.name));
    assert.throws(() => assertRecordingAuthorityStage(directory, [file]), /names differ/);
  } finally { rmSync(directory, { recursive: true }); }
});
