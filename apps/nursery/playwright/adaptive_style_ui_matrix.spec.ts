import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page } from "playwright/test";

type WorkspaceRow = {
  adaptive_style_alignment_enabled: boolean | null;
  adaptive_style_ai_accelerate_enabled: boolean | null;
};

type UserSession = {
  label: string;
  email: string;
  password: string;
  userId: string;
  client: SupabaseClient;
};

type MatrixRow = {
  role: "Owner" | "Admin" | "Editor" | "Viewer" | "Non-member";
  sees_toggles: boolean;
  can_toggle: boolean;
  reflects_db: boolean | "n/a";
  notes: string;
};

type MatrixChecks = {
  toggles_persist_on_refresh: boolean;
  style_shows_immediately_after_on: boolean;
  style_hides_immediately_after_off: boolean;
  writes_blocked_after_off_while_hearth_open: boolean;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return out;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function ensureNoError<T>(result: { data: T; error: { message: string; code?: string | null } | null }, context: string): T {
  if (result.error) {
    const code = result.error.code ? ` (${result.error.code})` : "";
    throw new Error(`${context}: ${result.error.message}${code}`);
  }
  return result.data;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Timed out: ${label}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function readWorkspaceFlags(adminClient: SupabaseClient, workspaceId: string): Promise<WorkspaceRow> {
  const row = ensureNoError(
    await adminClient
      .from("workspaces")
      .select("adaptive_style_alignment_enabled, adaptive_style_ai_accelerate_enabled")
      .eq("id", workspaceId)
      .single(),
    "read workspace flags",
  ) as WorkspaceRow;
  return row;
}

async function createUser(
  adminClient: SupabaseClient,
  appClientFactory: () => SupabaseClient,
  label: string,
): Promise<UserSession> {
  const email = `ui-matrix-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const password = `P@ss-${crypto.randomUUID()}!`;

  const created = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { smoke_label: `ui-matrix-${label}` },
  });
  if (created.error || !created.data.user?.id) {
    throw new Error(`${label} createUser failed: ${created.error?.message ?? "unknown"}`);
  }

  const client = appClientFactory();
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.user?.id) {
    throw new Error(`${label} signIn failed: ${signed.error?.message ?? "unknown"}`);
  }

  return {
    label,
    email,
    password,
    userId: signed.data.user.id,
    client,
  };
}

async function rpcOne<T>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  context: string,
): Promise<T> {
  const result = await client.rpc(fn, args);
  const data = ensureNoError(result as { data: T | T[]; error: { message: string; code?: string | null } | null }, context);
  const row = firstRow(data);
  if (!row) throw new Error(`${context}: empty result`);
  return row as T;
}

async function inviteAndAccept(
  owner: UserSession,
  invitee: UserSession,
  role: "admin" | "editor" | "viewer",
  workspaceId: string,
): Promise<void> {
  const invite = await rpcOne<{ token?: string }>(
    owner.client,
    "create_workspace_invite",
    {
      p_workspace_id: workspaceId,
      p_email: invitee.email.toLowerCase(),
      p_role: role,
      p_expires_hours: 24,
    },
    `create invite (${invitee.label})`,
  );
  if (!invite.token) throw new Error(`Missing invite token for ${invitee.label}`);
  await rpcOne(
    invitee.client,
    "accept_workspace_invite",
    { p_token: invite.token },
    `accept invite (${invitee.label})`,
  );
}

async function loginAs(
  browser: Browser,
  baseURL: string,
  user: UserSession,
  nextPath: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  let lastCompletedPhase = "context-created";
  const phase = async <T>(code: string, work: () => Promise<T>): Promise<T> => {
    console.log(`[ui-matrix setup] ${user.label}:${code}:begin`);
    try {
      const result = await work();
      lastCompletedPhase = code;
      console.log(`[ui-matrix setup] ${user.label}:${code}:pass`);
      return result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`ADAPTIVE_STYLE_SETUP_TIMEOUT:${code}:last_completed=${lastCompletedPhase}:${detail}`);
    }
  };
  try {
    const page = await phase("PAGE_CREATED", () => context.newPage());
    await phase("LOGIN_PAGE_LOADED", async () => {
      await page.goto(`${baseURL}/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.getByRole("button", { name: "Sign in" }).waitFor({ state: "visible", timeout: 10_000 });
    });
    await phase("CREDENTIALS_SUBMITTED", async () => {
      await page.getByLabel("Email").fill(user.email, { timeout: 10_000 });
      await page.getByLabel("Password").fill(user.password, { timeout: 10_000 });
      await Promise.all([
        page.waitForURL((url) => url.pathname.startsWith("/app"), { timeout: 30_000 }),
        page.getByRole("button", { name: "Sign in" }).click({ timeout: 10_000 }),
      ]);
    });
    await phase("AUTH_SESSION_OBSERVED", async () => {
      await page.getByText("Forge Cloud: Connected", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
    });
    await phase("DESTINATION_LOADED", async () => {
      const expectedPathname = new URL(nextPath, baseURL).pathname;
      await page.waitForURL((url) => url.pathname === expectedPathname, { timeout: 15_000 });
    });
    await phase("WORKSPACE_RESOLVED", async () => {
      const selector = page.getByRole("combobox", { name: "Workspace" });
      await selector.waitFor({ state: "visible", timeout: 15_000 });
      await expect(selector).toBeEnabled({ timeout: 15_000 });
    });
    return { context, page };
  } catch (error) {
    await context.close().catch(() => undefined);
    throw error;
  }
}

