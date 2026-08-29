import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_nursery";
const ids = {
  owner: "14000000-0000-4000-8000-000000000001",
  editor: "14000000-0000-4000-8000-000000000002",
  viewer: "14000000-0000-4000-8000-000000000003",
  outsider: "14000000-0000-4000-8000-000000000004",
  orgA: "94000000-0000-4000-8000-000000000001",
  orgB: "94000000-0000-4000-8000-000000000002",
  workspaceA: "a4000000-0000-4000-8000-000000000001",
  workspaceB: "a4000000-0000-4000-8000-000000000002",
  existingWorkpiece: "d4000000-0000-4000-8000-000000000001",
  execution: "c4000000-0000-4000-8000-000000000001",
};
const mediaHash = "e".repeat(64);

function psql(sql, { role, user, allowFailure = false } = {}) {
  const prefix = role ? `set role ${role};set request.jwt.claim.sub='${user}';` : "";
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
  { input: `${prefix}${sql}`, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.stdout);
  return { status: result.status ?? 1, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}
function json(sql, options) {
  const output = psql(sql, options).stdout.split(/\r?\n/).filter(Boolean).at(-1);
  return JSON.parse(output);
}
function check(condition, message) {
  if (!condition) throw new Error(message);
  process.stdout.write(`ok - ${message}\n`);
}
function quoteJson(value) { return JSON.stringify(value).replaceAll("'", "''"); }
const cleanupSql = `
  alter table tongs.recording_workpiece_creation_requests disable trigger trg_recording_workpiece_creation_immutable;
  alter table tongs.recording_capture_authorities disable trigger trg_anvil_capture_authority_immutable;
  alter table tongs.anvil_capture_executions disable trigger trg_anvil_capture_execution_immutable;
  alter table tongs.anvil_recording_completion_requests disable trigger trg_recording_completion_immutable;
  alter table tongs.recording_media_verification_receipts disable trigger trg_recording_media_verification_immutable;
  alter table tongs.anvil_recording_keep_requests disable trigger trg_recording_keep_immutable;
  alter table tongs.anvil_recording_discard_requests disable trigger trg_recording_discard_immutable;
  delete from tongs.anvil_recording_keep_requests where workspace_id in ('${ids.workspaceA}','${ids.workspaceB}');
  delete from tongs.anvil_recording_discard_requests where workspace_id in ('${ids.workspaceA}','${ids.workspaceB}');
  delete from tongs.anvil_recording_completion_requests where workspace_id in ('${ids.workspaceA}','${ids.workspaceB}');
  delete from tongs.recording_media_verification_receipts where workspace_id in ('${ids.workspaceA}','${ids.workspaceB}');
  delete from tongs.anvil_capture_executions where recording_capture_authority_id in
    (select id from tongs.recording_capture_authorities where workspace_id in ('${ids.workspaceA}','${ids.workspaceB}'));
  delete from tongs.recording_capture_authorities where workspace_id in ('${ids.workspaceA}','${ids.workspaceB}');
  delete from tongs.recording_workpiece_creation_requests where workspace_id in ('${ids.workspaceA}','${ids.workspaceB}');
  alter table tongs.anvil_recording_discard_requests enable trigger trg_recording_discard_immutable;
  alter table tongs.anvil_recording_keep_requests enable trigger trg_recording_keep_immutable;
  alter table tongs.anvil_recording_completion_requests enable trigger trg_recording_completion_immutable;
  alter table tongs.recording_media_verification_receipts enable trigger trg_recording_media_verification_immutable;
  alter table tongs.anvil_capture_executions enable trigger trg_anvil_capture_execution_immutable;
  alter table tongs.recording_capture_authorities enable trigger trg_anvil_capture_authority_immutable;
  alter table tongs.recording_workpiece_creation_requests enable trigger trg_recording_workpiece_creation_immutable;
  delete from tongs.workspaces where id in ('${ids.workspaceA}','${ids.workspaceB}');
  delete from tongs.orgs where id in ('${ids.orgA}','${ids.orgB}');
  delete from auth.users where id in ('${ids.owner}','${ids.editor}','${ids.viewer}','${ids.outsider}');`;

try {
  psql(`${cleanupSql}
    insert into auth.users(id) values ('${ids.owner}'),('${ids.editor}'),('${ids.viewer}'),('${ids.outsider}');
    insert into tongs.orgs(id,name,created_by) values
      ('${ids.orgA}','Recording Authority A','${ids.owner}'),('${ids.orgB}','Recording Authority B','${ids.outsider}');
    insert into tongs.workspaces(id,name,created_by,org_id) values
      ('${ids.workspaceA}','Recording Workspace A','${ids.owner}','${ids.orgA}'),
      ('${ids.workspaceB}','Recording Workspace B','${ids.outsider}','${ids.orgB}');
    insert into tongs.workspace_members(workspace_id,user_id,role,created_by) values
      ('${ids.workspaceA}','${ids.editor}','editor','${ids.owner}'),
      ('${ids.workspaceA}','${ids.viewer}','viewer','${ids.owner}');
    insert into tongs.episodes(id,workspace_id,label,created_by,creation_origin)
      values('${ids.existingWorkpiece}','${ids.workspaceA}','Existing workpiece','${ids.owner}','hearth_project');
  `);

  const securityShape = Number(psql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='tongs' and p.proname in ('create_recording_workpiece','establish_recording_capture_authority',
      'recording_transition_take_completed','recording_transition_take_completed_verified','recording_transition_take_decision') and p.prosecdef
      and pg_get_userbyid(p.proowner)='postgres' and p.proconfig @> array['search_path=pg_catalog, tongs'];`).stdout);
  check(securityShape === 5, "venue-neutral recording RPCs are postgres-owned definers with a fixed search_path");

  const createKey = "phase1-create-operation-0001";
  const created = json(`select tongs.create_recording_workpiece('${ids.workspaceA}','Unscripted take','anvil','${createKey}')::text;`,
    { role: "authenticated", user: ids.editor });
  check(created.outcome === "created" && typeof created.workpiece_id === "string", "shared workflow creates a recording-origin workpiece");
  const workpiece = created.workpiece_id;
  const duplicateCreate = json(`select tongs.create_recording_workpiece('${ids.workspaceA}','Unscripted take','anvil','${createKey}')::text;`,
    { role: "authenticated", user: ids.editor });
  check(duplicateCreate.outcome === "existing" && duplicateCreate.workpiece_id === workpiece, "workpiece creation replay is idempotent");
  const createConflict = json(`select tongs.create_recording_workpiece('${ids.workspaceA}','Changed title','anvil','${createKey}')::text;`,
    { role: "authenticated", user: ids.editor });
  check(createConflict.outcome === "conflict" && createConflict.reason === "operation_key_reused", "workpiece creation rejects operation-key payload reuse");
  const deniedCreate = json(`select tongs.create_recording_workpiece('${ids.workspaceA}','Denied','anvil','phase1-create-denied-0001')::text;`,
    { role: "authenticated", user: ids.outsider });
  check(deniedCreate.outcome === "denied", "cross-workspace workpiece creation is denied");
  check(psql(`select count(*) from tongs.recording_capture_authorities where workpiece_id='${workpiece}';`).stdout === "0",
    "workpiece creation does not establish capture authority");
  check(psql(`select count(*) from tongs.workpiece_files where workpiece_id='${workpiece}';`).stdout === "0" &&
    psql(`select count(*) from tongs.workpiece_ready_transition_requests where workpiece_id='${workpiece}';`).stdout === "0" &&
    psql(`select count(*) from tongs.workpiece_ready_script_meta where workpiece_id='${workpiece}';`).stdout === "0" &&
    psql(`select count(*) from tongs.script_approval_revisions where workpiece_id='${workpiece}';`).stdout === "0",
    "workpiece creation manufactures no script, Ready, or approval artifact");
  check(psql(`select count(*) from tongs.recording_capture_authorities where workpiece_id='${ids.existingWorkpiece}';`).stdout === "0",
    "opening/existence of a workpiece does not establish capture authority");

  const captureKey = "phase1-capture-operation-0001";
  const capture = json(`select tongs.establish_recording_capture_authority('${ids.workspaceA}','${workpiece}','anvil','${ids.execution}',
    '${captureKey}',null,'forge-v1.2.0')::text;`, { role: "authenticated", user: ids.editor });
  const authority = capture.capture_authority?.id;
  check(capture.outcome === "established" && capture.capture_authority?.script_binding_kind === "none" &&
    capture.venue_execution?.execution_id === ids.execution, "Record establishes an unscripted shared authority plus Anvil execution evidence");
  const duplicateCapture = json(`select tongs.establish_recording_capture_authority('${ids.workspaceA}','${workpiece}','anvil','${ids.execution}',
    '${captureKey}',null,'forge-v1.2.0')::text;`, { role: "authenticated", user: ids.editor });
  check(duplicateCapture.outcome === "duplicate" && duplicateCapture.capture_authority?.id === authority, "capture replay is idempotent");
  const captureConflict = json(`select tongs.establish_recording_capture_authority('${ids.workspaceA}','${ids.existingWorkpiece}','anvil',
    'c4000000-0000-4000-8000-000000000002','${captureKey}',null,'forge-v1.2.0')::text;`,
  { role: "authenticated", user: ids.editor });
  check(captureConflict.outcome === "conflict" && captureConflict.reason === "operation_key_reused", "capture rejects operation-key payload reuse");

  psql(`insert into tongs.workpiece_files(workpiece_id,path,file_type,content_type,bytes,hash_value,storage_key,
    written_by_tool,written_by_tool_version,written_by_lane) values('${workpiece}','recordings/phase1.webm','recording','video/webm',8192,
    '${mediaHash}','workpieces/${workpiece}/recordings/phase1.webm','anvil','forge-v1.2.0','forge-managed');`);
  check(psql(`select count(*) from tongs.workpiece_files where workpiece_id='${workpiece}' and path='recordings/phase1.webm';`).stdout === "1"
    && psql(`select count(*) from tongs.anvil_recording_completion_requests where workpiece_id='${workpiece}';`).stdout === "0",
    "refresh boundary after upload is distinguishable without inventing a pending-operation authority");
  const completionEvidence = { schema: "forge.recording-completion.v1", completed: true, recording_capture_authority_id: authority,
    venue_version: "forge-v1.2.0", artifact_validation: { ok: true, sha256: mediaHash, bytes: 8192, content_type: "video/webm" } };
  const unverifiedAttempt = psql(`select tongs.recording_transition_take_completed('${authority}','recordings/phase1.webm',1,
    '${mediaHash}',8192,'video/webm','forge-workpieces','workpieces/${workpiece}/recordings/phase1.webm','phase1-unverified-0001',
    '${quoteJson(completionEvidence)}'::jsonb)::text;`, { role: "authenticated", user: ids.editor, allowFailure: true });
  check(unverifiedAttempt.status !== 0 && /permission denied/i.test(unverifiedAttempt.stderr), "browser-authenticated completion cannot bypass trusted verification");
  const completionSql = (key, evidence) => `select tongs.recording_transition_take_completed_verified('${authority}','recordings/phase1.webm',1,
    '${mediaHash}',8192,'video/webm','forge-workpieces','workpieces/${workpiece}/recordings/phase1.webm',1000,true,true,
    'ffprobe:phase1-certifier','${key}','${quoteJson(evidence)}'::jsonb,'${ids.editor}')::text;`;
  const completed = json(completionSql("phase1-completion-0001", completionEvidence), { role: "service_role", user: ids.editor });
  const completion = completed.completion?.id;
  check(completed.outcome === "saved" && typeof completion === "string", "completion binds canonical file evidence to the shared authority");
  const duplicateCompletion = json(completionSql("phase1-completion-0001", completionEvidence), { role: "service_role", user: ids.editor });
  check(duplicateCompletion.outcome === "duplicate" && duplicateCompletion.completion?.id === completion, "completion replay is idempotent");
  const changedEvidence = { ...completionEvidence, certification_nonce: "changed" };
  const completionConflict = json(completionSql("phase1-completion-0001", changedEvidence), { role: "service_role", user: ids.editor });
  check(completionConflict.outcome === "conflict" && completionConflict.reason === "idempotency_key_reused", "completion rejects operation-key payload reuse");
  const pendingAfterCompletion = json(`select tongs.read_anvil_pending_take_decisions('${ids.workspaceA}','${workpiece}')::text;`,
    { role: "authenticated", user: ids.editor });
  check(pendingAfterCompletion.pending?.[0]?.recording_capture_authority_id === authority
    && typeof pendingAfterCompletion.pending?.[0]?.media_verification_receipt_id === "string",
    "refresh after completion reconstructs the venue-neutral authority and verified media receipt");

  const decisionEvidence = { decision: "keep", completion_id: completion, recording_capture_authority_id: authority };
  const kept = json(`select tongs.recording_transition_take_decision('${authority}','${completion}','keep','phase1-keep-0001',
    '${quoteJson(decisionEvidence)}'::jsonb)::text;`, { role: "authenticated", user: ids.editor });
  check(kept.outcome === "saved", `keep decision is authority-bound (${JSON.stringify(kept)})`);
  const duplicateKeep = json(`select tongs.recording_transition_take_decision('${authority}','${completion}','keep','phase1-keep-0001',
    '${quoteJson(decisionEvidence)}'::jsonb)::text;`, { role: "authenticated", user: ids.editor });
  check(duplicateKeep.outcome === "duplicate" && duplicateKeep.keep?.id === kept.keep?.id, "decision replay is idempotent");
  const changedDecision = { ...decisionEvidence, certification_nonce: "changed" };
  const decisionConflict = json(`select tongs.recording_transition_take_decision('${authority}','${completion}','keep','phase1-keep-0001',
    '${quoteJson(changedDecision)}'::jsonb)::text;`, { role: "authenticated", user: ids.editor });
  check(decisionConflict.outcome === "conflict" && decisionConflict.reason === "idempotency_key_reused", "decision rejects operation-key payload reuse");
  const pendingAfterKeep = json(`select tongs.read_anvil_pending_take_decisions('${ids.workspaceA}','${workpiece}')::text;`,
    { role: "authenticated", user: ids.editor });
  check(pendingAfterKeep.pending?.length === 0, "refresh after keep reconstructs the terminal decision");
  check(psql(`select count(*) from tongs.recording_workpiece_creation_requests where workpiece_id='${workpiece}';`).stdout === "1"
    && psql(`select count(*) from tongs.recording_capture_authorities where workpiece_id='${workpiece}';`).stdout === "1"
    && psql(`select count(*) from tongs.recording_media_verification_receipts where workpiece_id='${workpiece}';`).stdout === "1"
    && psql(`select count(*) from tongs.anvil_recording_completion_requests where workpiece_id='${workpiece}';`).stdout === "1"
    && psql(`select count(*) from tongs.anvil_recording_keep_requests where workpiece_id='${workpiece}';`).stdout === "1",
    "retries create no duplicate workpiece, authority, verification, completion, or decision receipts");

  check(psql(`select count(*) from tongs.recording_workpiece_creation_requests where workpiece_id='${workpiece}';`,
    { role: "authenticated", user: ids.viewer }).stdout === "1", "workspace viewer can read the creation receipt");
  check(psql(`select count(*) from tongs.recording_capture_authorities where id='${authority}';`,
    { role: "authenticated", user: ids.viewer }).stdout === "1", "workspace viewer can read capture authority");
  check(psql(`select count(*) from tongs.anvil_capture_executions where recording_capture_authority_id='${authority}';`,
    { role: "authenticated", user: ids.viewer }).stdout === "1", "workspace viewer can read Anvil execution evidence");
  for (const relation of ["recording_workpiece_creation_requests", "recording_capture_authorities", "anvil_capture_executions",
    "recording_media_verification_receipts", "anvil_recording_completion_requests", "anvil_recording_keep_requests"]) {
    check(psql(`select count(*) from tongs.${relation};`, { role: "authenticated", user: ids.outsider }).stdout === "0",
      `RLS hides ${relation} from an unrelated workspace`);
  }

  const mutateCreation = psql(`update tongs.recording_workpiece_creation_requests set title='mutated' where workpiece_id='${workpiece}';`,
    { role: "service_role", user: ids.owner, allowFailure: true });
  check(mutateCreation.status !== 0 && /immutable/i.test(mutateCreation.stderr), "creation receipts are immutable");
  const mutateAuthority = psql(`update tongs.recording_capture_authorities set operation_key='mutated-operation' where id='${authority}';`,
    { role: "service_role", user: ids.owner, allowFailure: true });
  check(mutateAuthority.status !== 0 && /immutable/i.test(mutateAuthority.stderr), "capture authority provenance is immutable");
  const mutateExecution = psql(`delete from tongs.anvil_capture_executions where recording_capture_authority_id='${authority}';`,
    { role: "service_role", user: ids.owner, allowFailure: true });
  check(mutateExecution.status !== 0 && /immutable/i.test(mutateExecution.stderr), "Anvil execution evidence is immutable");
  const mutateCompletion = psql(`update tongs.anvil_recording_completion_requests set media_bytes=1 where id='${completion}';`,
    { role: "service_role", user: ids.owner, allowFailure: true });
  check(mutateCompletion.status !== 0 && /immutable/i.test(mutateCompletion.stderr), "completion receipts are immutable");
  const mutateVerification = psql(`update tongs.recording_media_verification_receipts set duration_ms=1 where recording_capture_authority_id='${authority}';`,
    { role: "service_role", user: ids.owner, allowFailure: true });
  check(mutateVerification.status !== 0 && /immutable/i.test(mutateVerification.stderr), "canonical media verification receipts are immutable");
  const mutateDecision = psql(`delete from tongs.anvil_recording_keep_requests where id='${kept.keep.id}';`,
    { role: "service_role", user: ids.owner, allowFailure: true });
  check(mutateDecision.status !== 0 && /immutable/i.test(mutateDecision.stderr), "decision receipts are immutable");

  process.stdout.write("Venue-neutral recording authority DB verification passed.\n");
} finally {
  psql(cleanupSql, { allowFailure: true });
}
