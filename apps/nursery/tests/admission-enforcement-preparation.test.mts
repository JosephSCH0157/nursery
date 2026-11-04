import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  readAdmissionGuardRuntime,
  withAdmissionEnforcement,
  type AdmissionGuardDependencies,
} from "../server/auth/admission-enforcement";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://forge.test/api/protected", { headers });
}

function dependencies(args: {
  userId?: string | null;
  authError?: unknown;
  rpcError?: { code?: string; message?: string } | null;
  calls?: string[];
} = {}): AdmissionGuardDependencies {
  return {
    async verifyUser(token) {
      args.calls?.push(`auth:${token}`);
      return { userId: args.userId ?? "11111111-1111-4111-8111-111111111111", error: args.authError ?? null };
    },
    async requireAdmission(userId) {
      args.calls?.push(`admission:${userId}`);
      return { data: null, error: args.rpcError ?? null };
    },
  };
}

test("server admission guard is disabled unless the exact flag is true", async () => {
  assert.equal(readAdmissionGuardRuntime({}).enabled, false);
  assert.equal(readAdmissionGuardRuntime({ FORGE_ADMISSION_ENFORCEMENT_ENABLED: "1" }).enabled, false);
  assert.equal(readAdmissionGuardRuntime({ FORGE_ADMISSION_ENFORCEMENT_ENABLED: "true" }).enabled, true);

  let nextCalls = 0;
  const result = await withAdmissionEnforcement(
    request(),
    "new_customer_operation",
    async () => { nextCalls += 1; return new Response("ok", { status: 207 }); },
    { enabled: false },
  );
  assert.equal(result.status, 207);
  assert.equal(nextCalls, 1);
});

test("admission runtime resolves Tongs credentials first and preserves Supabase fallbacks", () => {
  const tongsOnly = readAdmissionGuardRuntime({
    FORGE_ADMISSION_ENFORCEMENT_ENABLED: "true",
    TONGS_SUPABASE_URL: "https://tongs-only.supabase.test",
    TONGS_SERVICE_ROLE_KEY: "tongs-test-service-key",
  });
  assert.equal(tongsOnly.enabled, true);
  assert.equal(tongsOnly.supabaseUrl, "https://tongs-only.supabase.test");
  assert.equal(tongsOnly.serviceRoleKey, "tongs-test-service-key");

  const both = readAdmissionGuardRuntime({
    FORGE_ADMISSION_ENFORCEMENT_ENABLED: "true",
    TONGS_SUPABASE_URL: "https://preferred-tongs.supabase.test",
    TONGS_SERVICE_ROLE_KEY: "preferred-tongs-test-key",
    SUPABASE_URL: "https://fallback-standard.supabase.test",
    VITE_SUPABASE_URL: "https://fallback-browser.supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "fallback-standard-test-key",
  });
  assert.equal(both.supabaseUrl, "https://preferred-tongs.supabase.test");
  assert.equal(both.serviceRoleKey, "preferred-tongs-test-key");

  const standard = readAdmissionGuardRuntime({
    FORGE_ADMISSION_ENFORCEMENT_ENABLED: "true",
    SUPABASE_URL: "https://standard.supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "standard-test-service-key",
  });
  assert.equal(standard.supabaseUrl, "https://standard.supabase.test");
  assert.equal(standard.serviceRoleKey, "standard-test-service-key");
});

test("enabled guard fails closed when database configuration is missing", async () => {
  let nextCalls = 0;
  const result = await withAdmissionEnforcement(
    request({ authorization: "Bearer customer-token" }),
    "new_customer_operation",
    async () => { nextCalls += 1; return new Response("must-not-run"); },
    readAdmissionGuardRuntime({ FORGE_ADMISSION_ENFORCEMENT_ENABLED: "true" }),
  );
  assert.equal(result.status, 503);
  assert.equal((await result.json()).error, "admission_guard_unavailable");
  assert.equal(nextCalls, 0);
});

