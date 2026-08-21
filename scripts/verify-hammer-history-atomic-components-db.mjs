import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER;
if (!container || !/^supabase_db_forge-he3-he8b1-[a-z0-9-]+$/.test(container)) throw new Error("a disposable HE-8B1 database container is required");
const ids = { owner: randomUUID(), editor: randomUUID(), viewer: randomUUID(), other: randomUUID(), orgA: randomUUID(), orgB: randomUUID(), workspaceA: randomUUID(), workspaceB: randomUUID() };
const hashes = { transcript: "1".repeat(64), visual_timeline: "2".repeat(64), visual_placements: "3".repeat(64), audio: "4".repeat(64), editorial_authority: "5".repeat(64) };

function psql(sql, { role, user, allowFailure = false } = {}) {
  const prefix = role ? `set role ${role};${user ? `set request.jwt.claim.sub='${user}';` : ""}` : "";
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: `${prefix}${sql}`, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.stdout);
  return { status: result.status ?? 1, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}
const qj = (value) => JSON.stringify(value).replaceAll("'", "''");
const check = (value, label) => { if (!value) throw new Error(label); process.stdout.write(`ok - ${label}\n`); };
const conflict = (value, code, label) => check(value.outcome === "conflict" && value.code === code && value.terminal === true && value.retryable === false, label);

psql(`
insert into auth.users(id) values('${ids.owner}'),('${ids.editor}'),('${ids.viewer}'),('${ids.other}');
insert into tongs.orgs(id,name,created_by) values('${ids.orgA}','HE8B1 Synthetic A','${ids.owner}'),('${ids.orgB}','HE8B1 Synthetic B','${ids.other}');
insert into tongs.workspaces(id,name,created_by,org_id) values('${ids.workspaceA}','HE8B1 Workspace A','${ids.owner}','${ids.orgA}'),('${ids.workspaceB}','HE8B1 Workspace B','${ids.other}','${ids.orgB}');
insert into tongs.workspace_members(workspace_id,user_id,role,created_by) values('${ids.workspaceA}','${ids.editor}','editor','${ids.owner}'),('${ids.workspaceA}','${ids.viewer}','viewer','${ids.owner}');
`);

