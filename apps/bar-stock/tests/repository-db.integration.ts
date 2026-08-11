import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseBarStockRepository } from "../src/lib/bar-stock-repository";
import { assignmentOperation, executeOperation, importLegacyBrowserData, reconcileRetryCache, sparkOperation } from "../src/lib/bar-stock-persistence";
import { makeAssignment } from "../src/lib/assignments";
import { makeSpark } from "../src/lib/model";
import { loadRetryCache, type RetryStorage } from "../src/lib/retry-cache";

class MemoryStorage implements RetryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

function localEnvironment(): Record<string, string> {
  const output = execFileSync("supabase", ["status", "-o", "env"], { cwd: new URL("../../..", import.meta.url), encoding: "utf8" });
  return Object.fromEntries(output.split(/\r?\n/).flatMap((line) => {
    const match = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    return match ? [[match[1], match[2]]] : [];
  }));
}

const env = localEnvironment();
assert.match(env.API_URL ?? "", /^http:\/\/127\.0\.0\.1:/, "integration test must target local Supabase only");
assert.ok(env.SERVICE_ROLE_KEY && env.ANON_KEY);

const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const password = "BarStock-Local-Only-123!";
const suffix = crypto.randomUUID();
const emails = [`editor-${suffix}@example.test`, `second-${suffix}@example.test`, `viewer-${suffix}@example.test`];
const userIds: string[] = [];
const workspaceA = crypto.randomUUID();
const workspaceB = crypto.randomUUID();
const orgA = crypto.randomUUID();
const orgB = crypto.randomUUID();

async function createUser(email: string): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("Local auth user creation failed");
  userIds.push(data.user.id);
  return data.user.id;
}