test("enabled Tongs-only runtime admits the canonical UUID and rejects an unadmitted UUID", async () => {
  const tongsOnly = readAdmissionGuardRuntime({
    FORGE_ADMISSION_ENFORCEMENT_ENABLED: "true",
    TONGS_SUPABASE_URL: "https://tongs-only.supabase.test",
    TONGS_SERVICE_ROLE_KEY: "tongs-test-service-key",
  });
  const admittedCalls: string[] = [];
  let admittedNextCalls = 0;
  const admitted = await withAdmissionEnforcement(
    request({ authorization: "Bearer admitted-token" }),
    "new_customer_operation",
    async () => { admittedNextCalls += 1; return new Response("ok"); },
    { ...tongsOnly, dependencies: dependencies({ calls: admittedCalls }) },
  );
  assert.equal(admitted.status, 200);
  assert.equal(admittedNextCalls, 1);
  assert.deepEqual(admittedCalls, [
    "auth:admitted-token",
    "admission:11111111-1111-4111-8111-111111111111",
  ]);

  const unadmittedCalls: string[] = [];
  let unadmittedNextCalls = 0;
  const unadmitted = await withAdmissionEnforcement(
    request({ authorization: "Bearer unadmitted-token" }),
    "new_customer_operation",
    async () => { unadmittedNextCalls += 1; return new Response("must-not-run"); },
    {
      ...tongsOnly,
      dependencies: dependencies({
        calls: unadmittedCalls,
        rpcError: { code: "42501", message: "account admission required" },
      }),
    },
  );
  assert.equal(unadmitted.status, 403);
  assert.equal((await unadmitted.json()).error, "account_admission_required");
  assert.equal(unadmittedNextCalls, 0);
  assert.deepEqual(unadmittedCalls, [
    "auth:unadmitted-token",
    "admission:11111111-1111-4111-8111-111111111111",
  ]);
});

test("trusted existing/recovery/public classifications bypass only the prepared server guard", async () => {
  for (const operationClass of [
    "existing_authorized_operation",
    "trusted_system_maintenance",
    "public_guest_signal",
  ] as const) {
    const result = await withAdmissionEnforcement(
      request(),
      operationClass,
      async () => new Response("existing", { status: 202 }),
      { enabled: true },
    );
    assert.equal(result.status, 202);
  }
});

test("enabled new-customer guard verifies the user token before exact UUID admission", async () => {
  const calls: string[] = [];
  let nextCalls = 0;
  const result = await withAdmissionEnforcement(
    request({ authorization: "Bearer user-token" }),
    "new_customer_operation",
    async () => { nextCalls += 1; return new Response("ok"); },
    { enabled: true, dependencies: dependencies({ calls }) },
  );
  assert.equal(result.status, 200);
  assert.deepEqual(calls, [
    "auth:user-token",
    "admission:11111111-1111-4111-8111-111111111111",
  ]);
  assert.equal(nextCalls, 1);
});

test("service credentials cannot substitute for a verified customer token", async () => {
  const result = await withAdmissionEnforcement(
    request({ authorization: "Bearer service-role-secret" }),
    "new_customer_operation",
    async () => new Response("must-not-run"),
    { enabled: true, dependencies: dependencies({ userId: null, authError: { message: "not a user JWT" } }) },
  );
  assert.equal(result.status, 401);
  assert.equal((await result.json()).error, "authenticated_account_required");
});

test("enabled guard fails closed for missing, revoked, and unavailable authority", async () => {
  const missing = await withAdmissionEnforcement(
    request(), "new_customer_operation", async () => new Response("bad"), { enabled: true },
  );
  assert.equal(missing.status, 401);

  const revoked = await withAdmissionEnforcement(
    request({ authorization: "Bearer token" }),
    "new_customer_operation",
    async () => new Response("bad"),
    { enabled: true, dependencies: dependencies({ rpcError: { code: "42501" } }) },
  );
  assert.equal(revoked.status, 403);
  assert.equal((await revoked.json()).error, "account_admission_required");

  const unavailable = await withAdmissionEnforcement(
    request({ authorization: "Bearer token" }),
    "new_customer_operation",
    async () => new Response("bad"),
    { enabled: true, dependencies: dependencies({ rpcError: { code: "XX000" } }) },
  );
  assert.equal(unavailable.status, 503);
});

