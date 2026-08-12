import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_nursery";
const ids = {
  viewer: "12000000-0000-4000-8000-000000000001",
  editor: "12000000-0000-4000-8000-000000000002",
  owner: "12000000-0000-4000-8000-000000000003",
  other: "12000000-0000-4000-8000-000000000004",
  orgA: "92000000-0000-4000-8000-000000000001",
  orgB: "92000000-0000-4000-8000-000000000002",
  workspaceA: "a2000000-0000-4000-8000-000000000001",
  workspaceB: "a2000000-0000-4000-8000-000000000002",
  workpieceA: "d2000000-0000-4000-8000-000000000001",
  workpieceB: "d2000000-0000-4000-8000-000000000002",
  capture: "c2000000-0000-4000-8000-000000000001",
};
const scriptHash = "d".repeat(64);
const mediaHash = "e".repeat(64);

function psql(sql, { role, user, allowFailure = false } = {}) {
  const prefix = role ? `set role ${role};${user ? `set request.jwt.claim.sub = '${user}';` : ""}` : "";
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
  { input: `${prefix}${sql}`, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.stdout);
  return { status: result.status ?? 1, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function check(condition, message) {
  if (!condition) throw new Error(message);
  process.stdout.write(`ok - ${message}\n`);
}

function asJson(value) {
  return JSON.stringify(value).replaceAll("'", "''");
}

function completionRpc({ user = ids.editor, key = "complete-valid-01", revision = 1, hash = mediaHash, evidence } = {}) {
  const body = evidence ?? {
    schema: "anvil.recording-completion.v2",
    completed: true,
    capture_session_id: ids.capture,
    asr_diagnostics: { terminal_line_completed: false, unresolved_skipped_line_count: 2 },
    artifact_validation: { ok: true, sha256: hash, bytes: 4096, content_type: "audio/wav" },
  };
  const sql = `select tongs.anvil_transition_take_completed_v2('${ids.workspaceA}','${ids.workpieceA}',
    '${ids.capture}',null,'script/script.md',1,'${scriptHash}','recordings/phase5c.wav',${revision},'${hash}',
    4096,'audio/wav','forge-workpieces','workpieces/${ids.workpieceA}/recordings/phase5c.wav','${key}','${asJson(body)}'::jsonb)::text;`;
  return JSON.parse(psql(sql, { role: "authenticated", user }).stdout.split(/\r?\n/).at(-1));
}

function keepRpc(completionId, { user = ids.editor, key = "keep-valid-0001", evidence } = {}) {
  const body = evidence ?? { schema: "anvil.take-decision.v1", decision: "keep", completion_id: completionId, capture_session_id: ids.capture };
  const sql = `select tongs.anvil_transition_take_kept('${ids.workspaceA}','${ids.workpieceA}','${ids.capture}',
    '${completionId}','${key}','${asJson(body)}'::jsonb)::text;`;
  return JSON.parse(psql(sql, { role: "authenticated", user }).stdout.split(/\r?\n/).at(-1));
}

try {
  psql(`
    delete from tongs.workspaces where id in ('${ids.workspaceA}','${ids.workspaceB}');
    delete from tongs.orgs where id in ('${ids.orgA}','${ids.orgB}');
    delete from auth.users where id in ('${ids.viewer}','${ids.editor}','${ids.owner}','${ids.other}');
    insert into auth.users(id) values ('${ids.viewer}'),('${ids.editor}'),('${ids.owner}'),('${ids.other}');
    insert into tongs.orgs(id,name,created_by) values
      ('${ids.orgA}','Anvil Authority A','${ids.owner}'),('${ids.orgB}','Anvil Authority B','${ids.other}');
    insert into tongs.workspaces(id,name,created_by,org_id) values
      ('${ids.workspaceA}','Anvil Workspace A','${ids.owner}','${ids.orgA}'),
      ('${ids.workspaceB}','Anvil Workspace B','${ids.other}','${ids.orgB}');
    insert into tongs.workspace_members(workspace_id,user_id,role,created_by) values
      ('${ids.workspaceA}','${ids.viewer}','viewer','${ids.owner}'),
      ('${ids.workspaceA}','${ids.editor}','editor','${ids.owner}');
    insert into tongs.episodes(id,workspace_id,label) values
      ('${ids.workpieceA}','${ids.workspaceA}','Anvil Proof A'),('${ids.workpieceB}','${ids.workspaceB}','Anvil Proof B');
    insert into tongs.workpiece_files(workpiece_id,path,file_type,content_type,bytes,hash_value,storage_key,
      written_by_tool,written_by_tool_version,written_by_lane) values
      ('${ids.workpieceA}','script/script.md','script','text/markdown',100,'${scriptHash}',
       'workpieces/${ids.workpieceA}/script/script.md','hearth','forge-v1.2.0','forge-managed'),
      ('${ids.workpieceA}','recordings/phase5c.wav','recording','audio/wav',4096,'${mediaHash}',
       'workpieces/${ids.workpieceA}/recordings/phase5c.wav','anvil','forge-v1.2.0','forge-managed');
  `);
  const readyEvidence = asJson({ transition: "hearth.script.published.v1", script_path: "script/script.md", script_revision: 1,
    script_hash: scriptHash, validation: { validator_version: "shared-script-tags-v1", ok: true, issue_count: 0 } });
  const ready = JSON.parse(psql(`select tongs.hearth_transition_script_ready('${ids.workspaceA}','${ids.workpieceA}',
    'script/script.md',1,'${scriptHash}','anvil-ready-0001','${readyEvidence}'::jsonb)::text;`,
  { role: "authenticated", user: ids.editor }).stdout);
  check(ready.outcome === "saved", "fixture establishes an exact validated Ready contract");

  const securityShape = psql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='tongs' and p.proname in ('anvil_transition_take_completed_v2','reserve_hammer_recording_import','finalize_hammer_recording_import')
      and p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
      and p.proconfig @> array['search_path=pg_catalog, tongs'];`).stdout;
  check(securityShape === "3", "recording authority RPCs are postgres-owned definers with fixed safe search_path");

  const direct = psql(`insert into tongs.workpiece_events(workpiece_id,event_name,payload,written_by_tool,written_by_tool_version,written_by_lane)
    values('${ids.workpieceA}','take_kept','{}','anvil','0.0.0','forge-managed');`, { allowFailure: true });
  check(direct.status !== 0 && /RPC-only/i.test(direct.stderr), "reserved take events cannot bypass transition RPCs, including service-role writes");

  const viewer = completionRpc({ user: ids.viewer, key: "complete-viewer-1" });
  check(viewer.outcome === "denied" && viewer.completion === null, "viewer completion is denied without row leakage");
  const crossWorkspace = completionRpc({ user: ids.other, key: "complete-cross-01" });
  check(crossWorkspace.outcome === "denied" && crossWorkspace.completion === null, "cross-workspace completion is denied without row leakage");
  const malformed = completionRpc({ key: "complete-bad-001", evidence: { schema: "anvil.recording-completion.v2", completed: true } });
  check(malformed.outcome === "conflict" && malformed.reason === "invalid_completion_evidence", "incomplete completion evidence is rejected");
  const unresolved = completionRpc({ key: "complete-skip-001", evidence: {
    schema: "anvil.recording-completion.v2", completed: true, capture_session_id: ids.capture,
    asr_diagnostics: { terminal_line_completed: false, unresolved_skipped_line_count: 1, unresolved_skipped_lines: [2] },
    artifact_validation: { ok: true, sha256: mediaHash, bytes: 4096, content_type: "audio/wav" },
  } });
  check(unresolved.outcome === "saved", "unresolved skipped lines and non-terminal ASR do not prevent completion");
  const stale = completionRpc({ key: "complete-stale-01", revision: 2 });
  check(stale.outcome === "stale" && stale.reason === "media_contract_mismatch", "stale media revision is rejected with canonical evidence");
  const mismatch = completionRpc({ key: "complete-hash-001", hash: "f".repeat(64) });
  check(mismatch.outcome === "stale", "mismatched media hash is rejected");

  const saved = unresolved;
  check(saved.outcome === "saved" && saved.completion.media_hash === mediaHash, "valid completion atomically records exact script and artifact authority");
  const completionId = saved.completion.id;
  const duplicate = completionRpc({ key: "complete-skip-001", evidence: saved.completion.completion_evidence });
  check(duplicate.outcome === "duplicate" && duplicate.completion.id === completionId, "completion retry is idempotent");
  const conflict = completionRpc({ key: "complete-skip-001", evidence: {
    schema: "anvil.recording-completion.v2", completed: true, capture_session_id: ids.capture,
    artifact_validation: { ok: true, sha256: mediaHash, bytes: 4096, content_type: "audio/wav" }, note: "conflicting reuse",
  } });
  check(conflict.outcome === "conflict" && conflict.reason === "idempotency_key_reused", "conflicting completion idempotency reuse fails");
  check(Number(psql(`select count(*) from tongs.current_workpiece_recorded_takes where workpiece_id='${ids.workpieceA}';`).stdout) >= 1,
    "completion alone exposes recorded truth without a keep gate");
  check(psql(`select count(*) from tongs.workpiece_events where workpiece_id='${ids.workpieceA}' and event_name='take_completed';`).stdout === "1",
    "each accepted completion maps to one append-only derived event");

  const importOperation = "c2000000-0000-4000-8000-000000000010";
  const importHash = "a".repeat(64);
  const importFingerprint = "b".repeat(64);
  const reserveSql = `select tongs.reserve_hammer_recording_import('${ids.workspaceA}','${ids.workpieceA}','${importOperation}',
    '${importFingerprint}','recordings/imports/${importOperation}/${importHash}.mp4','external.mp4','${importHash}',8192,
    'video/mp4','forge-workpieces','workpieces/${ids.workpieceA}/recordings/imports/${importOperation}/${importHash}.mp4',
    'forge-v1.2.0','{"schema":"hammer.recording-import.v1","deliberate_attach":true}'::jsonb)::text;`;
  const reserved = JSON.parse(psql(reserveSql, { role: "authenticated", user: ids.editor }).stdout);
  check(reserved.outcome === "reserved", "Hammer import reserves a stable operation before media mutation");
  const resumed = JSON.parse(psql(reserveSql, { role: "authenticated", user: ids.editor }).stdout);
  check(resumed.outcome === "resumable" && resumed.import.id === reserved.import.id, "Hammer import reservation replay resumes the same operation");
  const reserveConflict = JSON.parse(psql(reserveSql.replace(importFingerprint, "c".repeat(64)), { role: "authenticated", user: ids.editor }).stdout);
  check(reserveConflict.outcome === "conflict", "Hammer import rejects operation-ID reuse with different inputs");
  const finalized = JSON.parse(psql(`select tongs.finalize_hammer_recording_import('${reserved.import.id}','${importHash}',8192,'video/mp4')::text;`,
    { role: "authenticated", user: ids.editor }).stdout);
  check(finalized.outcome === "committed" && finalized.import.state === "committed", "Hammer import finalizes file authority and provenance atomically");
  const finalizedAgain = JSON.parse(psql(`select tongs.finalize_hammer_recording_import('${reserved.import.id}','${importHash}',8192,'video/mp4')::text;`,
    { role: "authenticated", user: ids.editor }).stdout);
  check(finalizedAgain.outcome === "duplicate" && finalizedAgain.import.id === reserved.import.id, "Hammer import finalization retry returns the original receipt");
  check(psql(`select count(*) from tongs.current_workpiece_recorded_takes where source_kind='hammer_import' and source_authority_id='${reserved.import.id}';`).stdout === "1",
    "committed Hammer import appears in normalized recorded-media truth");

  const crossRead = psql(`select count(*) from tongs.current_workpiece_recorded_takes where workpiece_id='${ids.workpieceA}';`,
    { role: "authenticated", user: ids.other });
  check(crossRead.stdout === "0", "cross-workspace recorded-truth reads are denied without row leakage");
  const directTable = psql(`delete from tongs.anvil_recording_completion_requests where id='${completionId}';`,
    { role: "authenticated", user: ids.editor, allowFailure: true });
  check(directTable.status !== 0 && /permission denied/i.test(directTable.stderr), "authenticated clients cannot mutate transition authority tables directly");

  process.stdout.write("Anvil recording-completion database authority verification passed.\n");
} finally {
  psql(`delete from tongs.workspaces where id in ('${ids.workspaceA}','${ids.workspaceB}');
    delete from tongs.orgs where id in ('${ids.orgA}','${ids.orgB}');
    delete from auth.users where id in ('${ids.viewer}','${ids.editor}','${ids.owner}','${ids.other}');`, { allowFailure: true });
}
