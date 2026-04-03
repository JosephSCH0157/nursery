import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@forge/tongs";
import { encryptUserAiKey } from "../../../packages/tongs/src/server/ai-key-crypto";
import {
  MissingUserKeyError,
  resolveEffectiveAiCredentials,
} from "../server/hearth/resolve-effective-ai-credentials";

const ORIGINAL_SECRET = process.env.FORGE_USER_KEY_ENCRYPTION_SECRET;

type RpcResult = {
  data: unknown;
  error: { message: string } | null;
};

function makeSupabaseStub(result: RpcResult): SupabaseClient<Database> {
  return {
    schema: () => ({
      rpc: async () => result,
    }),
  } as unknown as SupabaseClient<Database>;
}

test.afterEach(() => {
  if (ORIGINAL_SECRET == null) {
    delete process.env.FORGE_USER_KEY_ENCRYPTION_SECRET;
  } else {
    process.env.FORGE_USER_KEY_ENCRYPTION_SECRET = ORIGINAL_SECRET;
  }
});

test("resolveEffectiveAiCredentials returns forge-managed key for forge lane", async () => {
  const resolved = await resolveEffectiveAiCredentials({
    requestedLane: "forge",
    provider: "openai",
    forgeManagedApiKey: "sk-forge-123",
    userId: "00000000-0000-4000-8000-000000000001",
    supabaseService: null,
    disableUserKeys: false,
  });

  assert.equal(resolved.keySource, "forge_managed");
  assert.equal(resolved.billingLane, "forge");
  assert.equal(resolved.apiKey, "sk-forge-123");
});

test("resolveEffectiveAiCredentials uses BYO key for byo lane when active key exists", async () => {
  process.env.FORGE_USER_KEY_ENCRYPTION_SECRET = "test-secret";
  const encrypted = encryptUserAiKey("sk-user-987");
  const supabaseStub = makeSupabaseStub({
    data: [{ encrypted_api_key: encrypted, status: "active" }],
    error: null,
  });

  const resolved = await resolveEffectiveAiCredentials({
    requestedLane: "byo",
    provider: "openai",
    forgeManagedApiKey: "sk-forge-123",
    userId: "00000000-0000-4000-8000-000000000001",
    supabaseService: supabaseStub,
    disableUserKeys: false,
  });

  assert.equal(resolved.keySource, "user_byo");
  assert.equal(resolved.billingLane, "byo");
  assert.equal(resolved.apiKey, "sk-user-987");
});

test("resolveEffectiveAiCredentials hard-fails when BYO is required but key is missing", async () => {
  const supabaseStub = makeSupabaseStub({
    data: [],
    error: null,
  });

  await assert.rejects(
    () => resolveEffectiveAiCredentials({
      requestedLane: "byo",
      provider: "openai",
      forgeManagedApiKey: "sk-forge-123",
      userId: "00000000-0000-4000-8000-000000000001",
      supabaseService: supabaseStub,
      disableUserKeys: false,
    }),
    MissingUserKeyError,
  );
});

test("resolveEffectiveAiCredentials kill switch forces forge lane", async () => {
  const resolved = await resolveEffectiveAiCredentials({
    requestedLane: "byo",
    provider: "openai",
    forgeManagedApiKey: "sk-forge-123",
    userId: null,
    supabaseService: null,
    disableUserKeys: true,
  });

  assert.equal(resolved.keySource, "forge_managed");
  assert.equal(resolved.billingLane, "forge");
  assert.equal(resolved.attribution.requestedLane, "byo");
  assert.equal(resolved.attribution.effectiveLane, "forge");
});