test("migration prepares but does not activate Data API, Storage, or financial guards", async () => {
  const migration = await read("supabase/migrations/20261101201817_forge_inactive_admission_enforcement.sql");
  const storageTemplate = await read("supabase/templates/forge-account-admission-storage-restrictive.sql.template");
  assert.match(migration, /create or replace function tongs\.account_admission_pre_request\(\)/i);
  assert.doesNotMatch(migration, /alter\s+(role|database)[^;]+pgrst\.db_pre_request\s*=/i);
  assert.doesNotMatch(migration, /create\s+policy\s+/i);
  assert.match(storageTemplate, /as restrictive[\s\S]+for select[\s\S]+current_request_is_admitted/i);
  assert.match(storageTemplate, /as restrictive[\s\S]+for insert[\s\S]+current_request_is_admitted/i);
  assert.match(migration, /current_setting\('forge\.account_admission_enforcement', true\)[\s\S]+<> 'on'/i);
  assert.match(migration, /before insert on tongs\.customer_spending_quote_acceptances/i);
  assert.match(migration, /before insert on tongs\.funding_reservations/i);
  assert.doesNotMatch(migration, /before\s+(update|delete)[^;]+_guard_new_customer_financial_authorization/i);
  assert.match(migration, /grant execute on function tongs\.require_account_admission\(uuid\)\s+to service_role/i);
  assert.doesNotMatch(migration, /grant execute on function tongs\.require_account_admission\(uuid\)\s+to[^;]*(authenticated|anon|public)/i);
});

test("server entrypoints classify new work and preserve cleanup/background work", async () => {
  const tongs = await read("apps/nursery/netlify/functions/_tongs-handler.ts");
  const anvil = await read("apps/nursery/netlify/functions/_anvil-handler.ts");
  const hearth = await read("apps/nursery/netlify/functions/_hearth-handler.ts");
  const hammer = await read("apps/nursery/netlify/_hammer-handler.ts");
  const publishing = await read("apps/nursery/netlify/functions/_publishing-youtube-handler.ts");
  const topic = await read("apps/nursery/netlify/functions/hearth-topic-discovery.ts");
  for (const source of [tongs, anvil, hearth, hammer, publishing, topic]) {
    assert.match(source, /withAdmissionEnforcement/);
  }
  assert.match(hammer, /hammerAssemblyAiExecutionMode === "background"[\s\S]+existing_authorized_operation/);
  assert.match(publishing, /publishing-youtube-callback[\s\S]+existing_authorized_operation/);
  for (const path of [
    "apps/nursery/netlify/functions/ai-keys-disconnect.ts",
    "apps/nursery/netlify/functions/ai-keys-status.ts",
    "apps/nursery/netlify/functions/hearth-chat-status.ts",
  ]) {
    assert.match(await read(path), /existing_authorized_operation/);
  }
});

test("frontend boundary is inactive by default and distinguishes pending, revoked, and errors", async () => {
  const source = await read("apps/nursery/src/components/AdmissionBoundary.tsx");
  const lifecycle = await read("apps/nursery/src/components/AdmissionBoundaryView.tsx");
  const runtime = await read("apps/nursery/src/components/AdmissionBoundaryRuntime.ts");
  assert.match(source, /VITE_FORGE_ADMISSION_ENFORCEMENT_ENABLED/);
  assert.match(lifecycle, /state\.kind === "allowed"/);
  assert.match(runtime, /effective_state === "revoked"/);
  assert.match(lifecycle, /Invitation setup is still pending/);
  assert.match(lifecycle, /Admission could not be verified/);
  assert.match(source, /onAuthStateChange/);
  assert.match(lifecycle, /window\.addEventListener\("focus"/);
  assert.match(lifecycle, /window\.setInterval\(refresh, ADMISSION_REFRESH_INTERVAL_MS\)/);
  assert.match(lifecycle, /document\.addEventListener\("visibilitychange"/);
  assert.match(lifecycle, /previous\.kind !== "allowed"/);
});

test("Bellows guest exception is limited to opaque link resolution and ephemeral signaling", async () => {
  const boundary = await read("apps/nursery/src/components/AdmissionBoundary.tsx");
  const runtime = await read("apps/nursery/src/components/AdmissionBoundaryRuntime.ts");
  const join = await read("apps/nursery/src/routes/BellowsJoin.tsx");
  const repository = await read("apps/nursery/src/lib/bellows/bellowsTongsRepository.ts");
  assert.match(`${boundary}\n${runtime}`, /\/apps\/bellows\/join\//);
  assert.match(join, /repository\.resolveJoinLink/);
  assert.match(repository, /\.rpc\("resolve_bellows_join_link"/);
  assert.match(join, /\.on\("presence"/);
  assert.match(join, /\.on\("broadcast"/);
  assert.doesNotMatch(join, /\.storage\b|funding_reservation|provider_attempt|workspace_members/);
});