function fixture(label) {
  const workpiece = randomUUID(), recording = randomUUID(), revision = randomUUID(), epoch = randomUUID(), head = randomUUID();
  const anchorPath = `hammer/revisions/${revision}/history/epochs/${epoch}.v1.json`;
  const headPath = `hammer/revisions/${revision}/history/epochs/${epoch}/heads/${head}.history.v1.json`;
  const paths = Object.fromEntries(Object.keys(hashes).map((key) => [key, `hammer/revisions/${revision}/components/${key}.v1.json`]));
  psql(`
  insert into tongs.episodes(id,workspace_id,label) values('${workpiece}','${ids.workspaceA}','${label}');
  insert into tongs.canonical_recordings(id,workspace_id,workpiece_id,status,media_path,media_id,created_by,updated_by) values('${recording}','${ids.workspaceA}','${workpiece}','draft','recordings/synthetic.wav','synthetic:${recording}','${ids.owner}','${ids.owner}');
  insert into tongs.recording_revisions(id,workspace_id,workpiece_id,canonical_recording_id,status,history_path,revision_transcript_path,visual_timeline_path,visual_placements_path,audio_polish_path,editorial_authority_path,created_by,updated_by)
    values('${revision}','${ids.workspaceA}','${workpiece}','${recording}','active','${anchorPath}','${paths.transcript}','${paths.visual_timeline}','${paths.visual_placements}','${paths.audio}','${paths.editorial_authority}','${ids.owner}','${ids.owner}');
  update tongs.episodes set canonical_recording_id='${recording}',active_revision_id='${revision}' where id='${workpiece}';
  insert into tongs.workpiece_files(workpiece_id,path,file_type,content_type,bytes,hash_value,storage_bucket,storage_key,written_by_tool,written_by_tool_version,written_by_lane) values('${workpiece}','${anchorPath}','hammer_history_epoch','application/json',2048,'${"a".repeat(64)}','forge-workpieces','workpieces/${workpiece}/${anchorPath}','tongs','history-epoch-v1','forge-managed');
  ${Object.entries(paths).map(([key,path]) => `insert into tongs.workpiece_files(workpiece_id,path,file_type,content_type,bytes,hash_value,storage_bucket,storage_key,written_by_tool,written_by_tool_version,written_by_lane) values('${workpiece}','${path}','hammer_revision_artifact','application/json',100,'${hashes[key]}','forge-workpieces','workpieces/${workpiece}/${path}','hammer','forge-v1.2.0','forge-managed');`).join("\n")}
  `);
  const state = JSON.parse(psql(`select json_build_object('revision_token',(select updated_at from tongs.recording_revisions where id='${revision}'),'anchor_revision',(select revision from tongs.workpiece_files where workpiece_id='${workpiece}' and path='${anchorPath}'),'anchor_token',(select updated_at from tongs.workpiece_files where workpiece_id='${workpiece}' and path='${anchorPath}'))::text;`).stdout);
  psql(`insert into tongs.hammer_history_epochs(epoch_id,workspace_id,workpiece_id,canonical_recording_id,recording_revision_id,artifact_path,artifact_sha256,artifact_bytes,artifact_registry_revision,artifact_registry_updated_at,base_editor_state_hash,base_component_sha256,creation_reason,predecessor_original_path,predecessor_archive_path,predecessor_sha256,predecessor_bytes,predecessor_registry_revision,predecessor_registry_updated_at,archive_registry_revision,archive_registry_updated_at,initiating_user_id)
    values('${epoch}','${ids.workspaceA}','${workpiece}','${recording}','${revision}','${anchorPath}','${"a".repeat(64)}',2048,${state.anchor_revision},'${state.anchor_token}','hammer-state:1234abcd','${qj(hashes)}','legacy_history_unrecoverable','hammer/revisions/${revision}/history.v1.json','hammer/revisions/${revision}/history/archive/${"f".repeat(64)}.history.v1.json','${"f".repeat(64)}',99,1,'${state.anchor_token}',1,'${state.anchor_token}','${ids.editor}');`);
  const authority = {};
  for (const [key,path] of Object.entries(paths)) authority[key] = JSON.parse(psql(`select json_build_object('workpiece_id',workpiece_id,'path',path,'sha256',lower(hash_value),'bytes',bytes,'registry_revision',revision,'registry_updated_at',updated_at,'content_type',content_type)::text from tongs.workpiece_files where workpiece_id='${workpiece}' and path='${path}';`).stdout);
  const component = "visual_placements", before = authority[component], nextToken = "2026-08-21 12:34:56.123456+00", nextHash = "6".repeat(64);
  const changes = [{ component, path: paths[component], expected: { sha256: before.sha256, bytes: before.bytes, revision: before.registry_revision, updated_at: before.registry_updated_at, storage_bucket: "forge-workpieces", storage_key: `workpieces/${workpiece}/${paths[component]}` }, next: { sha256: nextHash, bytes: 101, revision: before.registry_revision + 1, updated_at: nextToken, storage_bucket: "forge-workpieces", storage_key: `workpieces/${workpiece}/hammer/staging/history-atomic/${head}/visual_placements.json` } }];
  authority[component] = { ...before, sha256: nextHash, bytes: 101, registry_revision: before.registry_revision + 1, registry_updated_at: nextToken };
  const headHash = "7".repeat(64), headToken = "2026-08-21 12:34:56.223456+00", key = `history-atomic:${head}`, fingerprint = "8".repeat(64);
  const envelope = { schema:"forge.hammer-history-epoch-head",schema_version:1,workspace_id:ids.workspaceA,workpiece_id:workpiece,canonical_recording_id:recording,recording_revision_id:revision,epoch_id:epoch,head_id:head,sequence:1,creation:{initiating_user_id:ids.editor},parent:{head_id:null,path:anchorPath,sha256:"a".repeat(64),registry_revision:state.anchor_revision,registry_updated_at:state.anchor_token},artifact:{path:headPath,sha256:headHash,bytes:3001,registry_revision:1,registry_updated_at:headToken},epoch_anchor:{path:anchorPath,sha256:"a".repeat(64)},base:{editor_state_hash:"hammer-state:1234abcd",component_sha256:hashes},result:{editor_state_hash:"hammer-state:87654321",component_authority:authority},component_changes:changes,history:{entries:[],undo_stack:[],redo_stack:[],checkpoints:[]},boundary:{prior_history_status:"unavailable",merged:false,traversable:false} };
  return { workpiece,recording,revision,epoch,head,anchorPath,headPath,state,changes,authority,envelope,key,fingerprint,headHash,headToken,paths,before };
}

function sql(f, overrides={}) {
  const v={...f,...overrides};
  return `select tongs.commit_hammer_history_epoch_head_with_components('${ids.workspaceA}','${v.workpiece}','${v.recording}','${v.revision}','${v.epoch}','${v.head}',1,'${v.key}','${v.fingerprint}','${v.state.revision_token}','${v.anchorPath}',null,'${"a".repeat(64)}',${v.state.anchor_revision},'${v.state.anchor_token}','${qj(v.changes)}'::jsonb,'${v.headPath}','${v.headHash}',3001,1,'${v.headToken}','forge-workpieces','workpieces/${v.workpiece}/${v.headPath}','hammer-state:87654321','${qj(v.authority)}'::jsonb,'${qj(v.envelope)}'::jsonb)::text;`;
}
function call(f, overrides={}, auth={ role:"authenticated", user:ids.editor }) { return JSON.parse(psql(sql(f,overrides),auth).stdout.split(/\r?\n/).at(-1)); }
function unchanged(f) { const row=JSON.parse(psql(`select json_build_object('hash',lower(hash_value),'revision',revision,'history',(select history_path from tongs.recording_revisions where id='${f.revision}'),'heads',(select count(*) from tongs.hammer_history_epoch_heads where recording_revision_id='${f.revision}'))::text from tongs.workpiece_files where workpiece_id='${f.workpiece}' and path='${f.paths.visual_placements}';`).stdout); return row.hash===f.before.sha256 && row.revision===f.before.registry_revision && row.history===f.envelope.parent.path && Number(row.heads)===0; }