test("adaptive style settings ui role matrix", async ({ browser, baseURL }) => {
  test.setTimeout(12 * 60 * 1000);
  if (!baseURL) {
    throw new Error("Playwright baseURL missing.");
  }

  const nurseryRoot = path.resolve(__dirname, "..");
  const env = {
    ...parseEnvFile(path.join(nurseryRoot, ".env")),
    ...parseEnvFile(path.join(nurseryRoot, ".env.local")),
    ...process.env,
  };
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = env.TONGS_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / TONGS_SERVICE_ROLE_KEY.");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: "tongs" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const appClientFactory = () => createClient(supabaseUrl, anonKey, {
    db: { schema: "tongs" },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const createdUserIds: string[] = [];
  let workspaceId: string | null = null;
  const users: {
    owner?: UserSession;
    admin?: UserSession;
    editor?: UserSession;
    viewer?: UserSession;
    nonMember?: UserSession;
  } = {};

  const matrix: MatrixRow[] = [];
  const checks: MatrixChecks = {
    toggles_persist_on_refresh: false,
    style_shows_immediately_after_on: false,
    style_hides_immediately_after_off: false,
    writes_blocked_after_off_while_hearth_open: false,
  };

  let adminSettingsContext: BrowserContext | null = null;
  let adminSettingsPage: Page | null = null;
  let adminPanelPage: Page | null = null;
  let editorHearthContext: BrowserContext | null = null;
  let editorHearthPage: Page | null = null;

  try {
    console.log("[ui-matrix] create users + workspace");
    users.owner = await createUser(adminClient, appClientFactory, "owner");
    users.admin = await createUser(adminClient, appClientFactory, "admin");
    users.editor = await createUser(adminClient, appClientFactory, "editor");
    users.viewer = await createUser(adminClient, appClientFactory, "viewer");
    users.nonMember = await createUser(adminClient, appClientFactory, "non-member");
    createdUserIds.push(
      users.owner.userId,
      users.admin.userId,
      users.editor.userId,
      users.viewer.userId,
      users.nonMember.userId,
    );

    const createdWorkspace = await rpcOne<{ id?: string }>(
      users.owner.client,
      "create_workspace_with_owner",
      { _name: `UI Matrix ${Date.now()}` },
      "create workspace",
    );
    workspaceId = createdWorkspace.id ?? null;
    if (!workspaceId) throw new Error("Missing workspace id from create_workspace_with_owner.");

    await inviteAndAccept(users.owner, users.admin, "admin", workspaceId);
    await inviteAndAccept(users.owner, users.editor, "editor", workspaceId);
    await inviteAndAccept(users.owner, users.viewer, "viewer", workspaceId);

    console.log("[ui-matrix] owner checks");
    {
      const { context, page } = await loginAs(browser, baseURL, users.owner, `/app/settings?workspace_id=${workspaceId}`);
      const alignment = page.getByLabel("Enable Adaptive Style Alignment");
      const accelerate = page.getByLabel("Enable AI Accelerate");
      await alignment.waitFor({ state: "visible", timeout: 30_000 });
      await accelerate.waitFor({ state: "visible", timeout: 30_000 });

      const seesToggles = await alignment.isVisible() && await accelerate.isVisible();
      const canToggle = !await alignment.isDisabled();

      if (!await alignment.isChecked()) {
        await alignment.click();
      }
      const saveButton = page.getByRole("button", { name: "Save Feature Flags" });
      await saveButton.click();
      await page.getByText("Adaptive style feature settings saved.").waitFor({ state: "visible", timeout: 30_000 });

      const db = await readWorkspaceFlags(adminClient, workspaceId);
      const reflectsDb = (await alignment.isChecked()) === (db.adaptive_style_alignment_enabled === true)
        && (await accelerate.isChecked()) === (db.adaptive_style_ai_accelerate_enabled === true);

      await page.getByRole("button", { name: "AI Controls" }).click();
      const aiPanel = page.locator(".forge-ai-panel");
      await aiPanel.waitFor({ state: "visible", timeout: 20_000 });
      await aiPanel.getByText("Adaptive Style Alignment", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      checks.style_shows_immediately_after_on = true;
      await page.getByRole("button", { name: "Close" }).click();

      await page.reload();
      await alignment.waitFor({ state: "visible", timeout: 30_000 });
      await expect.poll(async () => await alignment.isChecked(), { timeout: 20_000 }).toBe(db.adaptive_style_alignment_enabled === true);
      checks.toggles_persist_on_refresh = (await alignment.isChecked()) === (db.adaptive_style_alignment_enabled === true)
        && (await accelerate.isChecked()) === (db.adaptive_style_ai_accelerate_enabled === true);

      matrix.push({
        role: "Owner",
        sees_toggles: seesToggles,
        can_toggle: canToggle,
        reflects_db: reflectsDb,
        notes: "Saved alignment ON; UI matched DB and AI Controls style section was visible.",
      });

      await context.close();
    }

    console.log("[ui-matrix] admin checks");
    {
      const logged = await loginAs(browser, baseURL, users.admin, `/app/settings?workspace_id=${workspaceId}`);
      adminSettingsContext = logged.context;
      adminSettingsPage = logged.page;

      const alignment = adminSettingsPage.getByLabel("Enable Adaptive Style Alignment");
      const accelerate = adminSettingsPage.getByLabel("Enable AI Accelerate");
      await alignment.waitFor({ state: "visible", timeout: 30_000 });
      await accelerate.waitFor({ state: "visible", timeout: 30_000 });

      const seesToggles = await alignment.isVisible() && await accelerate.isVisible();
      const canToggle = !await alignment.isDisabled();
      const db = await readWorkspaceFlags(adminClient, workspaceId);
      const reflectsDb = (await alignment.isChecked()) === (db.adaptive_style_alignment_enabled === true)
        && (await accelerate.isChecked()) === (db.adaptive_style_ai_accelerate_enabled === true);

      matrix.push({
        role: "Admin",
        sees_toggles: seesToggles,
        can_toggle: canToggle,
        reflects_db: reflectsDb,
        notes: "Toggles visible/editable and current values matched DB.",
      });
    }

    console.log("[ui-matrix] editor checks");
    {
      const { context, page } = await loginAs(browser, baseURL, users.editor, `/app/settings?workspace_id=${workspaceId}`);
      editorHearthContext = context;
      editorHearthPage = page;
      const alignment = page.getByLabel("Enable Adaptive Style Alignment");
      const accelerate = page.getByLabel("Enable AI Accelerate");
      await alignment.waitFor({ state: "visible", timeout: 30_000 });
      await accelerate.waitFor({ state: "visible", timeout: 30_000 });

      const seesToggles = await alignment.isVisible() && await accelerate.isVisible();
      const canToggle = !await alignment.isDisabled() || !await accelerate.isDisabled();
      const tooltip = await alignment.getAttribute("title");

      matrix.push({
        role: "Editor",
        sees_toggles: seesToggles,
        can_toggle: canToggle,
        reflects_db: "n/a",
        notes: tooltip === "Admins only"
          ? "Visible but disabled with Admins only tooltip."
          : `Visible but disabled; tooltip=${tooltip ?? "none"}.`,
      });
    }

    console.log("[ui-matrix] viewer checks");
    {
      const { context, page } = await loginAs(browser, baseURL, users.viewer, `/app/settings?workspace_id=${workspaceId}`);
      const alignment = page.getByLabel("Enable Adaptive Style Alignment");
      const accelerate = page.getByLabel("Enable AI Accelerate");
      await alignment.waitFor({ state: "visible", timeout: 30_000 });
      await accelerate.waitFor({ state: "visible", timeout: 30_000 });

      const seesToggles = await alignment.isVisible() && await accelerate.isVisible();
      const canToggle = !await alignment.isDisabled() || !await accelerate.isDisabled();
      const tooltip = await alignment.getAttribute("title");

      matrix.push({
        role: "Viewer",
        sees_toggles: seesToggles,
        can_toggle: canToggle,
        reflects_db: "n/a",
        notes: tooltip === "Admins only"
          ? "Visible but disabled with Admins only tooltip."
          : `Visible but disabled; tooltip=${tooltip ?? "none"}.`,
      });

      await context.close();
    }

    console.log("[ui-matrix] hearth-open flip-off checks");
    {
      if (!editorHearthContext || !editorHearthPage) throw new Error("Editor Hearth context/page missing.");
      await editorHearthPage.goto(`${baseURL}/app/hearth?workspace_id=${workspaceId}`, { waitUntil: "load" });
      await editorHearthPage.waitForURL((url) => url.pathname.startsWith("/apps/hearth"), { timeout: 30_000 });

      if (!adminSettingsContext || !adminSettingsPage) throw new Error("Admin settings context/page missing.");
      adminPanelPage = await adminSettingsContext.newPage();
      await adminPanelPage.goto(`${baseURL}/app?workspace_id=${workspaceId}`, { waitUntil: "load" });
      await adminPanelPage.waitForURL((url) => url.pathname.startsWith("/app"), { timeout: 30_000 });
      const adminPanelAiControlsButton = adminPanelPage.getByRole("button", { name: "AI Controls" });
      await adminPanelAiControlsButton.waitFor({ state: "visible", timeout: 30_000 });
      await adminPanelAiControlsButton.click({ timeout: 15_000 });
      const adminAiPanel = adminPanelPage.locator(".forge-ai-panel");
      await adminAiPanel.waitFor({ state: "visible", timeout: 20_000 });
      await adminAiPanel.getByText("Adaptive Style Alignment", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });

      const adminAlignment = adminSettingsPage.getByLabel("Enable Adaptive Style Alignment");
      if (await adminAlignment.isChecked()) {
        await adminAlignment.click();
      }
      const adminSave = adminSettingsPage.getByRole("button", { name: "Save Feature Flags" });
      await adminSave.click();
      await adminSettingsPage.getByText("Adaptive style feature settings saved.").waitFor({ state: "visible", timeout: 30_000 });

      await adminAiPanel.getByText("Adaptive Style Alignment", { exact: true }).waitFor({ state: "hidden", timeout: 25_000 });
      checks.style_hides_immediately_after_off = true;

      const writeAttempt = await withTimeout(users.editor.client.rpc("upsert_style_profile_metrics", {
        p_workspace_id: workspaceId,
        p_avg_sentence_length: 12,
        p_sentence_length_variance: 5,
        p_pause_per_1000_words: 2,
        p_reflective_pause_ratio: 0.2,
        p_avg_s1_block_length: 10,
        p_avg_s2_block_length: 10,
        p_structural_intent_vector: { hook: 0.25, evidence: 0.25, narrative: 0.25, close: 0.25 },
        p_adaptation_weight: 0.15,
      }), 45_000, "editor upsert_style_profile_metrics");
      checks.writes_blocked_after_off_while_hearth_open = !!writeAttempt.error
        && writeAttempt.error.code === "42501"
        && String(writeAttempt.error.message ?? "").toLowerCase().includes("disabled");
    }

    console.log("[ui-matrix] non-member checks");
    {
      const { context, page } = await loginAs(browser, baseURL, users.nonMember, `/app/settings?workspace_id=${workspaceId}`);
      await page.getByRole("heading", { name: "Settings", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      const deniedNotice = await page.getByText("Settings access denied for this workspace.").isVisible();
      const stripped = !page.url().includes(`workspace_id=${workspaceId}`);
      const selectedWorkspaceId = await page.getByRole("combobox", { name: "Workspace" }).inputValue();
      expect(selectedWorkspaceId).not.toBe(workspaceId);
      expect(stripped || deniedNotice).toBe(true);
      const alignment = page.getByLabel("Enable Adaptive Style Alignment");
      matrix.push({
        role: "Non-member",
        sees_toggles: await alignment.isVisible(),
        can_toggle: await alignment.isVisible() ? !await alignment.isDisabled() : false,
        reflects_db: "n/a",
        notes: deniedNotice
          ? "Forbidden workspace rejected with an access-denied notice."
          : "Forbidden workspace query stripped; Settings safely fell back to the user's own workspace.",
      });
      await context.close();
    }

    expect(matrix.find((row) => row.role === "Owner")?.sees_toggles).toBe(true);
    expect(matrix.find((row) => row.role === "Admin")?.sees_toggles).toBe(true);
    expect(matrix.find((row) => row.role === "Editor")?.can_toggle).toBe(false);
    expect(matrix.find((row) => row.role === "Viewer")?.can_toggle).toBe(false);
    expect(checks.toggles_persist_on_refresh).toBe(true);
    expect(checks.style_shows_immediately_after_on).toBe(true);
    expect(checks.style_hides_immediately_after_off).toBe(true);
    expect(checks.writes_blocked_after_off_while_hearth_open).toBe(true);

    console.log(`UI_MATRIX_JSON:${JSON.stringify({
      status: "PASS",
      workspace_id: workspaceId,
      matrix,
      checks,
    })}`);
  } finally {
    console.log("[ui-matrix] cleanup");
    try {
      if (editorHearthContext) {
        await withTimeout(editorHearthContext.close(), 15_000, "cleanup close editor hearth context");
      }
    } catch {
      // best effort
    }
    try {
      if (adminSettingsContext) {
        await withTimeout(adminSettingsContext.close(), 15_000, "cleanup close admin settings context");
      }
    } catch {
      // best effort
    }
    try {
      if (workspaceId && users.owner?.client) {
        await withTimeout(
          users.owner.client.rpc("delete_workspace_with_owner_check", { _workspace_id: workspaceId }),
          20_000,
          "cleanup delete workspace",
        );
      }
    } catch {
      // best effort
    }
    for (const userId of createdUserIds) {
      try {
        await withTimeout(adminClient.auth.admin.deleteUser(userId), 15_000, `cleanup delete user ${userId}`);
      } catch {
        // best effort
      }
    }
  }
});
