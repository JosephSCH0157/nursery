import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { completeYoutubeConnection, disconnectYoutubeConnection, initiateYoutubeConnection, refreshYoutubeConnection, type PublishingRpc } from "../server/publishing/youtube-connection-service";
import { decryptPublishingCredential, encryptPublishingCredential } from "../../../packages/tongs/src/server/publishing-credential-crypto";

process.env.FORGE_PUBLISHING_CREDENTIAL_ENCRYPTION_SECRET = "test-only-publishing-secret-not-for-production";
process.env.FORGE_PUBLISHING_CREDENTIAL_KEY_VERSION = "test-k1";

type Call = { fn: string; params: Record<string, unknown> };
function fakeAuthority() {
  const calls: Call[] = [];
  const destinations = new Map<string, string>();
  let attempt: Record<string, unknown> = {};
  let generation = 0;
  let encryptedRefresh = "";
  const rpc: PublishingRpc = { async rpc(fn, params) {
    calls.push({ fn, params });
    if (fn === "create_publishing_provider_connection_authority") return { data: { disposition: "created", provider_connection_id: "connection-1", credential_authority_id: "credential-1" }, error: null };
    if (fn === "create_publishing_oauth_connection_attempt") { attempt = params; return { data: { disposition: "created", oauth_attempt_id: "attempt-1", connection_id: "connection-1" }, error: null }; }
    if (fn === "consume_publishing_oauth_connection_attempt") return { data: { disposition: "consumed", oauth_attempt_id: "attempt-1", connection_id: "connection-1", owner_user_id: "user-1", encrypted_pkce_verifier: attempt.p_encrypted_pkce_verifier, encryption_key_version: attempt.p_encryption_key_version, ciphertext_version: attempt.p_ciphertext_version }, error: null };
    if (fn === "get_publishing_credential_execution_authority") return { data: { connection_id: "connection-1", owner_user_id: "user-1", provider: "google", credential_authority_id: "credential-1", generation, encrypted_refresh_token: encryptedRefresh, encryption_key_version: "test-k1", ciphertext_version: "v1" }, error: null };
    if (fn === "commit_publishing_credential_generation") { assert.equal(params.p_expected_generation, generation); generation += 1; encryptedRefresh = String(params.p_encrypted_refresh_token); return { data: { disposition: "committed", generation }, error: null }; }
    if (fn === "record_publishing_provider_account") return { data: { disposition: "recorded", provider_account_id: "account-1" }, error: null };
    if (fn === "record_publishing_executable_destination") { const native = String(params.p_external_destination_id); const id = destinations.get(native) ?? `destination-${destinations.size + 1}`; destinations.set(native, id); return { data: { disposition: "recorded", executable_destination_id: id }, error: null }; }
    if (fn === "get_publishing_destination_capability_head") return { data: { capability_revision: generation > 1 ? 1 : 0 }, error: null };
    if (fn === "commit_publishing_destination_capability_revision") return { data: { disposition: generation > 1 ? "no_change" : "committed", revision: 1 }, error: null };
    if (fn === "complete_publishing_oauth_connection_attempt") return { data: { disposition: "completed", success: params.p_success }, error: null };
    if (fn === "set_publishing_provider_connection_state") return { data: { disposition: "committed" }, error: null };
    return { data: { disposition: "prepared" }, error: null };
  } };
  return { rpc, calls, generation: () => generation };
}

function googleFetch(): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "access-secret", refresh_token: init?.body?.toString().includes("authorization_code") ? "refresh-secret" : undefined, expires_in: 3600, scope: "openid email https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload" });
    if (url.includes("openidconnect.googleapis.com")) return Response.json({ sub: "google-subject-1", email: "creator@example.test" });
    if (url.includes("youtube/v3/channels")) return Response.json({ items: [{ id: "UC_A", snippet: { title: "Channel A" } }, { id: "UC_B", snippet: { title: "Channel B" } }] });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

const config = { clientId: "client-id", clientSecret: "server-secret", redirectUri: "https://forge.example/.netlify/functions/publishing-youtube-callback", fetchImpl: googleFetch() };

test("OAuth creates a connection and PKCE attempt without selecting workspace or destination", async () => {
  const authority = fakeAuthority();
  const result = await initiateYoutubeConnection({ rpc: authority.rpc, ownerUserId: "user-1", config });
  const url = new URL(result.authorizationUrl);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("include_granted_scopes"), "true");
  const attempt = authority.calls.find((call) => call.fn === "create_publishing_oauth_connection_attempt")!;
  assert.ok(String(attempt.params.p_state_hash).match(/^[a-f0-9]{64}$/));
  assert.equal("workspace_id" in attempt.params, false);
  assert.equal("destination_id" in attempt.params, false);
});

test("callback persists two stable destinations and capabilities but never grants one", async () => {
  const authority = fakeAuthority();
  const opened = await initiateYoutubeConnection({ rpc: authority.rpc, ownerUserId: "user-1", config });
  const state = new URL(opened.authorizationUrl).searchParams.get("state")!;
  const result = await completeYoutubeConnection({ rpc: authority.rpc, code: "one-time-code", state, config });
  assert.deepEqual(result.destinationIds, ["destination-1", "destination-2"]);
  assert.equal(authority.generation(), 1);
  assert.equal(authority.calls.filter((call) => call.fn === "commit_publishing_destination_capability_revision").length, 2);
  assert.equal(authority.calls.some((call) => call.fn === "set_publishing_workspace_destination_grant"), false);
  assert.equal(JSON.stringify(result).includes("secret"), false);

  const refreshed = await refreshYoutubeConnection({ rpc: authority.rpc, ownerUserId: "user-1", connectionId: "connection-1", config });
  assert.deepEqual(refreshed.destinationIds, result.destinationIds);
  assert.equal(authority.generation(), 2);
});

