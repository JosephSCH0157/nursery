import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_nursery";
const ids = { owner: randomUUID(), editor: randomUUID(), viewer: randomUUID(), other: randomUUID(), orgA: randomUUID(), orgB: randomUUID(), workspaceA: randomUUID(), workspaceB: randomUUID() };
const baseHashes = { transcript: "1".repeat(64), visual_timeline: "2".repeat(64), visual_placements: "3".repeat(64), audio: "4".repeat(64), editorial_authority: "5".repeat(64) };
const headHashes = ["6".repeat(64), "7".repeat(64), "8".repeat(64), "9".repeat(64)];

function psql(sql, { role, user, allowFailure = false } = {}) {
  const prefix = role ? `set role ${role};${user ? `set request.jwt.claim.sub = '${user}';` : ""}` : "";
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: `${prefix}${sql}`, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.stdout);
  return { status: result.status ?? 1, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}
const quoteJson = (value) => JSON.stringify(value).replaceAll("'", "''");
function check(condition, message) { if (!condition) throw new Error(message); process.stdout.write(`ok - ${message}\n`); }
function assertConflict(result, code, message) { check(result.outcome === "conflict" && result.code === code && result.terminal === true && result.retryable === false, message); }

psql(`
  insert into auth.users(id) values('${ids.owner}'),('${ids.editor}'),('${ids.viewer}'),('${ids.other}');
  insert into tongs.orgs(id,name,created_by) values('${ids.orgA}','HE Head Org A','${ids.owner}'),('${ids.orgB}','HE Head Org B','${ids.other}');
  insert into tongs.workspaces(id,name,created_by,org_id) values
    ('${ids.workspaceA}','HE Head Workspace A','${ids.owner}','${ids.orgA}'),('${ids.workspaceB}','HE Head Workspace B','${ids.other}','${ids.orgB}');
  insert into tongs.workspace_members(workspace_id,user_id,role,created_by) values
    ('${ids.workspaceA}','${ids.editor}','editor','${ids.owner}'),('${ids.workspaceA}','${ids.viewer}','viewer','${ids.owner}');
`);

