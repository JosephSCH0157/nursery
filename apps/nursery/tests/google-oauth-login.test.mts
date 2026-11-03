import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AUTH_NEXT_STORAGE_KEY,
  AUTH_PROVIDER_STORAGE_KEY,
  isOAuthCancellation,
  normalizeAuthNextPath,
  readAuthCallbackError,
} from "../src/lib/auth-callback-intent";

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const login = read("../src/routes/Login.tsx");
const callback = read("../src/routes/AuthCallback.tsx");
const signup = read("../src/routes/Signup.tsx");
const boundary = read("../src/components/AdmissionBoundary.tsx");
const serverAdmission = read("../server/auth/admission-enforcement.ts");
const styles = read("../src/routes/Login.css");

test("Google login invokes Supabase OAuth with the allow-listed callback and retained next path", () => {
  assert.match(login, /supabase\.auth\.signInWithOAuth\(\{\s*provider: "google",\s*options: \{ redirectTo \},\s*\}\)/s);
  assert.match(login, /redirectTo = `\$\{window\.location\.origin\}\/auth\/callback`/);
  assert.match(login, new RegExp(`sessionStorage\\.setItem\\(${AUTH_NEXT_STORAGE_KEY === "forge_auth_next_v1" ? "AUTH_NEXT_STORAGE_KEY" : "never"}, next\\)`));
  assert.match(login, new RegExp(`sessionStorage\\.setItem\\(${AUTH_PROVIDER_STORAGE_KEY === "forge_auth_provider_v1" ? "AUTH_PROVIDER_STORAGE_KEY" : "never"}, "google"\\)`));
  assert.doesNotMatch(login, /client_secret|access_token|refresh_token|linkIdentity|auth\.signUp/);
});

test("post-auth navigation accepts only local paths and preserves local query/hash state", () => {
  assert.equal(normalizeAuthNextPath("/app/hearth?view=recent#draft"), "/app/hearth?view=recent#draft");
  for (const unsafe of [
    "https://attacker.example/path",
    "//attacker.example/path",
    "/\\attacker.example/path",
    "javascript:alert(1)",
    "\u0000/app",
  ]) {
    assert.equal(normalizeAuthNextPath(unsafe), "/app");
  }
});

test("OAuth callback failures distinguish cancellation without reflecting provider errors", () => {
  const cancelled = readAuthCallbackError({
    search: "?error=access_denied&error_description=The+user+cancelled",
    hash: "",
  });
  assert.ok(cancelled);
  assert.equal(isOAuthCancellation(cancelled), true);

  const failed = readAuthCallbackError({
    search: "",
    hash: "#error=server_error&error_description=Provider+unavailable",
  });
  assert.ok(failed);
  assert.equal(isOAuthCancellation(failed), false);
  assert.match(callback, /providerIntent === "google"/);
  assert.match(callback, /"oauth_cancelled" : "oauth_failed"/);
  assert.match(callback, /clearProviderIntent\(\)/);
  assert.doesNotMatch(callback, /encodeURIComponent\(callbackError|error_description.*nav/);
});

test("Google callback establishes only an Auth session and retains admission authority boundaries", () => {
  assert.match(callback, /supabase\.auth\.exchangeCodeForSession\(code\)/);
  assert.match(callback, /const session = await waitForSession\(\)/);
  assert.doesNotMatch(callback, /auth\.signUp|linkIdentity|insert\(|upsert\(|admit|workspace/i);
  assert.doesNotMatch(signup, /auth\.signUp|signInWithOAuth|type="password"/);

  assert.match(boundary, /read_my_admission_onboarding/);
  assert.match(boundary, /value\?\.admitted === true && value\.effective_state === "admitted"/);
  assert.match(boundary, /value\?\.effective_state === "revoked"/);
  assert.match(serverAdmission, /require_account_admission/);
  assert.match(serverAdmission, /account_admission_required/);
});

test("Google control is accessible and shares the responsive login card with password login", () => {
  assert.match(login, /"Continue with Google"/);
  assert.match(login, /type="button"\s*onClick=\{onGoogleSignIn\}/s);
  assert.match(styles, /\.forge-login-button--google/);
  assert.match(styles, /@media \(max-width: 760px\)/);
});
