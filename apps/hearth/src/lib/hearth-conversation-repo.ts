import { resolveForgeUserAccessToken, type HearthChatMessage } from "./hearth-chat-api";

export type HearthConversationCompleteness = "complete" | "legacy_completeness_unknown" | "known_truncated";

export type CanonicalHearthConversation = Readonly<{
  generation: number;
  completeness: HearthConversationCompleteness;
  messages: HearthChatMessage[];
}>;

type RpcResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

function runtimeValue(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY"): string {
  const meta = import.meta as ImportMeta & { env?: Record<string, unknown> };
  const compileTime = meta.env?.[name];
  if (typeof compileTime === "string" && compileTime.trim()) return compileTime.trim();
  const globals = globalThis as {
    __FORGE_RUNTIME_CONFIG__?: Record<string, unknown>;
    __forge_supabase_client__?: { supabaseUrl?: unknown; supabaseKey?: unknown };
    __forgeSupabaseUrl?: unknown;
    __forgeSupabaseAnonKey?: unknown;
    __tpSupabaseUrl?: unknown;
    __tpSupabaseAnonKey?: unknown;
  };
  const clientValue = name === "VITE_SUPABASE_URL"
    ? globals.__forge_supabase_client__?.supabaseUrl
    : globals.__forge_supabase_client__?.supabaseKey;
  if (typeof clientValue === "string" && clientValue.trim()) return clientValue.trim();
  const globalValue = name === "VITE_SUPABASE_URL"
    ? globals.__forgeSupabaseUrl ?? globals.__tpSupabaseUrl
    : globals.__forgeSupabaseAnonKey ?? globals.__tpSupabaseAnonKey;
  if (typeof globalValue === "string" && globalValue.trim()) return globalValue.trim();
  const runtime = globals.__FORGE_RUNTIME_CONFIG__;
  const key = name === "VITE_SUPABASE_URL" ? "supabaseUrl" : "supabaseAnonKey";
  const value = runtime?.[key];
  return typeof value === "string" ? value.trim() : "";
}

async function rpc<T>(name: string, payload: Record<string, unknown>): Promise<RpcResult<T>> {
  const url = runtimeValue("VITE_SUPABASE_URL");
  const anon = runtimeValue("VITE_SUPABASE_ANON_KEY");
  const token = await resolveForgeUserAccessToken();
  if (!url || !anon || !token) {
    console.warn(`[hearth-conversation] Canonical request configuration is incomplete: operation=${name} url=${Boolean(url)} anon=${Boolean(anon)} session=${Boolean(token)}`);
    return { ok: false, status: 401, error: "Canonical conversation authentication is unavailable." };
  }
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: anon,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "accept-profile": "tongs",
      "content-profile": "tongs",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null) as T;
  if (response.ok) return { ok: true, data };
  const errorCode = data && typeof data === "object" && "code" in data && typeof data.code === "string"
    ? data.code.slice(0, 80)
    : null;
  console.warn(`[hearth-conversation] Canonical request failed: operation=${name} target=${new URL(url).origin} status=${response.status} code=${errorCode ?? "unknown"}`);
  return { ok: false, status: response.status, error: `Canonical conversation request failed (${response.status}).` };
}

type ConversationRow = {
  generation?: unknown;
  completeness?: unknown;
  sequence?: unknown;
  role?: unknown;
  content?: unknown;
};

export async function readCanonicalHearthConversation(
  workspaceId: string,
  workpieceId: string,
): Promise<RpcResult<CanonicalHearthConversation | null>> {
  const messages: HearthChatMessage[] = [];
  let afterSequence = 0;
  let generation = 1;
  let completeness: HearthConversationCompleteness = "complete";
  for (;;) {
    const result = await rpc<ConversationRow[]>("read_my_hearth_conversation", {
      p_workspace_id: workspaceId,
      p_workpiece_id: workpieceId,
      p_after_sequence: afterSequence,
      p_limit: 1000,
    });
    if (!result.ok) return result;
    const rows = Array.isArray(result.data) ? result.data : [];
    if (rows.length === 0) return afterSequence === 0 ? { ok: true, data: null } : { ok: true, data: { generation, completeness, messages } };
    for (const row of rows) {
      if (typeof row.generation === "number") generation = row.generation;
      if (row.completeness === "legacy_completeness_unknown" || row.completeness === "known_truncated") completeness = row.completeness;
      if ((row.role === "user" || row.role === "assistant") && typeof row.content === "string" && row.content) {
        messages.push({ role: row.role, content: row.content });
      }
      if (typeof row.sequence === "number") afterSequence = Math.max(afterSequence, row.sequence);
    }
    if (rows.length < 1000) return { ok: true, data: { generation, completeness, messages } };
  }
}

function messageKey(message: HearthChatMessage, index: number): string {
  let hash = 2166136261;
  const input = `${message.role}\u0000${index}\u0000${message.content}`;
  for (let cursor = 0; cursor < input.length; cursor += 1) {
    hash ^= input.charCodeAt(cursor);
    hash = Math.imul(hash, 16777619);
  }
  return `v1:${index}:${(hash >>> 0).toString(16)}`;
}

export async function appendCanonicalHearthConversation(args: {
  workspaceId: string;
  workpieceId: string;
  generation: number;
  messages: readonly HearthChatMessage[];
  importCompleteness?: Exclude<HearthConversationCompleteness, "complete">;
}): Promise<RpcResult<{ status?: string; generation?: number; inserted?: number }>> {
  return rpc("append_my_hearth_conversation_messages", {
    p_workspace_id: args.workspaceId,
    p_workpiece_id: args.workpieceId,
    p_generation: args.generation,
    p_messages: args.messages.flatMap((message, index) => (
      message.role === "user" || message.role === "assistant"
        ? [{ client_message_key: messageKey(message, index), role: message.role, content: message.content }]
        : []
    )),
    p_import_completeness: args.importCompleteness ?? null,
  });
}

export async function clearCanonicalHearthConversation(
  workspaceId: string,
  workpieceId: string,
  expectedGeneration: number,
): Promise<RpcResult<{ status?: string; generation?: number }>> {
  return rpc("clear_my_hearth_conversation", {
    p_workspace_id: workspaceId,
    p_workpiece_id: workpieceId,
    p_expected_generation: expectedGeneration,
  });
}
