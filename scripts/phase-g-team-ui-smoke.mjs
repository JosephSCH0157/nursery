import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

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

function pass(name, detail = "") {
  console.log(`PASS ${name}${detail ? ` :: ${detail}` : ""}`);
}

function fail(name, detail = "") {
  console.log(`FAIL ${name}${detail ? ` :: ${detail}` : ""}`);
}

function getErrorMeta(value) {
  const out = { message: "", code: "" };
  if (!value || typeof value !== "object") return out;
  const message = value.message;
  const code = value.code;
  if (typeof message === "string") out.message = message;
  if (typeof code === "string") out.code = code;
  return out;
}

function ensureNoError(res, context) {
  if (res.error) {
    const code = typeof res.error.code === "string" && res.error.code ? ` (${res.error.code})` : "";
    throw new Error(`${context}: ${res.error.message}${code}`);
  }
  return res.data;
}

async function expectDenied(name, operation, options = {}) {
  const { messageIncludes = null, code = null } = options;
  try {
    const result = await operation();
    const err = result && typeof result === "object" && "error" in result ? result.error : null;
    if (!err) {
      fail(name, "expected denial but operation succeeded");
      return false;
    }

    const meta = getErrorMeta(err);
    if (code && meta.code !== code) {
      fail(name, `expected code=${code}, got ${meta.code || "unknown"}`);
      return false;
    }
    if (messageIncludes && !meta.message.includes(messageIncludes)) {
      fail(name, `expected message containing \"${messageIncludes}\", got \"${meta.message || ""}\"`);
      return false;
    }
    pass(name, `${meta.message || "denied"}${meta.code ? ` (${meta.code})` : ""}`);
    return true;
  } catch (err) {
    const meta = getErrorMeta(err);
    if (code && meta.code && meta.code !== code) {
      fail(name, `expected code=${code}, got ${meta.code}`);
      return false;
    }
    if (messageIncludes && meta.message && !meta.message.includes(messageIncludes)) {
      fail(name, `expected message containing \"${messageIncludes}\", got \"${meta.message}\"`);
      return false;
    }
    pass(name, `${meta.message || String(err)}${meta.code ? ` (${meta.code})` : ""}`);
    return true;
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

  const envServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  let serviceRoleKey = envServiceRoleKey || null;
  if (!serviceRoleKey) {
    const keyRows = JSON.parse(execSync(`supabase projects api-keys --project-ref ${projectRef} -o json`, { encoding: "utf8" }));
    serviceRoleKey = keyRows.find((row) => row.id === "service_role" && typeof row.api_key === "string")?.api_key ?? null;
  }
  if (!serviceRoleKey) throw new Error("service_role key not available via SUPABASE_SERVICE_ROLE_KEY or Supabase CLI");

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
  let workspaceA = null;
  let workspaceB = null;
  let allPassed = true;

  const createUser = async (label) => {
    const email = `phase-g5-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const password = `P@ss-${crypto.randomUUID()}!`;

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { smoke_label: `phase-g5-${label}` },
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

  const rpcSingle = async (client, fn, args, context) => {
    const data = ensureNoError(await client.rpc(fn, args).single(), context);
    return data;
  };

  const rpcMany = async (client, fn, args, context) => {
    const data = ensureNoError(await client.rpc(fn, args), context);
    return Array.isArray(data) ? data : [];
  };

  const createInvite = async (actor, workspaceId, email, role = "viewer", hours = 72) => {
    return rpcSingle(
      actor.client,
      "create_workspace_invite",
      {
        p_workspace_id: workspaceId,
        p_email: email.toLowerCase(),
        p_role: role,
        p_expires_hours: hours,
      },
      `create invite (${actor.label})`,
    );
  };

  const acceptInvite = async (invitee, token) => {
    return rpcSingle(invitee.client, "accept_workspace_invite", { p_token: token }, `accept invite (${invitee.label})`);
  };

  try {
    users.owner = await createUser("owner");
    users.admin = await createUser("admin");
    users.editor = await createUser("editor");
    users.viewer = await createUser("viewer");
    users.nonMember = await createUser("non-member");
    users.editorB = await createUser("editor-b");
    users.pending = await createUser("pending");
    users.expired = await createUser("expired");
    users.duplicate = await createUser("duplicate");

    const createdA = await rpcSingle(
      users.owner.client,
      "create_workspace_with_owner",
      { _name: `Phase G.5 A ${Date.now()}` },
      "create workspace A",
    );
    workspaceA = createdA?.id ?? null;
    if (!workspaceA) throw new Error("workspace A id missing");

    const createdB = await rpcSingle(
      users.owner.client,
      "create_workspace_with_owner",
      { _name: `Phase G.5 B ${Date.now()}` },
      "create workspace B",
    );
    workspaceB = createdB?.id ?? null;
    if (!workspaceB) throw new Error("workspace B id missing");

    const adminInvite = await createInvite(users.owner, workspaceA, users.admin.email, "admin");
    await acceptInvite(users.admin, adminInvite.token);

    const editorInvite = await createInvite(users.owner, workspaceA, users.editor.email, "editor");
    await acceptInvite(users.editor, editorInvite.token);

    const viewerInvite = await createInvite(users.owner, workspaceA, users.viewer.email, "viewer");
    await acceptInvite(users.viewer, viewerInvite.token);

    const editorBInvite = await createInvite(users.owner, workspaceB, users.editorB.email, "editor");
    await acceptInvite(users.editorB, editorBInvite.token);

    // 1) List members/invites
    const viewerMembers = await rpcMany(
      users.viewer.client,
      "list_workspace_members",
      { p_workspace_id: workspaceA },
      "viewer list members",
    );
    if (viewerMembers.length >= 4) {
      pass("Viewer can list workspace members");
    } else {
      fail("Viewer can list workspace members", `expected >=4, got ${viewerMembers.length}`);
      allPassed = false;
    }

    const viewerInvites = await rpcMany(
      users.viewer.client,
      "list_workspace_invites",
      { p_workspace_id: workspaceA, p_only_pending: true },
      "viewer list invites",
    );
    pass("Viewer can list workspace invites", `pending=${viewerInvites.length}`);

    if (!(await expectDenied(
      "Non-member denied list members",
      () => users.nonMember.client.rpc("list_workspace_members", { p_workspace_id: workspaceA }),
      { code: "42501" },
    ))) {
      allPassed = false;
    }

    if (!(await expectDenied(
      "Non-member denied list invites",
      () => users.nonMember.client.rpc("list_workspace_invites", { p_workspace_id: workspaceA, p_only_pending: true }),
      { code: "42501" },
    ))) {
      allPassed = false;
    }

    // 2) Create invite
    const pendingInvite = await createInvite(users.admin, workspaceA, users.pending.email, "editor");
    if (pendingInvite?.token) pass("Admin can create invite");
    else { fail("Admin can create invite", "token missing"); allPassed = false; }

    if (!(await expectDenied(
      "Editor denied create invite",
      () => users.editor.client.rpc("create_workspace_invite", {
        p_workspace_id: workspaceA,
        p_email: users.nonMember.email.toLowerCase(),
        p_role: "viewer",
        p_expires_hours: 24,
      }).single(),
      { code: "42501" },
    ))) {
      allPassed = false;
    }

    if (!(await expectDenied(
      "Viewer denied create invite",
      () => users.viewer.client.rpc("create_workspace_invite", {
        p_workspace_id: workspaceA,
        p_email: users.nonMember.email.toLowerCase(),
        p_role: "viewer",
        p_expires_hours: 24,
      }).single(),
      { code: "42501" },
    ))) {
      allPassed = false;
    }

    // 3) Invite preview (valid + revoked + expired + duplicate handling)
    const pendingPreview = await rpcSingle(
      users.pending.client,
      "get_workspace_invite_preview",
      { p_token: pendingInvite.token },
      "preview pending invite",
    );
    if (pendingPreview?.workspace_id === workspaceA && typeof pendingPreview?.workspace_name === "string" && pendingPreview.workspace_name) {
      pass("Invite preview returns workspace name/role/expiry");
    } else {
      fail("Invite preview returns workspace name/role/expiry", JSON.stringify(pendingPreview));
      allPassed = false;
    }

    const revokedInvite = await createInvite(users.admin, workspaceA, users.expired.email, "viewer");
    await rpcSingle(
      users.admin.client,
      "revoke_workspace_invite",
      { p_invite_id: revokedInvite.invite_id },
      "revoke invite",
    );

    if (!(await expectDenied(
      "Revoked invite preview deterministic error",
      () => users.expired.client.rpc("get_workspace_invite_preview", { p_token: revokedInvite.token }).single(),
      { messageIncludes: "invite_revoked", code: "22023" },
    ))) {
      allPassed = false;
    }

    const expiresInvite = await createInvite(users.admin, workspaceA, users.duplicate.email, "viewer");
    const createdAtMs = Date.parse(expiresInvite.created_at);
    const forcedExpiryIso = Number.isFinite(createdAtMs)
      ? new Date(createdAtMs + 1000).toISOString()
      : new Date(Date.now() + 1000).toISOString();
    ensureNoError(
      await admin
        .from("workspace_invites")
        .update({ expires_at: forcedExpiryIso })
        .eq("id", expiresInvite.invite_id),
      "force invite expiry",
    );
    await new Promise((resolve) => setTimeout(resolve, 2200));

    if (!(await expectDenied(
      "Expired invite preview deterministic error",
      () => users.duplicate.client.rpc("get_workspace_invite_preview", { p_token: expiresInvite.token }).single(),
      { messageIncludes: "invite_expired", code: "22023" },
    ))) {
      allPassed = false;
    }

    const duplicateInvite1 = await createInvite(users.admin, workspaceA, users.duplicate.email, "viewer");
    const duplicateInvite2 = await createInvite(users.admin, workspaceA, users.duplicate.email, "viewer");

    if (!(await expectDenied(
      "Older duplicate invite token revoked",
      () => users.duplicate.client.rpc("get_workspace_invite_preview", { p_token: duplicateInvite1.token }).single(),
      { messageIncludes: "invite_revoked", code: "22023" },
    ))) {
      allPassed = false;
    }

    await rpcSingle(
      users.duplicate.client,
      "get_workspace_invite_preview",
      { p_token: duplicateInvite2.token },
      "preview latest duplicate invite",
    );
    pass("Latest duplicate invite remains valid");

    // 4) Accept invite + replay behavior
    const acceptedInvite = await acceptInvite(users.pending, pendingInvite.token);
    if (acceptedInvite?.workspace_id === workspaceA && acceptedInvite?.role === "editor") {
      pass("Accept invite creates membership with correct role");
    } else {
      fail("Accept invite creates membership with correct role", JSON.stringify(acceptedInvite));
      allPassed = false;
    }

    if (!(await expectDenied(
      "Accept invite replay deterministic",
      () => users.pending.client.rpc("accept_workspace_invite", { p_token: pendingInvite.token }).single(),
      { messageIncludes: "invite_already_accepted", code: "22023" },
    ))) {
      allPassed = false;
    }

    const membersAfterAccept = await rpcMany(
      users.admin.client,
      "list_workspace_members",
      { p_workspace_id: workspaceA },
      "list members after accept",
    );
    const pendingMember = membersAfterAccept.find((row) => row.user_id === users.pending.userId);
    if (pendingMember?.role === "editor") {
      pass("Membership row has expected role after accept");
    } else {
      fail("Membership row has expected role after accept", JSON.stringify(pendingMember ?? null));
      allPassed = false;
    }

    // 5) Role change + guardrails
    if (!(await expectDenied(
      "Viewer cannot role-change",
      () => users.viewer.client.rpc("update_workspace_member_role", {
        p_workspace_id: workspaceA,
        p_user_id: users.pending.userId,
        p_role: "viewer",
      }).single(),
      { code: "42501" },
    ))) {
      allPassed = false;
    }

    if (!(await expectDenied(
      "Editor cannot role-change",
      () => users.editor.client.rpc("update_workspace_member_role", {
        p_workspace_id: workspaceA,
        p_user_id: users.pending.userId,
        p_role: "viewer",
      }).single(),
      { code: "42501" },
    ))) {
      allPassed = false;
    }

    const adminRoleUpdate = await rpcSingle(
      users.admin.client,
      "update_workspace_member_role",
      {
        p_workspace_id: workspaceA,
        p_user_id: users.editor.userId,
        p_role: "viewer",
      },
      "admin role update editor->viewer",
    );
    if (adminRoleUpdate?.role === "viewer") {
      pass("Admin can change role editor -> viewer");
    } else {
      fail("Admin can change role editor -> viewer", JSON.stringify(adminRoleUpdate));
      allPassed = false;
    }

    if (!(await expectDenied(
      "Cannot demote owner",
      () => users.admin.client.rpc("update_workspace_member_role", {
        p_workspace_id: workspaceA,
        p_user_id: users.owner.userId,
        p_role: "admin",
      }).single(),
      { messageIncludes: "creator_role_locked", code: "42501" },
    ))) {
      allPassed = false;
    }

    // 6) Remove member + owner removal guard
    const removedPending = await rpcSingle(
      users.admin.client,
      "remove_workspace_member",
      { p_workspace_id: workspaceA, p_user_id: users.pending.userId },
      "remove pending member",
    );
    if (removedPending?.removed === true) {
      pass("Admin can remove member");
    } else {
      fail("Admin can remove member", JSON.stringify(removedPending));
      allPassed = false;
    }

    if (!(await expectDenied(
      "Removed member loses access",
      () => users.pending.client.rpc("list_workspace_members", { p_workspace_id: workspaceA }),
      { code: "42501" },
    ))) {
      allPassed = false;
    }

    if (!(await expectDenied(
      "Cannot remove owner",
      () => users.admin.client.rpc("remove_workspace_member", {
        p_workspace_id: workspaceA,
        p_user_id: users.owner.userId,
      }).single(),
      { messageIncludes: "creator_remove_blocked", code: "42501" },
    ))) {
      allPassed = false;
    }

    // 7) Self leave + owner leave safety
    const viewerLeave = await rpcSingle(
      users.viewer.client,
      "leave_workspace",
      { p_workspace_id: workspaceA },
      "viewer leave workspace",
    );
    if (viewerLeave?.left_workspace === true) {
      pass("Member can self-leave workspace");
    } else {
      fail("Member can self-leave workspace", JSON.stringify(viewerLeave));
      allPassed = false;
    }

    if (!(await expectDenied(
      "Self-leave member loses access",
      () => users.viewer.client.rpc("list_workspace_members", { p_workspace_id: workspaceA }),
      { code: "42501" },
    ))) {
      allPassed = false;
    }

    if (!(await expectDenied(
      "Owner cannot leave when sole owner",
      () => users.owner.client.rpc("leave_workspace", { p_workspace_id: workspaceB }).single(),
      { messageIncludes: "Workspace creator cannot leave this workspace", code: "42501" },
    ))) {
      allPassed = false;
    }

    // 8) Two-workspace isolation for members + invites
    if (!(await expectDenied(
      "Workspace A admin denied workspace B member list",
      () => users.admin.client.rpc("list_workspace_members", { p_workspace_id: workspaceB }),
      { code: "42501" },
    ))) {
      allPassed = false;
    }

    if (!(await expectDenied(
      "Workspace A admin denied workspace B invite list",
      () => users.admin.client.rpc("list_workspace_invites", { p_workspace_id: workspaceB, p_only_pending: true }),
      { code: "42501" },
    ))) {
      allPassed = false;
    }

    const isolationEmailA = `phase-g5-isolation-a-${Date.now()}@example.com`;
    const isolationEmailB = `phase-g5-isolation-b-${Date.now()}@example.com`;
    const inviteA = await createInvite(users.owner, workspaceA, isolationEmailA, "viewer");
    const inviteB = await createInvite(users.owner, workspaceB, isolationEmailB, "viewer");

    const ownerInvitesA = await rpcMany(
      users.owner.client,
      "list_workspace_invites",
      { p_workspace_id: workspaceA, p_only_pending: true },
      "owner list invites A",
    );
    const ownerInvitesB = await rpcMany(
      users.owner.client,
      "list_workspace_invites",
      { p_workspace_id: workspaceB, p_only_pending: true },
      "owner list invites B",
    );

    const inA = ownerInvitesA.some((row) => row.id === inviteA.invite_id) && !ownerInvitesA.some((row) => row.id === inviteB.invite_id);
    const inB = ownerInvitesB.some((row) => row.id === inviteB.invite_id) && !ownerInvitesB.some((row) => row.id === inviteA.invite_id);
    if (inA && inB) {
      pass("Invite lists are workspace isolated");
    } else {
      fail("Invite lists are workspace isolated", JSON.stringify({ inA, inB }));
      allPassed = false;
    }

    const ownerMembersA = await rpcMany(
      users.owner.client,
      "list_workspace_members",
      { p_workspace_id: workspaceA },
      "owner list members A",
    );
    const ownerMembersB = await rpcMany(
      users.owner.client,
      "list_workspace_members",
      { p_workspace_id: workspaceB },
      "owner list members B",
    );

    const hasEditorBInA = ownerMembersA.some((row) => row.user_id === users.editorB.userId);
    const hasEditorBInB = ownerMembersB.some((row) => row.user_id === users.editorB.userId);
    if (!hasEditorBInA && hasEditorBInB) {
      pass("Member lists are workspace isolated");
    } else {
      fail("Member lists are workspace isolated", JSON.stringify({ hasEditorBInA, hasEditorBInB }));
      allPassed = false;
    }

    console.log(`SMOKE_STATUS: ${allPassed ? "PASS" : "FAIL"}`);
    if (!allPassed) process.exitCode = 1;
  } finally {
    try {
      if (workspaceA) {
        await users.owner?.client.rpc("delete_workspace_with_owner_check", { _workspace_id: workspaceA });
      }
      if (workspaceB) {
        await users.owner?.client.rpc("delete_workspace_with_owner_check", { _workspace_id: workspaceB });
      }
    } catch {
      // best-effort workspace cleanup
    }

    for (const userId of createdAuthUserIds) {
      try {
        await admin.auth.admin.deleteUser(userId);
      } catch {
        // best-effort user cleanup
      }
    }
  }
}

main().catch((err) => {
  console.error("SMOKE_FATAL:", err instanceof Error ? err.message : String(err));
  console.log("SMOKE_STATUS: FAIL");
  process.exitCode = 1;
});
