import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function parse(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error("activation_surface_argument_invalid");
    result[key.slice(2)] = value;
  }
  return result;
}

const args = parse(process.argv.slice(2));
const container = args.container;
const projectId = args["project-id"];
const output = resolve(args.output ?? "");
assert.match(container ?? "", /^[a-zA-Z0-9_.-]+$/, "explicit database container is required");
assert.match(projectId ?? "", /^[a-z0-9][a-z0-9-]{2,62}$/, "explicit disposable project id is required");
assert.ok(output.endsWith("ADMISSION_ACTIVATION_DATABASE_SURFACE.v1.json"), "canonical output name is required");

const inspectedName = execFileSync("docker", ["inspect", "--format={{.Name}}", container], { encoding: "utf8" }).trim();
assert.equal(inspectedName, `/supabase_db_${projectId}`, "container must belong to the explicitly owned disposable project");

const sql = String.raw`
select jsonb_build_object(
  'lineage', (select lineage from forge_meta.database_lineage where singleton=true),
  'migrationCount', (select count(*) from supabase_migrations.schema_migrations),
  'migrationHead', (select max(version) from supabase_migrations.schema_migrations),
  'dataApiRelations', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', namespace.nspname,
      'name', relation.relname,
      'kind', case relation.relkind when 'r' then 'table' when 'p' then 'partitioned_table' when 'v' then 'view' when 'm' then 'materialized_view' end,
      'rls', relation.relrowsecurity,
      'forceRls', relation.relforcerowsecurity,
      'select', has_table_privilege('authenticated', relation.oid, 'SELECT'),
      'insert', has_table_privilege('authenticated', relation.oid, 'INSERT'),
      'update', has_table_privilege('authenticated', relation.oid, 'UPDATE'),
      'delete', has_table_privilege('authenticated', relation.oid, 'DELETE'),
      'acl', coalesce(relation.relacl::text, '')
    ) order by namespace.nspname, relation.relname)
    from pg_class relation
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname in ('public','tongs')
      and relation.relkind in ('r','p','v','m')
      and (
        has_table_privilege('authenticated', relation.oid, 'SELECT')
        or has_table_privilege('authenticated', relation.oid, 'INSERT')
        or has_table_privilege('authenticated', relation.oid, 'UPDATE')
        or has_table_privilege('authenticated', relation.oid, 'DELETE')
      )
  ), '[]'::jsonb),
  'dataApiFunctions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', namespace.nspname,
      'signature', procedure.oid::regprocedure::text,
      'owner', procedure.proowner::regrole::text,
      'securityDefiner', procedure.prosecdef,
      'volatility', procedure.provolatile::text,
      'config', coalesce(to_jsonb(procedure.proconfig), '[]'::jsonb),
      'acl', coalesce(procedure.proacl::text, '')
    ) order by namespace.nspname, procedure.oid::regprocedure::text)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname in ('graphql_public','public','tongs')
      and has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
  ), '[]'::jsonb),
  'storageAuthenticatedPolicies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', policy.policyname,
      'command', lower(policy.cmd),
      'permissive', policy.permissive,
      'roles', policy.roles,
      'using', coalesce(policy.qual,''),
      'withCheck', coalesce(policy.with_check,'')
    ) order by policy.policyname)
    from pg_policies policy
    where policy.schemaname='storage' and policy.tablename='objects'
      and 'authenticated'=any(policy.roles)
      and policy.policyname not like 'forge_account_admission_storage_%_v1'
  ), '[]'::jsonb),
  'realtimeAdmissionPolicies', coalesce((
    select jsonb_agg(jsonb_build_object('table',policy.tablename,'name',policy.policyname,'command',lower(policy.cmd)) order by policy.tablename,policy.policyname)
    from pg_policies policy
    where policy.schemaname='realtime' and policy.policyname like 'forge_account_admission%'
  ), '[]'::jsonb)
)::text;
`;

const raw = execFileSync("docker", [
  "exec", "-i", container,
  "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
], { encoding: "utf8", input: sql }).trim();
const catalog = JSON.parse(raw);
assert.equal(catalog.lineage, "baseline-v1");
assert.equal(catalog.migrationCount, 18);
assert.equal(catalog.migrationHead, "20261102032722");
assert.ok(catalog.dataApiRelations.length > 0);
assert.ok(catalog.dataApiFunctions.length > 0);
assert.equal(catalog.realtimeAdmissionPolicies.length, 0);

const hash = (value) => createHash("sha256").update(value).digest("hex");
const relationContract = catalog.dataApiRelations.map((item) => [
  item.schema, item.name, item.kind, item.rls, item.forceRls,
  item.select, item.insert, item.update, item.delete, item.acl,
].join("|")).join("\n");
const functionContract = catalog.dataApiFunctions.map((item) => [
  item.schema, item.signature, item.owner, item.securityDefiner,
  item.volatility, item.config.join(","), item.acl,
].join("|")).join("\n");
const storageContract = catalog.storageAuthenticatedPolicies.map((item) => [
  item.name, item.command, item.permissive, item.roles.join(","), item.using, item.withCheck,
].join("|")).join("\n");
const document = {
  schema: "forge.account-admission-activation-database-surface.v1",
  lineage: catalog.lineage,
  migrationCount: catalog.migrationCount,
  migrationHead: catalog.migrationHead,
  relationCount: catalog.dataApiRelations.length,
  relationSha256: hash(relationContract),
  functionCount: catalog.dataApiFunctions.length,
  functionSha256: hash(functionContract),
  storagePolicyCount: catalog.storageAuthenticatedPolicies.length,
  storagePolicySha256: hash(storageContract),
  realtimeAdmissionPolicyCount: catalog.realtimeAdmissionPolicies.length,
  dataApiRelations: catalog.dataApiRelations,
  dataApiFunctions: catalog.dataApiFunctions,
  storageAuthenticatedPolicies: catalog.storageAuthenticatedPolicies,
  realtimeAdmissionPolicies: catalog.realtimeAdmissionPolicies,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", flag: "w" });
process.stdout.write(`${JSON.stringify({
  ok: true,
  output,
  relationCount: document.relationCount,
  relationSha256: document.relationSha256,
  functionCount: document.functionCount,
  functionSha256: document.functionSha256,
  storagePolicyCount: document.storagePolicyCount,
  storagePolicySha256: document.storagePolicySha256,
})}\n`);