function createFixture(label) {
  const workpiece = randomUUID(), recording = randomUUID(), revision = randomUUID(), epoch = randomUUID();
  const anchorPath = `hammer/revisions/${revision}/history/epochs/${epoch}.v1.json`;
  const anchorHash = "a".repeat(64);
  const componentPaths = Object.fromEntries(Object.keys(baseHashes).map((key) => [key, `hammer/revisions/${revision}/components/${key}.v1.json`]));
  psql(`
    insert into tongs.episodes(id,workspace_id,label) values('${workpiece}','${ids.workspaceA}','${label}');
    insert into tongs.canonical_recordings(id,workspace_id,workpiece_id,status,media_path,media_id,created_by,updated_by)
      values('${recording}','${ids.workspaceA}','${workpiece}','draft','recordings/synthetic.wav','synthetic:${recording}','${ids.owner}','${ids.owner}');
    insert into tongs.recording_revisions(id,workspace_id,workpiece_id,canonical_recording_id,status,history_path,
      revision_transcript_path,visual_timeline_path,visual_placements_path,audio_polish_path,editorial_authority_path,created_by,updated_by)
      values('${revision}','${ids.workspaceA}','${workpiece}','${recording}','active','${anchorPath}',
      '${componentPaths.transcript}','${componentPaths.visual_timeline}','${componentPaths.visual_placements}','${componentPaths.audio}','${componentPaths.editorial_authority}',
      '${ids.owner}','${ids.owner}');
    update tongs.episodes set canonical_recording_id='${recording}',active_revision_id='${revision}' where id='${workpiece}';
    insert into tongs.workpiece_files(workpiece_id,path,file_type,content_type,bytes,hash_value,storage_bucket,storage_key,written_by_tool,written_by_tool_version,written_by_lane)
      values('${workpiece}','${anchorPath}','hammer_history_epoch','application/json',2048,'${anchorHash}','forge-workpieces','workpieces/${workpiece}/${anchorPath}','tongs','history-epoch-v1','forge-managed');
    ${Object.entries(componentPaths).map(([key, path]) => `insert into tongs.workpiece_files(workpiece_id,path,file_type,content_type,bytes,hash_value,storage_bucket,storage_key,written_by_tool,written_by_tool_version,written_by_lane) values('${workpiece}','${path}','hammer_revision_artifact','application/json',100,'${baseHashes[key]}','forge-workpieces','workpieces/${workpiece}/${path}','hammer','forge-v1.2.0','forge-managed');`).join("\n")}
  `);
  const tokens = JSON.parse(psql(`select json_build_object(
    'revision_updated_at',(select updated_at from tongs.recording_revisions where id='${revision}'),
    'anchor_revision',(select revision from tongs.workpiece_files where workpiece_id='${workpiece}' and path='${anchorPath}'),
    'anchor_updated_at',(select updated_at from tongs.workpiece_files where workpiece_id='${workpiece}' and path='${anchorPath}')
  )::text;`).stdout);
  psql(`insert into tongs.hammer_history_epochs(
    epoch_id,workspace_id,workpiece_id,canonical_recording_id,recording_revision_id,artifact_path,artifact_sha256,artifact_bytes,
    artifact_registry_revision,artifact_registry_updated_at,base_editor_state_hash,base_component_sha256,creation_reason,
    predecessor_original_path,predecessor_archive_path,predecessor_sha256,predecessor_bytes,predecessor_registry_revision,
    predecessor_registry_updated_at,archive_registry_revision,archive_registry_updated_at,initiating_user_id
  ) values('${epoch}','${ids.workspaceA}','${workpiece}','${recording}','${revision}','${anchorPath}','${anchorHash}',2048,
    ${tokens.anchor_revision},'${tokens.anchor_updated_at}','hammer-state:1234abcd','${quoteJson(baseHashes)}','legacy_history_unrecoverable',
    'hammer/revisions/${revision}/history.v1.json','hammer/revisions/${revision}/history/archive/${"f".repeat(64)}.history.v1.json','${"f".repeat(64)}',99,1,
    '${tokens.anchor_updated_at}',1,'${tokens.anchor_updated_at}','${ids.editor}');`);
  const authority = {};
  for (const [key, path] of Object.entries(componentPaths)) {
    const row = JSON.parse(psql(`select row_to_json(x)::text from (select workpiece_id,path,lower(hash_value) sha256,bytes,revision registry_revision,updated_at registry_updated_at,content_type from tongs.workpiece_files where workpiece_id='${workpiece}' and path='${path}') x;`).stdout);
    authority[key] = row;
  }
  return { workpiece, recording, revision, epoch, anchorPath, anchorHash, authority, revisionUpdatedAt: tokens.revision_updated_at, parentRevision: tokens.anchor_revision, parentUpdatedAt: tokens.anchor_updated_at, heads: [] };
}

function stageHead(f, sequence, hash = headHashes[(sequence - 1) % headHashes.length]) {
  const head = randomUUID();
  const path = `hammer/revisions/${f.revision}/history/epochs/${f.epoch}/heads/${head}.history.v1.json`;
  psql(`insert into tongs.workpiece_files(workpiece_id,path,file_type,content_type,bytes,hash_value,storage_bucket,storage_key,written_by_tool,written_by_tool_version,written_by_lane)
    values('${f.workpiece}','${path}','hammer_history_epoch_head','application/json',${3000 + sequence},'${hash}','forge-workpieces','workpieces/${f.workpiece}/${path}','tongs','history-head-v1','forge-managed');`);
  const row = JSON.parse(psql(`select json_build_object('revision',revision,'updated_at',updated_at)::text from tongs.workpiece_files where workpiece_id='${f.workpiece}' and path='${path}';`).stdout);
  return { head, path, hash, bytes: 3000 + sequence, revision: row.revision, updatedAt: row.updated_at };
}

