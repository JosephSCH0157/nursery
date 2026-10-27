import { spawn, spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER;
if (!container) throw new Error("SUPABASE_DB_CONTAINER is required");

const user = "15000000-0000-4000-8000-000000000001";
const workspace = "a5000000-0000-4000-8000-000000000001";
const authority = (n) => `c5000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const completion = (n) => `e5000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function psql(sql, { authenticated = false, allowFailure = false } = {}) {
  const prefix = authenticated ? `set role authenticated;set request.jwt.claim.sub='${user}';` : "";
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: `${prefix}${sql}`, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.stdout);
  return { status: result.status ?? 1, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}
function rpc(authorityId, completionId, decision, key, nonce = "") {
  const evidence = JSON.stringify({ decision, completion_id: completionId, recording_capture_authority_id: authorityId, nonce });
  const out = psql(`select tongs.recording_transition_take_decision('${authorityId}','${completionId}','${decision}','${key}',
    '${evidence.replaceAll("'", "''")}'::jsonb)::text;`, { authenticated: true }).stdout.split(/\r?\n/).filter(Boolean).at(-1);
  return JSON.parse(out);
}
function check(value, message) {
  if (!value) throw new Error(message);
  process.stdout.write(`ok - ${message}\n`);
}
function concurrentRpc(authorityId, completionId, decision, key) {
  return new Promise((resolve, reject) => {
    const evidence = JSON.stringify({ decision, completion_id: completionId, recording_capture_authority_id: authorityId });
    const child = spawn("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
      "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || stdout));
      resolve(JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)));
    });
    child.stdin.end(`set role authenticated;set request.jwt.claim.sub='${user}';select tongs.recording_transition_take_decision(
      '${authorityId}','${completionId}','${decision}','${key}','${evidence.replaceAll("'", "''")}'::jsonb)::text;`);
  });
}

const shape = psql(`select jsonb_build_object(
  'keep_authority_not_null',(select attnotnull from pg_attribute where attrelid='tongs.anvil_recording_keep_requests'::regclass and attname='recording_capture_authority_id'),
  'discard_authority_not_null',(select attnotnull from pg_attribute where attrelid='tongs.anvil_recording_discard_requests'::regclass and attname='recording_capture_authority_id'),
  'keep_session_not_null',(select attnotnull from pg_attribute where attrelid='tongs.anvil_recording_keep_requests'::regclass and attname='capture_session_id'),
  'discard_session_not_null',(select attnotnull from pg_attribute where attrelid='tongs.anvil_recording_discard_requests'::regclass and attname='capture_session_id'),
  'immutable_triggers',(select count(*) from pg_trigger where not tgisinternal and tgname in
    ('trg_recording_completion_immutable','trg_recording_keep_immutable','trg_recording_discard_immutable')),
  'authority_fks',(select count(*) from pg_constraint where contype='f' and confrelid='tongs.recording_capture_authorities'::regclass
    and conrelid in ('tongs.anvil_recording_keep_requests'::regclass,'tongs.anvil_recording_discard_requests'::regclass))
)::text;`).stdout;
const parsedShape = JSON.parse(shape);
check(parsedShape.keep_authority_not_null && parsedShape.discard_authority_not_null
  && !parsedShape.keep_session_not_null && !parsedShape.discard_session_not_null
  && Number(parsedShape.immutable_triggers) === 3 && Number(parsedShape.authority_fks) === 2,
"drifted receipt schema upgraded with authority FKs, nullable execution IDs, and immutable triggers");

check(psql(`select count(*) from public.recording_authority_upgrade_preimage p
  join tongs.anvil_recording_keep_requests k on p.kind='keep' and p.id=k.id
  where p.receipt=(to_jsonb(k.*)-'recording_capture_authority_id');`).stdout === "1"
  && psql(`select count(*) from public.recording_authority_upgrade_preimage p
  join tongs.anvil_recording_discard_requests d on p.kind='discard' and p.id=d.id
  where p.receipt=(to_jsonb(d.*)-'recording_capture_authority_id');`).stdout === "1",
"legacy receipt identities and all pre-existing bytes remain unchanged");
check(psql(`select count(*) from tongs.anvil_recording_keep_requests where id='b5200000-0000-4000-8000-000000000001'
  and recording_capture_authority_id='${authority(1)}' and request_fingerprint=md5('legacy-keep-fingerprint');`).stdout === "1"
  && psql(`select count(*) from tongs.anvil_recording_discard_requests where id='b5200000-0000-4000-8000-000000000002'
  and recording_capture_authority_id='${authority(2)}' and request_fingerprint=md5('legacy-discard-fingerprint');`).stdout === "1",
"authority backfill preserves legacy fingerprints");

