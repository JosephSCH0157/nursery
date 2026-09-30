import assert from "node:assert/strict";
import test from "node:test";
import {
  createCanonicalSupabaseAccessTokenAuthority,
  createCanonicalSupabaseAccessTokenResolver,
} from "../src/lib/supabase-session-authority";

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

test("canonical authority distinguishes signed-out, session, and refresh failures without exposing errors", async () => {
  const expired = jwt(2_000, "expired");
  const signedOut = createCanonicalSupabaseAccessTokenAuthority({
    async getSession() { return { data: { session: null } }; },
    async refreshSession() { throw new Error("must not refresh"); },
  });
  const unavailable = createCanonicalSupabaseAccessTokenAuthority({
    async getSession() { throw new Error("private session diagnostics"); },
    async refreshSession() { throw new Error("must not refresh"); },
  });
  const refreshFailed = createCanonicalSupabaseAccessTokenAuthority({
    async getSession() { return { data: { session: { access_token: expired } } }; },
    async refreshSession() { throw new Error("private refresh diagnostics"); },
  }, () => 10_000);

  assert.deepEqual(await signedOut.resolve(), { ok: false, reason: "signed_out" });
  assert.deepEqual(await unavailable.resolve(), { ok: false, reason: "session_unavailable" });
  assert.deepEqual(await refreshFailed.resolve(), { ok: false, reason: "refresh_failed" });
});

test("canonical authority reads a changed current token on a later request", async () => {
  let token = jwt(20_000, "first");
  const authority = createCanonicalSupabaseAccessTokenAuthority({
    async getSession() { return { data: { session: { access_token: token } } }; },
    async refreshSession() { throw new Error("must not refresh"); },
  }, () => 1_000);
  assert.equal((await authority.resolve()).ok, true);
  token = jwt(30_000, "second");
  const changed = await authority.resolve();
  assert.equal(changed.ok && changed.accessToken, token);
});
