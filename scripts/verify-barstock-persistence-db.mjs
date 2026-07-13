import { spawn, spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_nursery";

const ids = {
  viewer: "10000000-0000-4000-8000-000000000001",
  editor: "10000000-0000-4000-8000-000000000002",
  admin: "10000000-0000-4000-8000-000000000003",
  other: "10000000-0000-4000-8000-000000000004",
  orgA: "90000000-0000-4000-8000-000000000001",
  orgB: "90000000-0000-4000-8000-000000000002",
  workspaceA: "a0000000-0000-4000-8000-000000000001",
  workspaceB: "a0000000-0000-4000-8000-000000000002",
  assignment: "b0000000-0000-4000-8000-000000000001",
  concurrent: "b0000000-0000-4000-8000-000000000002",
  archiveAssignment: "b0000000-0000-4000-8000-000000000003",
  deleteAssignment: "b0000000-0000-4000-8000-000000000004",
  conflictAssignment: "b0000000-0000-4000-8000-000000000005",
  spark: "c0000000-0000-4000-8000-000000000001",
  mismatchedSpark: "c0000000-0000-4000-8000-000000000002",
  workpiece: "d0000000-0000-4000-8000-000000000001",
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

function rpc(expression, user) {
  const result = psql(`select (${expression})::text;`, { role: "authenticated", user });
  return JSON.parse(result.stdout.split(/\r?\n/).at(-1));
}

function check(condition, message) {
  if (!condition) throw new Error(message);
  process.stdout.write(`ok - ${message}\n`);
}

function concurrentRpc(expression, user) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`concurrent psql failed: ${stderr || stdout}`));
      resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1)));
    });
    child.stdin.end(`set role authenticated;set request.jwt.claim.sub = '${user}';select (${expression})::text;`);
  });
}

psql(`
  delete from tongs.workspaces where id in ('${ids.workspaceA}', '${ids.workspaceB}');
  delete from tongs.orgs where id in ('${ids.orgA}', '${ids.orgB}');
  delete from auth.users where id in ('${ids.viewer}', '${ids.editor}', '${ids.admin}', '${ids.other}');
  insert into auth.users (id) values
    ('${ids.viewer}'), ('${ids.editor}'), ('${ids.admin}'), ('${ids.other}');
  insert into tongs.orgs (id, name, created_by) values
    ('${ids.orgA}', 'BarStock DB Test A', '${ids.admin}'),
    ('${ids.orgB}', 'BarStock DB Test B', '${ids.other}');
  insert into tongs.workspaces (id, name, created_by, org_id) values
    ('${ids.workspaceA}', 'Workspace A', '${ids.admin}', '${ids.orgA}'),
    ('${ids.workspaceB}', 'Workspace B', '${ids.other}', '${ids.orgB}');
  insert into tongs.workspace_members (workspace_id, user_id, role, created_by) values
    ('${ids.workspaceA}', '${ids.viewer}', 'viewer', '${ids.admin}'),
    ('${ids.workspaceA}', '${ids.editor}', 'editor', '${ids.admin}');
`);

const definerMetadata = psql(`
  select count(*)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'tongs'
    and p.proname in (
      'barstock_apply_assignment', 'barstock_apply_spark',
      'barstock_archive_assignment', 'barstock_archive_spark',
      'barstock_delete_assignment'
    )
    and p.prosecdef
    and pg_get_userbyid(p.proowner) = 'postgres'
    and p.proconfig @> array['search_path=pg_catalog, tongs'];
`).stdout;
check(Number(definerMetadata) === 5, "all mutation RPCs are postgres-owned definers with an explicit safe search_path");

const grantMetadata = psql(`
  select
    has_function_privilege('anon', 'tongs.barstock_apply_assignment(jsonb,bigint,text)', 'execute')::int || ',' ||
    has_function_privilege('authenticated', 'tongs.barstock_apply_assignment(jsonb,bigint,text)', 'execute')::int || ',' ||
    has_table_privilege('authenticated', 'tongs.barstock_assignments', 'update')::int || ',' ||
    has_table_privilege('authenticated', 'tongs.barstock_assignments', 'select')::int;
`).stdout;
check(grantMetadata === "0,1,0,1", "RPC and table grants allow authenticated reads but prevent anonymous or direct writes");

const anon = psql(
  `select tongs.barstock_apply_assignment('{}'::jsonb, null, null);`,
  { role: "anon", allowFailure: true },
);
check(anon.status !== 0 && /permission denied/i.test(anon.stderr), "anonymous RPC invocation is denied by grants");

const viewerDenied = rpc(
  `tongs.barstock_apply_assignment('{"id":"${ids.assignment}","workspace_id":"${ids.workspaceA}","title":"Denied"}'::jsonb, null, 'assignment-main')`,
  ids.viewer,
);
check(viewerDenied.outcome === "denied" && viewerDenied.row === null, "viewer mutation returns denied without row disclosure");