function argsFor(f, candidate, sequence, overrides = {}) {
  const anchor = { head: null, path: f.anchorPath, hash: f.anchorHash, revision: f.parentRevision, updatedAt: f.parentUpdatedAt };
  const parent = sequence === 1 ? anchor : (f.heads[sequence - 2] ?? anchor);
  const values = { workspace: ids.workspaceA, workpiece: f.workpiece, recording: f.recording, revision: f.revision, epoch: f.epoch,
    head: candidate.head, sequence, key: `history-head:${candidate.head}`, fingerprint: "b".repeat(64), revisionUpdatedAt: f.revisionUpdatedAt,
    parentHead: parent.head, parentPath: parent.path, parentHash: parent.hash, parentRevision: parent.revision, parentUpdatedAt: parent.updatedAt,
    headPath: candidate.path, headHash: candidate.hash, headBytes: candidate.bytes, headRevision: candidate.revision, headUpdatedAt: candidate.updatedAt,
    resultHash: `hammer-state:${String(sequence).padStart(8, "0")}`, authority: f.authority, ...overrides };
  values.envelope = overrides.envelope ?? { schema: "forge.hammer-history-epoch-head", schema_version: 1, workspace_id: values.workspace, workpiece_id: values.workpiece,
    canonical_recording_id: values.recording, recording_revision_id: values.revision, epoch_id: values.epoch, head_id: values.head, sequence: values.sequence,
    creation: { initiating_user_id: overrides.user ?? ids.editor }, parent: { head_id: values.parentHead, path: values.parentPath, sha256: values.parentHash, registry_revision: values.parentRevision, registry_updated_at: values.parentUpdatedAt },
    artifact: { path: values.headPath, sha256: values.headHash, bytes: values.headBytes, registry_revision: values.headRevision, registry_updated_at: values.headUpdatedAt },
    epoch_anchor: { path: f.anchorPath, sha256: f.anchorHash }, base: { editor_state_hash: "hammer-state:1234abcd", component_sha256: baseHashes },
    result: { editor_state_hash: values.resultHash, component_authority: values.authority }, history: { entries: [], undo_stack: [], redo_stack: [], checkpoints: [] },
    boundary: { prior_history_status: "unavailable", merged: false, traversable: false } };
  return values;
}

function rpcSql(v) { return `select tongs.commit_hammer_history_epoch_head(
  '${v.workspace}','${v.workpiece}','${v.recording}','${v.revision}','${v.epoch}','${v.head}',${v.sequence},'${v.key}','${v.fingerprint}',
  '${v.revisionUpdatedAt}','${v.parentPath}',${v.parentHead ? `'${v.parentHead}'` : "null"},'${v.parentHash}',${v.parentRevision},'${v.parentUpdatedAt}',
  '${v.headPath}','${v.headHash}',${v.headBytes},${v.headRevision},'${v.headUpdatedAt}','${v.resultHash}','${quoteJson(v.authority)}'::jsonb,'${quoteJson(v.envelope)}'::jsonb
)::text;`; }
function call(f, candidate, sequence, overrides = {}) {
  const user = overrides.user ?? ids.editor;
  return JSON.parse(psql(rpcSql(argsFor(f, candidate, sequence, overrides)), { role: overrides.role ?? "authenticated", user }).stdout.split(/\r?\n/).at(-1));
}
function commitHead(f, sequence, label) {
  const candidate = stageHead(f, sequence);
  const revisionUpdatedAtBefore = f.revisionUpdatedAt;
  const result = call(f, candidate, sequence);
  check(result.outcome === "committed" && result.sequence === sequence && result.history_path === candidate.path, label);
  f.heads.push({ ...candidate, head: result.head_id }); f.revisionUpdatedAt = result.revision_updated_at;
  return { candidate, result, revisionUpdatedAtBefore };
}

const shape = JSON.parse(psql(`select json_build_object(
  'definer',(select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='tongs' and p.proname='commit_hammer_history_epoch_head'),
  'config',(select proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='tongs' and p.proname='commit_hammer_history_epoch_head'),
  'read_definer',(select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='tongs' and p.proname='read_hammer_history_epoch_head_operation')
)::text;`).stdout);
check(shape.definer === true && shape.config.includes("search_path=pg_catalog, tongs") && shape.read_definer === false, "head commit is locked-search-path SECURITY DEFINER and readback is invoker-safe");

const lifecycle = createFixture("head lifecycle");
const first = commitHead(lifecycle, 1, "anchor advances to sequence 1");
const replay = call(lifecycle, first.candidate, 1, { revisionUpdatedAt: first.revisionUpdatedAtBefore });
check(replay.outcome === "already_committed" && replay.transition_id === first.result.transition_id, "exact replay returns the committed receipt");
assertConflict(call(lifecycle, first.candidate, 1, { revisionUpdatedAt: first.revisionUpdatedAtBefore, fingerprint: "c".repeat(64) }),
  "history_epoch_head_idempotency_conflict", "idempotency reuse with a different fingerprint is rejected");
