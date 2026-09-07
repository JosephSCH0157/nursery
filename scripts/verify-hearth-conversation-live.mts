import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function envFile(file: string): Record<string, string> {
  return Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/).flatMap((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    return match ? [[match[1], match[2].trim().replace(/^(['"])(.*)\1$/, "$2")]] : [];
  }));
}

function requireValue(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const env = envFile(path.resolve(import.meta.dirname, "../apps/nursery/.env.local"));
const url = requireValue(env.TONGS_SUPABASE_URL ?? env.VITE_SUPABASE_URL, "Supabase URL");
const anon = requireValue(env.TONGS_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY, "Supabase publishable key");
const serviceKey = requireValue(env.TONGS_SERVICE_ROLE_KEY, "Supabase server key");
const suffix = crypto.randomUUID();
const email = `hearth-conversation-${suffix}@example.invalid`;
const password = `Hearth-${crypto.randomUUID()}!`;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const user = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
let userId: string | null = null;
let workspaceId: string | null = null;

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("Fixture user was not created");
  userId = created.data.user.id;
  const signedIn = await user.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("Fixture sign-in failed");

  const workspace = await user.schema("tongs").rpc("create_workspace_with_owner", { _name: `Hearth conversation ${suffix}` });
  if (workspace.error || !Array.isArray(workspace.data) || !workspace.data[0]?.id) throw workspace.error ?? new Error("Fixture workspace was not created");
  workspaceId = String(workspace.data[0].id);
  const episode = await user.schema("tongs").rpc("create_recording_workpiece", {
    p_workspace_id: workspaceId,
    p_title: "Disposable Hearth conversation verification",
    p_origin_venue: "anvil",
    p_operation_key: `hearth-conversation-${suffix}`,
  });
  const workpieceId = episode.data && typeof episode.data === "object" && "workpiece_id" in episode.data
    ? String(episode.data.workpiece_id)
    : "";
  if (episode.error || !workpieceId) throw episode.error ?? new Error("Fixture workpiece was not created");

  const expected = "Disposable canonical conversation verification.";
  const appended = await user.schema("tongs").rpc("append_my_hearth_conversation_messages", {
    p_workspace_id: workspaceId,
    p_workpiece_id: workpieceId,
    p_generation: 1,
    p_messages: [{ client_message_key: `verify:${suffix}`, role: "user", content: expected }],
    p_import_completeness: null,
  });
  if (appended.error || appended.data?.status !== "committed") throw appended.error ?? new Error("Canonical append was not committed");
  const readback = await user.schema("tongs").rpc("read_my_hearth_conversation", {
    p_workspace_id: workspaceId,
    p_workpiece_id: workpieceId,
    p_after_sequence: 0,
    p_limit: 100,
  });
  if (readback.error || !Array.isArray(readback.data) || readback.data[0]?.content !== expected) throw readback.error ?? new Error("Canonical readback did not match");
  console.log(`Authenticated append/readback passed against ${new URL(url).origin}.`);
} finally {
  if (workspaceId) await admin.schema("tongs").from("workspaces").delete().eq("id", workspaceId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}
