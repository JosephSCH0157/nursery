import { createClient } from "@supabase/supabase-js";
import {
  completeYoutubeConnection,
  disconnectYoutubeConnection,
  initiateYoutubeConnection,
  refreshYoutubeConnection,
  rejectYoutubeConnectionCallback,
  YoutubeConnectionError,
  type PublishingRpc,
  type YoutubeConnectionConfig,
} from "./youtube-connection-service";

export type YoutubeConnectionRuntimeConfig = YoutubeConnectionConfig & { supabaseUrl: string; serviceRoleKey: string; rpcKey: string };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function bearer(request: Request): string | null { const match = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i); return match?.[1]?.trim() || null; }
async function body(request: Request): Promise<Record<string, unknown>> { try { const value = await request.json(); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; } catch { return {}; } }
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

async function userRpc(config: YoutubeConnectionRuntimeConfig, token: string, fn: string, payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: unknown }> {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: config.rpcKey, authorization: `Bearer ${token}`, "content-profile": "tongs", "accept-profile": "tongs", "content-type": "application/json" }, body: JSON.stringify(payload) });
  let data: unknown = null; try { data = await response.json(); } catch { data = null; }
  return { ok: response.ok, status: response.status, data };
}

export function createYoutubeConnectionHandler(config: YoutubeConnectionRuntimeConfig) {
  const service = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rpcClient = service.schema("tongs") as unknown as PublishingRpc;
  async function user(request: Request): Promise<{ id: string; token: string } | null> {
    const token = bearer(request); if (!token) return null;
    const result = await service.auth.getUser(token); return result.data.user?.id ? { id: result.data.user.id, token } : null;
  }
  return async (request: Request): Promise<Response> => {
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname.endsWith("/publishing-youtube-callback")) {
        if (request.method !== "GET") return json(405, { ok: false, code: "method_not_allowed" });
        const url = new URL(request.url), code = url.searchParams.get("code"), state = url.searchParams.get("state"), providerError = url.searchParams.get("error");
        if (!state || url.searchParams.has("workspace_id") || url.searchParams.has("destination_id")) return json(400, { ok: false, code: "oauth_callback_invalid" });
        if (providerError) { await rejectYoutubeConnectionCallback({ rpc: rpcClient, state, providerError, config }); return json(400, { ok: false, code: providerError === "access_denied" ? "oauth_access_denied" : "oauth_provider_error" }); }
        if (!code) return json(400, { ok: false, code: "oauth_callback_invalid" });
        const result = await completeYoutubeConnection({ rpc: rpcClient, code, state, config });
        return json(200, { ok: true, connection_id: result.connectionId, discovered_destination_ids: result.destinationIds, destination_selected: false });
      }
      const actor = await user(request);
      if (!actor) return json(401, { ok: false, code: "authentication_required" });
      if (pathname.endsWith("/publishing-youtube-connect")) {
        if (request.method !== "POST") return json(405, { ok: false, code: "method_not_allowed" });
        const input = await body(request);
        if (input.workspace_id != null || input.destination_id != null) return json(400, { ok: false, code: "connection_cannot_select_destination" });
        const result = await initiateYoutubeConnection({ rpc: rpcClient, ownerUserId: actor.id, config, reconnectConnectionId: text(input.reconnect_connection_id) });
        return json(200, { ok: true, authorization_url: result.authorizationUrl, connection_id: result.connectionId, expires_at: result.expiresAt });
      }
      if (pathname.endsWith("/publishing-youtube-refresh")) {
        if (request.method !== "POST") return json(405, { ok: false, code: "method_not_allowed" });
        const input = await body(request), connectionId = text(input.connection_id); if (!connectionId) return json(400, { ok: false, code: "connection_id_required" });
        const result = await refreshYoutubeConnection({ rpc: rpcClient, ownerUserId: actor.id, connectionId, config });
        return json(200, { ok: true, connection_id: result.connectionId, discovered_destination_ids: result.destinationIds, destination_selected: false });
      }
      if (pathname.endsWith("/publishing-youtube-disconnect")) {
        if (request.method !== "POST") return json(405, { ok: false, code: "method_not_allowed" });
        const input = await body(request), connectionId = text(input.connection_id); if (!connectionId) return json(400, { ok: false, code: "connection_id_required" });
        const result = await disconnectYoutubeConnection({ rpc: rpcClient, ownerUserId: actor.id, connectionId, config });
        return json(200, { ok: true, connection_id: connectionId, connection_state: "revoked", provider_revocation_confirmed: result.providerRevocationConfirmed });
      }
      if (pathname.endsWith("/publishing-destination-grant")) {
        if (request.method !== "POST") return json(405, { ok: false, code: "method_not_allowed" });
        const input = await body(request);
        const result = await userRpc(config, actor.token, "set_publishing_workspace_destination_grant", { p_workspace_id: text(input.workspace_id), p_destination_id: text(input.destination_id), p_expected_revision: Number(input.expected_revision ?? 0), p_state: text(input.state) ?? "active", p_reason: text(input.reason) });
        return json(result.ok ? 200 : result.status, result.ok ? { ok: true, authority: result.data } : { ok: false, code: "destination_grant_failed" });
      }
      if (pathname.endsWith("/publishing-destinations")) {
        if (request.method !== "GET") return json(405, { ok: false, code: "method_not_allowed" });
        const workspaceId = new URL(request.url).searchParams.get("workspace_id"); if (!workspaceId) return json(400, { ok: false, code: "workspace_id_required" });
        const result = await userRpc(config, actor.token, "get_workspace_publishing_destination_authorities", { p_workspace_id: workspaceId });
        return json(result.ok ? 200 : result.status, result.ok ? { ok: true, destinations: result.data } : { ok: false, code: "destination_listing_failed" });
      }
      return json(404, { ok: false, code: "not_found" });
    } catch (error) {
      const code = error instanceof YoutubeConnectionError ? error.code : "youtube_connection_failed";
      return json(code.includes("owner") ? 403 : code.includes("state") ? 409 : 502, { ok: false, code });
    }
  };
}
