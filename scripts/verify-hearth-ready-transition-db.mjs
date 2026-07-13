import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_nursery";
const ids = {
  viewer: "11000000-0000-4000-8000-000000000001",
  editor: "11000000-0000-4000-8000-000000000002",
  owner: "11000000-0000-4000-8000-000000000003",
  other: "11000000-0000-4000-8000-000000000004",
  orgA: "91000000-0000-4000-8000-000000000001",
  orgB: "91000000-0000-4000-8000-000000000002",
  workspaceA: "a1000000-0000-4000-8000-000000000001",
  workspaceB: "a1000000-0000-4000-8000-000000000002",
  workpieceA: "d1000000-0000-4000-8000-000000000001",
  workpieceB: "d1000000-0000-4000-8000-000000000002",
};

const hashes = {
  seed: "a".repeat(64),
  edit: "b".repeat(64),
  later: "c".repeat(64),
};

function psql(sql, { role, user, allowFailure = false } = {}) {
  const prefix = role
    ? `set role ${role};${user ? `set request.jwt.claim.sub = '${user}';` : ""}`
    : "";
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: `${prefix}${sql}`, encoding: "utf8" },
  );
  if (!allowFailure && result.status !== 0) {
    throw new Error(`psql failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return { status: result.status ?? 1, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function rpc(args, user) {
  const evidence = JSON.stringify(args.evidence).replaceAll("'", "''");
  const expression = `tongs.hearth_transition_script_ready(
    '${args.workspaceId}', '${args.workpieceId}', 'script/script.md',
    ${args.revision}, '${args.hash}', '${args.key}', '${evidence}'::jsonb)`;
  const result = psql(`select (${expression})::text;`, { role: "authenticated", user });
  return JSON.parse(result.stdout.split(/\r?\n/).at(-1));
}

function evidence(revision, hash, overrides = {}) {
  return {
    transition: "hearth.script.published.v1",
    script_path: "script/script.md",
    script_revision: revision,
    script_hash: hash,
    validation: {
      validator_version: "shared-script-tags-v1",
      ok: true,
      issue_count: 0,
    },
    ...overrides,
  };
}

function check(condition, message) {
  if (!condition) throw new Error(message);
  process.stdout.write(`ok - ${message}\n`);
}

try {
  psql(`
    delete from tongs.workspaces where id in ('${ids.workspaceA}', '${ids.workspaceB}');
    delete from tongs.orgs where id in ('${ids.orgA}', '${ids.orgB}');
    delete from auth.users where id in ('${ids.viewer}', '${ids.editor}', '${ids.owner}', '${ids.other}');
    insert into auth.users (id) values
      ('${ids.viewer}'), ('${ids.editor}'), ('${ids.owner}'), ('${ids.other}');
    insert into tongs.orgs (id, name, created_by) values
      ('${ids.orgA}', 'Ready Authority A', '${ids.owner}'),
      ('${ids.orgB}', 'Ready Authority B', '${ids.other}');
    insert into tongs.workspaces (id, name, created_by, org_id) values
      ('${ids.workspaceA}', 'Ready Workspace A', '${ids.owner}', '${ids.orgA}'),
      ('${ids.workspaceB}', 'Ready Workspace B', '${ids.other}', '${ids.orgB}');
    insert into tongs.workspace_members (workspace_id, user_id, role, created_by) values
      ('${ids.workspaceA}', '${ids.viewer}', 'viewer', '${ids.owner}'),
      ('${ids.workspaceA}', '${ids.editor}', 'editor', '${ids.owner}');
    insert into tongs.episodes (id, workspace_id, label) values
      ('${ids.workpieceA}', '${ids.workspaceA}', 'Ready Proof A'),
      ('${ids.workpieceB}', '${ids.workspaceB}', 'Ready Proof B');
    insert into tongs.workpiece_files (
      workpiece_id, path, file_type, content_type, bytes, hash_value,
      storage_key, written_by_tool, written_by_tool_version, written_by_lane
    ) values (
      '${ids.workpieceA}', 'script/script.md', 'script', 'text/markdown', 10, '${hashes.seed}',
      'workpieces/${ids.workpieceA}/script/script.md', 'hearth', 'forge-v1.2.0', 'forge-managed'
    );
  `);

  const authorityMetadata = psql(`
    select
      (select revision from tongs.workpiece_files where workpiece_id = '${ids.workpieceA}' and path = 'script/script.md') || ',' ||
      (select count(*) from tongs.current_workpiece_ready_scripts where workpiece_id = '${ids.workpieceA}');
  `).stdout;
  check(authorityMetadata === "1,0", "seed commit remains warming at canonical file revision 1");

  psql(`update tongs.workpiece_files set hash_value = '${hashes.edit}', bytes = 20
    where workpiece_id = '${ids.workpieceA}' and path = 'script/script.md';`);
  const editState = psql(`
    select
      (select revision from tongs.workpiece_files where workpiece_id = '${ids.workpieceA}' and path = 'script/script.md') || ',' ||
      (select count(*) from tongs.current_workpiece_ready_scripts where workpiece_id = '${ids.workpieceA}');
  `).stdout;
  check(editState === "2,0", "ordinary edit advances the canonical revision and remains warming");

  const malformed = rpc({
    workspaceId: ids.workspaceA, workpieceId: ids.workpieceA, revision: 2,
    hash: hashes.edit, key: "ready-malformed", evidence: { transition: "hearth.script.published.v1" },
  }, ids.editor);
  check(malformed.outcome === "conflict" && malformed.reason === "invalid_publish_evidence" && malformed.ready === null,
    "malformed or incomplete Hearth publish evidence is rejected");

  const stale = rpc({
    workspaceId: ids.workspaceA, workpieceId: ids.workpieceA, revision: 1,
    hash: hashes.seed, key: "ready-stale-01", evidence: evidence(1, hashes.seed),
  }, ids.editor);
  check(stale.outcome === "stale" && stale.canonical_script.revision === 2,
    "stale expected script revision is rejected with the canonical revision");

  const mismatch = rpc({
    workspaceId: ids.workspaceA, workpieceId: ids.workpieceA, revision: 2,
    hash: hashes.seed, key: "ready-hash-mismatch", evidence: evidence(2, hashes.seed),
  }, ids.editor);
  check(mismatch.outcome === "conflict" && mismatch.reason === "script_hash_mismatch",
    "mismatched content hash is rejected");

  const viewerDenied = rpc({
    workspaceId: ids.workspaceA, workpieceId: ids.workpieceA, revision: 2,
    hash: hashes.edit, key: "ready-viewer-denied", evidence: evidence(2, hashes.edit),
  }, ids.viewer);
  check(viewerDenied.outcome === "denied" && viewerDenied.ready === null,
    "viewer transition is denied without row leakage");

  const crossWorkspaceDenied = rpc({
    workspaceId: ids.workspaceA, workpieceId: ids.workpieceB, revision: 1,
    hash: hashes.edit, key: "ready-cross-denied", evidence: evidence(1, hashes.edit),
  }, ids.editor);
  check(crossWorkspaceDenied.outcome === "denied" && crossWorkspaceDenied.ready === null,
    "cross-workspace transition is denied without row leakage");

  const saved = rpc({
    workspaceId: ids.workspaceA, workpieceId: ids.workpieceA, revision: 2,
    hash: hashes.edit, key: "ready-valid-0001", evidence: evidence(2, hashes.edit),
  }, ids.editor);
  check(saved.outcome === "saved" && saved.ready.script_revision === 2 && saved.ready.script_hash === hashes.edit,
    "valid Hearth publish transition becomes revision/hash-bound Ready");

  const duplicate = rpc({
    workspaceId: ids.workspaceA, workpieceId: ids.workpieceA, revision: 2,
    hash: hashes.edit, key: "ready-valid-0001", evidence: evidence(2, hashes.edit),
  }, ids.editor);
  check(duplicate.outcome === "duplicate" && duplicate.ready.transition_id === saved.ready.transition_id,
    "duplicate transition retry reconciles idempotently to the accepted transition");

  const conflictingReuse = rpc({
    workspaceId: ids.workspaceA, workpieceId: ids.workpieceA, revision: 2,
    hash: hashes.edit, key: "ready-valid-0001", evidence: evidence(2, hashes.edit, { note: "different request" }),
  }, ids.editor);
  check(conflictingReuse.outcome === "conflict" && conflictingReuse.reason === "idempotency_reuse" && conflictingReuse.ready === null,
    "conflicting idempotency-key reuse fails without changing Ready authority");

  const directReadyWrite = psql(
    `update tongs.workpiece_ready_script_meta set script_revision = 999 where workpiece_id = '${ids.workpieceA}';`,
    { role: "authenticated", user: ids.editor, allowFailure: true },
  );
  check(directReadyWrite.status !== 0 && /permission denied/i.test(directReadyWrite.stderr),
    "authenticated clients cannot bypass the Ready RPC with direct metadata writes");

  const directFileWrite = psql(
    `update tongs.workpiece_files set hash_value = '${hashes.seed}' where workpiece_id = '${ids.workpieceA}' and path = 'script/script.md';`,
    { role: "authenticated", user: ids.editor, allowFailure: true },
  );
  check(directFileWrite.status !== 0 && /permission denied/i.test(directFileWrite.stderr),
    "authenticated clients cannot forge canonical file revision or hash state");

  psql(`update tongs.workpiece_files set hash_value = '${hashes.later}', bytes = 30
    where workpiece_id = '${ids.workpieceA}' and path = 'script/script.md';`);
  const afterLaterEdit = psql(`
    select
      (select revision from tongs.workpiece_files where workpiece_id = '${ids.workpieceA}' and path = 'script/script.md') || ',' ||
      (select count(*) from tongs.workpiece_ready_script_meta where workpiece_id = '${ids.workpieceA}') || ',' ||
      (select count(*) from tongs.current_workpiece_ready_scripts where workpiece_id = '${ids.workpieceA}');
  `).stdout;
  check(afterLaterEdit === "3,1,0",
    "later edit preserves historical Ready evidence but makes it canonically ineligible");

  const viewerOldReadyCount = Number(psql(
    `select count(*) from tongs.current_workpiece_ready_scripts where workpiece_id = '${ids.workpieceA}';`,
    { role: "authenticated", user: ids.viewer },
  ).stdout);
  check(viewerOldReadyCount === 0, "old Ready metadata cannot expose the edited script to Anvil consumers");

  const savedCurrent = rpc({
    workspaceId: ids.workspaceA, workpieceId: ids.workpieceA, revision: 3,
    hash: hashes.later, key: "ready-valid-0002", evidence: evidence(3, hashes.later),
  }, ids.editor);
  check(savedCurrent.outcome === "saved" && savedCurrent.ready.script_revision === 3,
    "current edited script can establish a new validated Ready transition");

  const currentContract = psql(`
    select workpiece_id::text || ',' || script_path || ',' || script_revision || ',' || script_hash || ',' || transition_id::text
    from tongs.current_workpiece_ready_scripts where workpiece_id = '${ids.workpieceA}';
  `, { role: "authenticated", user: ids.viewer }).stdout;
  check(currentContract.split(",").length === 5
    && currentContract.startsWith(`${ids.workpieceA},script/script.md,3,${hashes.later},`),
    "current matching Ready metadata exposes exactly one canonical Anvil-ready contract");

  const otherVisible = Number(psql(
    `select count(*) from tongs.current_workpiece_ready_scripts where workpiece_id = '${ids.workpieceA}';`,
    { role: "authenticated", user: ids.other },
  ).stdout);
  check(otherVisible === 0, "Ready-contract view remains workspace-scoped by RLS");

  const acceptedTransitions = Number(psql(`
    select count(*) from tongs.workpiece_ready_transition_requests where workpiece_id = '${ids.workpieceA}';
  `).stdout);
  check(acceptedTransitions === 2, "only the two accepted transitions are stored as append-only authority rows");

  const grants = psql(`
    select
      has_function_privilege('anon', 'tongs.hearth_transition_script_ready(uuid,uuid,text,bigint,text,text,jsonb)', 'execute')::int || ',' ||
      has_function_privilege('authenticated', 'tongs.hearth_transition_script_ready(uuid,uuid,text,bigint,text,text,jsonb)', 'execute')::int || ',' ||
      has_table_privilege('authenticated', 'tongs.workpiece_ready_script_meta', 'update')::int || ',' ||
      has_table_privilege('authenticated', 'tongs.workpiece_files', 'update')::int || ',' ||
      has_table_privilege('authenticated', 'tongs.current_workpiece_ready_scripts', 'select')::int;
  `).stdout;
  check(grants === "0,1,0,0,1", "RPC, table, and view grants enforce the intended authority boundary");

  const functionSecurity = Number(psql(`
    select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'tongs' and p.proname = 'hearth_transition_script_ready'
      and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
      and p.proconfig @> array['search_path=pg_catalog, tongs'];
  `).stdout);
  check(functionSecurity === 1, "Ready transition RPC is postgres-owned with a fixed safe search_path");

  process.stdout.write("Hearth Ready-transition executable database authority verification passed.\n");
} finally {
  psql(`
    delete from tongs.workspaces where id in ('${ids.workspaceA}', '${ids.workspaceB}');
    delete from tongs.orgs where id in ('${ids.orgA}', '${ids.orgB}');
    delete from auth.users where id in ('${ids.viewer}', '${ids.editor}', '${ids.owner}', '${ids.other}');
  `, { allowFailure: true });
}
