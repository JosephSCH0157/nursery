import assert from "node:assert/strict";
import test from "node:test";
import { createCanonicalSupabaseAccessTokenResolver } from "../src/lib/supabase-session-authority";

function jwt(expirationMs: number, marker: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: Math.trunc(expirationMs / 1000), marker })).toString("base64url");
  return `${header}.${payload}.signature`;
}

test("authenticated canonical session exposes its current access token", async () => {
  const token = jwt(20_000, "current");
  const resolve = createCanonicalSupabaseAccessTokenResolver({
    async getSession() { return { data: { session: { access_token: token } } }; },
    async refreshSession() { throw new Error("refresh must not run"); },
  }, () => 1_000);
  assert.equal(await resolve(), token);
});

test("near-expiry session refreshes once and replaces the stale token for concurrent callers", async () => {
  const stale = jwt(2_000, "stale");
  const fresh = jwt(30_000, "fresh");
  let refreshes = 0;
  const resolve = createCanonicalSupabaseAccessTokenResolver({
    async getSession() { return { data: { session: { access_token: stale } } }; },
    async refreshSession() {
      refreshes += 1;
      await new Promise((done) => setTimeout(done, 5));
      return { data: { session: { access_token: fresh } } };
    },
  }, () => 1_000);
  assert.deepEqual(await Promise.all([resolve(), resolve(), resolve()]), [fresh, fresh, fresh]);
  assert.equal(refreshes, 1);
});

test("expired, signed-out, and failed sessions fail closed", async () => {
  const expired = jwt(2_000, "expired");
  const cases = [
    createCanonicalSupabaseAccessTokenResolver({
      async getSession() { return { data: { session: { access_token: expired } } }; },
      async refreshSession() { return { data: { session: { access_token: expired } } }; },
    }, () => 10_000),
    createCanonicalSupabaseAccessTokenResolver({
      async getSession() { return { data: { session: null } }; },
      async refreshSession() { throw new Error("refresh must not run"); },
    }),
    createCanonicalSupabaseAccessTokenResolver({
      async getSession() { throw new Error("private session failure"); },
      async refreshSession() { throw new Error("refresh must not run"); },
    }),
  ];
  for (const resolve of cases) assert.equal(await resolve(), null);
});
