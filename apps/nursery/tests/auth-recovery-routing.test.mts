import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isRecoveryAuthCallback,
  readAuthCallbackType,
} from "../src/lib/auth-callback-intent";

const location = (pathname: string, search = "", hash = "") => ({
  pathname,
  search,
  hash,
});

test("dedicated callback route preserves recovery intent when Supabase returns only a code", () => {
  const callback = location("/auth/callback/recovery", "?code=pkce-code");
  assert.equal(isRecoveryAuthCallback(callback), true);
  assert.equal(readAuthCallbackType(callback), "recovery");
});

test("legacy query and implicit-hash recovery links remain supported", () => {
  assert.equal(isRecoveryAuthCallback(location("/auth/callback", "?type=recovery")), true);
  assert.equal(isRecoveryAuthCallback(location("/auth/callback", "", "#type=recovery&access_token=token")), true);
});

test("ordinary magic-link callbacks are not promoted to password recovery", () => {
  assert.equal(isRecoveryAuthCallback(location("/auth/callback", "?code=magic-code")), false);
  assert.equal(readAuthCallbackType(location("/auth/callback", "?type=invite")), "invite");
});

test("all password-reset issuers use the dedicated recovery callback", () => {
  const login = readFileSync(new URL("../src/routes/Login.tsx", import.meta.url), "utf8");
  const anvilLogin = readFileSync(new URL("../src/components/AnvilLoginPanel.tsx", import.meta.url), "utf8");
  const callback = readFileSync(new URL("../src/routes/AuthCallback.tsx", import.meta.url), "utf8");
  const routes = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const redirects = readFileSync(new URL("../public/_redirects", import.meta.url), "utf8");

  assert.match(login, /auth\/callback\/recovery/);
  assert.match(anvilLogin, /auth\/callback\/recovery/);
  assert.match(routes, /path="\/auth\/callback\/recovery"/);
  assert.match(redirects, /^\/auth\/callback\/\*\s+\/index\.html\s+200$/m);
  assert.ok(
    callback.indexOf("exchangeCodeForSession") < callback.indexOf('nav("/reset-password"'),
    "the recovery session must be established before the password form is shown",
  );
  assert.match(callback, /event === "PASSWORD_RECOVERY"/);
});
