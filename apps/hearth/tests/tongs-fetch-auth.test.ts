import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  configureTongsUserAccessTokenResolver,
  resolveTongsUserAccessToken,
  tongsFetch,
} from "../src/lib/tongs-fetch";

function installWindow(url: string) {
  const dom = new JSDOM("<!doctype html>", { url });
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  return () => {
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  };
}

test("signed-in browser Tongs requests send API and user credentials together", async () => {
  const restoreWindow = installWindow("http://localhost/apps/hearth?tongs_api_token=local-api-token");
  const previousFetch = globalThis.fetch;
  let received: Headers | null = null;
  (window as Window & typeof globalThis & { __forge_supabase_client__?: unknown }).__forge_supabase_client__ = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "user-access-token" } } }),
    },
  };
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    received = new Headers(init?.headers);
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    const response = await tongsFetch("/tongs/workpieces/fixture/script-approval", { method: "POST" });
    assert.equal(response.status, 204);
    assert.equal(received?.get("authorization"), "Bearer local-api-token");
    assert.equal(received?.get("x-forge-user-authorization"), "Bearer user-access-token");
  } finally {
    globalThis.fetch = previousFetch;
    restoreWindow();
  }
});

test("a browser with no Tongs credential fails clearly without making a request", async () => {
  const restoreWindow = installWindow("http://localhost/apps/hearth");
  const previousFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("network must not be reached");
  }) as typeof fetch;
  try {
    const response = await tongsFetch("/tongs/workpieces/fixture/script-approval", { method: "POST" });
    assert.equal(response.status, 401);
    assert.equal(called, false);
    assert.equal((await response.json()).error.code, "missing_tongs_auth");
  } finally {
    globalThis.fetch = previousFetch;
    restoreWindow();
  }
});

test("canonical session accessor is authoritative and token failures stay sanitized", async () => {
  const restoreWindow = installWindow("http://localhost/apps/hearth");
  const runtime = window as Window & typeof globalThis & {
    __forge_resolve_user_access_token__?: () => Promise<string | null>;
  };
  window.localStorage.setItem("forge-auth", "compatibility-token-must-not-be-used");
  runtime.__forge_resolve_user_access_token__ = async () => {
    throw new Error("private refresh failure with secret-token-material");
  };
  const previousFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("network must not be reached");
  }) as typeof fetch;
  try {
    assert.equal(await resolveTongsUserAccessToken(), null);
    const response = await tongsFetch("/tongs/workpieces/fixture/script-approval", { method: "GET" });
    const body = await response.json() as { error?: { code?: string; message?: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error?.code, "missing_tongs_auth");
    assert.doesNotMatch(JSON.stringify(body), /secret-token-material|compatibility-token/);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = previousFetch;
    restoreWindow();
  }
});

test("host shell can inject its canonical current-session accessor without browser globals", async () => {
  const restoreWindow = installWindow("http://localhost/apps/hearth");
  const token = "canonical-current-session-token";
  configureTongsUserAccessTokenResolver(async () => token);
  try {
    assert.equal(await resolveTongsUserAccessToken(), token);
  } finally {
    configureTongsUserAccessTokenResolver(null);
    restoreWindow();
  }
});

test("local request-token readers keep Vite env access directly transformable", async () => {
  const [hearthSource, nurseryBridgeSource, nurseryApiSource] = await Promise.all([
    readFile(new URL("../src/lib/tongs-fetch.ts", import.meta.url), "utf8"),
    readFile(new URL("../../nursery/src/lib/tongs-request-token.ts", import.meta.url), "utf8"),
    readFile(new URL("../../nursery/src/lib/tongs-api.ts", import.meta.url), "utf8"),
  ]);
  for (const source of [hearthSource, nurseryBridgeSource, nurseryApiSource]) {
    assert.match(source, /import\.meta\.env\?\.VITE_TONGS_API_TOKEN/);
    assert.doesNotMatch(source, /const\s+\w+\s*=\s*import\.meta[\s\S]{0,160}\.env\?\.VITE_TONGS_API_TOKEN/);
  }
});

test("approval flow has no canonical script writer before approval authority", async () => {
  const source = await readFile(new URL("../src/hooks/useApprovalFlow.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /publishApprovedScript|commitHearthPrimaryScript|\/commit-file/);
  assert.match(source, /commitPublishedScriptApprovalAuthority/);
});
