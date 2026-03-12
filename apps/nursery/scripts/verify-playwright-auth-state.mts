import {
  getPlaywrightStorageStatePath,
  loadNurseryEnv,
  readStorageSession,
} from "../playwright/helpers/hearth-phase4-fixtures.ts";

const MIN_TOKEN_LIFETIME_MS = 5 * 60 * 1000;

function fail(message: string): never {
  throw new Error(message);
}

function formatExpiry(timestampMs: number | null): string {
  if (!timestampMs) return "unknown";
  return new Date(timestampMs).toISOString();
}

async function main(): Promise<void> {
  const env = loadNurseryEnv();
  const storageStatePath = getPlaywrightStorageStatePath(env);
  const session = readStorageSession(storageStatePath);
  const now = Date.now();

  if (!session.refreshToken) {
    fail(
      `Playwright auth state is missing a refresh token: ${storageStatePath}. ` +
      "Run pnpm --filter nursery test:playwright:auth again.",
    );
  }

  if (!session.selectedWorkspaceId) {
    fail(
      `Playwright auth state has no selected workspace: ${storageStatePath}. ` +
      "After login, land on /app and select a workspace before finishing auth capture.",
    );
  }

  if (
    session.accessTokenExpiresAtMs != null
    && session.accessTokenExpiresAtMs <= now + MIN_TOKEN_LIFETIME_MS
  ) {
    fail(
      `Playwright auth access token expires too soon (${formatExpiry(session.accessTokenExpiresAtMs)}): ` +
      `${storageStatePath}. Run pnpm --filter nursery test:playwright:auth again.`,
    );
  }

  console.log(`[playwright-auth] storage state: ${storageStatePath}`);
  console.log(`[playwright-auth] selected workspace: ${session.selectedWorkspaceId}`);
  console.log(`[playwright-auth] cached workspaces: ${session.cachedWorkspaceIds.length}`);
  console.log(`[playwright-auth] access token expires: ${formatExpiry(session.accessTokenExpiresAtMs)}`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[playwright-auth] verification failed: ${message}`);
  process.exitCode = 1;
});