const legacyKeep = rpc(authority(1), completion(1), "keep", "legacy-keep-operation-0001", "replay");
const legacyDiscard = rpc(authority(2), completion(2), "discard", "legacy-discard-operation-0001", "replay");
check(legacyKeep.outcome === "duplicate" && legacyKeep.keep?.id === "b5200000-0000-4000-8000-000000000001"
  && legacyDiscard.outcome === "duplicate" && legacyDiscard.discard?.id === "b5200000-0000-4000-8000-000000000002",
"legacy Keep and Discard replay as duplicates without fingerprint replacement");

const kept = rpc(authority(3), completion(3), "keep", "venue-neutral-keep-0001");
const discarded = rpc(authority(4), completion(4), "discard", "venue-neutral-discard-0001");
check(kept.outcome === "saved" && kept.keep?.capture_session_id === null
  && discarded.outcome === "saved" && discarded.discard?.capture_session_id === null,
"new venue-neutral Keep and Discard decisions succeed without Anvil execution IDs");
check(rpc(authority(3), completion(3), "keep", "different-key-same-completion", "changed").outcome === "duplicate",
"same-completion replay is idempotent before fingerprint comparison");
const reused = rpc(authority(5), completion(5), "keep", "venue-neutral-keep-0001");
check(reused.outcome === "conflict" && reused.reason === "idempotency_key_reused", "cross-completion key reuse conflicts");
check(rpc(authority(3), completion(3), "discard", "opposite-discard-0001").reason === "take_already_kept"
  && rpc(authority(4), completion(4), "keep", "opposite-keep-0001").reason === "take_already_discarded",
"opposite decisions conflict");
check(rpc(authority(4), completion(3), "keep", "mismatch-authority-0001").outcome === "not_found",
"mismatched authority and completion return not_found");

const competing = await Promise.all([
  concurrentRpc(authority(6), completion(6), "keep", "concurrent-keep-0001"),
  concurrentRpc(authority(6), completion(6), "discard", "concurrent-discard-0001"),
]);
check(competing.filter((row) => row.outcome === "saved").length === 1
  && competing.filter((row) => row.outcome === "conflict").length === 1,
"competing decisions serialize to one terminal winner");
check(psql(`select count(*) from tongs.workpiece_events where workpiece_id='d5000000-0000-4000-8000-000000000006'
  and event_name in ('take_kept','take_discarded');`).stdout === "1", "concurrent decision emits exactly one guarded event");

for (const statement of [
  `update tongs.anvil_recording_completion_requests set media_bytes=1 where id='${completion(3)}'`,
  `delete from tongs.anvil_recording_keep_requests where completion_id='${completion(3)}'`,
  `delete from tongs.anvil_recording_discard_requests where completion_id='${completion(4)}'`,
]) {
  const result = psql(statement, { allowFailure: true });
  check(result.status !== 0 && /immutable/i.test(result.stderr), "immutable recording receipt rejects mutation");
}

check(psql(`set role authenticated;set request.jwt.claim.sub='${user}';select jsonb_array_length(
  tongs.read_anvil_pending_take_decisions('${workspace}','d5000000-0000-4000-8000-000000000007')->'pending');`).stdout === "1",
"pending decision remains visible until a valid decision exists");
check(rpc(authority(7), completion(7), "keep", "pending-terminal-keep-0001").outcome === "saved"
  && psql(`set role authenticated;set request.jwt.claim.sub='${user}';select jsonb_array_length(
    tongs.read_anvil_pending_take_decisions('${workspace}','d5000000-0000-4000-8000-000000000007')->'pending');`).stdout === "0",
"pending decision disappears only after valid Keep");
check(psql(`set role authenticated;set request.jwt.claim.sub='${user}';select count(*) from tongs.current_workpiece_recorded_takes
  where completion_id in ('${completion(3)}','${completion(7)}');`).stdout === "2",
"verified kept venue-neutral recordings appear in the Hammer projection");
check(psql(`select count(*) from tongs.workpiece_files where workpiece_id::text like 'd5000000-%'
  and bytes between 8193 and 8199 and hash_value ~ '^[0-9a-f]{64}$';`).stdout === "7",
"customer media metadata remains unchanged");

const grants = Number(psql(`select count(*) from information_schema.routine_privileges where specific_schema='tongs'
  and routine_name='recording_transition_take_decision' and grantee in ('authenticated','service_role') and privilege_type='EXECUTE';`).stdout);
const publicGrant = Number(psql(`select count(*) from information_schema.routine_privileges where specific_schema='tongs'
  and routine_name='recording_transition_take_decision' and grantee in ('PUBLIC','anon') and privilege_type='EXECUTE';`).stdout);
check(grants === 2 && publicGrant === 0, "decision function grants remain restricted to authenticated and service_role");

process.stdout.write("Production-shaped recording authority upgrade verification passed; no provider or financial path was invoked.\n");
