import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  getHearthPhase4Fixtures,
  getPlaywrightStorageStatePath,
  loadNurseryEnv,
} from "../playwright/helpers/hearth-phase4-fixtures.ts";

type WorkspaceCacheRow = {
  id: string;
  name: string;
  role: string | null;
  createdAt: string | null;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fail(message: string): never {
  throw new Error(message);
}

function resolveBaseOrigin(env: Record<string, string>): string {
  const baseUrl = readString(env.FORGE_TEST_BASE_URL)
    ?? readString(env.PLAYWRIGHT_BASE_URL)
    ?? "http://127.0.0.1:4173";
  try {
    return new URL(baseUrl).origin;
  } catch {
    fail(`Invalid FORGE_TEST_BASE_URL/PLAYWRIGHT_BASE_URL: ${baseUrl}`);
  }
}

async function listWorkspaceCacheRows(args: {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  userId: string;
}): Promise<WorkspaceCacheRow[]> {
  const client = createClient(args.supabaseUrl, args.anonKey, {
    db: { schema: "tongs" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
      },
    },
  });

  const { data, error } = await client
    .schema("tongs")
    .from("workspace_members")
    .select("workspace_id, role, workspaces!workspace_members_workspace_id_fkey(id, name, created_at)")
    .eq("user_id", args.userId);

  if (error) {
    throw new Error(`Unable to list workspace memberships for Playwright auth: ${error.message}`);
  }

  const out: WorkspaceCacheRow[] = [];
  for (const row of data ?? []) {
    const workspaces = (row as { workspaces?: unknown }).workspaces as {
      id?: unknown;
      name?: unknown;
      created_at?: unknown;
    } | null | undefined;
    const id = readString(workspaces?.id);
    const name = readString(workspaces?.name);
    if (!id || !name) continue;
    out.push({
      id,
      name,
      role: readString((row as { role?: unknown }).role),
      createdAt: readString(workspaces?.created_at),
    });
  }

  out.sort((left, right) => {
    const leftCreated = Date.parse(left.createdAt ?? "") || 0;
    const rightCreated = Date.parse(right.createdAt ?? "") || 0;
    if (leftCreated !== rightCreated) return leftCreated - rightCreated;
    return left.name.localeCompare(right.name);
  });
  return out;
}

async function main(): Promise<void> {
  const env = loadNurseryEnv();
  const fixtures = getHearthPhase4Fixtures(env);
  const storageStatePath = getPlaywrightStorageStatePath(env);
  const supabaseUrl = readString(env.VITE_SUPABASE_URL);
  const anonKey = readString(env.VITE_SUPABASE_ANON_KEY);
  const email = readString(env.FORGE_CI_AUTH_EMAIL);
  const password = readString(env.FORGE_CI_AUTH_PASSWORD);
  const origin = resolveBaseOrigin(env);

  if (!supabaseUrl || !anonKey) {
    fail("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
  }
  if (!email || !password) {
    fail("Missing FORGE_CI_AUTH_EMAIL or FORGE_CI_AUTH_PASSWORD.");
  }

  const client = createClient(supabaseUrl, anonKey, {
    db: { schema: "tongs" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session || !signed.data.user?.id) {
    fail(`CI Playwright auth sign-in failed: ${signed.error?.message ?? "missing session"}`);
  }

  const workspaceCache = await listWorkspaceCacheRows({
    supabaseUrl,
    anonKey,
    accessToken: signed.data.session.access_token,
    userId: signed.data.user.id,
  });

  if (!workspaceCache.some((workspace) => workspace.id === fixtures.workspaceId)) {
    fail(
      `Configured FORGE_TEST_WORKSPACE_ID ${fixtures.workspaceId} is not a member workspace ` +
      `for ${email}.`,
    );
  }

  const storageState = {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          { name: "forge-auth", value: JSON.stringify(signed.data.session) },
          { name: "forge_workspace_id_v1", value: fixtures.workspaceId },
          { name: "barstock_workspace_id", value: fixtures.workspaceId },
          { name: "forge_workspaces_cache_v1", value: JSON.stringify(workspaceCache) },
        ],
      },
    ],
  };

  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
  fs.writeFileSync(storageStatePath, `${JSON.stringify(storageState, null, 2)}\n`, "utf8");

  console.log(`[playwright-auth] generated storage state: ${storageStatePath}`);
  console.log(`[playwright-auth] selected workspace: ${fixtures.workspaceId}`);
  console.log(`[playwright-auth] cached workspaces: ${workspaceCache.length}`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[playwright-auth] generation failed: ${message}`);
  process.exitCode = 1;
});