commitHead(lifecycle, 2, "head 1 advances to head 2");
commitHead(lifecycle, 3, "undo is durably represented as a later sequence");
commitHead(lifecycle, 4, "redo is durably represented as a later sequence");

const denied = createFixture("head authorization"); const deniedCandidate = stageHead(denied, 1);
assertConflict(call(denied, deniedCandidate, 1, { user: ids.viewer }), "history_epoch_head_forbidden", "viewer commit is denied");
assertConflict(call(denied, deniedCandidate, 1, { user: ids.other }), "history_epoch_head_forbidden", "cross-workspace commit is denied");
const anon = psql(rpcSql(argsFor(denied, deniedCandidate, 1)), { role: "anon", allowFailure: true });
check(anon.status !== 0 && /permission denied/i.test(anon.stderr), "anonymous cannot execute the head commit RPC");

for (const [label, overrides, code] of [
  ["stale revision token", { revisionUpdatedAt: "2000-01-01T00:00:00Z" }, "history_epoch_head_revision_token_conflict"],
  ["stale pointer", { parentPath: "hammer/stale.json" }, "history_epoch_head_pointer_conflict"],
  ["stale parent registry", { parentRevision: 99 }, "history_epoch_head_parent_conflict"],
  ["wrong identity", { recording: randomUUID() }, "history_epoch_head_identity_conflict"],
]) {
  const f = createFixture(label); const candidate = stageHead(f, 1); assertConflict(call(f, candidate, 1, overrides), code, `${label} is terminal and non-retryable`);
}
const staleComponent = createFixture("stale component"); const staleCandidate = stageHead(staleComponent, 1);
const badAuthority = structuredClone(staleComponent.authority); badAuthority.audio.sha256 = "d".repeat(64);
assertConflict(call(staleComponent, staleCandidate, 1, { authority: badAuthority }), "history_epoch_head_component_authority_conflict", "stale component authority fails closed");
const staleCandidateRegistry = createFixture("stale candidate registry"); const staleRegistryCandidate = stageHead(staleCandidateRegistry, 1);
assertConflict(call(staleCandidateRegistry, staleRegistryCandidate, 1, { headBytes: staleRegistryCandidate.bytes + 1 }), "history_epoch_head_registry_conflict", "stale candidate registry metadata fails closed");
const inactive = createFixture("inactive revision"); const inactiveCandidate = stageHead(inactive, 1);
psql(`update tongs.recording_revisions set status='discarded' where id='${inactive.revision}'`);
assertConflict(call(inactive, inactiveCandidate, 1, { revisionUpdatedAt: psql(`select updated_at from tongs.recording_revisions where id='${inactive.revision}'`).stdout }), "history_epoch_head_identity_conflict", "inactive revision is rejected");
const skipped = createFixture("skipped sequence"); const skippedCandidate = stageHead(skipped, 2);
assertConflict(call(skipped, skippedCandidate, 2, { parentHead: randomUUID() }), "history_epoch_head_parent_conflict", "skipped sequence is rejected");
const wrongParent = createFixture("wrong parent"); commitHead(wrongParent, 1, "wrong-parent fixture commits head 1"); const wrongCandidate = stageHead(wrongParent, 2);
assertConflict(call(wrongParent, wrongCandidate, 2, { parentHead: randomUUID() }), "history_epoch_head_parent_conflict", "wrong parent head is rejected");

const duplicate = createFixture("duplicate authority"); const duplicateFirst = commitHead(duplicate, 1, "duplicate fixture commits head 1");
for (const [sql, message] of [
  [`insert into tongs.hammer_history_epoch_heads select * from tongs.hammer_history_epoch_heads where head_id='${duplicateFirst.result.head_id}'`, "duplicate head ID is rejected"],
  [`insert into tongs.hammer_history_epoch_heads select '${randomUUID()}'::uuid,epoch_id,workspace_id,workpiece_id,canonical_recording_id,recording_revision_id,sequence,schema_version,artifact_path,artifact_sha256,artifact_bytes,artifact_registry_revision,artifact_registry_updated_at,parent_kind,parent_head_id,parent_path,parent_sha256,parent_registry_revision,parent_registry_updated_at,base_editor_state_hash,base_component_sha256,result_editor_state_hash,result_component_authority,initiated_by,created_at from tongs.hammer_history_epoch_heads where head_id='${duplicateFirst.result.head_id}'`, "duplicate sequence/path authority is rejected"],
  [`insert into tongs.hammer_history_epoch_head_transitions select * from tongs.hammer_history_epoch_head_transitions where transition_id='${duplicateFirst.result.transition_id}'`, "duplicate receipt/operation identity is rejected"],
]) { const result = psql(sql, { role: "service_role", allowFailure: true }); check(result.status !== 0 && /(duplicate key|violates check constraint)/i.test(result.stderr), message); }