const otherDenied = rpc(
  `tongs.barstock_apply_assignment('{"id":"${ids.assignment}","workspace_id":"${ids.workspaceA}","title":"Other"}'::jsonb, null, 'assignment-main')`,
  ids.other,
);
check(otherDenied.outcome === "denied" && otherDenied.row === null, "other-workspace mutation returns denied without row disclosure");

const created = rpc(
  `tongs.barstock_apply_assignment('{"id":"${ids.assignment}","workspace_id":"${ids.workspaceA}","title":"Canonical"}'::jsonb, null, 'assignment-main')`,
  ids.editor,
);
check(created.outcome === "saved" && created.row.revision === 1, "editor creates assignment at server revision 1");

const directWrite = psql(
  `update tongs.barstock_assignments set title = 'Bypass' where id = '${ids.assignment}';`,
  { role: "authenticated", user: ids.editor, allowFailure: true },
);
check(directWrite.status !== 0 && /permission denied/i.test(directWrite.stderr), "authenticated direct update cannot bypass RPC compare-and-swap");

const updated = rpc(
  `tongs.barstock_apply_assignment('{"id":"${ids.assignment}","workspace_id":"${ids.workspaceA}","title":"Updated"}'::jsonb, 1, null)`,
  ids.editor,
);
check(updated.outcome === "saved" && updated.row.revision === 2, "matching revision update succeeds and trigger increments revision");

const stale = rpc(
  `tongs.barstock_apply_assignment('{"id":"${ids.assignment}","workspace_id":"${ids.workspaceA}","title":"Stale"}'::jsonb, 1, null)`,
  ids.editor,
);
check(stale.outcome === "stale" && stale.row.revision === 2 && stale.row.title === "Updated", "stale update returns newer canonical row without overwriting it");

const duplicate = rpc(
  `tongs.barstock_apply_assignment('{"id":"${ids.assignment}","workspace_id":"${ids.workspaceA}","title":"Retry payload ignored"}'::jsonb, null, 'assignment-main')`,
  ids.editor,
);
check(duplicate.outcome === "duplicate" && duplicate.row.id === ids.assignment && duplicate.row.title === "Updated", "duplicate retry returns the canonical prior result");

const conflict = rpc(
  `tongs.barstock_apply_assignment('{"id":"${ids.conflictAssignment}","workspace_id":"${ids.workspaceA}","title":"Conflict"}'::jsonb, null, 'assignment-main')`,
  ids.editor,
);
check(conflict.outcome === "conflict" && conflict.row === null, "idempotency-key reuse with a different id returns conflict without row disclosure");

const missingId = psql(
  `select tongs.barstock_apply_assignment('{"workspace_id":"${ids.workspaceA}","title":"Missing"}'::jsonb, null, null);`,
  { role: "authenticated", user: ids.editor, allowFailure: true },
);
check(missingId.status !== 0 && /assignment id and title are required/i.test(missingId.stderr), "missing assignment identifier is rejected");

const malformedId = psql(
  `select tongs.barstock_apply_assignment('{"id":"not-a-uuid","workspace_id":"${ids.workspaceA}","title":"Malformed"}'::jsonb, null, null);`,
  { role: "authenticated", user: ids.editor, allowFailure: true },
);
check(malformedId.status !== 0 && /invalid input syntax for type uuid/i.test(malformedId.stderr), "malformed assignment identifier is rejected");

const concurrentCreated = rpc(
  `tongs.barstock_apply_assignment('{"id":"${ids.concurrent}","workspace_id":"${ids.workspaceA}","title":"Concurrent"}'::jsonb, null, 'assignment-concurrent')`,
  ids.editor,
);
check(concurrentCreated.outcome === "saved", "concurrency fixture created");

const concurrentExpression = (title) =>
  `tongs.barstock_apply_assignment('{"id":"${ids.concurrent}","workspace_id":"${ids.workspaceA}","title":"${title}"}'::jsonb, 1, null)`;
const concurrentResults = await Promise.all([
  concurrentRpc(concurrentExpression("Writer A"), ids.editor),
  concurrentRpc(concurrentExpression("Writer B"), ids.editor),
]);
check(
  concurrentResults.filter((item) => item.outcome === "saved").length === 1
    && concurrentResults.filter((item) => item.outcome === "stale").length === 1,
  "two concurrent compare-and-swap updates produce exactly one winner",
);

const archivedAssignment = rpc(
  `tongs.barstock_apply_assignment('{"id":"${ids.archiveAssignment}","workspace_id":"${ids.workspaceA}","title":"Archive me"}'::jsonb, null, 'assignment-archive')`,
  ids.editor,
);
check(archivedAssignment.outcome === "saved", "archive assignment fixture created");

