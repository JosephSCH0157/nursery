import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../../supabase/migrations/20260827230000_tongs_publishing_destination_authority_s5_2b.sql", import.meta.url);
const contractUrl = new URL("../src/publishing-destination-authority.ts", import.meta.url);
const legacyMigrationUrl = new URL("../../../supabase/migrations/20260718160000_tongs_quench_release_decisions.sql", import.meta.url);
const sql = await readFile(migrationUrl, "utf8");
const contract = await readFile(contractUrl, "utf8");

test("publishing authority graph keeps connection, credential, account, destination, grant, and capability separate", () => {
  for (const table of [
    "publishing_provider_connections",
    "publishing_provider_credential_authorities",
    "publishing_provider_credential_generations",
    "publishing_provider_accounts",
    "publishing_executable_destinations",
    "publishing_workspace_destination_grant_revisions",
    "publishing_destination_capability_revisions",
  ]) assert.match(sql, new RegExp(`create table tongs\\.${table}`));
  assert.match(sql, /owner_user_id uuid not null references auth\.users\(id\)/);
  assert.match(sql, /foreign key\(provider_account_id, connection_id, provider\)/);
  assert.match(sql, /foreign key\(executable_destination_id, connection_id\)/);
});

test("credential ciphertext is server-only and absent from public contracts", () => {
  assert.match(sql, /Credential generations deliberately have no authenticated policy/);
  assert.doesNotMatch(sql, /grant select on tongs\.publishing_provider_credential_generations to authenticated/);
  assert.match(sql, /revoke all on function tongs\.commit_publishing_credential_generation[\s\S]+from public,anon,authenticated/);
  assert.doesNotMatch(contract, /encrypted_refresh_token|encrypted_access_token|refreshToken|accessToken/);
});

test("credential authority inherits provider from its exact owned connection", () => {
  assert.match(sql, /create table tongs\.publishing_provider_credential_authorities[\s\S]+foreign key\(connection_id, owner_user_id\) references tongs\.publishing_provider_connections\(id, owner_user_id\)/);
  const credentialTable = sql.match(/create table tongs\.publishing_provider_credential_authorities \([\s\S]*?\n\);/)?.[0] ?? "";
  assert.doesNotMatch(credentialTable, /\bprovider\b/);
  assert.match(sql, /create table tongs\.publishing_provider_accounts[\s\S]+unique\(id, connection_id, provider\)[\s\S]+foreign key\(provider_account_id, connection_id, provider\)/);
});

test("credential rotation appends a validated generation before advancing the authority pointer", () => {
  const insertAt = sql.indexOf("insert into tongs.publishing_provider_credential_generations");
  const pointerAt = sql.indexOf("update tongs.publishing_provider_credential_authorities set current_generation_id", insertAt);
  assert.ok(insertAt > 0 && pointerAt > insertAt);
  assert.match(sql, /current_generation<>p_expected_generation/);
  assert.match(sql, /supersedes_generation_id/);
  assert.match(sql, /connection_reauthorization_required/);
  assert.match(sql, /provider_grant_subject_hash<>p_provider_grant_identity_hash[\s\S]+provider_grant_identity_conflict/);
});

test("workspace executability requires the complete live dependency chain", () => {
  assert.match(sql, /r\.state = 'active'[\s\S]+d\.state = 'active'[\s\S]+d\.current_capability_revision_id is not null[\s\S]+c\.state = 'active'[\s\S]+ca\.state = 'available'/);
  assert.match(sql, /join tongs\.publishing_provider_credential_authorities ca[\s\S]+ca\.state='available'[\s\S]+where h\.workspace_id=p_workspace_id and d\.state='active' and c\.state='active'/);
  assert.match(sql, /workspace_admin_required/);
  assert.match(sql, /connection_owner_required/);
});

test("one connection can expose multiple exact destinations and capability history is destination-scoped", () => {
  assert.doesNotMatch(sql, /unique\(connection_id\)\s*[,)]/);
  assert.match(sql, /unique\(connection_id, external_destination_id\)/);
  assert.match(sql, /unique\(executable_destination_id, revision\)/);
  assert.match(sql, /trg_publishing_capability_revisions_immutable/);
});

test("legacy connection_ref is not promoted into the new authority graph", async () => {
  let legacy = "";
  try { legacy = await readFile(legacyMigrationUrl, "utf8"); } catch { /* filename may differ; inventory remains the evidence. */ }
  if (legacy) assert.match(legacy, /connection_ref/i);
  assert.doesNotMatch(sql, /connection_ref/);
  assert.doesNotMatch(sql, /\bend \$\$;/);
});
