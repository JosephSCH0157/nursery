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

async function expectDenied(name, operation) {
  try {
    await operation();
    fail(name, "expected denial but succeeded");
    return false;
  } catch (err) {
    pass(name, err instanceof Error ? err.message : String(err));
    return true;
  }
}

async function main() {
  const root = process.cwd();
  const env = {
    ...parseEnvFile(path.join(root, "apps/nursery/.env")),
    ...parseEnvFile(path.join(root, "apps/nursery/.env.local")),
    ...parseEnvFile(path.join(root, "apps/bar-stock/.env.local")),
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
    const email = `phase-d-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const password = `P@ss-${crypto.randomUUID()}!`;

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { smoke_label: `phase-d-${label}` },
    });
    if (created.error || !created.data.user?.id) {
      throw new Error(`${label} createUser failed: ${created.error?.message ?? "unknown"}`);
    }

    const client = appClient();
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.user?.id) {
      throw new Error(`${label} signIn failed: ${signedIn.error?.message ?? "unknown"}`);
    }

    createdAuthUserIds.push(created.data.user.id);
    return {
      label,
      email,
      userId: signedIn.data.user.id,
      client,
    };
  };

  try {
    users.owner = await createUser("owner");
    users.admin = await createUser("admin");
    users.editorA = await createUser("editor-a");
    users.viewerA = await createUser("viewer-a");
    users.editorB = await createUser("editor-b");
    users.nonMember = await createUser("non-member");

    const wsA = ensureNoError(
      await users.owner.client.rpc("create_workspace_with_owner", { _name: `Phase D A ${Date.now()}` }),
      "create workspace A",
    );
    workspaceA = wsA?.[0]?.id ?? null;
    if (!workspaceA) throw new Error("workspace A id missing");

    const wsB = ensureNoError(
      await users.owner.client.rpc("create_workspace_with_owner", { _name: `Phase D B ${Date.now()}` }),
      "create workspace B",
    );
    workspaceB = wsB?.[0]?.id ?? null;
    if (!workspaceB) throw new Error("workspace B id missing");

    const inviteAndAccept = async (workspaceId, invitee, role) => {
      const invite = ensureNoError(
        await users.owner.client.rpc("create_workspace_invite", {
          p_workspace_id: workspaceId,
          p_email: invitee.email.toLowerCase(),
          p_role: role,
          p_expires_hours: 72,
        }),
        `create invite ${invitee.label}`,
      );
      const token = invite?.[0]?.token ?? null;
      if (!token) throw new Error(`missing invite token for ${invitee.label}`);
      ensureNoError(
        await invitee.client.rpc("accept_workspace_invite", { p_token: token }),
        `accept invite ${invitee.label}`,
      );
    };

    await inviteAndAccept(workspaceA, users.admin, "admin");
    await inviteAndAccept(workspaceA, users.editorA, "editor");
    await inviteAndAccept(workspaceA, users.viewerA, "viewer");
    await inviteAndAccept(workspaceB, users.editorB, "editor");

    const projectA = crypto.randomUUID();
    const projectB = crypto.randomUUID();
    const sparkA1 = crypto.randomUUID();
    const sparkB1 = crypto.randomUUID();

    ensureNoError(await users.owner.client.from("barstock_assignments").insert({
      id: projectA,
      workspace_id: workspaceA,
      created_by: users.owner.userId,
      title: "Project A",
      status: "open",
    }), "insert project A");

    ensureNoError(await users.owner.client.from("barstock_assignments").insert({
      id: projectB,
      workspace_id: workspaceB,
      created_by: users.owner.userId,
      title: "Project B",
      status: "open",
    }), "insert project B");

    ensureNoError(await users.owner.client.from("barstock_sparks").insert({
      id: sparkA1,
      workspace_id: workspaceA,
      created_by: users.owner.userId,
      assignment_id: projectA,
      title: "A1",
      body: "A1 spark body",
      tags: ["alpha"],
      status: "raw",
      source: "typed",
      pinned: false,
    }), "insert A1");

    ensureNoError(await users.owner.client.from("barstock_sparks").insert({
      id: sparkB1,
      workspace_id: workspaceB,
      created_by: users.owner.userId,
      assignment_id: projectB,
      title: "B1",
      body: "B1 spark body",
      tags: ["bravo"],
      status: "raw",
      source: "typed",
      pinned: false,
    }), "insert B1");

    const sparkTitles = async (user, workspaceId) => {
      const rows = ensureNoError(
        await user.client
          .from("barstock_sparks")
          .select("title")
          .eq("workspace_id", workspaceId)
          .is("deleted_at", null),
        `sparkTitles ${user.label}`,
      );
      return (rows ?? []).map((row) => String(row.title ?? "")).filter(Boolean);
    };

    const editorAA = await sparkTitles(users.editorA, workspaceA);
    const editorAB = await sparkTitles(users.editorA, workspaceB);
    if (editorAA.includes("A1") && !editorAA.includes("B1") && editorAB.length === 0) pass("Isolation EditorA A/B");
    else { fail("Isolation EditorA A/B", JSON.stringify({ editorAA, editorAB })); allPassed = false; }

    const editorBA = await sparkTitles(users.editorB, workspaceA);
    const editorBB = await sparkTitles(users.editorB, workspaceB);
    if (editorBB.includes("B1") && !editorBB.includes("A1") && editorBA.length === 0) pass("Isolation EditorB A/B");
    else { fail("Isolation EditorB A/B", JSON.stringify({ editorBA, editorBB })); allPassed = false; }

    const viewerAA = await sparkTitles(users.viewerA, workspaceA);
    const viewerAB = await sparkTitles(users.viewerA, workspaceB);
    if (viewerAA.includes("A1") && viewerAB.length === 0) pass("Isolation ViewerA A/B");
    else { fail("Isolation ViewerA A/B", JSON.stringify({ viewerAA, viewerAB })); allPassed = false; }

    const nonMemberA = await sparkTitles(users.nonMember, workspaceA);
    const nonMemberB = await sparkTitles(users.nonMember, workspaceB);
    if (nonMemberA.length === 0 && nonMemberB.length === 0) pass("Isolation NonMember");
    else { fail("Isolation NonMember", JSON.stringify({ nonMemberA, nonMemberB })); allPassed = false; }

    if (!(await expectDenied("Viewer create denied", async () => {
      ensureNoError(await users.viewerA.client.from("barstock_sparks").insert({
        id: crypto.randomUUID(),
        workspace_id: workspaceA,
        created_by: users.viewerA.userId,
        assignment_id: projectA,
        title: "viewer-denied",
        body: "denied",
        tags: [],
        status: "raw",
        source: "typed",
        pinned: false,
      }), "viewer insert");
    }))) allPassed = false;

    try {
      ensureNoError(await users.editorA.client.from("barstock_sparks").insert({
        id: crypto.randomUUID(),
        workspace_id: workspaceA,
        created_by: users.editorA.userId,
        assignment_id: projectA,
        title: "A2",
        body: "allowed",
        tags: [],
        status: "raw",
        source: "typed",
        pinned: false,
      }), "editorA insert A2");
      pass("EditorA create in A");
    } catch (err) {
      fail("EditorA create in A", err instanceof Error ? err.message : String(err));
      allPassed = false;
    }

    try {
      ensureNoError(await users.editorA.client.from("barstock_sparks").delete().eq("id", sparkA1), "editor delete A1");
      const stillExists = ensureNoError(
        await users.owner.client.from("barstock_sparks").select("id").eq("id", sparkA1).maybeSingle(),
        "verify A1 after editor delete",
      );
      if (stillExists?.id === sparkA1) {
        pass("EditorA delete denied (admin+)");
      } else {
        fail("EditorA delete denied (admin+)", "spark was deleted");
        allPassed = false;
      }
    } catch (err) {
      fail("EditorA delete denied (admin+)", err instanceof Error ? err.message : String(err));
      allPassed = false;
    }

    const spoofRows = ensureNoError(
      await users.editorA.client.from("barstock_sparks").select("id").eq("workspace_id", workspaceB),
      "spoof read",
    );
    if ((spoofRows ?? []).length === 0) pass("Spoof read by workspace_id=B returns nothing");
    else { fail("Spoof read by workspace_id=B returns nothing", JSON.stringify(spoofRows)); allPassed = false; }

    if (!(await expectDenied("Spoof write to workspace B denied", async () => {
      ensureNoError(await users.editorA.client.from("barstock_sparks").insert({
        id: crypto.randomUUID(),
        workspace_id: workspaceB,
        created_by: users.editorA.userId,
        assignment_id: projectB,
        title: "spoof-denied",
        body: "denied",
        tags: [],
        status: "raw",
        source: "typed",
        pinned: false,
      }), "spoof write");
    }))) allPassed = false;

    const searchRows = ensureNoError(
      await users.editorA.client
        .from("barstock_sparks")
        .select("id,title")
        .eq("workspace_id", workspaceA)
        .ilike("body", "%B1 spark body%"),
      "search in A",
    );
    if ((searchRows ?? []).length === 0) pass("Search in A does not leak B1");
    else { fail("Search in A does not leak B1", JSON.stringify(searchRows)); allPassed = false; }

    console.log(`SMOKE_STATUS: ${allPassed ? "PASS" : "FAIL"}`);
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

    for (const authUserId of createdAuthUserIds) {
      try {
        await admin.auth.admin.deleteUser(authUserId);
      } catch {
        // best-effort auth cleanup
      }
    }
  }

  if (!allPassed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("SMOKE_FATAL:", err instanceof Error ? err.message : String(err));
  console.log("SMOKE_STATUS: FAIL");
  process.exitCode = 1;
});
