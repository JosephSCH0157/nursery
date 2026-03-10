import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  createTongsCommitService,
  type WorkspaceEpisodeSummary,
} from "../../../packages/tongs/src/workpiece-commit-api.ts";
import {
  getHearthPhase4ArtifactPath,
  getHearthPhase4Fixtures,
  loadNurseryEnv,
  readStorageSession,
  type HearthPhase4VerifiedArtifact,
} from "../playwright/helpers/hearth-phase4-fixtures.ts";

const PRIMARY_SCRIPT_PATH = "script/script.md";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fail(message: string): never {
  throw new Error(message);
}

function pickInvalidWorkspaceId(takenIds: readonly string[]): string {
  const candidates = [
    "00000000-0000-4000-8000-000000000000",
    "11111111-1111-4111-8111-111111111111",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ];
  for (const candidate of candidates) {
    if (!takenIds.includes(candidate)) return candidate;
  }
  return "99999999-9999-4999-8999-999999999999";
}

function buildScriptSnippet(scriptText: string): string {
  const firstContentLine = scriptText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !/^\[[^\]]+\]$/.test(line));
  const base = firstContentLine ?? scriptText.trim();
  if (!base) {
    fail(`Canonical script at ${PRIMARY_SCRIPT_PATH} is empty.`);
  }
  return base.length > 120 ? `${base.slice(0, 120)}...` : base;
}

function resolveWorkpieceTitle(workpiece: WorkspaceEpisodeSummary | null, workpieceId: string): string {
  const label = readString(workpiece?.label);
  if (label) return label;
  return `Episode ${workpieceId.slice(0, 8)}`;
}