const shape=JSON.parse(psql(`select json_build_object('definer',(select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='tongs' and p.proname='commit_hammer_history_epoch_head_with_components'),'config',(select proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='tongs' and p.proname='commit_hammer_history_epoch_head_with_components'),'execute_authenticated',has_function_privilege('authenticated','tongs.commit_hammer_history_epoch_head_with_components(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,timestamptz,jsonb,text,text,bigint,bigint,timestamptz,text,text,text,jsonb,jsonb)','execute'),'execute_anon',has_function_privilege('anon','tongs.commit_hammer_history_epoch_head_with_components(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,uuid,text,bigint,timestamptz,jsonb,text,text,bigint,bigint,timestamptz,text,text,text,jsonb,jsonb)','execute'))::text;`).stdout);
check(shape.definer===true && shape.config.includes("search_path=pg_catalog, tongs") && shape.execute_authenticated===true && shape.execute_anon===false,"RPC ownership posture, locked search path, grants, and revokes are exact");

const ok=fixture("HE8B1 committed"); const receipt=call(ok);
check(receipt.outcome==="committed" && receipt.history_path===ok.headPath,"component registry and immutable head commit together");
const after=JSON.parse(psql(`select json_build_object('hash',lower(hash_value),'revision',revision,'token',updated_at,'history',(select history_path from tongs.recording_revisions where id='${ok.revision}'),'heads',(select count(*) from tongs.hammer_history_epoch_heads where recording_revision_id='${ok.revision}'),'transitions',(select count(*) from tongs.hammer_history_epoch_head_transitions where recording_revision_id='${ok.revision}'))::text from tongs.workpiece_files where workpiece_id='${ok.workpiece}' and path='${ok.paths.visual_placements}';`).stdout);
check(after.hash==="6".repeat(64) && after.revision===2 && after.token.startsWith("2026-08-21T12:34:56.123456") && after.history===ok.headPath && Number(after.heads)===1 && Number(after.transitions)===1,"one transaction installs exact component token, pointer, head, and receipt");
check(call(ok).outcome==="already_committed","exact replay is idempotent");
conflict(call(ok,{fingerprint:"9".repeat(64)}),"history_epoch_atomic_idempotency_conflict","changed replay is rejected");

const auth=fixture("HE8B1 auth");
conflict(call(auth,{}, {role:"authenticated",user:ids.viewer}),"history_epoch_atomic_forbidden","viewer is denied");
conflict(call(auth,{}, {role:"authenticated",user:ids.other}),"history_epoch_atomic_forbidden","cross-workspace user is denied");
const anon=psql(sql(auth),{role:"anon",allowFailure:true}); check(anon.status!==0 && /permission denied/i.test(anon.stderr),"anonymous execution is revoked");

for (const [label, mutate, code] of [
  ["stale revision token", f=>{f.state.revision_token="2000-01-01T00:00:00Z";}, "history_epoch_atomic_revision_token_conflict"],
  ["stale pointer", f=>{f.anchorPath="hammer/stale.json";}, "history_epoch_atomic_pointer_conflict"],
  ["stale component", f=>{f.changes[0].expected.sha256="0".repeat(64);}, "history_epoch_atomic_component_conflict"],
  ["unchanged component", f=>{f.changes[0].next.sha256=f.before.sha256;}, "history_epoch_atomic_component_invalid"],
  ["late head rejection", f=>{f.envelope.result.editor_state_hash="hammer-state:ffffffff";}, "history_epoch_head_envelope_conflict"],
]) { const f=fixture(`HE8B1 ${label}`); mutate(f); conflict(call(f),code,`${label} fails closed`); check(unchanged(f),`${label} rolls back every component/head/pointer mutation`); }

const readback=JSON.parse(psql(`select tongs.read_hammer_history_epoch_head_with_components_operation('${ids.workspaceA}','${ok.workpiece}','${ok.revision}','${ok.key}','${ok.fingerprint}','${ok.head}')::text;`,{role:"authenticated",user:ids.viewer}).stdout);
check(readback.outcome==="committed" && readback.transition_id===receipt.transition_id,"authorized idempotent readback returns the exact receipt");
const direct=psql(`update tongs.workpiece_files set bytes=bytes where workpiece_id='${ok.workpiece}' and path='${ok.paths.visual_placements}';`,{role:"authenticated",user:ids.editor,allowFailure:true});
check(direct.status!==0 && /permission denied/i.test(direct.stderr),"authenticated direct component mutation remains denied");
process.stdout.write("HE-8B1 atomic database verification passed.\n");