test("provider revocation preserves the prior credential generation and disables the connection", async () => {
  const authority = fakeAuthority();
  const opened = await initiateYoutubeConnection({ rpc: authority.rpc, ownerUserId: "user-1", config });
  await completeYoutubeConnection({ rpc: authority.rpc, code: "one-time-code", state: new URL(opened.authorizationUrl).searchParams.get("state")!, config });
  const priorGeneration = authority.generation();
  const revokedFetch = (async (input: string | URL | Request) => String(input).includes("oauth2.googleapis.com/token")
    ? Response.json({ error: "invalid_grant" }, { status: 400 })
    : new Response("unexpected", { status: 500 })) as typeof fetch;
  await assert.rejects(() => refreshYoutubeConnection({ rpc: authority.rpc, ownerUserId: "user-1", connectionId: "connection-1", config: { ...config, fetchImpl: revokedFetch } }), /youtube_connection_revoked/);
  assert.equal(authority.generation(), priorGeneration);
  const transition = authority.calls.findLast((call) => call.fn === "set_publishing_provider_connection_state");
  assert.equal(transition?.params.p_connection_state, "revoked");
  assert.equal(transition?.params.p_credential_state, "revoked");
});

test("disconnect revokes server-side credentials and returns only safe confirmation", async () => {
  const authority = fakeAuthority();
  const opened = await initiateYoutubeConnection({ rpc: authority.rpc, ownerUserId: "user-1", config });
  await completeYoutubeConnection({ rpc: authority.rpc, code: "one-time-code", state: new URL(opened.authorizationUrl).searchParams.get("state")!, config });
  let revokeBody = "";
  const result = await disconnectYoutubeConnection({ rpc: authority.rpc, ownerUserId: "user-1", connectionId: "connection-1", config: { ...config, fetchImpl: (async (_input, init) => { revokeBody = String(init?.body); return new Response(null, { status: 200 }); }) as typeof fetch } });
  assert.equal(result.providerRevocationConfirmed, true);
  assert.match(revokeBody, /^token=/);
  const transition = authority.calls.findLast((call) => call.fn === "set_publishing_provider_connection_state");
  assert.equal(transition?.params.p_connection_state, "revoked");
  assert.doesNotMatch(JSON.stringify(result), /token|secret|cipher/i);
});

test("migration makes OAuth state single-use, expiring, server-only, and context-bound", async () => {
  const sql = await readFile(new URL("../../../supabase/migrations/20260828100000_tongs_youtube_connection_vertical_s5_2c.sql", import.meta.url), "utf8");
  assert.match(sql, /state_hash text not null unique/);
  assert.match(sql, /v_attempt\.state<>'pending'.*oauth_state_replayed/s);
  assert.match(sql, /v_attempt\.expires_at<=now\(\).*oauth_state_expired/s);
  assert.match(sql, /v_attempt\.provider<>p_provider or v_attempt\.expected_redirect_uri<>p_expected_redirect_uri/);
  assert.match(sql, /No authenticated policy: PKCE verifier ciphertext and state evidence are server-only/);
  assert.doesNotMatch(sql, /grant .*publishing_oauth_connection_attempts.*authenticated/i);
  assert.doesNotMatch(sql, /\bend \$\$;/);
});

test("public handler contracts reject callback authority injection and never return tokens", async () => {
  const handler = await readFile(new URL("../server/publishing/create-youtube-connection-handler.ts", import.meta.url), "utf8");
  assert.match(handler, /url\.searchParams\.has\("workspace_id"\)/);
  assert.match(handler, /destination_selected: false/);
  assert.doesNotMatch(handler, /refresh_token|access_token|encrypted_refresh_token|encrypted_access_token/);
});

test("versioned keyring decrypts K1 evidence after K2 becomes current", () => {
  const priorVersion = process.env.FORGE_PUBLISHING_CREDENTIAL_KEY_VERSION;
  const priorKeyring = process.env.FORGE_PUBLISHING_CREDENTIAL_ENCRYPTION_KEYS;
  try {
    process.env.FORGE_PUBLISHING_CREDENTIAL_ENCRYPTION_KEYS = JSON.stringify({ k1: "old-secret", k2: "new-secret" });
    process.env.FORGE_PUBLISHING_CREDENTIAL_KEY_VERSION = "k1";
    const old = encryptPublishingCredential("refresh-generation-1");
    process.env.FORGE_PUBLISHING_CREDENTIAL_KEY_VERSION = "k2";
    assert.equal(decryptPublishingCredential(old), "refresh-generation-1");
    assert.equal(encryptPublishingCredential("refresh-generation-2").encryptionKeyVersion, "k2");
  } finally {
    if (priorVersion == null) delete process.env.FORGE_PUBLISHING_CREDENTIAL_KEY_VERSION; else process.env.FORGE_PUBLISHING_CREDENTIAL_KEY_VERSION = priorVersion;
    if (priorKeyring == null) delete process.env.FORGE_PUBLISHING_CREDENTIAL_ENCRYPTION_KEYS; else process.env.FORGE_PUBLISHING_CREDENTIAL_ENCRYPTION_KEYS = priorKeyring;
  }
});
