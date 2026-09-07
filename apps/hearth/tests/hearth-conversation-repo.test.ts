import assert from "node:assert/strict";
import test from "node:test";
import {
  appendCanonicalHearthConversation,
  readCanonicalHearthConversation,
} from "../src/lib/hearth-conversation-repo";

test("canonical conversation read paginates beyond the former 200-message cap", async () => {
  const runtime = globalThis as typeof globalThis & { window?: unknown; __FORGE_RUNTIME_CONFIG__?: Record<string, unknown> };
  const previousWindow = runtime.window;
  const previousConfig = runtime.__FORGE_RUNTIME_CONFIG__;
  const previousFetch = globalThis.fetch;
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: "55555555-5555-4555-8555-555555555555", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  runtime.window = { localStorage: { getItem: (key: string) => key === "forge-auth" ? `${header}.${payload}.sig` : null } };
  runtime.__FORGE_RUNTIME_CONFIG__ = { supabaseUrl: "https://example.test", supabaseAnonKey: "anon" };
  let calls = 0;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    calls += 1;
    const body = JSON.parse(String(init?.body ?? "{}")) as { p_after_sequence?: number };
    const start = Number(body.p_after_sequence ?? 0) + 1;
    const count = start === 1 ? 1000 : 5;
    return new Response(JSON.stringify(Array.from({ length: count }, (_, index) => ({
      generation: 3,
      completeness: "complete",
      sequence: start + index,
      role: index % 2 ? "assistant" : "user",
      content: `message ${start + index}`,
    }))), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await readCanonicalHearthConversation("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.data?.messages.length : 0, 1005);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previousFetch;
    runtime.window = previousWindow;
    runtime.__FORGE_RUNTIME_CONFIG__ = previousConfig;
  }
});

test("canonical append excludes system messages and sends stable ordered keys", async () => {
  const runtime = globalThis as typeof globalThis & { window?: unknown; __FORGE_RUNTIME_CONFIG__?: Record<string, unknown> };
  const previousWindow = runtime.window;
  const previousConfig = runtime.__FORGE_RUNTIME_CONFIG__;
  const previousFetch = globalThis.fetch;
  const header = Buffer.from("{}").toString("base64url"), payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  runtime.window = { localStorage: { getItem: () => `${header}.${payload}.sig` } };
  runtime.__FORGE_RUNTIME_CONFIG__ = { supabaseUrl: "https://example.test", supabaseAnonKey: "anon" };
  let submitted: Record<string, unknown> = {};
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    submitted = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ status: "committed", generation: 1, inserted: 2 }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await appendCanonicalHearthConversation({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      workpieceId: "22222222-2222-4222-8222-222222222222",
      generation: 1,
      messages: [{ role: "system", content: "hidden" }, { role: "user", content: "hello" }, { role: "assistant", content: "hi" }],
    });
    assert.equal(result.ok, true);
    const messages = submitted.p_messages as Array<{ role: string; client_message_key: string }>;
    assert.deepEqual(messages.map((message) => message.role), ["user", "assistant"]);
    assert.match(messages[0]!.client_message_key, /^v1:1:/);
  } finally {
    globalThis.fetch = previousFetch;
    runtime.window = previousWindow;
    runtime.__FORGE_RUNTIME_CONFIG__ = previousConfig;
  }
});
