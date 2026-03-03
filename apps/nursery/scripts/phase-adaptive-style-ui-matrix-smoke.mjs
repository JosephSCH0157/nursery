import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseEnvFile(filePath) {
  const out = {};
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

async function waitForUrl(url, timeoutMs = 180_000) {
  const started = Date.now();
  let attempts = 0;
  while ((Date.now() - started) < timeoutMs) {
    attempts += 1;
    if (attempts % 10 === 0) {
      console.log(`[ui-matrix] waiting for dev server at ${url}...`);
    }
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok || response.status >= 300) {
        return;
      }
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function ensureNoError(result, context) {
  if (result.error) {
    const code = typeof result.error.code === "string" && result.error.code.length ? ` (${result.error.code})` : "";
    throw new Error(`${context}: ${result.error.message}${code}`);
  }
  return result.data;
}

function firstRow(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function fail(message) {
  throw new Error(message);
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  console.log("[ui-matrix] starting");
  const env = {
    ...parseEnvFile(path.join(repoRoot, "apps/nursery/.env")),
    ...parseEnvFile(path.join(repoRoot, "apps/nursery/.env.local")),
    ...process.env,
  };

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = env.TONGS_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, or TONGS_SERVICE_ROLE_KEY");
  }

  const externalBaseUrl = env.FORGE_TEST_BASE_URL ?? env.PLAYWRIGHT_BASE_URL ?? null;
  const baseUrl = externalBaseUrl || "http://127.0.0.1:4173";
  let devServer = null;

  if (!externalBaseUrl) {
    console.log("[ui-matrix] starting nursery dev server");
    devServer = spawn("pnpm", ["--filter", "nursery", "dev", "--host", "127.0.0.1", "--port", "4173"], {
      cwd: repoRoot,
      stdio: "ignore",
      shell: true,
      env: process.env,
    });
    await waitForUrl(baseUrl, 240_000);
    console.log("[ui-matrix] dev server is ready");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: "tongs" },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const appClient = () => createClient(supabaseUrl, anonKey, {
    db: { schema: "tongs" },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const users = {};
  const createdAuthUserIds = [];
  let workspaceId = null;
  let browser = null;
  let failed = false;

  async function createUser(label) {
    const email = `phase-ui-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const password = `P@ss-${crypto.randomUUID()}!`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { smoke_label: `phase-ui-${label}` },
    });
    if (created.error || !created.data.user?.id) {
      throw new Error(`${label} createUser failed: ${created.error?.message ?? "unknown"}`);
    }

    const client = appClient();
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.user?.id) {
      throw new Error(`${label} signIn failed: ${signIn.error?.message ?? "unknown"}`);
    }

    createdAuthUserIds.push(signIn.data.user.id);
    return {
      label,
      email,
      password,
      userId: signIn.data.user.id,
      client,
    };
  }

  async function rpcOne(client, fn, args, context) {
    const data = ensureNoError(await client.rpc(fn, args), context);
    return firstRow(data);
  }

  async function inviteAndAccept(owner, invitee, role) {
    const invite = await rpcOne(owner.client, "create_workspace_invite", {
      p_workspace_id: workspaceId,
      p_email: invitee.email.toLowerCase(),
      p_role: role,
      p_expires_hours: 24,
    }, `create invite (${invitee.label})`);
    if (!invite?.token) throw new Error(`missing invite token for ${invitee.label}`);
    await rpcOne(invitee.client, "accept_workspace_invite", { p_token: invite.token }, `accept invite (${invitee.label})`);
  }

  async function loginAs(user, nextPath) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/login?next=${encodeURIComponent(nextPath)}`);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await Promise.all([
      page.waitForURL((url) => url.pathname.startsWith("/app"), { timeout: 60_000 }),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);
    return { context, page };
  }

  const matrix = [];
  const checks = {
    persistOnRefresh: false,
    styleShowsWithoutHardReload: false,
    styleHidesWhenOff: false,
    writesBlockedWhenOffWhileHearthOpen: false,
  };

  try {
    console.log("[ui-matrix] creating users + workspace");
    users.owner = await createUser("owner");
    users.admin = await createUser("admin");
    users.editor = await createUser("editor");
    users.viewer = await createUser("viewer");
    users.nonMember = await createUser("non-member");

    const workspace = await rpcOne(users.owner.client, "create_workspace_with_owner", {
      _name: `Phase Adaptive Style UI ${Date.now()}`,
    }, "create workspace");
    workspaceId = workspace?.id ?? null;
    if (!workspaceId) throw new Error("Workspace id missing from create_workspace_with_owner");

    await inviteAndAccept(users.owner, users.admin, "admin");
    await inviteAndAccept(users.owner, users.editor, "editor");
    await inviteAndAccept(users.owner, users.viewer, "viewer");

    console.log("[ui-matrix] launching browser");
    browser = await chromium.launch({ headless: true });

    // OWNER
    {
      console.log("[ui-matrix] checking Owner");
      const { context, page } = await loginAs(users.owner, `/app/settings?workspace_id=${workspaceId}`);
      const alignment = page.getByLabel("Enable Adaptive Style Alignment");
      const accelerate = page.getByLabel("Enable AI Accelerate");
      await alignment.waitFor({ state: "visible", timeout: 30_000 });
      await accelerate.waitFor({ state: "visible", timeout: 30_000 });

      const seesToggles = await alignment.isVisible() && await accelerate.isVisible();
      const canToggle = !await alignment.isDisabled();
      if (!canToggle) fail("Owner toggle unexpectedly disabled.");

      const initialAlignment = await alignment.isChecked();
      if (initialAlignment !== true) {
        await alignment.click();
      }
      const saveButton = page.getByRole("button", { name: "Save Feature Flags" });
      if (await saveButton.isDisabled()) fail("Owner save button should be enabled after toggle.");
      await saveButton.click();
      await page.getByText("Adaptive style feature settings saved.").waitFor({ state: "visible", timeout: 20_000 });

      const flagsAfterSave = ensureNoError(
        await admin.from("workspaces")
          .select("adaptive_style_alignment_enabled, adaptive_style_ai_accelerate_enabled")
          .eq("id", workspaceId)
          .single(),
        "owner verify flags after save",
      );

      const reflectsDb = (await alignment.isChecked()) === (flagsAfterSave.adaptive_style_alignment_enabled === true);

      await page.getByRole("button", { name: "AI Controls" }).click();
      await page.getByText("AI Controls", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Adaptive Style Alignment", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      checks.styleShowsWithoutHardReload = true;
      await page.getByRole("button", { name: "Close" }).click();

      await page.reload();
      await alignment.waitFor({ state: "visible", timeout: 30_000 });
      checks.persistOnRefresh = await alignment.isChecked() === true;

      matrix.push({
        role: "Owner",
        seesToggles,
        canToggle,
        reflectsDb,
        note: "Enabled and saved alignment in Settings.",
      });

      await context.close();
    }

    // ADMIN
    let adminSettingsContext = null;
    let adminSettingsPage = null;
    {
      console.log("[ui-matrix] checking Admin");
      const loggedIn = await loginAs(users.admin, `/app/settings?workspace_id=${workspaceId}`);
      adminSettingsContext = loggedIn.context;
      adminSettingsPage = loggedIn.page;

      const alignment = adminSettingsPage.getByLabel("Enable Adaptive Style Alignment");
      const accelerate = adminSettingsPage.getByLabel("Enable AI Accelerate");
      await alignment.waitFor({ state: "visible", timeout: 30_000 });
      await accelerate.waitFor({ state: "visible", timeout: 30_000 });

      const seesToggles = await alignment.isVisible() && await accelerate.isVisible();
      const canToggle = !await alignment.isDisabled();
      const dbFlags = ensureNoError(
        await admin.from("workspaces")
          .select("adaptive_style_alignment_enabled, adaptive_style_ai_accelerate_enabled")
          .eq("id", workspaceId)
          .single(),
        "admin verify current flags",
      );
      const reflectsDb = (await alignment.isChecked()) === (dbFlags.adaptive_style_alignment_enabled === true)
        && (await accelerate.isChecked()) === (dbFlags.adaptive_style_ai_accelerate_enabled === true);

      matrix.push({
        role: "Admin",
        seesToggles,
        canToggle,
        reflectsDb,
        note: "Verified flag state mirrors DB before flip-off test.",
      });
    }

    // EDITOR SETTINGS
    {
      console.log("[ui-matrix] checking Editor");
      const { context, page } = await loginAs(users.editor, `/app/settings?workspace_id=${workspaceId}`);
      const alignment = page.getByLabel("Enable Adaptive Style Alignment");
      const accelerate = page.getByLabel("Enable AI Accelerate");
      await alignment.waitFor({ state: "visible", timeout: 30_000 });
      await accelerate.waitFor({ state: "visible", timeout: 30_000 });

      const seesToggles = await alignment.isVisible() && await accelerate.isVisible();
      const canToggle = !await alignment.isDisabled() || !await accelerate.isDisabled();
      const tooltipOk = (await alignment.getAttribute("title")) === "Admins only";

      matrix.push({
        role: "Editor",
        seesToggles,
        canToggle,
        reflectsDb: "n/a",
        note: tooltipOk ? "Visible but disabled with Admins only tooltip." : "Visible but disabled; tooltip missing.",
      });

      await context.close();
    }

    // VIEWER SETTINGS
    {
      console.log("[ui-matrix] checking Viewer");
      const { context, page } = await loginAs(users.viewer, `/app/settings?workspace_id=${workspaceId}`);
      const alignment = page.getByLabel("Enable Adaptive Style Alignment");
      const accelerate = page.getByLabel("Enable AI Accelerate");
      await alignment.waitFor({ state: "visible", timeout: 30_000 });
      await accelerate.waitFor({ state: "visible", timeout: 30_000 });

      const seesToggles = await alignment.isVisible() && await accelerate.isVisible();
      const canToggle = !await alignment.isDisabled() || !await accelerate.isDisabled();
      const tooltipOk = (await alignment.getAttribute("title")) === "Admins only";

      matrix.push({
        role: "Viewer",
        seesToggles,
        canToggle,
        reflectsDb: "n/a",
        note: tooltipOk ? "Visible but disabled with Admins only tooltip." : "Visible but disabled; tooltip missing.",
      });

      await context.close();
    }

    // Editor Hearth open with AI Controls section visible while ON.
    console.log("[ui-matrix] verifying Hearth open while ON");
    const editorHearth = await loginAs(users.editor, `/app/hearth?workspace_id=${workspaceId}`);
    await editorHearth.page.getByRole("button", { name: "AI Controls" }).click();
    await editorHearth.page.getByText("AI Controls", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
    await editorHearth.page.getByText("Adaptive Style Alignment", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });

    // Admin flips OFF while editor hearth tab is already open.
    {
      const alignment = adminSettingsPage.getByLabel("Enable Adaptive Style Alignment");
      await alignment.waitFor({ state: "visible", timeout: 30_000 });
      if (await alignment.isChecked()) {
        await alignment.click();
      }
      const saveButton = adminSettingsPage.getByRole("button", { name: "Save Feature Flags" });
      await saveButton.click();
      await adminSettingsPage.getByText("Adaptive style feature settings saved.").waitFor({ state: "visible", timeout: 20_000 });
    }

    const flagsOff = ensureNoError(
      await admin.from("workspaces")
        .select("adaptive_style_alignment_enabled, adaptive_style_ai_accelerate_enabled")
        .eq("id", workspaceId)
        .single(),
      "verify flags after off toggle",
    );
    if (flagsOff.adaptive_style_alignment_enabled !== false) {
      fail("Alignment flag should be false after admin toggle OFF.");
    }

    await editorHearth.page.getByText("Adaptive Style Alignment", { exact: true }).waitFor({ state: "hidden", timeout: 20_000 });
    checks.styleHidesWhenOff = true;

    const blockedWrite = await users.editor.client.rpc("upsert_style_profile_metrics", {
      p_workspace_id: workspaceId,
      p_avg_sentence_length: 11,
      p_sentence_length_variance: 4,
      p_pause_per_1000_words: 2,
      p_reflective_pause_ratio: 0.2,
      p_avg_s1_block_length: 12,
      p_avg_s2_block_length: 11,
      p_structural_intent_vector: { hook: 0.25, evidence: 0.25, narrative: 0.25, close: 0.25 },
      p_adaptation_weight: 0.15,
    });
    checks.writesBlockedWhenOffWhileHearthOpen = !!blockedWrite.error
      && blockedWrite.error.code === "42501"
      && blockedWrite.error.message.includes("disabled");

    await editorHearth.context.close();
    await adminSettingsContext.close();

    // NON-MEMBER
    {
      console.log("[ui-matrix] checking Non-member");
      const { context, page } = await loginAs(users.nonMember, `/app/settings?workspace_id=${workspaceId}`);
      await page.getByText("Settings requires a workspace.").waitFor({ state: "visible", timeout: 30_000 });
      const stripped = !page.url().includes(`workspace_id=${workspaceId}`);
      matrix.push({
        role: "Non-member",
        seesToggles: false,
        canToggle: false,
        reflectsDb: "n/a",
        note: stripped ? "Workspace id stripped; settings blocked behind workspace-required notice." : "Workspace-required notice shown.",
      });
      await context.close();
    }

    // Validate hard requirements.
    const roleByName = new Map(matrix.map((row) => [row.role, row]));
    if (!roleByName.get("Owner")?.seesToggles || !roleByName.get("Owner")?.canToggle) {
      fail("Owner row failed matrix expectations.");
    }
    if (!roleByName.get("Admin")?.seesToggles || !roleByName.get("Admin")?.canToggle) {
      fail("Admin row failed matrix expectations.");
    }
    if (roleByName.get("Editor")?.canToggle || roleByName.get("Viewer")?.canToggle) {
      fail("Editor/Viewer should not be able to toggle.");
    }
    if (!checks.persistOnRefresh) {
      fail("Toggle state did not persist on refresh.");
    }
    if (!checks.styleShowsWithoutHardReload) {
      fail("Style section did not show without hard reload after turning ON.");
    }
    if (!checks.styleHidesWhenOff) {
      fail("Style section did not hide when toggled OFF.");
    }
    if (!checks.writesBlockedWhenOffWhileHearthOpen) {
      fail("Style profile writes were not blocked after toggling OFF.");
    }

    const output = {
      matrix,
      checks,
      workspaceId,
      status: "PASS",
    };
    console.log(`UI_MATRIX_JSON: ${JSON.stringify(output)}`);
  } catch (error) {
    failed = true;
    console.error("UI_MATRIX_FATAL:", error instanceof Error ? error.message : String(error));
    const output = {
      matrix,
      checks,
      workspaceId,
      status: "FAIL",
    };
    console.log(`UI_MATRIX_JSON: ${JSON.stringify(output)}`);
  } finally {
    console.log("[ui-matrix] cleanup");
    try {
      if (browser) {
        await browser.close();
      }
    } catch {
      // ignore browser cleanup failures
    }
    try {
      if (workspaceId && users.owner?.client) {
        await users.owner.client.rpc("delete_workspace_with_owner_check", { _workspace_id: workspaceId });
      }
    } catch {
      // best-effort cleanup
    }
    for (const userId of createdAuthUserIds) {
      try {
        await admin.auth.admin.deleteUser(userId);
      } catch {
        // best-effort cleanup
      }
    }
    if (devServer) {
      devServer.kill("SIGTERM");
    }
    if (failed) {
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error("UI_MATRIX_FATAL:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
