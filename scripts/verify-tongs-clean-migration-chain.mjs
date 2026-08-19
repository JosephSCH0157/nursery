import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectId = process.env.FORGE_CP5_DISPOSABLE_PROJECT_ID ?? "";
assert.match(projectId, /^forge-cp5-[a-z0-9-]+$/, "A unique forge-cp5-* disposable project ID is required.");
assert.notEqual(projectId, "wtvdjndyxegudufrompx");
assert.notEqual(projectId, "nursery");
const container = `supabase_db_${projectId}`;

function command(args, input) {
  const result = spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

const labels = command(["inspect", "--format", "{{index .Config.Labels \"com.supabase.cli.project\"}}", container]);
assert.equal(labels, projectId, "Refusing a container not owned by the disposable CP-5 project.");
const ports = command(["port", container, "5432/tcp"]);
assert.match(ports, /(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]):\d+/, "Disposable database must publish only a local host port.");

function psql(sql) {
  return command(["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], sql);
}

function policyEvidence() {
  return JSON.parse(psql(`
    select json_build_object(
      'count', count(*),
      'permissive', bool_and(p.polpermissive),
      'command', min(p.polcmd),
      'roles', min(array(select rolname from pg_roles where oid = any(p.polroles))::text),
      'using_expression', min(pg_get_expr(p.polqual,p.polrelid)),
      'with_check', min(pg_get_expr(p.polwithcheck,p.polrelid)),
      'rls_enabled', bool_and(c.relrowsecurity),
      'policy_oid', min(p.oid)
    )
    from pg_policy p
    join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='tongs' and c.relname='reference_visual_sequence_sequences'
      and p.polname='reference_visual_sequence_sequences_viewer';
  `));
}

function assertFinalContract() {
  const evidence = policyEvidence();
  assert.equal(evidence.count, 1);
  assert.equal(evidence.permissive, true);
  assert.equal(evidence.command, "r");
  assert.equal(evidence.roles, "{authenticated}");
  assert.equal(evidence.using_expression.replace(/::text/g, ""), "tongs.has_workspace_role(workspace_id, 'viewer')");
  assert.equal(evidence.with_check, null);
  assert.equal(evidence.rls_enabled, true);
  const privileges = JSON.parse(psql(`select json_build_object(
    'authenticated_select',has_table_privilege('authenticated','tongs.reference_visual_sequence_sequences','select'),
    'authenticated_write',has_table_privilege('authenticated','tongs.reference_visual_sequence_sequences','insert,update,delete'),
    'service_all',has_table_privilege('service_role','tongs.reference_visual_sequence_sequences','select,insert,update,delete,truncate,references,trigger'),
    'anon_any',has_table_privilege('anon','tongs.reference_visual_sequence_sequences','select,insert,update,delete'),
    'public_any',has_table_privilege('public','tongs.reference_visual_sequence_sequences','select,insert,update,delete'))`));
  assert.deepEqual(privileges, {
    authenticated_select: true,
    authenticated_write: false,
    service_all: true,
    anon_any: false,
    public_any: false,
  });
  return { evidence, privileges };
}

const bridge = readFileSync(join(root, "supabase", "migrations", "20260811135000_tongs_reference_visual_sequence_policy_clean_init_bridge.sql"), "utf8");
const canonical = readFileSync(join(root, "supabase", "migrations", "20260811140000_tongs_restore_reference_visual_archival_completion_rpcs.sql"), "utf8");
assert.equal(psql("select count(*) from supabase_migrations.schema_migrations where version='20260816190000';"), "1");
const clean = assertFinalContract();

psql(bridge);
const deployedNoOp = assertFinalContract();
assert.equal(deployedNoOp.evidence.policy_oid, clean.evidence.policy_oid, "Recorded canonical migration must make the bridge a schema no-op.");

psql("delete from supabase_migrations.schema_migrations where version='20260811140000';");
psql(bridge);
assert.equal(psql("select count(*) from pg_policies where schemaname='tongs' and tablename='reference_visual_sequence_sequences' and policyname='reference_visual_sequence_sequences_viewer';"), "0");
psql(bridge);
psql(canonical);
psql("insert into supabase_migrations.schema_migrations(version,name,statements) values('20260811140000','tongs_restore_reference_visual_archival_completion_rpcs',array[]::text[]) on conflict(version) do nothing;");
const partialReplay = assertFinalContract();
assert.equal(psql("select count(*) from supabase_migrations.schema_migrations where version='20260816190000';"), "1");

process.stdout.write(`${JSON.stringify({ project_id: projectId, container, ports, clean, deployed_no_op: deployedNoOp, partial_replay: partialReplay }, null, 2)}\n`);
