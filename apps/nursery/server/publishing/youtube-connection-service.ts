import crypto from "node:crypto";
import {
  decryptPublishingCredential,
  encryptPublishingCredential,
  type PublishingCiphertext,
} from "../../../../packages/tongs/src/server/publishing-credential-crypto";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke";
const YOUTUBE_CHANNELS = "https://www.googleapis.com/youtube/v3/channels?part=id,snippet,status&mine=true&maxResults=50";
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/youtube.upload"];

type RpcResult = { data: unknown; error: { message: string } | null };
export type PublishingRpc = { rpc(fn: string, params: Record<string, unknown>): Promise<RpcResult> };
type Json = Record<string, unknown>;

export type YoutubeConnectionConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

function object(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function string(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function number(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function hash(value: string): string { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }
function base64Url(value: Buffer): string { return value.toString("base64url"); }
function safeCode(error: unknown): string { return error instanceof YoutubeConnectionError ? error.code : "youtube_connection_failed"; }

export class YoutubeConnectionError extends Error {
  constructor(readonly code: string, message = code) { super(message); }
}

async function rpc(rpcClient: PublishingRpc, fn: string, params: Record<string, unknown>): Promise<Json> {
  const result = await rpcClient.rpc(fn, params);
  if (result.error) throw new YoutubeConnectionError("publishing_authority_rpc_failed", result.error.message);
  const body = object(result.data);
  if (string(body.disposition) && !["created", "prepared", "consumed", "committed", "recorded", "completed", "no_change"].includes(String(body.disposition))) {
    throw new YoutubeConnectionError(string(body.code) ?? "publishing_authority_blocked");
  }
  return body;
}

async function jsonFetch(fetchImpl: typeof fetch, url: string, init: RequestInit, code: string): Promise<Json> {
  const response = await fetchImpl(url, init);
  let body: unknown = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    const providerCode = string(object(body).error);
    if (code === "youtube_token_refresh_failed" && providerCode === "invalid_grant") throw new YoutubeConnectionError("youtube_connection_revoked");
    throw new YoutubeConnectionError(code, string(object(body).error_description) ?? providerCode ?? code);
  }
  return object(body);
}

function tokenCipher(value: string): PublishingCiphertext { return encryptPublishingCredential(value); }

export async function initiateYoutubeConnection(args: {
  rpc: PublishingRpc; ownerUserId: string; config: YoutubeConnectionConfig; reconnectConnectionId?: string | null;
}): Promise<{ authorizationUrl: string; connectionId: string; expiresAt: string }> {
  const now = args.config.now?.() ?? new Date();
  let connectionId = args.reconnectConnectionId ?? null;
  if (connectionId) {
    await rpc(args.rpc, "prepare_publishing_connection_reauthorization", { p_owner_user_id: args.ownerUserId, p_connection_id: connectionId });
  } else {
    const created = await rpc(args.rpc, "create_publishing_provider_connection_authority", { p_owner_user_id: args.ownerUserId, p_provider: "google" });
    connectionId = string(created.provider_connection_id);
  }
  if (!connectionId) throw new YoutubeConnectionError("connection_creation_invalid");
  const state = base64Url(crypto.randomBytes(32));
  const verifier = base64Url(crypto.randomBytes(48));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  const encrypted = tokenCipher(verifier);
  const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  await rpc(args.rpc, "create_publishing_oauth_connection_attempt", {
    p_owner_user_id: args.ownerUserId, p_connection_id: connectionId, p_state_hash: hash(state),
    p_encrypted_pkce_verifier: encrypted.ciphertext, p_encryption_key_version: encrypted.encryptionKeyVersion,
    p_ciphertext_version: encrypted.ciphertextVersion, p_expected_redirect_uri: args.config.redirectUri, p_expires_at: expiresAt,
  });
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set("client_id", args.config.clientId);
  url.searchParams.set("redirect_uri", args.config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  return { authorizationUrl: url.toString(), connectionId, expiresAt };
}

type TokenResult = { accessToken: string; refreshToken: string; expiresAt: string | null; scopes: string[] };
function normalizeToken(body: Json, priorRefreshToken?: string, priorScopes: string[] = []): TokenResult {
  const accessToken = string(body.access_token);
  const refreshToken = string(body.refresh_token) ?? priorRefreshToken ?? null;
  if (!accessToken || !refreshToken) throw new YoutubeConnectionError("youtube_token_response_invalid");
  const scopes = (string(body.scope) ?? "").split(/\s+/).filter(Boolean);
  if (!scopes.length) scopes.push(...priorScopes);
  const normalizedScopes = [...new Set(scopes)].sort();
  for (const required of ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/youtube.upload"]) {
    if (!normalizedScopes.includes(required)) throw new YoutubeConnectionError("youtube_scope_insufficient");
  }
  const seconds = number(body.expires_in);
  return { accessToken, refreshToken, scopes: normalizedScopes, expiresAt: seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null };
}

async function discoverAndPersist(args: { rpc: PublishingRpc; fetchImpl: typeof fetch; connectionId: string; credentialAuthorityId: string; expectedGeneration: number; token: TokenResult }): Promise<{ destinationIds: string[] }> {
  const headers = { authorization: `Bearer ${args.token.accessToken}`, accept: "application/json" };
  const profile = await jsonFetch(args.fetchImpl, GOOGLE_USERINFO, { headers }, "youtube_identity_discovery_failed");
  const subject = string(profile.sub);
  if (!subject) throw new YoutubeConnectionError("youtube_provider_account_invalid");
  const identityHash = hash(`google:${subject}`);
  const refresh = tokenCipher(args.token.refreshToken);
  const access = tokenCipher(args.token.accessToken);
  await rpc(args.rpc, "commit_publishing_credential_generation", {
    p_credential_authority_id: args.credentialAuthorityId, p_expected_generation: args.expectedGeneration,
    p_encryption_key_version: refresh.encryptionKeyVersion, p_ciphertext_version: refresh.ciphertextVersion,
    p_encrypted_refresh_token: refresh.ciphertext, p_encrypted_access_token: access.ciphertext,
    p_access_token_expires_at: args.token.expiresAt, p_granted_scopes: args.token.scopes,
    p_provider_grant_identity_hash: identityHash, p_validated_at: new Date().toISOString(),
  });
  const account = await rpc(args.rpc, "record_publishing_provider_account", {
    p_connection_id: args.connectionId, p_external_account_id: subject,
    p_display_label: string(profile.email) ?? "Google account", p_state: "active", p_observed_at: new Date().toISOString(),
  });
  const accountId = string(account.provider_account_id);
  if (!accountId) throw new YoutubeConnectionError("youtube_provider_account_persistence_invalid");
  const channels = await jsonFetch(args.fetchImpl, YOUTUBE_CHANNELS, { headers }, "youtube_destination_discovery_failed");
  const items = Array.isArray(channels.items) ? channels.items.map(object) : [];
  if (!items.length) throw new YoutubeConnectionError("youtube_destination_missing");
  const destinationIds: string[] = [];
  for (const item of items) {
    const channelId = string(item.id);
    if (!channelId) continue;
    const snippet = object(item.snippet);
    const recorded = await rpc(args.rpc, "record_publishing_executable_destination", {
      p_provider_account_id: accountId, p_destination_kind: "channel", p_external_destination_id: channelId,
      p_display_label: string(snippet.title) ?? `YouTube channel ${channelId}`, p_state: "active", p_observed_at: new Date().toISOString(),
    });
    const destinationId = string(recorded.executable_destination_id);
    if (!destinationId) continue;
    const head = await rpc(args.rpc, "get_publishing_destination_capability_head", { p_destination_id: destinationId });
    await rpc(args.rpc, "commit_publishing_destination_capability_revision", {
      p_destination_id: destinationId, p_expected_revision: number(head.capability_revision), p_contract_version: "youtube-destination-capabilities/v1",
      p_observation_source: "provider_api", p_capabilities: { video_upload: true, channel_id: channelId, scopes: args.token.scopes, scheduling: true, thumbnail_upload: true },
      p_adapter_id: "youtube-data-api-v3", p_adapter_version: "v3", p_observed_at: new Date().toISOString(),
    });
    destinationIds.push(destinationId);
  }
  if (!destinationIds.length) throw new YoutubeConnectionError("youtube_destination_identity_invalid");
  return { destinationIds };
}

export async function completeYoutubeConnection(args: { rpc: PublishingRpc; code: string; state: string; config: YoutubeConnectionConfig }): Promise<{ connectionId: string; destinationIds: string[] }> {
  const fetchImpl = args.config.fetchImpl ?? fetch;
  const consumed = await rpc(args.rpc, "consume_publishing_oauth_connection_attempt", { p_provider: "google", p_state_hash: hash(args.state), p_expected_redirect_uri: args.config.redirectUri });
  const attemptId = string(consumed.oauth_attempt_id);
  const connectionId = string(consumed.connection_id);
  const ownerUserId = string(consumed.owner_user_id);
  try {
    if (!attemptId || !connectionId) throw new YoutubeConnectionError("oauth_attempt_receipt_invalid");
    const verifier = decryptPublishingCredential({ ciphertext: String(consumed.encrypted_pkce_verifier), encryptionKeyVersion: String(consumed.encryption_key_version), ciphertextVersion: String(consumed.ciphertext_version) });
    const tokenBody = await jsonFetch(fetchImpl, GOOGLE_TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams({ client_id: args.config.clientId, client_secret: args.config.clientSecret, code: args.code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: args.config.redirectUri }) }, "youtube_token_exchange_failed");
    const token = normalizeToken(tokenBody);
    const execution = await rpc(args.rpc, "get_publishing_credential_execution_authority", { p_connection_id: connectionId });
    const credentialAuthorityId = string(execution.credential_authority_id);
    if (!credentialAuthorityId) throw new YoutubeConnectionError("credential_authority_missing");
    const discovered = await discoverAndPersist({ rpc: args.rpc, fetchImpl, connectionId, credentialAuthorityId, expectedGeneration: number(execution.generation), token });
    await rpc(args.rpc, "complete_publishing_oauth_connection_attempt", { p_attempt_id: attemptId, p_success: true, p_failure_code: null });
    return { connectionId, destinationIds: discovered.destinationIds };
  } catch (error) {
    if (attemptId) await rpc(args.rpc, "complete_publishing_oauth_connection_attempt", { p_attempt_id: attemptId, p_success: false, p_failure_code: safeCode(error) }).catch(() => undefined);
    if (connectionId && ownerUserId) await rpc(args.rpc, "set_publishing_provider_connection_state", { p_actor_user_id: ownerUserId, p_connection_id: connectionId, p_connection_state: "invalid", p_credential_state: "invalid", p_reason: safeCode(error) }).catch(() => undefined);
    throw error;
  }
}

export async function rejectYoutubeConnectionCallback(args: { rpc: PublishingRpc; state: string; providerError: string; config: YoutubeConnectionConfig }): Promise<void> {
  const consumed = await rpc(args.rpc, "consume_publishing_oauth_connection_attempt", { p_provider: "google", p_state_hash: hash(args.state), p_expected_redirect_uri: args.config.redirectUri });
  const attemptId = string(consumed.oauth_attempt_id), connectionId = string(consumed.connection_id), ownerUserId = string(consumed.owner_user_id);
  const code = args.providerError === "access_denied" ? "oauth_access_denied" : "oauth_provider_error";
  if (attemptId) await rpc(args.rpc, "complete_publishing_oauth_connection_attempt", { p_attempt_id: attemptId, p_success: false, p_failure_code: code });
  if (connectionId && ownerUserId) await rpc(args.rpc, "set_publishing_provider_connection_state", { p_actor_user_id: ownerUserId, p_connection_id: connectionId, p_connection_state: "invalid", p_credential_state: "invalid", p_reason: code });
}

export async function refreshYoutubeConnection(args: { rpc: PublishingRpc; ownerUserId: string; connectionId: string; config: YoutubeConnectionConfig }): Promise<{ connectionId: string; destinationIds: string[] }> {
  const fetchImpl = args.config.fetchImpl ?? fetch;
  const execution = await rpc(args.rpc, "get_publishing_credential_execution_authority", { p_connection_id: args.connectionId });
  if (string(execution.owner_user_id) !== args.ownerUserId || string(execution.provider) !== "google") throw new YoutubeConnectionError("connection_owner_required");
  const prior = decryptPublishingCredential({ ciphertext: String(execution.encrypted_refresh_token), encryptionKeyVersion: String(execution.encryption_key_version), ciphertextVersion: String(execution.ciphertext_version) });
  try {
    const tokenBody = await jsonFetch(fetchImpl, GOOGLE_TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams({ client_id: args.config.clientId, client_secret: args.config.clientSecret, refresh_token: prior, grant_type: "refresh_token" }) }, "youtube_token_refresh_failed");
    const token = normalizeToken(tokenBody, prior, Array.isArray(execution.granted_scopes) ? execution.granted_scopes.filter((value): value is string => typeof value === "string") : []);
    const discovered = await discoverAndPersist({ rpc: args.rpc, fetchImpl, connectionId: args.connectionId, credentialAuthorityId: String(execution.credential_authority_id), expectedGeneration: number(execution.generation), token });
    return { connectionId: args.connectionId, destinationIds: discovered.destinationIds };
  } catch (error) {
    const state = safeCode(error) === "youtube_connection_revoked" ? "revoked" : safeCode(error) === "youtube_scope_insufficient" ? "invalid" : "refresh_required";
    await rpc(args.rpc, "set_publishing_provider_connection_state", { p_actor_user_id: args.ownerUserId, p_connection_id: args.connectionId, p_connection_state: state, p_credential_state: state === "revoked" ? "revoked" : state === "invalid" ? "invalid" : "refresh_required", p_reason: safeCode(error) });
    throw error;
  }
}

export async function disconnectYoutubeConnection(args: { rpc: PublishingRpc; ownerUserId: string; connectionId: string; config: YoutubeConnectionConfig }): Promise<{ providerRevocationConfirmed: boolean }> {
  const execution = await rpc(args.rpc, "get_publishing_credential_execution_authority", { p_connection_id: args.connectionId });
  if (string(execution.owner_user_id) !== args.ownerUserId || string(execution.provider) !== "google") throw new YoutubeConnectionError("connection_owner_required");
  let providerRevocationConfirmed = false;
  try {
    const refreshToken = decryptPublishingCredential({ ciphertext: String(execution.encrypted_refresh_token), encryptionKeyVersion: String(execution.encryption_key_version), ciphertextVersion: String(execution.ciphertext_version) });
    const response = await (args.config.fetchImpl ?? fetch)(GOOGLE_REVOKE, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams({ token: refreshToken }) });
    providerRevocationConfirmed = response.ok;
  } catch { providerRevocationConfirmed = false; }
  await rpc(args.rpc, "set_publishing_provider_connection_state", { p_actor_user_id: args.ownerUserId, p_connection_id: args.connectionId, p_connection_state: "revoked", p_credential_state: "revoked", p_reason: providerRevocationConfirmed ? "provider_revocation_confirmed" : "local_revocation_enforced" });
  return { providerRevocationConfirmed };
}
