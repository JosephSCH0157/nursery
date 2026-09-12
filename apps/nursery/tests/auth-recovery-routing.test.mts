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

test("password-reset issuers use the current session-establishing recovery form and retain legacy callbacks", () => {
  const login = readFileSync(new URL("../src/routes/Login.tsx", import.meta.url), "utf8");
  const anvilLogin = readFileSync(new URL("../src/components/AnvilLoginPanel.tsx", import.meta.url), "utf8");
  const callback = readFileSync(new URL("../src/routes/AuthCallback.tsx", import.meta.url), "utf8");
  const routes = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const redirects = readFileSync(new URL("../public/_redirects", import.meta.url), "utf8");
  const reset = readFileSync(new URL("../src/routes/ResetPassword.tsx", import.meta.url), "utf8");

  assert.match(login, /redirectTo = `\$\{window\.location\.origin\}\/reset-password\?type=recovery`/);
  assert.match(anvilLogin, /redirectTo: `\$\{window\.location\.origin\}\/reset-password\?type=recovery`/);
  assert.match(routes, /path="\/reset-password"/);
  assert.match(reset, /supabase\.auth\.exchangeCodeForSession\(code\)/);
  assert.match(reset, /supabase\.auth\.setSession\(\{ access_token: accessToken, refresh_token: refreshToken \}\)/);
  assert.match(reset, /if \(!data\.session\) throw new Error\("This password reset link is invalid or has expired\."\)/);
  assert.match(reset, /disabled=\{busy \|\| !sessionReady\}/);
  assert.match(reset, /event === "PASSWORD_RECOVERY"/);
  assert.match(routes, /path="\/auth\/callback\/recovery"/);
  assert.match(redirects, /^\/auth\/callback\/\*\s+\/index\.html\s+200$/m);
  assert.ok(
    callback.indexOf("exchangeCodeForSession") < callback.indexOf('nav("/reset-password"'),
    "the recovery session must be established before the password form is shown",
  );
  assert.match(callback, /event === "PASSWORD_RECOVERY"/);
});
