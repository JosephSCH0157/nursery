import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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

function pass(name, detail = "") {
  console.log(`PASS ${name}${detail ? ` :: ${detail}` : ""}`);
}

function fail(name, detail = "") {
  console.log(`FAIL ${name}${detail ? ` :: ${detail}` : ""}`);
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

function readErrorCode(result) {
  if (!result || typeof result !== "object") return null;
  if (!("error" in result)) return null;
  const err = result.error;
  if (!err || typeof err !== "object") return null;
  return typeof err.code === "string" ? err.code : null;
}

function readErrorMessage(result) {
  if (!result || typeof result !== "object") return "";
  if (!("error" in result)) return "";
  const err = result.error;
  if (!err || typeof err !== "object") return "";
  return typeof err.message === "string" ? err.message : "";
}

async function expectDenied(name, operation, options = {}) {
  const { code = null, messageIncludes = null } = options;
  const result = await operation();
  if (!result.error) {
    fail(name, "expected denial but operation succeeded");
    return false;
  }
  const actualCode = readErrorCode(result);
  const actualMessage = readErrorMessage(result);
  if (code && actualCode !== code) {
    fail(name, `expected code=${code}, got ${actualCode ?? "unknown"}`);
    return false;
  }
  if (messageIncludes && !actualMessage.includes(messageIncludes)) {
    fail(name, `expected message containing \"${messageIncludes}\", got \"${actualMessage}\"`);
    return false;
  }
  pass(name, `${actualMessage}${actualCode ? ` (${actualCode})` : ""}`);
  return true;
}

async function main() {
  const root = process.cwd();
  const env = {
    ...parseEnvFile(path.join(root, "apps/nursery/.env")),
    ...parseEnvFile(path.join(root, "apps/nursery/.env.local")),
    ...parseEnvFile(path.join(root, "apps/bar-stock/.env.local")),
    ...process.env,
  };

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = env.TONGS_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, or TONGS_SERVICE_ROLE_KEY");
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
  let allPassed = true;

  const createUser = async (label) => {
    const email = `phase-style-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const password = `P@ss-${crypto.randomUUID()}!`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { smoke_label: `phase-style-${label}` },
    });
    if (created.error || !created.data.user?.id) {
      throw new Error(`${label} createUser failed: ${created.error?.message ?? "unknown"}`);
    }

    const client = appClient();
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.user?.id || !signIn.data.session?.access_token) {
      throw new Error(`${label} signIn failed: ${signIn.error?.message ?? "unknown"}`);
    }

    createdAuthUserIds.push(signIn.data.user.id);
    return {
      label,
      email,
      userId: signIn.data.user.id,
      client,
    };
  };

  const rpcOne = async (client, fn, args, context) => {
    const data = ensureNoError(await client.rpc(fn, args), context);
    return firstRow(data);
  };

  const inviteAndAccept = async (owner, invitee, role) => {
    const invite = await rpcOne(owner.client, "create_workspace_invite", {
      p_workspace_id: workspaceId,
      p_email: invitee.email.toLowerCase(),
      p_role: role,
      p_expires_hours: 24,
    }, `create invite (${invitee.label})`);
    if (!invite?.token) throw new Error(`missing invite token for ${invitee.label}`);
    await rpcOne(invitee.client, "accept_workspace_invite", { p_token: invite.token }, `accept invite (${invitee.label})`);
  };

  try {
    users.owner = await createUser("owner");
    users.admin = await createUser("admin");
    users.editor = await createUser("editor");
    users.viewer = await createUser("viewer");
    users.nonMember = await createUser("non-member");

    const workspace = await rpcOne(users.owner.client, "create_workspace_with_owner", {
      _name: `Phase Adaptive Style ${Date.now()}`,
    }, "create workspace");
    workspaceId = workspace?.id ?? null;
    if (!workspaceId) throw new Error("Workspace id missing from create_workspace_with_owner");

    await inviteAndAccept(users.owner, users.admin, "admin");
    await inviteAndAccept(users.owner, users.editor, "editor");
    await inviteAndAccept(users.owner, users.viewer, "viewer");

    // Schema existence smoke: feature columns are queryable and default false.
    const wsRow = ensureNoError(
      await admin.from("workspaces")
        .select("id, adaptive_style_alignment_enabled, adaptive_style_ai_accelerate_enabled")
        .eq("id", workspaceId)
        .single(),
      "read workspace feature columns",
    );
    if (wsRow.adaptive_style_alignment_enabled === false && wsRow.adaptive_style_ai_accelerate_enabled === false) {
      pass("Workspace feature columns exist with false defaults");
    } else {
      fail("Workspace feature columns exist with false defaults", JSON.stringify(wsRow));
      allPassed = false;
    }

    // Table existence smoke.
    const tableProbe = await admin.from("user_style_profile")
      .select("workspace_id,user_id,last_updated")
      .eq("workspace_id", workspaceId)
      .limit(1);
    if (!tableProbe.error) {
      pass("user_style_profile table exists and is readable via service role");
    } else {
      fail("user_style_profile table exists and is readable via service role", tableProbe.error.message);
      allPassed = false;
    }

    // Member read: get feature flags as viewer.
    const viewerFeatures = await users.viewer.client.rpc("get_my_workspace_features", {
      p_workspace_id: workspaceId,
    });
    if (!viewerFeatures.error && firstRow(viewerFeatures.data)?.adaptive_style_alignment_enabled === false) {
      pass("Viewer can read workspace features");
    } else {
      fail("Viewer can read workspace features", viewerFeatures.error?.message ?? "unexpected payload");
      allPassed = false;
    }

    // Non-member denied on feature read.
    if (!(await expectDenied(
      "Non-member denied get_my_workspace_features",
      () => users.nonMember.client.rpc("get_my_workspace_features", { p_workspace_id: workspaceId }),
      { code: "42501" },
    ))) {
      allPassed = false;
    }

    // Only admin+ can toggle flags.
    if (!(await expectDenied(
      "Viewer denied set_adaptive_style_features",
      () => users.viewer.client.rpc("set_adaptive_style_features", {
        p_workspace_id: workspaceId,
        p_alignment_enabled: true,
        p_ai_accelerate_enabled: false,
      }),
      { code: "42501" },
    ))) {
      allPassed = false;
    }

    if (!(await expectDenied(
      "Editor denied set_adaptive_style_features",
      () => users.editor.client.rpc("set_adaptive_style_features", {
        p_workspace_id: workspaceId,
        p_alignment_enabled: true,
        p_ai_accelerate_enabled: false,
      }),
      { code: "42501" },
    ))) {
      allPassed = false;
    }

    // Force flags off and prove no writes.
    await rpcOne(users.admin.client, "set_adaptive_style_features", {
      p_workspace_id: workspaceId,
      p_alignment_enabled: false,
      p_ai_accelerate_enabled: false,
    }, "admin disable adaptive style features");
    pass("Admin can set feature flags");

    const offWriteAttempt = await users.editor.client.rpc("upsert_style_profile_metrics", {
      p_workspace_id: workspaceId,
      p_avg_sentence_length: 13,
      p_sentence_length_variance: 8,
      p_pause_per_1000_words: 2,
      p_reflective_pause_ratio: 0.2,
      p_avg_s1_block_length: 15,
      p_avg_s2_block_length: 14,
      p_structural_intent_vector: { hook: 0.4, evidence: 0.3, narrative: 0.2, close: 0.1 },
      p_adaptation_weight: 0.15,
    });
    if (offWriteAttempt.error && readErrorCode(offWriteAttempt) === "42501"
      && readErrorMessage(offWriteAttempt).includes("disabled")) {
      pass("Flags off blocks style profile writes");
    } else {
      fail("Flags off blocks style profile writes", offWriteAttempt.error?.message ?? "write unexpectedly succeeded");
      allPassed = false;
    }

    const beforeEnableRows = ensureNoError(
      await admin.from("user_style_profile")
        .select("workspace_id,user_id,scripts_analyzed_count,last_updated")
        .eq("workspace_id", workspaceId)
        .eq("user_id", users.editor.userId),
      "query style profile row before enable",
    );
    if (beforeEnableRows.length === 0) {
      pass("Flags off produced zero profile rows");
    } else {
      fail("Flags off produced zero profile rows", JSON.stringify(beforeEnableRows[0]));
      allPassed = false;
    }

    // Enable alignment only.
    const enabled = await rpcOne(users.admin.client, "set_adaptive_style_features", {
      p_workspace_id: workspaceId,
      p_alignment_enabled: true,
      p_ai_accelerate_enabled: false,
    }, "admin enable alignment only");
    if (enabled?.adaptive_style_alignment_enabled === true
      && enabled?.adaptive_style_ai_accelerate_enabled === false) {
      pass("Alignment enabled while AI accelerate remains disabled");
    } else {
      fail("Alignment enabled while AI accelerate remains disabled", JSON.stringify(enabled));
      allPassed = false;
    }

    const accelerateOn = await rpcOne(users.admin.client, "set_adaptive_style_features", {
      p_workspace_id: workspaceId,
      p_alignment_enabled: true,
      p_ai_accelerate_enabled: true,
    }, "admin enable AI accelerate");
    if (accelerateOn?.adaptive_style_alignment_enabled === true
      && accelerateOn?.adaptive_style_ai_accelerate_enabled === true) {
      pass("Admin can enable AI accelerate");
    } else {
      fail("Admin can enable AI accelerate", JSON.stringify(accelerateOn));
      allPassed = false;
    }

    const accelerateOff = await rpcOne(users.admin.client, "set_adaptive_style_features", {
      p_workspace_id: workspaceId,
      p_alignment_enabled: true,
      p_ai_accelerate_enabled: false,
    }, "admin disable AI accelerate");
    if (accelerateOff?.adaptive_style_alignment_enabled === true
      && accelerateOff?.adaptive_style_ai_accelerate_enabled === false) {
      pass("Admin can disable AI accelerate");
    } else {
      fail("Admin can disable AI accelerate", JSON.stringify(accelerateOff));
      allPassed = false;
    }

    const upsertEnabled = await users.editor.client.rpc("upsert_style_profile_metrics", {
      p_workspace_id: workspaceId,
      p_avg_sentence_length: 12,
      p_sentence_length_variance: 6,
      p_pause_per_1000_words: 4,
      p_reflective_pause_ratio: 0.25,
      p_avg_s1_block_length: 18,
      p_avg_s2_block_length: 17,
      p_structural_intent_vector: { hook: 0.2, evidence: 0.5, narrative: 0.2, close: 0.1 },
      p_adaptation_weight: 0.15,
    });
    const upsertRow = firstRow(upsertEnabled.data);
    if (!upsertEnabled.error && upsertRow?.scripts_analyzed_count === 1) {
      pass("Alignment enabled allows profile write on checkpoint");
    } else {
      fail("Alignment enabled allows profile write on checkpoint", upsertEnabled.error?.message ?? JSON.stringify(upsertRow));
      allPassed = false;
    }

    const editorDirectRead = await users.editor.client.from("user_style_profile")
      .select("workspace_id,user_id,scripts_analyzed_count")
      .eq("workspace_id", workspaceId)
      .eq("user_id", users.editor.userId);
    if (!editorDirectRead.error && Array.isArray(editorDirectRead.data) && editorDirectRead.data.length === 1) {
      pass("RLS allows member to read own style profile row");
    } else {
      fail("RLS allows member to read own style profile row", editorDirectRead.error?.message ?? JSON.stringify(editorDirectRead.data));
      allPassed = false;
    }

    const viewerOtherRead = await users.viewer.client.from("user_style_profile")
      .select("workspace_id,user_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", users.editor.userId);
    if (!viewerOtherRead.error && Array.isArray(viewerOtherRead.data) && viewerOtherRead.data.length === 0) {
      pass("RLS hides other users' style profile rows");
    } else {
      fail("RLS hides other users' style profile rows", viewerOtherRead.error?.message ?? JSON.stringify(viewerOtherRead.data));
      allPassed = false;
    }

    const profileRead = await users.editor.client.rpc("get_my_style_profile", {
      p_workspace_id: workspaceId,
    });
    const profileRow = firstRow(profileRead.data);
    if (!profileRead.error && profileRow?.scripts_analyzed_count === 1) {
      pass("Profile read returns updated row");
    } else {
      fail("Profile read returns updated row", profileRead.error?.message ?? JSON.stringify(profileRow));
      allPassed = false;
    }

    const auditRows = ensureNoError(
      await admin.from("hearth_interaction_events")
        .select("event_type,workspace_id,user_id,payload,created_at")
        .eq("workspace_id", workspaceId)
        .eq("event_type", "workspace.feature.toggled")
        .order("created_at", { ascending: false })
        .limit(20),
      "query feature toggle audit events",
    );
    const hasAuditForFlag = (flagName) => auditRows.some((row) => {
      const payload = row && typeof row.payload === "object" && row.payload !== null ? row.payload : null;
      if (!payload) return false;
      return payload.workspace_id === workspaceId
        && payload.flag_name === flagName
        && typeof payload.old === "boolean"
        && typeof payload.new === "boolean"
        && payload.actor_user_id === users.admin.userId
        && typeof payload.timestamp === "string"
        && payload.timestamp.length > 0;
    });
    if (hasAuditForFlag("adaptive_style_alignment_enabled")) {
      pass("Feature toggle audit emits alignment flag events");
    } else {
      fail("Feature toggle audit emits alignment flag events", JSON.stringify(auditRows[0] ?? null));
      allPassed = false;
    }
    if (hasAuditForFlag("adaptive_style_ai_accelerate_enabled")) {
      pass("Feature toggle audit emits AI accelerate flag events");
    } else {
      fail("Feature toggle audit emits AI accelerate flag events", JSON.stringify(auditRows[0] ?? null));
      allPassed = false;
    }

    const viewerDirectInsert = await users.viewer.client.from("user_style_profile").insert({
      workspace_id: workspaceId,
      user_id: users.viewer.userId,
      avg_sentence_length: 11,
    });
    if (viewerDirectInsert.error && readErrorCode(viewerDirectInsert) === "42501") {
      pass("Direct table writes are blocked for authenticated users");
    } else {
      fail("Direct table writes are blocked for authenticated users", viewerDirectInsert.error?.message ?? "unexpected insert success");
      allPassed = false;
    }

    const reset = await users.editor.client.rpc("reset_my_style_profile", {
      p_workspace_id: workspaceId,
    });
    const resetRow = firstRow(reset.data);
    if (!reset.error && resetRow?.reset === true) {
      pass("Reset profile succeeds for member");
    } else {
      fail("Reset profile succeeds for member", reset.error?.message ?? JSON.stringify(resetRow));
      allPassed = false;
    }

    const afterResetRows = ensureNoError(
      await admin.from("user_style_profile")
        .select("workspace_id,user_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", users.editor.userId),
      "query style profile row after reset",
    );
    if (afterResetRows.length === 0) {
      pass("Reset removes profile influence row immediately");
    } else {
      fail("Reset removes profile influence row immediately", JSON.stringify(afterResetRows[0]));
      allPassed = false;
    }

    console.log(`SMOKE_STATUS: ${allPassed ? "PASS" : "FAIL"}`);
    if (!allPassed) process.exitCode = 1;
  } finally {
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
  }
}

main().catch((error) => {
  console.error("SMOKE_FATAL:", error instanceof Error ? error.message : String(error));
  console.log("SMOKE_STATUS: FAIL");
  process.exitCode = 1;
});