const committedStatus = JSON.parse(psql(`select tongs.read_hammer_history_epoch_head_operation('${ids.workspaceA}','${lifecycle.workpiece}','${lifecycle.revision}','history-head:${first.candidate.head}','${"b".repeat(64)}','${first.candidate.head}')::text;`, { role: "authenticated", user: ids.viewer }).stdout);
check(committedStatus.outcome === "committed" && committedStatus.head_id === first.candidate.head, "viewer readback returns a committed operation");
const absentStatus = JSON.parse(psql(`select tongs.read_hammer_history_epoch_head_operation('${ids.workspaceA}','${lifecycle.workpiece}','${lifecycle.revision}','history-head:absent-00000000',null,null)::text;`, { role: "authenticated", user: ids.owner }).stdout);
check(absentStatus.outcome === "absent", "status readback reports absent operations");
const mismatchStatus = JSON.parse(psql(`select tongs.read_hammer_history_epoch_head_operation('${ids.workspaceA}','${lifecycle.workpiece}','${lifecycle.revision}','history-head:${first.candidate.head}','${"c".repeat(64)}','${first.candidate.head}')::text;`, { role: "authenticated", user: ids.viewer }).stdout);
assertConflict(mismatchStatus, "history_epoch_head_operation_mismatch", "status readback rejects a mismatched fingerprint");

for (const [sql, message] of [
  [`update tongs.hammer_history_epoch_heads set artifact_bytes=1 where head_id='${first.candidate.head}'`, "committed head update is denied"],
  [`delete from tongs.hammer_history_epoch_head_transitions where transition_id='${first.result.transition_id}'`, "head receipt delete is denied"],
  [`update tongs.workpiece_files set bytes=1 where workpiece_id='${lifecycle.workpiece}' and path='${first.candidate.path}'`, "committed head registry update is denied"],
]) { const result = psql(sql, { role: "service_role", allowFailure: true }); check(result.status !== 0 && /immutable/i.test(result.stderr), message); }
for (const [sql, message] of [
  [`insert into tongs.hammer_history_epoch_heads select * from tongs.hammer_history_epoch_heads where head_id='${first.candidate.head}'`, "authenticated direct head insert is revoked"],
  [`update tongs.hammer_history_epoch_heads set artifact_bytes=artifact_bytes where head_id='${first.candidate.head}'`, "authenticated direct head update is revoked"],
  [`delete from tongs.hammer_history_epoch_heads where head_id='${first.candidate.head}'`, "authenticated direct head delete is revoked"],
]) { const direct = psql(sql, { role: "authenticated", user: ids.editor, allowFailure: true }); check(direct.status !== 0 && /permission denied/i.test(direct.stderr), message); }
const visibility = psql(`select count(*) from tongs.hammer_history_epoch_heads where head_id='${first.candidate.head}'`, { role: "authenticated", user: ids.viewer }).stdout;
const ownerVisibility = psql(`select count(*) from tongs.hammer_history_epoch_heads where head_id='${first.candidate.head}'`, { role: "authenticated", user: ids.owner }).stdout;
const hidden = psql(`select count(*) from tongs.hammer_history_epoch_heads where head_id='${first.candidate.head}'`, { role: "authenticated", user: ids.other }).stdout;
check(visibility === "1" && ownerVisibility === "1" && hidden === "0", "owner/viewer reads and cross-workspace RLS isolation are enforced");

const legacy = createFixture("legacy unchanged");
psql(`update tongs.recording_revisions set history_path='hammer/revisions/${legacy.revision}/history.v1.json' where id='${legacy.revision}';`);
check(psql(`select history_path from tongs.recording_revisions where id='${legacy.revision}'`).stdout.endsWith("/history.v1.json"), "legacy history pointer behavior remains unchanged");
process.stdout.write("Hammer history epoch head database verification passed.\n");
