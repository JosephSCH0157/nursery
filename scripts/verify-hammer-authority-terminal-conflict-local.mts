import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const projectId = process.env.FORGE_DISPOSABLE_PROJECT_ID ?? "";
const workdir = process.env.FORGE_DISPOSABLE_WORKDIR ?? "";
assert.match(projectId, /^forge-authority-conflict-[a-z0-9-]+$/);
assert.ok(workdir.includes(projectId));
assert.notEqual(projectId, "wtvdjndyxegudufrompx");

async function principal(admin: SupabaseClient, apiUrl: string, anonKey: string, label: string) {
  const email = `${label}-${crypto.randomUUID()}@example.invalid`;
  const password = `Cp5-${crypto.randomUUID()}!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  assert.ok(created.data.user);
  const client = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signed.error);
  return { id: created.data.user.id, client };
}

async function main() {
  const apiUrl = process.env.FORGE_LOCAL_API_URL ?? "";
  const anonKey = process.env.FORGE_LOCAL_ANON_KEY ?? "";
  const serviceRoleKey = process.env.FORGE_LOCAL_SERVICE_ROLE_KEY ?? "";
  assert.equal(new URL(apiUrl).hostname, "127.0.0.1");
  const admin = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const editor = await principal(admin, apiUrl, anonKey, "editor");
  const viewer = await principal(admin, apiUrl, anonKey, "viewer");
  const outsider = await principal(admin, apiUrl, anonKey, "outsider");
  const ids = {
    workspace: "81000000-0000-4000-8000-000000000001",
    otherWorkspace: "82000000-0000-4000-8000-000000000002",
    workpiece: "83000000-0000-4000-8000-000000000003",
    recording: "84000000-0000-4000-8000-000000000004",
  };
  const forbidden = ["494c2ae5-9037-4208-b898-fab4898ab430", "85d076d6-54e6-4b56-ab60-5eff4c87cdd0", "6c5b0d00-f775-4611-ac67-284dd9ae7d39", "f642b5d9-cec2-4656-804e-49bb33bc0cb5", "93dacc5a-e9f0-41f8-bc58-0b6ab9b199c2"];
  for (const id of Object.values(ids)) assert.ok(!forbidden.includes(id));
  const org = await admin.schema("tongs").from("orgs").insert({ name: "Terminal conflict fixture", created_by: editor.id }).select("id").single();
  assert.ifError(org.error);
  const otherOrg = await admin.schema("tongs").from("orgs").insert({ name: "Other fixture", created_by: outsider.id }).select("id").single();
  assert.ifError(otherOrg.error);
  assert.ifError((await admin.schema("tongs").from("workspaces").insert([
    { id: ids.workspace, name: "Authority conflict", created_by: editor.id, org_id: org.data.id },
    { id: ids.otherWorkspace, name: "Other", created_by: outsider.id, org_id: otherOrg.data.id },
  ])).error);
  assert.ifError((await admin.schema("tongs").from("workspace_members").upsert([
    { workspace_id: ids.workspace, user_id: editor.id, role: "owner", created_by: editor.id },
    { workspace_id: ids.workspace, user_id: viewer.id, role: "viewer", created_by: editor.id },
  ])).error);
  assert.ifError((await admin.schema("tongs").from("episodes").insert({ id: ids.workpiece, workspace_id: ids.workspace, label: "Synthetic authority conflict" })).error);
  assert.ifError((await admin.schema("tongs").from("canonical_recordings").insert({ id: ids.recording, workspace_id: ids.workspace, workpiece_id: ids.workpiece, status: "sealed", media_path: "synthetic/cp5.wav", media_id: "synthetic:cp5", created_by: editor.id, updated_by: editor.id, sealed_at: "2026-08-19T12:00:00Z" })).error);

  const revisions = [
    ["85000000-0000-4000-8000-000000000005", "active", null, null, 0, "2026-08-19T12:00:00Z"],
    ["86000000-0000-4000-8000-000000000006", "discarded", null, null, 0, "2026-08-19T12:00:00Z"],
    ["87000000-0000-4000-8000-000000000007", "superseded", null, null, 0, "2026-08-19T12:00:00Z"],
    ["88000000-0000-4000-8000-000000000008", "active", null, null, 0, "2026-08-19T12:00:01Z"],
    ["89000000-0000-4000-8000-000000000009", "active", "hammer/revisions/prior/editorial-authority.v1.json", "a".repeat(64), 2, "2026-08-19T12:00:02Z"],
    ["8a000000-0000-4000-8000-00000000000a", "active", null, "b".repeat(64), 0, "2026-08-19T12:00:03Z"],
  ] as const;
  assert.ifError((await admin.schema("tongs").from("recording_revisions").insert(revisions.map(([id, status, path, fingerprint, authorityRevision, updatedAt]) => ({ id, workspace_id: ids.workspace, workpiece_id: ids.workpiece, canonical_recording_id: ids.recording, status, editorial_authority_path: path, editorial_authority_fingerprint: fingerprint, editorial_authority_revision: authorityRevision, created_by: editor.id, updated_by: editor.id, updated_at: updatedAt })))).error);

  const rpc = (client: SupabaseClient, revisionId: string, overrides: Record<string, unknown> = {}) => client.schema("tongs").rpc("acknowledge_hammer_editorial_authority", {
    p_workspace_id: ids.workspace, p_workpiece_id: ids.workpiece, p_canonical_recording_id: ids.recording,
    p_revision_id: revisionId, p_path: `hammer/revisions/${revisionId}/editorial-authority.v1.json`,
    p_fingerprint: "c".repeat(64), p_expected_revision_updated_at: "2026-08-19T12:00:00Z",
    p_expected_authority_revision: 0, p_expected_authority_path: null, ...overrides,
  });
  async function conflict(name: string, revisionId: string, overrides: Record<string, unknown> = {}) {
    const before = await admin.schema("tongs").from("recording_revisions").select("editorial_authority_path,editorial_authority_fingerprint,editorial_authority_revision,updated_at").eq("id", revisionId).single();
    const started = performance.now();
    const result = await rpc(editor.client, revisionId, overrides);
    const latencyMs = Math.round(performance.now() - started);
    assert.equal(result.error?.code, "PT409", `${name} did not return PT409`);
    assert.equal(result.error?.message, "editorial_authority_conflict");
    assert.ok(latencyMs < 2000, `${name} took ${latencyMs}ms`);
    const after = await admin.schema("tongs").from("recording_revisions").select("editorial_authority_path,editorial_authority_fingerprint,editorial_authority_revision,updated_at").eq("id", revisionId).single();
    assert.deepEqual(after.data, before.data);
    return { status: 409, code: result.error.code, message: result.error.message, latency_ms: latencyMs, tuple_unchanged: true };
  }

  const success = await rpc(editor.client, revisions[0][0]);
  assert.ifError(success.error);
  assert.equal(success.data.authority_revision, 1);
  const cases = {
    inactive: await conflict("inactive", revisions[1][0]),
    superseded: await conflict("superseded", revisions[2][0]),
    stale_row_token: await conflict("stale row token", revisions[3][0]),
    stale_prior_path: await conflict("stale prior path", revisions[4][0], { p_expected_revision_updated_at: revisions[4][5], p_expected_authority_revision: 2, p_expected_authority_path: null }),
    stale_prior_fingerprint: await conflict("stale prior fingerprint", revisions[5][0]),
    stale_authority_revision: await conflict("stale authority revision", revisions[4][0], { p_expected_revision_updated_at: revisions[4][5], p_expected_authority_revision: 1, p_expected_authority_path: revisions[4][2] }),
  };
  const staleSuccess = await rpc(editor.client, revisions[0][0]);
  assert.equal(staleSuccess.error?.code, "PT409");

  const auth: Record<string, { code: string; latency_ms: number }> = {};
  for (const [name, client] of [["viewer", viewer.client], ["anonymous", createClient(apiUrl, anonKey)], ["cross_workspace", outsider.client]] as const) {
    const started = performance.now();
    const result = await rpc(client, revisions[3][0]);
    const latencyMs = Math.round(performance.now() - started);
    assert.ok(result.error);
    assert.notEqual(result.error.code, "PT409");
    assert.ok(["42501", "PGRST301"].includes(result.error.code));
    assert.ok(latencyMs < 2000);
    auth[name] = { code: result.error.code, latency_ms: latencyMs };
  }
  const invalidPath = await rpc(editor.client, revisions[3][0], { p_path: "hammer/not-canonical.json" });
  assert.equal(invalidPath.error?.code, "22023");
  assert.equal(invalidPath.error?.message, "editorial_authority_path_invalid");
  const identityMismatch = await rpc(editor.client, revisions[3][0], { p_workpiece_id: crypto.randomUUID() });
  assert.equal(identityMismatch.error?.code, "PT409");

  const direct = await editor.client.schema("tongs").from("recording_revisions").update({ label: "forbidden" }).eq("id", revisions[0][0]);
  assert.ok(direct.error);
  process.stdout.write(`${JSON.stringify({ project_id: projectId, endpoint: apiUrl, migration: "20260819120000", success: { authority_revision: success.data.authority_revision }, conflicts: cases, repeated_success_attempt: { code: staleSuccess.error.code }, authorization: auth, invalid_path: { code: invalidPath.error.code, message: invalidPath.error.message }, identity_mismatch: { code: identityMismatch.error.code, message: identityMismatch.error.message }, direct_update_denied: true }, null, 2)}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
