import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_nursery";
const ids = {
  owner: randomUUID(),
  editor: randomUUID(),
  viewer: randomUUID(),
  other: randomUUID(),
  orgA: randomUUID(),
  orgB: randomUUID(),
  workspaceA: randomUUID(),
  workspaceB: randomUUID(),
};
const predecessorHash = "a".repeat(64);
const epochHash = "b".repeat(64);
const operationFingerprint = "c".repeat(64);
const components = {
  transcript: "1".repeat(64),
  visual_timeline: "2".repeat(64),
  visual_placements: "3".repeat(64),
  audio: "4".repeat(64),
  editorial_authority: "5".repeat(64),
};

function psql(sql, { role, user, allowFailure = false } = {}) {
  const prefix = role ? `set role ${role};${user ? `set request.jwt.claim.sub = '${user}';` : ""}` : "";
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
  { input: `${prefix}${sql}`, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.stdout);
  return { status: result.status ?? 1, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function check(condition, message) {
  if (!condition) throw new Error(message);
  process.stdout.write(`ok - ${message}\n`);
}

function json(value) {
  return JSON.stringify(value).replaceAll("'", "''");
}

function createFixture(label) {
  const workpiece = randomUUID();
  const recording = randomUUID();
  const revision = randomUUID();
  const epoch = randomUUID();
  const predecessorPath = `hammer/revisions/${revision}/history.v1.json`;
  const archivePath = `hammer/revisions/${revision}/history/archive/${predecessorHash}.history.v1.json`;
  const epochPath = `hammer/revisions/${revision}/history/epochs/${epoch}.v1.json`;
  psql(`
    insert into tongs.episodes(id,workspace_id,label) values('${workpiece}','${ids.workspaceA}','${label}');
    insert into tongs.canonical_recordings(
      id,workspace_id,workpiece_id,status,media_path,media_id,created_by,updated_by
    ) values(
      '${recording}','${ids.workspaceA}','${workpiece}','draft','recordings/synthetic.wav','synthetic:${recording}','${ids.owner}','${ids.owner}'
    );
    insert into tongs.recording_revisions(
      id,workspace_id,workpiece_id,canonical_recording_id,status,history_path,created_by,updated_by
    ) values(
      '${revision}','${ids.workspaceA}','${workpiece}','${recording}','active','${predecessorPath}','${ids.owner}','${ids.owner}'
    );
    update tongs.episodes set canonical_recording_id='${recording}',active_revision_id='${revision}' where id='${workpiece}';
    insert into tongs.workpiece_files(
      workpiece_id,path,file_type,content_type,bytes,hash_value,storage_bucket,storage_key,
      written_by_tool,written_by_tool_version,written_by_lane
    ) values
      ('${workpiece}','${predecessorPath}','hammer_revision_artifact','application/json',208379,'${predecessorHash}',
       'forge-workpieces','workpieces/${workpiece}/${predecessorPath}','hammer','forge-v1.2.0','forge-managed'),
      ('${workpiece}','${archivePath}','hammer_history_archive','application/json',208379,'${predecessorHash}',
       'forge-workpieces','workpieces/${workpiece}/${archivePath}','tongs','forge-v1.2.0','forge-managed'),
      ('${workpiece}','${epochPath}','hammer_history_epoch','application/json',2048,'${epochHash}',
       'forge-workpieces','workpieces/${workpiece}/${epochPath}','tongs','forge-v1.2.0','forge-managed');
  `);
  const snapshot = JSON.parse(psql(`
    select json_build_object(
      'revision_updated_at',(select updated_at from tongs.recording_revisions where id='${revision}'),
      'predecessor_revision',(select revision from tongs.workpiece_files where workpiece_id='${workpiece}' and path='${predecessorPath}'),
      'predecessor_updated_at',(select updated_at from tongs.workpiece_files where workpiece_id='${workpiece}' and path='${predecessorPath}'),
      'archive_revision',(select revision from tongs.workpiece_files where workpiece_id='${workpiece}' and path='${archivePath}'),
      'archive_updated_at',(select updated_at from tongs.workpiece_files where workpiece_id='${workpiece}' and path='${archivePath}'),
      'epoch_revision',(select revision from tongs.workpiece_files where workpiece_id='${workpiece}' and path='${epochPath}'),
      'epoch_updated_at',(select updated_at from tongs.workpiece_files where workpiece_id='${workpiece}' and path='${epochPath}')
    )::text;
  `).stdout);
  return { workpiece, recording, revision, epoch, predecessorPath, archivePath, epochPath, snapshot };
}

function rpcSql(fixture, overrides = {}) {
  const values = {
    workspace: ids.workspaceA,
    workpiece: fixture.workpiece,
    recording: fixture.recording,
    revision: fixture.revision,
    epoch: fixture.epoch,
    key: `history-epoch:${fixture.epoch}`,
    fingerprint: operationFingerprint,
    revisionUpdatedAt: fixture.snapshot.revision_updated_at,
    predecessorPath: fixture.predecessorPath,
    predecessorRevision: fixture.snapshot.predecessor_revision,
    predecessorUpdatedAt: fixture.snapshot.predecessor_updated_at,
    predecessorSha: predecessorHash,
    predecessorBytes: 208379,
    archivePath: fixture.archivePath,
    archiveRevision: fixture.snapshot.archive_revision,
    archiveUpdatedAt: fixture.snapshot.archive_updated_at,
    epochPath: fixture.epochPath,
    epochRevision: fixture.snapshot.epoch_revision,
    epochUpdatedAt: fixture.snapshot.epoch_updated_at,
    epochSha: epochHash,
    epochBytes: 2048,
    baseHash: "hammer-state:1234abcd",
    componentHashes: components,
    ...overrides,
  };
  return `select tongs.commit_hammer_history_epoch(
    '${values.workspace}','${values.workpiece}','${values.recording}','${values.revision}','${values.epoch}',
    '${values.key}','${values.fingerprint}','${values.revisionUpdatedAt}','${values.predecessorPath}',
    ${values.predecessorRevision},'${values.predecessorUpdatedAt}','${values.predecessorSha}',${values.predecessorBytes},
    '${values.archivePath}',${values.archiveRevision},'${values.archiveUpdatedAt}',
    '${values.epochPath}',${values.epochRevision},'${values.epochUpdatedAt}','${values.epochSha}',${values.epochBytes},
    '${values.baseHash}','${json(values.componentHashes)}'::jsonb
  )::text;`;
}

function call(fixture, options = {}) {
  const { user = ids.editor, role = "authenticated", ...overrides } = options;
  return JSON.parse(psql(rpcSql(fixture, overrides), { role, user }).stdout.split(/\r?\n/).at(-1));
}

function assertConflict(result, code, message) {
  check(result.outcome === "conflict" && result.code === code && result.terminal === true && result.retryable === false, message);
}

psql(`
  insert into auth.users(id) values('${ids.owner}'),('${ids.editor}'),('${ids.viewer}'),('${ids.other}');
  insert into tongs.orgs(id,name,created_by) values
    ('${ids.orgA}','History Epoch Org A','${ids.owner}'),('${ids.orgB}','History Epoch Org B','${ids.other}');
  insert into tongs.workspaces(id,name,created_by,org_id) values
    ('${ids.workspaceA}','History Epoch Workspace A','${ids.owner}','${ids.orgA}'),
    ('${ids.workspaceB}','History Epoch Workspace B','${ids.other}','${ids.orgB}');
  insert into tongs.workspace_members(workspace_id,user_id,role,created_by) values
    ('${ids.workspaceA}','${ids.editor}','editor','${ids.owner}'),
    ('${ids.workspaceA}','${ids.viewer}','viewer','${ids.owner}');
`);

const functionShape = JSON.parse(psql(`select json_build_object(
  'commit_definer',(select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='tongs' and p.proname='commit_hammer_history_epoch'),
  'commit_config',(select proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='tongs' and p.proname='commit_hammer_history_epoch'),
  'readback_definer',(select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='tongs' and p.proname='read_hammer_history_epoch_operation')
)::text;`).stdout);
check(functionShape.commit_definer === true && functionShape.commit_config.includes("search_path=pg_catalog, tongs") && functionShape.readback_definer === false,
  "commit is the only fixed-search-path SECURITY DEFINER transition RPC and readback is invoker-safe");

const editorFixture = createFixture("editor success");
const editorCommitted = call(editorFixture);
check(editorCommitted.outcome === "committed" && editorCommitted.history_path === editorFixture.epochPath,
  "workspace editor atomically commits the epoch pointer transition");
const replay = call(editorFixture);
check(replay.outcome === "already_committed" && replay.transition_id === editorCommitted.transition_id,
  "identical replay returns the original committed receipt");
assertConflict(call(editorFixture, { fingerprint: "d".repeat(64) }), "history_epoch_idempotency_conflict",
  "idempotency-key reuse with different inputs is terminal and non-retryable");

const ownerFixture = createFixture("owner success");
check(call(ownerFixture, { user: ids.owner }).outcome === "committed", "workspace owner satisfies the editor-or-higher role contract");

const deniedFixture = createFixture("authorization denial");
assertConflict(call(deniedFixture, { user: ids.viewer }), "history_epoch_forbidden", "viewer transition is denied without retry");
assertConflict(call(deniedFixture, { user: ids.other }), "history_epoch_forbidden", "cross-workspace transition is denied without row leakage");
const anonymous = psql(rpcSql(deniedFixture), { role: "anon", allowFailure: true });
check(anonymous.status !== 0 && /permission denied/i.test(anonymous.stderr), "anonymous cannot execute the transition RPC");

const staleRevision = createFixture("stale revision token");
assertConflict(call(staleRevision, { revisionUpdatedAt: "2000-01-01T00:00:00Z" }), "history_epoch_revision_token_conflict",
  "stale revision timestamp is a terminal CAS conflict");
const stalePointer = createFixture("stale pointer");
assertConflict(call(stalePointer, { predecessorPath: "hammer/revisions/stale/history.v1.json" }), "history_epoch_pointer_conflict",
  "stale active history pointer is a terminal CAS conflict");
const stalePredecessor = createFixture("stale predecessor registry");
assertConflict(call(stalePredecessor, { predecessorRevision: 99 }), "history_epoch_predecessor_registry_conflict",
  "stale predecessor registry metadata fails closed");
const staleArchive = createFixture("stale archive registry");
assertConflict(call(staleArchive, { archiveRevision: 99 }), "history_epoch_archive_registry_conflict",
  "stale archive registry metadata fails closed");
const staleEpoch = createFixture("stale epoch registry");
assertConflict(call(staleEpoch, { epochBytes: 2049 }), "history_epoch_artifact_registry_conflict",
  "stale epoch artifact metadata fails closed");
const wrongIdentity = createFixture("wrong identity");
assertConflict(call(wrongIdentity, { recording: randomUUID() }), "history_epoch_identity_conflict",
  "recording and active-revision identity mismatch fails closed");
const badPath = createFixture("bad path");
assertConflict(call(badPath, { archivePath: `${badPath.archivePath}.wrong` }), "history_epoch_path_invalid",
  "non-canonical immutable archive path is rejected");

const committedStatus = JSON.parse(psql(`select tongs.read_hammer_history_epoch_operation(
  '${ids.workspaceA}','${editorFixture.workpiece}','${editorFixture.revision}','history-epoch:${editorFixture.epoch}'
)::text;`, { role: "authenticated", user: ids.viewer }).stdout);
check(committedStatus.outcome === "committed" && committedStatus.transition_id === editorCommitted.transition_id,
  "viewer readback resolves a committed operation");
const absentStatus = JSON.parse(psql(`select tongs.read_hammer_history_epoch_operation(
  '${ids.workspaceA}','${editorFixture.workpiece}','${editorFixture.revision}','history-epoch:absent-00000000'
)::text;`, { role: "authenticated", user: ids.owner }).stdout);
check(absentStatus.outcome === "absent", "owner readback reports an absent operation");
const crossStatus = JSON.parse(psql(`select tongs.read_hammer_history_epoch_operation(
  '${ids.workspaceA}','${editorFixture.workpiece}','${editorFixture.revision}','history-epoch:${editorFixture.epoch}'
)::text;`, { role: "authenticated", user: ids.other }).stdout);
check(crossStatus.outcome === "absent", "cross-workspace readback reveals no operation state");

const directInsert = psql(`insert into tongs.hammer_history_epochs select * from tongs.hammer_history_epochs limit 1;`,
  { role: "authenticated", user: ids.editor, allowFailure: true });
check(directInsert.status !== 0 && /permission denied/i.test(directInsert.stderr), "authenticated direct epoch insert is denied");
const directUpdate = psql(`update tongs.hammer_history_epoch_transitions set outcome='committed' where transition_id='${editorCommitted.transition_id}';`,
  { role: "authenticated", user: ids.editor, allowFailure: true });
check(directUpdate.status !== 0 && /permission denied/i.test(directUpdate.stderr), "authenticated direct transition update is denied");
const directDelete = psql(`delete from tongs.hammer_history_epoch_transitions where transition_id='${editorCommitted.transition_id}';`,
  { role: "authenticated", user: ids.editor, allowFailure: true });
check(directDelete.status !== 0 && /permission denied/i.test(directDelete.stderr), "authenticated direct transition delete is denied");

const immutableEpoch = psql(`update tongs.hammer_history_epochs set artifact_bytes=artifact_bytes+1 where epoch_id='${editorFixture.epoch}';`,
  { role: "service_role", allowFailure: true });
check(immutableEpoch.status !== 0 && /hammer_history_record_immutable/i.test(immutableEpoch.stderr), "committed epoch rows are immutable even to operational role writes");
const immutableReceipt = psql(`delete from tongs.hammer_history_epoch_transitions where transition_id='${editorCommitted.transition_id}';`,
  { role: "service_role", allowFailure: true });
check(immutableReceipt.status !== 0 && /hammer_history_record_immutable/i.test(immutableReceipt.stderr), "transition receipts are append-only");
const immutableRegistry = psql(`update tongs.workpiece_files set bytes=1 where workpiece_id='${editorFixture.workpiece}' and path='${editorFixture.archivePath}';`,
  { role: "service_role", allowFailure: true });
check(immutableRegistry.status !== 0 && /committed_hammer_history_file_immutable/i.test(immutableRegistry.stderr), "committed archive registry metadata is immutable");

const visibleToViewer = psql(`select count(*) from tongs.hammer_history_epochs where epoch_id='${editorFixture.epoch}';`,
  { role: "authenticated", user: ids.viewer }).stdout;
const visibleToOwner = psql(`select count(*) from tongs.hammer_history_epochs where epoch_id='${ownerFixture.epoch}';`,
  { role: "authenticated", user: ids.owner }).stdout;
const hiddenCrossWorkspace = psql(`select count(*) from tongs.hammer_history_epochs where epoch_id='${editorFixture.epoch}';`,
  { role: "authenticated", user: ids.other }).stdout;
check(visibleToViewer === "1" && visibleToOwner === "1" && hiddenCrossWorkspace === "0", "owner/viewer reads and cross-workspace RLS are correct");

const normalFixture = createFixture("normal history unchanged");
psql(`update tongs.workpiece_files set bytes=208380 where workpiece_id='${normalFixture.workpiece}' and path='${normalFixture.predecessorPath}';`,
  { role: "service_role" });
const normalState = JSON.parse(psql(`select json_build_object(
  'path',history_path,
  'bytes',(select bytes from tongs.workpiece_files where workpiece_id='${normalFixture.workpiece}' and path='${normalFixture.predecessorPath}')
)::text from tongs.recording_revisions where id='${normalFixture.revision}';`).stdout);
check(normalState.path === normalFixture.predecessorPath && normalState.bytes === 208380,
  "uncommitted normal-history pointer and registry behavior remain unchanged");

process.stdout.write("Hammer history-epoch database authority verification passed.\n");
