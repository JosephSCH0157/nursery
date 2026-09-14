import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";

// Never accepts a production URL or an arbitrary database. Only this disposable
// database is created/dropped; the user's existing Supabase database is untouched.
const container = "supabase_db_nursery";
const database = `forge_cleanup_review_${randomUUID().replaceAll("-", "")}`;
const run = (args, input) =>
  spawnSync("docker", args, {
    input,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
const checked = (r) => {
  if (r.status !== 0) throw Error(r.stderr || r.stdout);
  return r.stdout.trim();
};
const command = [
  "exec",
  "-i",
  container,
  "psql",
  "-X",
  "-q",
  "-A",
  "-t",
  "-v",
  "ON_ERROR_STOP=1",
  "-U",
  "postgres",
  "-d",
  database,
];
const sql = (s) => checked(run(command, s));
const fails = (s) => assert.notEqual(run(command, s).status, 0);
const quote = (x) => `'${String(x).replaceAll("'", "''")}'`;
const json = (x) => `${quote(JSON.stringify(x))}::jsonb`;
const id = () => randomUUID();
const ids = {
  owner: id(),
  editor: id(),
  viewer: id(),
  other: id(),
  workspace: id(),
  workpiece: id(),
  recording: id(),
  revision: id(),
};
const role = (name, user) =>
  `set role ${name};${user ? `set request.jwt.claim.sub=${quote(user)};` : ""}`;
const rpcArgs = [ids.editor, ids.workspace, ids.workpiece, ids.revision]
  .map(quote)
  .join(",");
const asynchronousSql = (s) =>
  new Promise((resolve, reject) => {
    const child = spawn("docker", command, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "",
      err = "";
    child.stdout.on("data", (x) => (out += x));
    child.stderr.on("data", (x) => (err += x));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(Error(err)),
    );
    child.stdin.end(s);
  });
let created = false;
try {
  checked(run(["info", "--format", "{{.ServerVersion}}"]));
  checked(run(["exec", container, "createdb", "-U", "postgres", database]));
  created = true;
  sql(`create schema auth; create schema tongs;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table tongs.workspaces(id uuid primary key,created_by uuid references auth.users);
    create table tongs.workspace_members(workspace_id uuid,user_id uuid,role text,primary key(workspace_id,user_id));
    create table tongs.episodes(id uuid primary key,workspace_id uuid,active_revision_id uuid,canonical_recording_id uuid);
    create table tongs.canonical_recordings(id uuid primary key,workspace_id uuid,workpiece_id uuid,media_id text,media_path text);
    create table tongs.recording_revisions(id uuid primary key,workspace_id uuid,workpiece_id uuid,canonical_recording_id uuid,status text,updated_at timestamptz default now(),revision_transcript_path text,history_path text);
    create table tongs.workpiece_files(workpiece_id uuid,path text,hash_value text,hash_algo text default 'sha256',content_type text,bytes bigint,revision bigint default 1,updated_at timestamptz default now(),storage_bucket text default 'forge-workpieces',storage_key text,primary key(workpiece_id,path));
    create function tongs.workspace_role_rank(text) returns integer language sql immutable as $$select case $1 when 'owner' then 40 when 'admin' then 30 when 'editor' then 20 when 'viewer' then 10 else 0 end$$;
    create function tongs.has_workspace_role(uuid,text) returns boolean language sql stable security definer as $$select exists(select 1 from tongs.workspaces w left join tongs.workspace_members m on m.workspace_id=w.id and m.user_id=auth.uid() where w.id=$1 and (w.created_by=auth.uid() or tongs.workspace_role_rank(m.role)>=tongs.workspace_role_rank($2)))$$;
    grant usage on schema tongs,auth to authenticated,service_role,anon;
    grant select on all tables in schema tongs to authenticated,service_role;
    insert into auth.users values ${[ids.owner, ids.editor, ids.viewer, ids.other].map((x) => `(${quote(x)})`).join(",")};
    insert into tongs.workspaces values(${quote(ids.workspace)},${quote(ids.owner)});
    insert into tongs.workspace_members values(${quote(ids.workspace)},${quote(ids.editor)},'editor'),(${quote(ids.workspace)},${quote(ids.viewer)},'viewer');
    insert into tongs.episodes values(${quote(ids.workpiece)},${quote(ids.workspace)},${quote(ids.revision)},${quote(ids.recording)});
    insert into tongs.canonical_recordings values(${quote(ids.recording)},${quote(ids.workspace)},${quote(ids.workpiece)},'media-1','recording.wav');
    insert into tongs.recording_revisions(id,workspace_id,workpiece_id,canonical_recording_id,status,revision_transcript_path) values(${quote(ids.revision)},${quote(ids.workspace)},${quote(ids.workpiece)},${quote(ids.recording)},'active','transcript.json');
    insert into tongs.workpiece_files(workpiece_id,path,hash_value,content_type,bytes,storage_key) values
      (${quote(ids.workpiece)},'transcript.json','${"a".repeat(64)}','application/json',100,'transcript'),
      (${quote(ids.workpiece)},'recording.wav','${"b".repeat(64)}','audio/wav',200,'media');`);
  sql(
    readFileSync(
      "supabase/migrations/20261011120000_tongs_hammer_cleanup_review_decisions.sql",
      "utf8",
    ),
  );
  const evidence = JSON.parse(
    sql(
      `${role("service_role")}select tongs.read_cleanup_review_basis(${rpcArgs},false);`,
    ),
  );
  const basis = {
    contract_version: "hammer-cleanup-review-v1",
    generator_version: "hammer-cleanup-generator-v1",
    workspace_id: ids.workspace,
    workpiece_id: ids.workpiece,
    canonical_recording_id: ids.recording,
    recording_revision_id: ids.revision,
    kind: "fillers",
    media: { media_id: "media-1", sha256: "b".repeat(64), bytes: 200 },
  };
  const commit = (
    hash = "c".repeat(64),
    actor = ids.editor,
    ev = evidence,
    b = basis,
  ) =>
    `select tongs.commit_cleanup_review_discard(${[actor, ids.workspace, ids.workpiece, ids.revision].map(quote).join(",")},'${"d".repeat(64)}',${quote(hash)},${json(b)},'{"kind":"fillers"}',${json(ev)});`;
  const first = JSON.parse(sql(role("service_role") + commit()));
  const replay = JSON.parse(sql(role("service_role") + commit()));
  assert.equal(first.receipt.id, replay.receipt.id);
  assert.equal(replay.outcome, "already_committed");
  const concurrent = await Promise.all(
    ["e", "f"].map((c) =>
      asynchronousSql(
        role("service_role") +
          "begin;" +
          commit(c.repeat(64)) +
          "select pg_sleep(0.05);commit;",
      ),
    ),
  );
  assert.equal(concurrent.length, 2);
  assert.equal(
    sql("select count(*) from tongs.hammer_cleanup_review_decisions;"),
    "3",
  );
  for (const actor of [ids.viewer, ids.other])
    fails(role("service_role") + commit("1".repeat(64), actor));
  for (const roleName of ["authenticated", "anon"])
    fails(role(roleName, ids.editor) + commit());
  fails(
    role("authenticated", ids.editor) +
      `insert into tongs.hammer_cleanup_review_decisions select * from tongs.hammer_cleanup_review_decisions;`,
  );
  fails(
    role("service_role") +
      `update tongs.hammer_cleanup_review_decisions set decision='discard';`,
  );
  fails(`delete from tongs.hammer_cleanup_review_decisions;`);
  assert.equal(
    sql(
      role("authenticated", ids.viewer) +
        "select count(*) from tongs.hammer_cleanup_review_decisions;",
    ),
    "3",
  );
  assert.equal(
    sql(
      role("authenticated", ids.other) +
        "select count(*) from tongs.hammer_cleanup_review_decisions;",
    ),
    "0",
  );
  fails(
    role("service_role") +
      commit("1".repeat(64), ids.editor, {
        ...evidence,
        revision_updated_at: "2000-01-01",
      }),
  );
  fails(
    role("service_role") +
      commit("1".repeat(64), ids.editor, evidence, {
        ...basis,
        workpiece_id: id(),
      }),
  );
  fails(
    role("service_role") +
      `select tongs.read_cleanup_review_basis(${[ids.editor, ids.workspace, id(), ids.revision].map(quote).join(",")},false);`,
  );
  sql(
    `delete from tongs.workspace_members where user_id=${quote(ids.editor)};`,
  );
  fails(role("service_role") + commit());
  assert.equal(
    sql(
      role("authenticated", ids.editor) +
        "select count(*) from tongs.hammer_cleanup_review_decisions;",
    ),
    "0",
  );
  assert.equal(
    sql("select count(*) from tongs.hammer_cleanup_review_decisions;"),
    "3",
  );
  console.log(
    "PASS: forward migration; RLS/direct-write denial; immutable receipts; duplicate replay; concurrent distinct discards; stale/foreign basis rejection; revoked read/write/replay; three retained decisions.",
  );
} finally {
  if (created && /^forge_cleanup_review_[a-f0-9]{32}$/.test(database))
    checked(run(["exec", container, "dropdb", "-U", "postgres", database]));
}
