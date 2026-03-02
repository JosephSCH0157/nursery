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
    const email = `phase-e-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const password = `P@ss-${crypto.randomUUID()}!`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { smoke_label: `phase-e-${label}` },
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
      await users.owner.client.rpc("create_workspace_with_owner", { _name: `Phase E A ${Date.now()}` }),
      "create workspace A",
    );
    workspaceA = wsA?.[0]?.id ?? null;
    if (!workspaceA) throw new Error("workspace A id missing");

    const wsB = ensureNoError(
      await users.owner.client.rpc("create_workspace_with_owner", { _name: `Phase E B ${Date.now()}` }),
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

    const episodeA = crypto.randomUUID();
    const episodeB = crypto.randomUUID();
    ensureNoError(await users.owner.client.from("episodes").insert({
      id: episodeA,
      workspace_id: workspaceA,
      label: "Episode A",
    }), "insert episode A");
    ensureNoError(await users.owner.client.from("episodes").insert({
      id: episodeB,
      workspace_id: workspaceB,
      label: "Episode B",
    }), "insert episode B");

    const eventAStart = new Date().toISOString();
    const eventBStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const eventA = ensureNoError(await users.owner.client.from("calendar_events").insert({
      workspace_id: workspaceA,
      title: "A-event",
      start_at: eventAStart,
      all_day: false,
      created_by: users.owner.userId,
    }).select("*").single(), "insert A-event");

    const eventB = ensureNoError(await users.owner.client.from("calendar_events").insert({
      workspace_id: workspaceB,
      title: "B-event",
      start_at: eventBStart,
      all_day: false,
      created_by: users.owner.userId,
    }).select("*").single(), "insert B-event");

    const eventTitles = async (user, workspaceId) => {
      const rows = ensureNoError(
        await user.client.from("calendar_events").select("title").eq("workspace_id", workspaceId),
        `eventTitles ${user.label}`,
      );
      return (rows ?? []).map((row) => String(row.title ?? "")).filter(Boolean);
    };

    const editorAA = await eventTitles(users.editorA, workspaceA);
    const editorAB = await eventTitles(users.editorA, workspaceB);
    if (editorAA.includes("A-event") && !editorAA.includes("B-event") && editorAB.length === 0) pass("Isolation EditorA A/B events");
    else { fail("Isolation EditorA A/B events", JSON.stringify({ editorAA, editorAB })); allPassed = false; }

    const editorBA = await eventTitles(users.editorB, workspaceA);
    const editorBB = await eventTitles(users.editorB, workspaceB);
    if (editorBB.includes("B-event") && !editorBB.includes("A-event") && editorBA.length === 0) pass("Isolation EditorB A/B events");
    else { fail("Isolation EditorB A/B events", JSON.stringify({ editorBA, editorBB })); allPassed = false; }

    const viewerAA = await eventTitles(users.viewerA, workspaceA);
    const viewerAB = await eventTitles(users.viewerA, workspaceB);
    if (viewerAA.includes("A-event") && viewerAB.length === 0) pass("Isolation ViewerA A/B events");
    else { fail("Isolation ViewerA A/B events", JSON.stringify({ viewerAA, viewerAB })); allPassed = false; }

    const nonMemberA = await eventTitles(users.nonMember, workspaceA);
    const nonMemberB = await eventTitles(users.nonMember, workspaceB);
    if (nonMemberA.length === 0 && nonMemberB.length === 0) pass("Isolation NonMember events");
    else { fail("Isolation NonMember events", JSON.stringify({ nonMemberA, nonMemberB })); allPassed = false; }

    if (!(await expectDenied("Viewer event create denied", async () => {
      ensureNoError(await users.viewerA.client.from("calendar_events").insert({
        workspace_id: workspaceA,
        title: "viewer-denied-event",
        start_at: new Date().toISOString(),
        all_day: false,
        created_by: users.viewerA.userId,
      }), "viewer create event");
    }))) allPassed = false;

    try {
      ensureNoError(await users.editorA.client.from("calendar_events").insert({
        workspace_id: workspaceA,
        title: "A-editor-event",
        start_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        all_day: false,
        created_by: users.editorA.userId,
      }), "editor create event");
      pass("EditorA event create allowed");
    } catch (err) {
      fail("EditorA event create allowed", err instanceof Error ? err.message : String(err));
      allPassed = false;
    }

    try {
      ensureNoError(await users.editorA.client.from("calendar_events").delete().eq("id", eventA.id), "editor delete A-event");
      const stillExists = ensureNoError(
        await users.owner.client.from("calendar_events").select("id").eq("id", eventA.id).maybeSingle(),
        "verify A-event after editor delete",
      );
      if (stillExists?.id === eventA.id) {
        pass("EditorA event delete denied (admin+)");
      } else {
        fail("EditorA event delete denied (admin+)", "event was deleted");
        allPassed = false;
      }
    } catch (err) {
      fail("EditorA event delete denied (admin+)", err instanceof Error ? err.message : String(err));
      allPassed = false;
    }

    const spoofRead = ensureNoError(
      await users.editorA.client.from("calendar_events").select("id,title").eq("workspace_id", workspaceB),
      "spoof read workspace B events",
    );
    if ((spoofRead ?? []).length === 0) pass("Spoof read workspace B blocked");
    else { fail("Spoof read workspace B blocked", JSON.stringify(spoofRead)); allPassed = false; }

    if (!(await expectDenied("Spoof event create in B denied", async () => {
      ensureNoError(await users.editorA.client.from("calendar_events").insert({
        workspace_id: workspaceB,
        title: "spoof-denied-event",
        start_at: new Date().toISOString(),
        all_day: false,
        created_by: users.editorA.userId,
      }), "spoof create event");
    }))) allPassed = false;

    try {
      ensureNoError(await users.editorA.client.from("calendar_event_assignments").insert({
        event_id: eventA.id,
        assignment_id: episodeA,
        workspace_id: workspaceA,
        created_by: users.editorA.userId,
      }), "editor attach episode A");
      pass("EditorA attach episode to A-event");
    } catch (err) {
      fail("EditorA attach episode to A-event", err instanceof Error ? err.message : String(err));
      allPassed = false;
    }

    if (!(await expectDenied("Viewer attach denied", async () => {
      ensureNoError(await users.viewerA.client.from("calendar_event_assignments").insert({
        event_id: eventA.id,
        assignment_id: episodeA,
        workspace_id: workspaceA,
        created_by: users.viewerA.userId,
      }), "viewer attach");
    }))) allPassed = false;

    if (!(await expectDenied("Cross-workspace episode attach denied", async () => {
      ensureNoError(await users.editorA.client.from("calendar_event_assignments").insert({
        event_id: eventA.id,
        assignment_id: episodeB,
        workspace_id: workspaceA,
        created_by: users.editorA.userId,
      }), "editor cross-workspace attach");
    }))) allPassed = false;

    const assignmentSpoofRead = ensureNoError(
      await users.editorA.client.from("calendar_event_assignments").select("event_id,assignment_id").eq("workspace_id", workspaceB),
      "spoof read workspace B assignments",
    );
    if ((assignmentSpoofRead ?? []).length === 0) pass("Spoof assignment read workspace B blocked");
    else { fail("Spoof assignment read workspace B blocked", JSON.stringify(assignmentSpoofRead)); allPassed = false; }

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
