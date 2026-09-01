import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  BROWSER_FIXTURE_NAMESPACE,
  BROWSER_FIXTURE_SCHEMA,
  assertNonProductionTarget,
  deterministicFixtureUuid,
  sanitizeFixtureDiagnostic,
  validateBrowserFixtureManifest,
} from "../scripts/browser-fixture-authority.mts";

test("Hammer fixture timeline uses the current packaging source authority", async () => {
  const source = await readFile(new URL("../scripts/browser-fixture-authority.mts", import.meta.url), "utf8");
  assert.match(source, /source_mode:\s*["']packaging["']/);
  assert.match(source, /packaging:\s*\{\s*version:\s*1,\s*intro_asset_id:\s*null,\s*outro_asset_id:\s*null/);
  assert.doesNotMatch(source, /source_mode:\s*["']canonical["']/);
});

test("Hammer fixture seeds a reusable canonical speaker-turn transcript", async () => {
  const source = await readFile(new URL("../scripts/browser-fixture-authority.mts", import.meta.url), "utf8");
  assert.match(source, /structure:\s*["']speaker_turns["']/);
  assert.match(source, /label_scheme:\s*["']forge-neutral-speakers\.v1["']/);
  assert.match(source, /speaker:\s*index % 2 \? ["']S2["'] : ["']S1["']/);
  assert.match(source, /media_signature:\s*mediaSignature/);
});

test("Hearth fixtures seed recording-valid speaker blocks", async () => {
  const source = await readFile(new URL("../scripts/browser-fixture-authority.mts", import.meta.url), "utf8");
  assert.match(source, /const script = `\[s1\]\\n/);
  assert.match(source, /\\n\[\/s1\]\\n`/);
  assert.match(source, /body:\s*handoffScript/);
  assert.match(source, /hearth\/drafts\.v1\.json/);
});

test("non-production guard allows local and explicit remote project refs", () => {
  assert.equal(assertNonProductionTarget("http://127.0.0.1:54321", null), "local");
  assert.equal(assertNonProductionTarget("https://test-project.supabase.co", "other,test-project"), "test-project");
  assert.throws(() => assertNonProductionTarget("https://production.supabase.co", "test-project"), /Refusing browser fixture mutation/);
  assert.throws(() => assertNonProductionTarget("https://example.com", "example"), /Unsupported Supabase host/);
});

test("deterministic fixture UUIDs are stable, distinct, and valid v5 UUIDs", () => {
  const first = deterministicFixtureUuid("workspace");
  assert.equal(first, deterministicFixtureUuid("workspace"));
  assert.notEqual(first, deterministicFixtureUuid("hammer"));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("diagnostics recursively redact every credential-shaped field", () => {
  const sanitized = sanitizeFixtureDiagnostic({ password: "secret", nested: { access_token: "token", serviceKey: "key", harmless: "ok" } });
  assert.deepEqual(sanitized, { password: "[redacted]", nested: { access_token: "[redacted]", serviceKey: "[redacted]", harmless: "ok" } });
});

test("manifest validation binds schema, project, identities, and two Ready candidates", () => {
  const id = (key: string) => deterministicFixtureUuid(key);
  const prefix = "test-project";
  const manifest = { schema_version: BROWSER_FIXTURE_SCHEMA, fixture_namespace: BROWSER_FIXTURE_NAMESPACE, project_ref: prefix, user_id: id("user"), org_id: id(`${prefix}:org`), workspace_id: id(`${prefix}:workspace`), hearth_workpiece_id: id(`${prefix}:hearth`), ready_workpiece_ids: [id(`${prefix}:ready:1`), id(`${prefix}:ready:2`)], hammer_workpiece_id: id(`${prefix}:hammer`), hammer_recording_id: id(`${prefix}:hammer:recording`), hammer_revision_id: id(`${prefix}:hammer:revision`), artifact_hashes: {}, provisioned_at: new Date(0).toISOString(), verified_at: null };
  assert.equal(validateBrowserFixtureManifest(manifest, "test-project").workspace_id, manifest.workspace_id);
  assert.throws(() => validateBrowserFixtureManifest({ ...manifest, project_ref: "wrong" }, "test-project"), /different Supabase project/);
  assert.throws(() => validateBrowserFixtureManifest({ ...manifest, ready_workpiece_ids: [id("one")] }), /invalid Ready workpieces/);
  assert.throws(() => validateBrowserFixtureManifest({ ...manifest, schema_version: "v0" }), /obsolete/);
});
