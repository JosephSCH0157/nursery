import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function textOrNull(locator) {
  const count = await locator.count();
  if (!count) return null;
  const text = await locator.first().innerText();
  const normalized = normalizeText(text);
  return normalized || null;
}

function resolveStorageStatePath() {
  const configured = process.env.PLAYWRIGHT_STORAGE_STATE;
  if (configured && configured.trim()) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }
  return path.join(appRoot, "playwright", ".auth", "state.json");
}

function parseStorageState(storageStatePath) {
  const raw = fs.readFileSync(storageStatePath, "utf8");
  return JSON.parse(raw);
}

function readStorageOrigins(storageState) {
  const origins = Array.isArray(storageState?.origins) ? storageState.origins : [];
  return origins
    .map((entry) => (entry && typeof entry.origin === "string" ? entry.origin : null))
    .filter(Boolean);
}

async function main() {
  const baseUrl =
    process.env.FORGE_SMOKE_BASE_URL
    ?? process.env.FORGE_TEST_BASE_URL
    ?? "http://127.0.0.1:4173";
  const storageState = resolveStorageStatePath();
  if (!fs.existsSync(storageState)) {
    throw new Error(
      `Playwright storage state not found at: ${storageState}. ` +
      "Run `pnpm --filter nursery test:playwright:auth` first or set PLAYWRIGHT_STORAGE_STATE.",
    );
  }

  const targetOrigin = new URL(baseUrl).origin;
  const parsedStorageState = parseStorageState(storageState);
  const storageOrigins = readStorageOrigins(parsedStorageState);
  if (!storageOrigins.includes(targetOrigin)) {
    throw new Error(
      `Storage-state origin mismatch. Target origin is ${targetOrigin}, ` +
      `but storage state contains: ${storageOrigins.join(", ") || "(none)"}. ` +
      "Re-capture auth for this base URL with `pnpm --filter nursery test:playwright:auth`.",
    );
  }

  console.log(`[smoke-org-workspace-sharing] base URL: ${baseUrl}`);
  console.log(`[smoke-org-workspace-sharing] storage state: ${storageState}`);
  console.log(`[smoke-org-workspace-sharing] storage origins: ${storageOrigins.join(", ")}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  const report = {
    baseURL: baseUrl,
    checks: [],
    observations: {},
  };

  const pushCheck = (name, pass, details = "") => {
    report.checks.push({ name, pass, details });
  };

  try {
    await page.goto(`${baseUrl}/app/settings/org`, { waitUntil: "domcontentloaded" });
    report.observations.after_org_nav_url = page.url();
    report.observations.page_title = await page.title();
    report.observations.sign_in_prompt_visible = await page.getByText("Sign in to view organizations.").isVisible().catch(() => false);
    report.observations.org_header_text = await textOrNull(page.locator(".settings-org__title"));

    const orgHeadingVisible = await page.getByRole("heading", { name: "Organization" }).first().isVisible();
    pushCheck("org_page_loaded", orgHeadingVisible, orgHeadingVisible ? "Organization page visible." : "Organization page not visible.");

    const contextCard = page.getByLabel("Organization context");
    const contextVisible = await contextCard.isVisible().catch(() => false);
    pushCheck("org_context_visible", contextVisible, contextVisible ? "Current org / role card visible." : "Context card not visible.");

    report.observations.current_org = await textOrNull(page.locator(".settings-org__context-grid div").nth(0).locator(".settings-org__context-value"));
    report.observations.current_role = await textOrNull(page.locator(".settings-org__context-grid div").nth(1).locator(".settings-org__context-value"));
    report.observations.context_chip = await textOrNull(page.locator(".settings-org__context-chip"));

    const assignmentScopeCopy = page.getByText("Assignments in this panel apply to organization-owned workspaces only.");
    const assignmentScopeVisible = await assignmentScopeCopy.isVisible().catch(() => false);
    pushCheck(
      "org_assignment_scope_copy",
      assignmentScopeVisible,
      assignmentScopeVisible ? "Org-owned workspace scope copy present." : "Scope copy not visible (likely non-admin role).",
    );

    const memberRows = page.locator(".settings-org__table tbody tr");
    const memberCount = await memberRows.count();
    report.observations.member_count = memberCount;
    pushCheck("members_list_present", memberCount > 0, `Member rows: ${memberCount}`);

    await page.goto(`${baseUrl}/app`, { waitUntil: "domcontentloaded" });
    report.observations.after_home_nav_url = page.url();
    const workspaceSelect = page.getByLabel("Workspace");
    const workspaceSelectVisible = await workspaceSelect.isVisible().catch(() => false);
    pushCheck("workspace_switcher_visible", workspaceSelectVisible, workspaceSelectVisible ? "Workspace select visible." : "Workspace select missing.");

    const personalGroup = workspaceSelect.locator("optgroup[label='Personal']");
    const sharedGroup = workspaceSelect.locator("optgroup[label='Shared with You']");
    const personalGroupCount = await personalGroup.count();
    const sharedGroupCount = await sharedGroup.count();
    report.observations.personal_group_count = personalGroupCount;
    report.observations.shared_group_count = sharedGroupCount;

    pushCheck("workspace_personal_group", personalGroupCount > 0, `Personal optgroup count: ${personalGroupCount}`);
    pushCheck("workspace_shared_group", sharedGroupCount > 0, `Shared optgroup count: ${sharedGroupCount}`);

    const personalOptions = await personalGroup.locator("option").allInnerTexts();
    const sharedOptions = await sharedGroup.locator("option").allInnerTexts();
    const allSelectOptions = await workspaceSelect.locator("option").allInnerTexts();
    report.observations.personal_workspaces = personalOptions.map(normalizeText).filter(Boolean);
    report.observations.shared_workspaces = sharedOptions.map(normalizeText).filter(Boolean);
    report.observations.all_workspace_options = allSelectOptions.map(normalizeText).filter(Boolean);
  } finally {
    await context.close();
    await browser.close();
  }

  const failed = report.checks.filter((check) => !check.pass).length;
  report.summary = {
    passed: report.checks.length - failed,
    failed,
    total: report.checks.length,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error("[smoke-org-workspace-sharing] failed", error);
  process.exitCode = 1;
});