async function signedIn(email: string) {
  const client = createClient(env.API_URL, env.ANON_KEY, { db: { schema: "tongs" }, auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("Local sign-in failed");
  return { client, userId: data.user.id, repository: createSupabaseBarStockRepository(client) };
}

function ok(message: string): void { process.stdout.write(`ok - ${message}\n`); }

try {
  const editorId = await createUser(emails[0]);
  const secondId = await createUser(emails[1]);
  const viewerId = await createUser(emails[2]);
  const db = service.schema("tongs") as any;
  let result = await db.from("orgs").insert([{ id: orgA, name: "BarStock A", created_by: editorId }, { id: orgB, name: "BarStock B", created_by: secondId }]);
  if (result.error) throw result.error;
  result = await db.from("workspaces").insert([
    { id: workspaceA, name: "Workspace A", created_by: editorId, org_id: orgA },
    { id: workspaceB, name: "Workspace B", created_by: secondId, org_id: orgB },
  ]);
  if (result.error) throw result.error;
  result = await db.from("workspace_members").insert([
    { workspace_id: workspaceA, user_id: secondId, role: "editor", created_by: editorId },
    { workspace_id: workspaceA, user_id: viewerId, role: "viewer", created_by: editorId },
  ]);
  if (result.error) throw result.error;

  const editor = await signedIn(emails[0]);
  const second = await signedIn(emails[1]);
  const viewer = await signedIn(emails[2]);
  const scopeA = { workspaceId: workspaceA, userId: editor.userId };

  const initial = await editor.repository.hydrateWorkspace(scopeA);
  assert.deepEqual({ assignments: initial.assignments.length, sparks: initial.sparks.length }, { assignments: 0, sparks: 0 });
  ok("clean initial hydration is empty and authenticated");

  const assignment = makeAssignment("Canonical assignment");
  const createdAssignment = await editor.repository.createAssignment(scopeA, assignment, `integration:assignment:${assignment.id}`);
  assert.equal(createdAssignment.outcome, "saved");
  assert.equal(createdAssignment.row?.revision, 1);
  const canonicalAssignment = createdAssignment.row!;

  const spark = makeSpark("Canonical Spark", canonicalAssignment.id);
  const createdSpark = await editor.repository.createSpark(scopeA, spark, `integration:spark:${spark.id}`);
  assert.equal(createdSpark.outcome, "saved");
  ok("repository creates Assignment and Spark through RPC acknowledgement");

  const refreshedClient = await signedIn(emails[0]);
  const refreshed = await refreshedClient.repository.hydrateWorkspace({ workspaceId: workspaceA, userId: refreshedClient.userId });
  assert.equal(refreshed.assignments[0]?.id, canonicalAssignment.id);
  assert.equal(refreshed.sparks[0]?.id, spark.id);
  ok("refresh and new-client hydration recover canonical rows");

  const secondDevice = await second.repository.hydrateWorkspace({ workspaceId: workspaceA, userId: second.userId });
  assert.equal(secondDevice.sparks[0]?.id, spark.id);
  const isolated = await second.repository.hydrateWorkspace({ workspaceId: workspaceB, userId: second.userId });
  assert.equal(isolated.sparks.length, 0);
  ok("second device hydrates shared workspace while workspace switching remains isolated");

  const clearedStorage = new MemoryStorage();
  clearedStorage.clear();
  assert.equal((await editor.repository.hydrateWorkspace(scopeA)).sparks[0]?.id, spark.id);
  ok("clearing browser storage does not remove canonical data");

  const viewerDenied = await viewer.repository.updateAssignment(
    { workspaceId: workspaceA, userId: viewer.userId }, { ...canonicalAssignment, name: "Denied" }, canonicalAssignment.revision,
  );
  assert.equal(viewerDenied.outcome, "denied");
  ok("viewer mutation is denied by executable RPC authority");

  const [writerA, writerB] = await Promise.all([
    editor.repository.updateAssignment(scopeA, { ...canonicalAssignment, name: "Writer A" }, 1),
    second.repository.updateAssignment({ workspaceId: workspaceA, userId: second.userId }, { ...canonicalAssignment, name: "Writer B" }, 1),
  ]);
  assert.deepEqual([writerA.outcome, writerB.outcome].sort(), ["saved", "stale"]);
  ok("concurrent repository clients produce exactly one CAS winner");

  const afterConcurrent = await editor.repository.hydrateWorkspace(scopeA);
  const currentAssignment = afterConcurrent.assignments.find((row) => row.id === assignment.id)!;
  const retryStorage = new MemoryStorage();
  const staleIntent = { ...canonicalAssignment, name: "Offline old intent", updatedAt: Date.now() };
  const retryOperation = assignmentOperation({ workspaceId: workspaceA, action: "update", assignment: staleIntent });
  await executeOperation({ repository: editor.repository, storage: retryStorage, scope: scopeA, operation: retryOperation, online: false });
  const retried = await reconcileRetryCache({ repository: editor.repository, storage: retryStorage, scope: scopeA, snapshot: afterConcurrent, online: true });
  assert.equal(retried[0]?.state.status, "stale");
  assert.equal(loadRetryCache(retryStorage, workspaceA).length, 1);
  assert.equal((retried[0]?.state as any).canonical.revision, currentAssignment.revision);
  ok("reconnect reconciliation preserves local intent and refuses to overwrite newer cloud state");

  const duplicate = await editor.repository.createSpark(scopeA, spark, `integration:spark:${spark.id}`);
  assert.equal(duplicate.outcome, "duplicate");
  const conflicting = await editor.repository.createSpark(scopeA, makeSpark("Conflicting", assignment.id), `integration:spark:${spark.id}`);
  assert.equal(conflicting.outcome, "conflict");
  ok("duplicate retry and conflicting idempotency-key reuse remain distinct");

  const legacyStorage = new MemoryStorage();
  legacyStorage.setItem(`barstock_sparks_v2:${workspaceA}`, JSON.stringify([{ id: "legacy-local", body: "Legacy valid" }, { malformed: true }]));
  const imported = await importLegacyBrowserData({ repository: editor.repository, storage: legacyStorage, scope: scopeA, online: true });
  assert.deepEqual({ imported: imported.imported, malformed: imported.malformed, pending: imported.pending }, { imported: 1, malformed: 1, pending: 0 });
  legacyStorage.setItem(`barstock_sparks_v2:${workspaceA}`, JSON.stringify([{ id: "legacy-local", body: "Legacy valid" }]));
  const replay = await importLegacyBrowserData({ repository: editor.repository, storage: legacyStorage, scope: scopeA, online: true });
  assert.equal(replay.imported, 1);
  ok("legacy import isolates malformed rows and replays idempotently against PostgreSQL");

  const linkedAssignment = makeAssignment("Linked assignment");
  const linkedCreated = await editor.repository.createAssignment(scopeA, linkedAssignment, `integration:linked:${linkedAssignment.id}`);
  assert.equal(linkedCreated.outcome, "saved");
  const linkedSpark = makeSpark("Handoff Spark", linkedAssignment.id);
  const linkedSparkCreated = await editor.repository.createSpark(scopeA, linkedSpark, `integration:linked-spark:${linkedSpark.id}`);
  assert.equal(linkedSparkCreated.outcome, "saved");
  const workpieceId = crypto.randomUUID();
  result = await db.from("episodes").insert({ id: workpieceId, workspace_id: workspaceA, label: "Handoff Workpiece" });
  if (result.error) throw result.error;
  result = await db.from("barstock_project_episode_links").insert({ workspace_id: workspaceA, project_id: linkedAssignment.id, workpiece_id: workpieceId });
  if (result.error) throw result.error;
  assert.equal(await editor.repository.getAssignmentWorkpieceLink(scopeA, linkedAssignment.id), workpieceId);
  const linkedDelete = await editor.repository.deleteAssignment(scopeA, linkedAssignment.id, linkedCreated.row!.revision);
  assert.equal(linkedDelete.outcome, "linked");
  const archivedSpark = await editor.repository.archiveSpark(scopeA, linkedSpark.id, linkedSparkCreated.row!.revision);
  assert.equal(archivedSpark.outcome, "saved");
  assert.equal((await editor.repository.hydrateWorkspace(scopeA)).sparks.some((spark) => spark.id === linkedSpark.id), false,
    "archived sparks are absent from a fresh canonical Bar Stock hydration");
  const linkAfterCleanup = await editor.repository.getAssignmentWorkpieceLink(scopeA, linkedAssignment.id);
  const { count: workpieceCount } = await db.from("episodes").select("id", { count: "exact", head: true }).eq("id", workpieceId);
  assert.equal(linkAfterCleanup, workpieceId);
  assert.equal(workpieceCount, 1);
  ok("Spark handoff and cleanup preserve Assignment-to-Workpiece identity and the Workpiece row");

  const archiveAssignment = makeAssignment("Archive/delete assignment");
  const archiveCreated = await editor.repository.createAssignment(scopeA, archiveAssignment, `integration:archive:${archiveAssignment.id}`);
  const archived = await editor.repository.archiveAssignment(scopeA, archiveAssignment.id, archiveCreated.row!.revision);
  assert.equal(archived.outcome, "saved");
  const deleted = await editor.repository.deleteAssignment(scopeA, archiveAssignment.id, archived.row!.revision);
  assert.equal(deleted.outcome, "deleted");
  ok("unlinked Assignment archive and permitted hard deletion succeed");

  process.stdout.write("Bar-Stock repository local Supabase integration passed.\n");
} finally {
  const db = service.schema("tongs") as any;
  await db.from("workspaces").delete().in("id", [workspaceA, workspaceB]);
  await db.from("orgs").delete().in("id", [orgA, orgB]);
  for (const userId of userIds) await service.auth.admin.deleteUser(userId);
}
