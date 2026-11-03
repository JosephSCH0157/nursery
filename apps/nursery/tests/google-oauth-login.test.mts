import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  AUTH_NEXT_STORAGE_KEY,
  AUTH_PROVIDER_STORAGE_KEY,
  canRestoreLegacyImplicitSession,
  isOAuthCancellation,
  normalizeAuthNextPath,
  readAuthCallbackError,
  readImplicitAuthSessionTokens,
} from "../src/lib/auth-callback-intent";
import {
  FORGE_AUTH_FLOW_TYPE,
  FORGE_AUTH_STORAGE_KEY,
} from "../src/lib/supabase-auth-contract";

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const login = read("../src/routes/Login.tsx");
const callback = read("../src/routes/AuthCallback.tsx");
const signup = read("../src/routes/Signup.tsx");
const boundary = read("../src/components/AdmissionBoundary.tsx");
const serverAdmission = read("../server/auth/admission-enforcement.ts");
const styles = read("../src/routes/Login.css");
const supabaseClient = read("../src/lib/supabase.ts");

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function storedString(storage: ReturnType<typeof memoryStorage>, key: string): string | null {
  const raw = storage.getItem(key);
  return raw === null ? null : JSON.parse(raw);
}

function createPkceClient(
  storage: ReturnType<typeof memoryStorage>,
  fetchImpl: typeof fetch = fetch,
) {
  return createClient("https://forge-pkce.test", "test-publishable-key", {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: FORGE_AUTH_FLOW_TYPE,
      persistSession: true,
      storage,
      storageKey: FORGE_AUTH_STORAGE_KEY,
    },
    global: { fetch: fetchImpl },
  });
}

test("Forge configures the shared browser client for the PKCE contract", () => {
  assert.equal(FORGE_AUTH_FLOW_TYPE, "pkce");
  assert.equal(FORGE_AUTH_STORAGE_KEY, "forge-auth");
  assert.match(supabaseClient, /flowType: FORGE_AUTH_FLOW_TYPE/);
  assert.match(supabaseClient, /detectSessionInUrl: true/);
});

test("installed Supabase Auth starts Google OAuth with a stored verifier and S256 challenge", async () => {
  const storage = memoryStorage();
  const client = createPkceClient(storage);
  const redirectTo = "https://podcastersforge.com/auth/callback";

  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });

  assert.ifError(error);
  assert.ok(data.url);
  const authorization = new URL(data.url);
  const verifier = storedString(storage, `${FORGE_AUTH_STORAGE_KEY}-code-verifier`);
  const challenge = authorization.searchParams.get("code_challenge");
  assert.ok(verifier);
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(authorization.searchParams.get("code_challenge_method"), "s256");
  assert.equal(authorization.searchParams.get("redirect_to"), redirectTo);
  assert.equal(
    challenge,
    createHash("sha256").update(verifier).digest("base64url"),
  );
  assert.equal(authorization.hash, "");
  assert.equal(authorization.searchParams.has("access_token"), false);
  assert.equal(authorization.searchParams.has("refresh_token"), false);
});

test("installed Supabase Auth exchanges a one-time code with the corresponding verifier", async () => {
  const storage = memoryStorage();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({
      access_token: "forge-access-token",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "forge-refresh-token",
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        aud: "authenticated",
        role: "authenticated",
        email: "existing@example.test",
        app_metadata: { provider: "google", providers: ["email", "google"] },
        user_metadata: {},
        identities: [],
        created_at: "2026-11-03T00:00:00.000Z",
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = createPkceClient(storage, fetchImpl);
  await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://podcastersforge.com/auth/callback",
      skipBrowserRedirect: true,
    },
  });
  const verifier = storedString(storage, `${FORGE_AUTH_STORAGE_KEY}-code-verifier`);
  assert.ok(verifier);

  const { data, error } = await client.auth.exchangeCodeForSession("one-time-auth-code");

  assert.ifError(error);
  assert.equal(data.session?.user.id, "11111111-1111-4111-8111-111111111111");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://forge-pkce.test/auth/v1/token?grant_type=pkce");
  assert.equal(requests[0].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    auth_code: "one-time-auth-code",
    code_verifier: verifier,
  });
  assert.equal(storage.getItem(`${FORGE_AUTH_STORAGE_KEY}-code-verifier`), null);
});

test("password recovery uses the same S256 contract and marks its stored verifier", async () => {
  const storage = memoryStorage();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = createPkceClient(storage, fetchImpl);

  const { error } = await client.auth.resetPasswordForEmail("existing@example.test", {
    redirectTo: "https://podcastersforge.com/reset-password?type=recovery",
  });

  assert.ifError(error);
  assert.equal(requests.length, 1);
  const body = JSON.parse(String(requests[0].init?.body));
  const stored = storedString(storage, `${FORGE_AUTH_STORAGE_KEY}-code-verifier`);
  assert.ok(stored?.endsWith("/PASSWORD_RECOVERY"));
  const verifier = stored.slice(0, -"/PASSWORD_RECOVERY".length);
  assert.equal(body.code_challenge_method, "s256");
  assert.equal(
    body.code_challenge,
    createHash("sha256").update(verifier).digest("base64url"),
  );
});

test("legacy email callbacks retain implicit-session compatibility without OAuth downgrade", () => {
  const tokens = readImplicitAuthSessionTokens({
    hash: "#type=invite&access_token=invite-access&refresh_token=invite-refresh",
  });
  assert.deepEqual(tokens, {
    access_token: "invite-access",
    refresh_token: "invite-refresh",
  });
  assert.equal(canRestoreLegacyImplicitSession("invite"), true);
  assert.equal(canRestoreLegacyImplicitSession("recovery"), true);
  assert.equal(canRestoreLegacyImplicitSession(null), false);
  assert.equal(canRestoreLegacyImplicitSession("oauth"), false);
  assert.match(callback, /supabase\.auth\.setSession\(tokens\)/);
  assert.match(callback, /canRestoreLegacyImplicitSession\(callbackType\)/);
});

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
  const initialSessionIndex = callback.indexOf("const initialSession = await supabase.auth.getSession()");
  const exchangeIndex = callback.indexOf("await supabase.auth.exchangeCodeForSession(code)");
  assert.ok(initialSessionIndex >= 0);
  assert.ok(exchangeIndex > initialSessionIndex);
  assert.match(callback, /if \(code && !session\)/);
  assert.match(callback, /supabase\.auth\.exchangeCodeForSession\(code\)/);
  assert.match(callback, /if \(!session\) session = await waitForSession\(code \? 1 : 10\)/);
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
