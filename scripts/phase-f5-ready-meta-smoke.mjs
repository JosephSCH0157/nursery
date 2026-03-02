import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { TongsCommitService } from "../packages/tongs/dist/workpiece-commit-api.js";

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

function inferProjectRef(url) {
  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

function ensureNoError(res, context) {
  if (res.error) throw new Error(`${context}: ${res.error.message}`);
  return res.data;
}

function pass(name, detail = "") {
  console.log(`PASS ${name}${detail ? ` :: ${detail}` : ""}`);
}

function fail(name, detail = "") {
  console.log(`FAIL ${name}${detail ? ` :: ${detail}` : ""}`);
}

async function expectDeniedCode(name, code, operation) {
  try {
    await operation();
    fail(name, `expected denial code=${code}, but succeeded`);
    return false;
  } catch (err) {
    const actualCode = err && typeof err === "object" ? err.code : null;
    if (actualCode === code) {
      pass(name, `code=${code}`);
      return true;
    }
    fail(name, `expected code=${code}, got ${actualCode ?? "unknown"}`);
    return false;
  }
}

async function main() {
  const root = process.cwd();
  const env = {
    ...parseEnvFile(path.join(root, "apps/nursery/.env")),
    ...parseEnvFile(path.join(root, "apps/nursery/.env.local")),
    ...parseEnvFile(path.join(root, "apps/bar-stock/.env.local")),
    ...parseEnvFile(path.join(root, "apps/hearth/.env.local")),
  };

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing Supabase URL/anon key in app env files");
  }

  const projectRef = inferProjectRef(supabaseUrl);
  if (!projectRef) throw new Error("Could not infer Supabase project ref from URL");

  const keyRows = JSON.parse(execSync(`supabase projects api-keys --project-ref ${projectRef} -o json`, { encoding: "utf8" }));
  const serviceRoleKey = keyRows.find((row) => row.id === "service_role" && typeof row.api_key === "string")?.api_key ?? null;
  if (!serviceRoleKey) throw new Error("service_role key not available via Supabase CLI");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: "tongs" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const tongsService = new TongsCommitService(serviceClient, "forge-workpieces", null);

  const appClient = () => createClient(supabaseUrl, anonKey, {
    db: { schema: "tongs" },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const users = {};
  const createdAuthUserIds = [];
  let allPassed = true;
  let workspaceId = null;
  let workpieceId = null;

  const createUser = async (label) => {
    const email = `phase-f5-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const password = `P@ss-${crypto.randomUUID()}!`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { smoke_label: `phase-f5-${label}` },
    });
    if (created.error || !created.data.user?.id) {
      throw new Error(`${label} createUser failed: ${created.error?.message ?? "unknown"}`);
    }
    const client = appClient();
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.user?.id || !signedIn.data.session?.access_token) {
      throw new Error(`${label} signIn failed: ${signedIn.error?.message ?? "unknown"}`);
    }
    createdAuthUserIds.push(created.data.user.id);
    return {
      label,
      email,
      userId: signedIn.data.user.id,
      token: signedIn.data.session.access_token,
      client,
    };
  };

  const inviteAndAccept = async (ownerUser, workspace, invitee, role) => {
    const invite = ensureNoError(
      await ownerUser.client.rpc("create_workspace_invite", {
        p_workspace_id: workspace,
        p_email: invitee.email.toLowerCase(),
        p_role: role,
        p_expires_hours: 24,
      }),
      `create invite ${invitee.label}`,
    );
    const token = invite?.[0]?.token ?? null;
    if (!token) throw new Error(`missing invite token for ${invitee.label}`);
    ensureNoError(await invitee.client.rpc("accept_workspace_invite", { p_token: token }), `accept invite ${invitee.label}`);
  };

  try {
    users.owner = await createUser("owner");
    users.admin = await createUser("admin");
    users.editor = await createUser("editor");
    users.viewer = await createUser("viewer");
    users.nonMember = await createUser("non-member");

    const workspaceRes = ensureNoError(
      await users.owner.client.rpc("create_workspace_with_owner", { _name: `Phase F5 Ready Meta ${Date.now()}` }),
      "create workspace",
    );
    workspaceId = workspaceRes?.[0]?.id ?? null;
    if (!workspaceId) throw new Error("workspace id missing");

    await inviteAndAccept(users.owner, workspaceId, users.admin, "admin");
    await inviteAndAccept(users.owner, workspaceId, users.editor, "editor");
    await inviteAndAccept(users.owner, workspaceId, users.viewer, "viewer");

    workpieceId = crypto.randomUUID();
    ensureNoError(await users.owner.client.from("episodes").insert({
      id: workpieceId,
      workspace_id: workspaceId,
      label: "Phase F5 episode",
    }), "insert episode");

    const writtenBy = {
      tool: "hearth",
      tool_version: "0.0.0",
      lane: "forge-managed",
    };

    // B) Mark ready creates meta (editor)
    await tongsService.commitFile(workpieceId, {
      path: "script/script.md",
      content_type: "text/markdown; charset=utf-8",
      text: "# Ready script\n\nSmoke test content.",
      written_by: writtenBy,
      user_access_token: users.editor.token,
      event_name: "hearth.script.approved.v1",
      correlation_id: `phase-f5:${Date.now()}`,
    });
    pass("Editor mark ready (commit ready path)");

    // A) Viewer can list ready scripts and sees meta fields.
    const viewerScripts = await tongsService.listWorkspaceReadyScripts(workspaceId, {
      userAccessToken: users.viewer.token,
      unrecordedOnly: true,
    });
    const viewerRow = viewerScripts.find((row) => row.workpiece_id === workpieceId);
    if (viewerRow && typeof viewerRow.marked_ready_by === "string" && typeof viewerRow.marked_ready_at === "string") {
      pass("Viewer list includes marked_ready_by/marked_ready_at");
    } else {
      fail("Viewer list includes marked_ready_by/marked_ready_at", JSON.stringify({ viewerRow }));
      allPassed = false;
    }

    if (viewerRow?.marked_ready_by === users.editor.userId) {
      pass("Marked ready by matches editor");
    } else {
      fail("Marked ready by matches editor", JSON.stringify({ expected: users.editor.userId, actual: viewerRow?.marked_ready_by ?? null }));
      allPassed = false;
    }

    if (!(await expectDeniedCode(
      "Non-member denied listWorkspaceReadyScripts",
      "workspace_access_denied",
      () => tongsService.listWorkspaceReadyScripts(workspaceId, { userAccessToken: users.nonMember.token }),
    ))) {
      allPassed = false;
    }

    // C) Delete ready removes meta and is idempotent.
    const firstDelete = await tongsService.deleteReadyScript(
      workpieceId,
      "script/script.md",
      { userAccessToken: users.editor.token },
    );
    if (firstDelete.already_deleted === false && firstDelete.ready_meta_deleted === true) {
      pass("First delete returns ready_meta_deleted=true");
    } else {
      fail("First delete returns ready_meta_deleted=true", JSON.stringify(firstDelete));
      allPassed = false;
    }

    const afterDeleteScripts = await tongsService.listWorkspaceReadyScripts(workspaceId, {
      userAccessToken: users.viewer.token,
      unrecordedOnly: true,
    });
    const afterDeleteRow = afterDeleteScripts.find((row) => row.workpiece_id === workpieceId);
    if (!afterDeleteRow) {
      pass("Deleted ready script no longer appears in list");
    } else {
      fail("Deleted ready script no longer appears in list", JSON.stringify(afterDeleteRow));
      allPassed = false;
    }

    const secondDelete = await tongsService.deleteReadyScript(
      workpieceId,
      "script/script.md",
      { userAccessToken: users.editor.token },
    );
    if (secondDelete.already_deleted === true && secondDelete.ready_meta_deleted === false) {
      pass("Second delete idempotent (already_deleted=true, ready_meta_deleted=false)");
    } else {
      fail("Second delete idempotent", JSON.stringify(secondDelete));
      allPassed = false;
    }

    // D) Viewer denied for ready-path commit.
    if (!(await expectDeniedCode(
      "Viewer denied ready-path commit",
      "insufficient_role",
      () => tongsService.commitFile(workpieceId, {
        path: "script/script.md",
        content_type: "text/markdown; charset=utf-8",
        text: "viewer should not commit",
        written_by: writtenBy,
        user_access_token: users.viewer.token,
      }),
    ))) {
      allPassed = false;
    }

    console.log(`SMOKE_STATUS: ${allPassed ? "PASS" : "FAIL"}`);
    if (!allPassed) process.exitCode = 1;
  } finally {
    for (const userId of createdAuthUserIds) {
      try {
        await admin.auth.admin.deleteUser(userId);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  console.log("SMOKE_STATUS: FAIL");
  process.exitCode = 1;
});