function writeArtifact(artifactPath: string, artifact: HearthPhase4VerifiedArtifact): void {
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

async function resolveFreshAccessToken(args: {
  supabaseUrl: string;
  anonKey: string | null;
  accessToken: string;
  refreshToken: string | null;
}): Promise<string> {
  if (!args.anonKey || !args.refreshToken) {
    return args.accessToken;
  }

  const client = createClient(args.supabaseUrl, args.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { data, error } = await client.auth.setSession({
    access_token: args.accessToken,
    refresh_token: args.refreshToken,
  });
  if (error) {
    throw new Error(
      `Unable to refresh Playwright auth session: ${error.message}. ` +
      "Run pnpm --filter nursery test:playwright:auth to capture a fresh session.",
    );
  }

  const nextToken = readString(data.session?.access_token);
  if (!nextToken) {
    throw new Error(
      "Unable to refresh Playwright auth session: missing access token. " +
      "Run pnpm --filter nursery test:playwright:auth to capture a fresh session.",
    );
  }
  return nextToken;
}

async function main(): Promise<void> {
  const env = loadNurseryEnv();
  const fixtures = getHearthPhase4Fixtures(env);
  const artifactPath = getHearthPhase4ArtifactPath(env);
  const storageSession = readStorageSession(fixtures.storageStatePath);

  const supabaseUrl = readString(env.TONGS_SUPABASE_URL)
    ?? readString(env.SUPABASE_URL)
    ?? readString(env.VITE_SUPABASE_URL);
  const supabaseServiceRoleKey = readString(env.TONGS_SERVICE_ROLE_KEY)
    ?? readString(env.SUPABASE_SERVICE_ROLE_KEY);
  const supabaseAnonKey = readString(env.TONGS_SUPABASE_ANON_KEY)
    ?? readString(env.SUPABASE_ANON_KEY)
    ?? readString(env.VITE_SUPABASE_ANON_KEY);

  if (!supabaseUrl) fail("Missing TONGS_SUPABASE_URL, SUPABASE_URL, or VITE_SUPABASE_URL.");
  if (!supabaseServiceRoleKey) fail("Missing TONGS_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY.");

  const service = createTongsCommitService({
    supabaseUrl,
    supabaseServiceRoleKey,
  });

  const selectedWorkspaceId = storageSession.selectedWorkspaceId ?? fixtures.workspaceId;
  const accessToken = await resolveFreshAccessToken({
    supabaseUrl,
    anonKey: supabaseAnonKey,
    accessToken: storageSession.accessToken,
    refreshToken: storageSession.refreshToken,
  });

  const [selectedWorkspaceEpisodes, workspaceEpisodes, readyScripts, primaryScript] = await Promise.all([
    service.listWorkspaceEpisodes(selectedWorkspaceId, { userAccessToken: accessToken }),
    service.listWorkspaceEpisodes(fixtures.workspaceId, { userAccessToken: accessToken }),
    service.listWorkspaceReadyScripts(fixtures.workspaceId, {
      userAccessToken: accessToken,
      unrecordedOnly: true,
      includeHidden: true,
    }),
    service.readWorkpieceText(fixtures.workpieceId, PRIMARY_SCRIPT_PATH),
  ]);

  if (selectedWorkspaceId !== fixtures.workspaceId && selectedWorkspaceEpisodes == null) {
    fail(`Selected workspace ${selectedWorkspaceId} is not reachable to the Playwright user.`);
  }

  if (!workspaceEpisodes.some((episode) => episode.id === fixtures.workpieceId)) {
    fail(
      `Seeded workpiece ${fixtures.workpieceId} is not reachable in workspace ${fixtures.workspaceId}.`,
    );
  }

  if (!primaryScript.found || !readString(primaryScript.text)) {
    fail(
      `Missing canonical primary script for workpiece ${fixtures.workpieceId} at ${PRIMARY_SCRIPT_PATH}.`,
    );
  }

  const visibleReadyTitles = readyScripts
    .filter((entry) => !entry.hidden_at)
    .map((entry) => entry.title.trim())
    .filter((title, index, all) => title.length > 0 && all.indexOf(title) === index);
  const hiddenReadyTitles = readyScripts
    .filter((entry) => !!entry.hidden_at)
    .map((entry) => entry.title.trim())
    .filter((title, index, all) => title.length > 0 && all.indexOf(title) === index);

  if (visibleReadyTitles.length < 2) {
    fail(
      `Workspace ${fixtures.workspaceId} must expose at least two approved-unrecorded Ready candidates; found ${visibleReadyTitles.length}.`,
    );
  }

  const seededWorkpiece = workspaceEpisodes.find((episode) => episode.id === fixtures.workpieceId) ?? null;
  const invalidWorkspaceId = pickInvalidWorkspaceId([
    fixtures.workspaceId,
    selectedWorkspaceId,
    ...storageSession.cachedWorkspaceIds,
  ]);

  const artifact: HearthPhase4VerifiedArtifact = {
    verified_at: new Date().toISOString(),
    storage_state_path: fixtures.storageStatePath,
    workspace_id: fixtures.workspaceId,
    workpiece_id: fixtures.workpieceId,
    selected_workspace_id: selectedWorkspaceId,
    invalid_workspace_id: invalidWorkspaceId,
    handoff: {
      title: resolveWorkpieceTitle(seededWorkpiece, fixtures.workpieceId),
      script_path: PRIMARY_SCRIPT_PATH,
      script_snippet: buildScriptSnippet(primaryScript.text),
    },
    ready: {
      visible_titles: visibleReadyTitles,
      hidden_titles: hiddenReadyTitles,
    },
  };

  writeArtifact(artifactPath, artifact);

  console.log(`[hearth-phase4] verified storage state: ${fixtures.storageStatePath}`);
  console.log(`[hearth-phase4] verified workspace: ${fixtures.workspaceId}`);
  console.log(`[hearth-phase4] verified workpiece: ${fixtures.workpieceId}`);
  console.log(`[hearth-phase4] fallback workspace: ${selectedWorkspaceId}`);
  console.log(`[hearth-phase4] expected Ready titles: ${visibleReadyTitles.join(" | ")}`);
  console.log(`[hearth-phase4] artifact: ${artifactPath}`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[hearth-phase4] fixture verification failed: ${message}`);
  process.exitCode = 1;
});