const viewerArchive = rpc(`tongs.barstock_archive_assignment('${ids.workspaceA}', '${ids.archiveAssignment}', 1)`, ids.viewer);
check(viewerArchive.outcome === "denied" && viewerArchive.row === null, "viewer cannot archive an assignment and receives no row evidence");

const missingOutcome = rpc(
  `tongs.barstock_apply_assignment('{"id":"eeeeeeee-0000-4000-8000-000000000001","workspace_id":"${ids.workspaceA}","title":"Missing"}'::jsonb, 1, null)`,
  ids.editor,
);
check(missingOutcome.outcome === "not_found" && missingOutcome.row === null, "authorized update of an absent canonical id returns not_found");

const sparkCreated = rpc(
  `tongs.barstock_apply_spark('{"id":"${ids.spark}","workspace_id":"${ids.workspaceA}","assignment_id":"${ids.archiveAssignment}","body":"Spark body"}'::jsonb, null, 'spark-main')`,
  ids.editor,
);
check(sparkCreated.outcome === "saved" && sparkCreated.row.revision === 1, "editor creates workspace-scoped Spark");

const sparkArchived = rpc(`tongs.barstock_archive_spark('${ids.workspaceA}', '${ids.spark}', 1)`, ids.editor);
check(sparkArchived.outcome === "saved" && sparkArchived.row.status === "archived" && sparkArchived.row.deleted_at, "Spark archive is soft and revisioned");

const assignmentArchived = rpc(`tongs.barstock_archive_assignment('${ids.workspaceA}', '${ids.archiveAssignment}', 1)`, ids.editor);
check(assignmentArchived.outcome === "saved" && assignmentArchived.row.status === "archived" && assignmentArchived.row.revision === 2, "Assignment archive is editor-authorized and revisioned");

const mismatch = psql(
  `select tongs.barstock_apply_spark('{"id":"${ids.mismatchedSpark}","workspace_id":"${ids.workspaceB}","assignment_id":"${ids.assignment}","body":"Mismatch"}'::jsonb, null, 'spark-mismatch');`,
  { role: "authenticated", user: ids.other, allowFailure: true },
);
check(mismatch.status !== 0 && /workspace mismatch/i.test(mismatch.stderr), "workspace-consistency trigger aborts cross-workspace Spark atomically");
const mismatchCount = Number(psql(`select count(*) from tongs.barstock_sparks where id = '${ids.mismatchedSpark}';`).stdout);
check(mismatchCount === 0, "failed cross-workspace Spark insert leaves no partial row");

psql(`
  insert into tongs.episodes (id, workspace_id, label) values ('${ids.workpiece}', '${ids.workspaceA}', 'Linked Workpiece');
  insert into tongs.barstock_project_episode_links (workspace_id, project_id, workpiece_id)
  values ('${ids.workspaceA}', '${ids.archiveAssignment}', '${ids.workpiece}');
`);
const linkedDelete = rpc(`tongs.barstock_delete_assignment('${ids.workspaceA}', '${ids.archiveAssignment}', 2)`, ids.admin);
check(linkedDelete.outcome === "linked" && linkedDelete.row === null, "admin cannot hard-delete an assignment linked to a Workpiece");
const workpieceCount = Number(psql(`select count(*) from tongs.episodes where id = '${ids.workpiece}';`).stdout);
check(workpieceCount === 1, "protected hard-delete attempt preserves the Workpiece");

rpc(
  `tongs.barstock_apply_assignment('{"id":"${ids.deleteAssignment}","workspace_id":"${ids.workspaceA}","title":"Delete me"}'::jsonb, null, 'assignment-delete')`,
  ids.editor,
);
const editorDelete = rpc(`tongs.barstock_delete_assignment('${ids.workspaceA}', '${ids.deleteAssignment}', 1)`, ids.editor);
check(editorDelete.outcome === "denied", "editor cannot hard-delete an assignment");
const adminDelete = rpc(`tongs.barstock_delete_assignment('${ids.workspaceA}', '${ids.deleteAssignment}', 1)`, ids.admin);
check(adminDelete.outcome === "deleted", "admin can hard-delete an unlinked assignment at the expected revision");

const viewerOwnCount = Number(psql(`select count(*) from tongs.barstock_assignments;`, { role: "authenticated", user: ids.viewer }).stdout);
const otherWorkspaceCount = Number(psql(`select count(*) from tongs.barstock_assignments;`, { role: "authenticated", user: ids.other }).stdout);
check(viewerOwnCount > 0 && otherWorkspaceCount === 0, "RLS hydrates only rows visible to the authenticated workspace member");

process.stdout.write("Bar-Stock executable database authority verification passed.\n");
