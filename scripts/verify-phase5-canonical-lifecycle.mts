import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseBarStockRepository } from "../apps/bar-stock/src/lib/bar-stock-repository.ts";
import { createTongsCommitService } from "../packages/tongs/src/workpiece-commit-api.ts";

function localEnv(): Record<string, string> {
  const raw = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8" });
  return Object.fromEntries(raw.split(/\r?\n/).flatMap((line) => {
    const match = /^([A-Z_]+)="(.*)"$/.exec(line.trim());
    return match ? [[match[1], match[2]]] : [];
  }));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const env = localEnv();
assert(env.API_URL && env.ANON_KEY && env.SERVICE_ROLE_KEY, "local Supabase is unavailable");
assert(new URL(env.API_URL).hostname === "127.0.0.1", "Phase 5 proof refuses non-local Supabase");

const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const service = createTongsCommitService({
  supabaseUrl: env.API_URL,
  supabaseServiceRoleKey: env.SERVICE_ROLE_KEY,
});
const appClient = () => createClient(env.API_URL, env.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const email = `phase5-${crypto.randomUUID()}@example.test`;
const password = `Phase5-${crypto.randomUUID()}!`;
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
assert(!created.error && created.data.user, `create user: ${created.error?.message}`);
const owner = appClient();
const signedIn = await owner.auth.signInWithPassword({ email, password });
assert(!signedIn.error && signedIn.data.user && signedIn.data.session, `sign in: ${signedIn.error?.message}`);
const userId = signedIn.data.user.id;
const token = signedIn.data.session.access_token;

const workspaceResult = await owner.schema("tongs").rpc("create_workspace_with_owner", {
  _name: `Phase 5 canonical proof ${Date.now()}`,
});
assert(!workspaceResult.error && Array.isArray(workspaceResult.data), `create workspace: ${workspaceResult.error?.message}`);
const workspaceId = workspaceResult.data[0]?.id as string | undefined;
assert(workspaceId, "workspace id missing");
const scope = { workspaceId, userId };
const repository = createSupabaseBarStockRepository(owner);

const assignmentId = crypto.randomUUID();
const sparkId = crypto.randomUUID();
const now = Date.now();
const assignment = await repository.createAssignment(scope, {
  id: assignmentId, name: "Phase 5 canonical lifecycle", revision: 0, createdAt: now, updatedAt: now,
}, `phase5-assignment:${assignmentId}`);
assert(assignment.outcome === "saved" && assignment.row?.revision === 1, "production Assignment create failed");
const spark = await repository.createSpark(scope, {
  id: sparkId,
  revision: 0,
  assignmentId,
  title: "Canonical lifecycle Spark",
  body: "A production-repository Spark for the Phase 5 lifecycle proof.",
  tags: ["phase5", "canonical"],
  status: "raw",
  source: "typed",
  pinned: false,
  createdAt: now,
  updatedAt: now,
}, `phase5-spark:${sparkId}`);
assert(spark.outcome === "saved" && spark.row?.revision === 1, "production Spark create failed");

const duplicateSpark = await repository.createSpark(scope, {
  ...spark.row!, revision: 0,
}, `phase5-spark:${sparkId}`);
assert(duplicateSpark.outcome === "duplicate" && duplicateSpark.row?.id === sparkId, "Spark retry did not reconcile");

const cradle = await service.createCradle({
  workspace_id: workspaceId,
  metadata: { title: "Canonical lifecycle Workpiece", origin: { created_from: "bar-stock", spark_id: sparkId } },
  written_by: { tool: "hearth", tool_version: "0.0.0", lane: "forge-managed" },
  origin_tool: { name: "hearth", version: "0.0.0" },
  correlation_id: `phase5-handoff:${sparkId}`,
});
const workpieceId = cradle.cradle.id;
const link = await owner.schema("tongs").from("barstock_project_episode_links").insert({
  workspace_id: workspaceId, project_id: assignmentId, workpiece_id: workpieceId,
});
assert(!link.error, `production Hearth link failed: ${link.error?.message}`);

const secondClient = appClient();
const secondSignIn = await secondClient.auth.signInWithPassword({ email, password });
assert(!secondSignIn.error, `second client sign in: ${secondSignIn.error?.message}`);
const secondRepository = createSupabaseBarStockRepository(secondClient);
const hydrated = await secondRepository.hydrateWorkspace(scope);
assert(hydrated.sparks.some((row) => row.id === sparkId) && hydrated.links[assignmentId] === workpieceId,
  "second-client hydration lost Spark-to-Workpiece identity");

const writer = { tool: "hearth", tool_version: "0.0.0", lane: "forge-managed" };
const seed = await service.commitFile(workpieceId, {
  path: "script/script.md", content_type: "text/markdown; charset=utf-8", text: "# Canonical lifecycle\n\nSeed draft.",
  written_by: writer, user_access_token: token, event_name: "hearth.script.seeded.v1",
  correlation_id: `phase5-seed:${workpieceId}`,
});
const seedReady = await service.listWorkspaceReadyScripts(workspaceId, { userAccessToken: token });
assert(seedReady.length === 0, "seed incorrectly became Ready");
const edited = await service.commitFile(workpieceId, {
  path: "script/script.md", content_type: "text/markdown; charset=utf-8",
  text: "# Canonical lifecycle\n\nThis exact validated revision is ready for recording.",
  written_by: writer, user_access_token: token, event_name: "hearth.script.edited.v1",
  correlation_id: `phase5-edit:${workpieceId}`,
});
assert(edited.file_row.revision === seed.file_row.revision + 1, "script revision did not advance");
const editReady = await service.listWorkspaceReadyScripts(workspaceId, { userAccessToken: token });
assert(editReady.length === 0, "ordinary edit incorrectly became Ready");

const publishEvidence = {
  transition: "hearth.script.published.v1",
  script_path: edited.path,
  script_revision: edited.file_row.revision,
  script_hash: edited.hash,
  validation: { validator_version: "shared-script-tags-v1", ok: true, issue_count: 0 },
};
const idempotencyKey = `phase5-ready:${workpieceId}:${edited.file_row.revision}`;
const ready = await service.transitionHearthScriptReady(workpieceId, {
  workspace_id: workspaceId,
  script_path: edited.path,
  expected_script_revision: edited.file_row.revision,
  expected_script_hash: edited.hash,
  idempotency_key: idempotencyKey,
  publish_evidence: publishEvidence,
  user_access_token: token,
});
assert(ready.outcome === "saved", `Ready transition outcome=${ready.outcome}`);
const duplicateReady = await service.transitionHearthScriptReady(workpieceId, {
  workspace_id: workspaceId,
  script_path: edited.path,
  expected_script_revision: edited.file_row.revision,
  expected_script_hash: edited.hash,
  idempotency_key: idempotencyKey,
  publish_evidence: publishEvidence,
  user_access_token: token,
});
assert(duplicateReady.outcome === "duplicate", `Ready retry outcome=${duplicateReady.outcome}`);
const hearthReady = await service.listWorkspaceReadyScripts(workspaceId, { userAccessToken: token });
const anvilReady = await service.listWorkspaceReadyScripts(workspaceId, { userAccessToken: secondSignIn.data.session!.access_token });
assert(hearthReady.length === 1 && anvilReady.length === 1, "Ready discovery is not exactly one contract");
assert(hearthReady[0].workpiece_id === workpieceId && hearthReady[0].script_revision === edited.file_row.revision
  && hearthReady[0].script_hash === edited.hash && anvilReady[0].transition_id === hearthReady[0].transition_id,
"Hearth/Anvil Ready contracts disagree");

const archived = await repository.archiveSpark(scope, sparkId, spark.row!.revision);
assert(archived.outcome === "saved" || archived.outcome === "deleted", `Spark cleanup outcome=${archived.outcome}`);
const episode = await secondClient.schema("tongs").from("episodes").select("id,workspace_id").eq("id", workpieceId).single();
assert(!episode.error && episode.data?.id === workpieceId, "Spark cleanup removed Workpiece");

const evidence = await admin.schema("tongs").from("workpiece_ready_transition_requests")
  .select("id,workspace_id,workpiece_id,script_path,script_revision,script_hash,idempotency_key,created_at")
  .eq("workpiece_id", workpieceId).single();
assert(!evidence.error && evidence.data, `transition evidence: ${evidence.error?.message}`);
console.log(JSON.stringify({
  outcome: "ready_boundary_proven",
  workspace_id: workspaceId,
  spark: { id: sparkId, revision: spark.row.revision, cleanup_revision: archived.row?.revision ?? null, cleanup_outcome: archived.outcome },
  workpiece_id: workpieceId,
  handoff_event_id: cradle.event.id,
  seed: { revision: seed.file_row.revision, hash: seed.hash, ready_count: seedReady.length },
  edit: { revision: edited.file_row.revision, hash: edited.hash, ready_count: editReady.length },
  ready_transition: evidence.data,
  ready_retry_outcome: duplicateReady.outcome,
  hearth_ready_count: hearthReady.length,
  anvil_ready_count: anvilReady.length,
  second_client_link: hydrated.links[assignmentId],
  workpiece_survived_spark_cleanup: true,
}, null, 2));
