import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

import { createNetlifyHammerFunction } from "../apps/nursery/netlify/functions/_hammer-handler.ts";
import type { HammerPrivateDiagnostic } from "../apps/nursery/scripts/mw-hammer-prep.ts";
import type { OpenAiTextGateClient } from "../packages/tongs/src/providers/paid-openai-text-execution-coordinator.ts";

const root = resolve(import.meta.dirname, "..");
const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_slice6c3_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
const schemaPath = resolve(root, ".git/forge-private-evidence/slice6a-connected-schema-after.sql");
const priorVerifier = readFileSync(resolve(root, "scripts/verify-hammer-test-canary-prerequisites-isolated.mjs"), "utf8");
const activationVerifier = readFileSync(resolve(root, "scripts/verify-owner-only-test-canary-scoped-activation-isolated.mjs"), "utf8");
const fixtureMatch = priorVerifier.match(/const fixture = String\.raw`([\s\S]*?)`;\n\ntry \{/);
const setupMatch = activationVerifier.match(/const setup = String\.raw`([\s\S]*?)`;\n\ntry \{/);
if (!fixtureMatch || !setupMatch) throw new Error("Slice 6C.3 isolated fixtures could not be located");
const fixture = fixtureMatch[1].replace(
  "'slice6b1-mini','sku','openai','slice6b1-mini'",
  "'slice6b1-mini','sku','openai','openai-text:hammer.transcript_cleanup:gpt-5.4-mini:40010000-0000-4000-8000-000000000301'",
);
const setup = setupMatch[1];

const ownerId = "6b100000-0000-4000-8000-000000000001";
const workspaceId = "6b100000-0000-4000-8000-000000000101";
const workpieceId = "6b100000-0000-4000-8000-000000000201";

function run(command: string, args: string[], options: Record<string, unknown> = {}): string {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 96 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${String(options.label ?? command)} failed:\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function docker(args: string[], options: Record<string, unknown> = {}): string { return run("docker", args, options); }
function psql(sql: string, label: string): string {
  return docker(["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: sql, label });
}
function psqlFile(hostPath: string, containerPath: string, label: string): string {
  docker(["cp", hostPath, `${container}:${containerPath}`], { label: `${label} copy` });
  return docker(["exec", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-f", containerPath], { label });
}

type RpcError = { message: string; code?: string; details?: string; hint?: string };

async function createGate(
  client: pg.Client,
  role: "service_role" | "authenticated",
  callerOverride?: "interactive",
): Promise<OpenAiTextGateClient> {
  const signatures = new Map<string, Array<{ names: string[]; types: string[]; defaults: number }>>();
  return {
    rpc: async (name, args) => {
      await client.query("savepoint hammer_diagnostic_rpc");
      try {
        await client.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)", [role, role === "authenticated" ? ownerId : ""]);
        const effectiveArgs = { ...args };
        if (callerOverride && (
          name === "acquire_openai_text_aggregate_admission"
          || name === "authorize_openai_text_provider_attempt_with_aggregate"
        )) effectiveArgs.p_caller_class = callerOverride;
        if (!signatures.has(name)) {
          const found = await client.query<{ names: string[]; identity: string; defaults: number }>(`
            select coalesce(p.proargnames,'{}') names,
                   pg_get_function_identity_arguments(p.oid) identity,
                   p.pronargdefaults defaults
            from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='tongs' and p.proname=$1`, [name]);
          signatures.set(name, found.rows.map((row) => ({
            names: row.names,
            types: row.identity.split(",").map((part) => part.trim().replace(/^[^ ]+\s+/, "")),
            defaults: row.defaults,
          })));
        }
        const keys = Object.keys(effectiveArgs);
        const signature = signatures.get(name)!.find((candidate) => {
          const required = candidate.names.length - candidate.defaults;
          return candidate.names.slice(0, required).every((arg) => keys.includes(arg))
            && keys.every((arg) => candidate.names.includes(arg));
        });
        if (!signature) throw Object.assign(new Error(`RPC signature not found for ${name}(${keys.join(",")})`), { code: "PGRST202" });
        const ordered = signature.names.filter((arg) => keys.includes(arg));
        const sqlArgs = ordered.map((arg, index) => {
          const type = signature.types[signature.names.indexOf(arg)];
          return `${arg} => $${index + 1}::${type}`;
        }).join(",");
        const result = await client.query(`select tongs.${name}(${sqlArgs}) value`, ordered.map((arg) => effectiveArgs[arg]));
        await client.query("release savepoint hammer_diagnostic_rpc");
        return { data: result.rows[0]?.value ?? null, error: null };
      } catch (error) {
        await client.query("rollback to savepoint hammer_diagnostic_rpc");
        await client.query("release savepoint hammer_diagnostic_rpc");
        const row = error as Error & { code?: string; detail?: string; hint?: string };
        const rpcError: RpcError = { message: row.message, code: row.code, details: row.detail, hint: row.hint };
        return { data: null, error: rpcError };
      }
    },
  };
}

async function invokeScenario(
  client: pg.Client,
  operationId: string,
  callerOverride?: "interactive",
) {
  await client.query("begin");
  try {
    const serviceGate = await createGate(client, "service_role", callerOverride);
    const userGate = await createGate(client, "authenticated");
    const diagnostics: HammerPrivateDiagnostic[] = [];
    let boundaryIntercepts = 0;
    let actualNetworkCalls = 0;
    const handler = createNetlifyHammerFunction({
      runtimeConfig: {
        textApiKey: "diagnostic-transport-disabled",
        model: "gpt-5.4-mini",
        sttModel: "gpt-4o-transcribe-diarize",
        configuredBillingMode: "forge",
        initialTokenBalance: null,
        supabaseUrl: "http://127.0.0.1:9",
        supabaseServiceRoleKey: "diagnostic-only",
        supabaseRpcKey: "diagnostic-only",
        sttBucket: "diagnostic-only",
        disableForgeLaneAi: false,
        disableUserKeys: false,
        disableExpensiveAiActions: false,
        disableCdcGeneration: false,
      } as never,
      openAiTextGate: serviceGate,
      diagnosticUserGate: userGate,
      diagnosticUserIdResolver: async () => ownerId,
      diagnosticPolicyPreflight: async () => ({ ok: true }),
      recordPrivateDiagnostic: async (diagnostic) => { diagnostics.push(diagnostic); },
      openAiProviderFetch: async () => {
        boundaryIntercepts += 1;
        throw new Error("diagnostic_provider_transport_intercepted");
      },
    });
    const base = {
      operation_id: operationId,
      workspace_id: workspaceId,
      workpiece_id: workpieceId,
      segments: [{ segment_id: "canary-segment-1", start_sec: 0, end_sec: 3.2, speaker: "Speaker 1", text: "Okay, um, this is the Hammer accounting canary test." }],
      segment_ids: ["canary-segment-1"],
    };
    const invoke = (body: Record<string, unknown>) => handler(new Request("http://localhost/api/hammer/editorial/transcript-cleanup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forge-user-authorization": "Bearer diagnostic-no-secret" },
      body: JSON.stringify(body),
    }));
    const quoteResponse = await invoke(base);
    const quotePayload = await quoteResponse.json() as Record<string, any>;
    if (quoteResponse.status !== 409 || quotePayload.error?.code !== "openai_text_quote_required") throw new Error(`quote failed: ${quoteResponse.status} ${JSON.stringify(quotePayload)}`);
    const quote = quotePayload.error.billing_quote;
    const executionResponse = await invoke({ ...base, spending_acceptance: {
      operation_id: quote.operation_id,
      quote_id: quote.quote_id,
      quote_hash: quote.quote_hash,
      request_fingerprint: quote.request_fingerprint,
    } });
    const executionPayload = await executionResponse.json() as Record<string, unknown>;
    const databaseEvidence = (await client.query(`select jsonb_build_object(
      'bounded_bindings',(select count(*) from tongs.bounded_provider_request_bindings),
      'aggregate_bindings',(select count(*) from tongs.paid_operation_aggregate_bindings),
      'provider_attempts',(select count(*) from tongs.funding_reservation_events where provider_attempt_key is not null),
      'quotes',(select count(*) from tongs.openai_text_customer_quote_bindings where route_code='hammer.transcript_cleanup'),
      'reservations',(select count(*) from tongs.openai_text_funding_bindings where route_code='hammer.transcript_cleanup')
    ) evidence`)).rows[0].evidence;
    return {
      caller_class_seen_by_database: callerOverride ?? "background",
      quote_status: quoteResponse.status,
      execution_status: executionResponse.status,
      customer_error: executionPayload,
      diagnostics,
      database_evidence: databaseEvidence,
      provider_boundary_intercepts: boundaryIntercepts,
      actual_network_calls: actualNetworkCalls,
    };
  } finally {
    await client.query("rollback");
  }
}

try {
  docker(["exec", container, "createdb", "-U", "postgres", database], { label: "create isolated database" });
  psql(String.raw`
    create schema if not exists auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(current_setting('request.jwt.claim.role',true),'') $$;
    create schema if not exists extensions;
    create extension if not exists "uuid-ossp" with schema extensions;
    create extension if not exists pgcrypto with schema extensions;
  `, "isolated bootstrap");
  psqlFile(schemaPath, "/tmp/forge-slice6c3-schema.sql", "connected-shape schema restore");
  psql(fixture, "Slice 6B.1 fixture");
  psqlFile(resolve(root, "supabase/migrations/20261012040000_hammer_test_canary_prerequisites.sql"), "/tmp/forge-slice6c3-prerequisite.sql", "Slice 6B.1 migration");
  psql(setup, "Slice 6C.1 staged authority");
  psqlFile(resolve(root, "supabase/migrations/20261012050000_owner_only_test_canary_scoped_activation.sql"), "/tmp/forge-slice6c3-activation.sql", "Slice 6C.1 migration");
  psqlFile(resolve(root, "supabase/migrations/20261012060000_scoped_owner_canary_execution_context_activation.sql"), "/tmp/forge-slice6c4-execution-context.sql", "Slice 6C.4 execution-context migration");
  psqlFile(resolve(root, "supabase/migrations/20261012070000_return_paid_funding_environment.sql"), "/tmp/forge-slice6c5-funding-environment.sql", "Slice 6C.5 funding-environment migration");

  const client = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:54322/${database}` });
  await client.connect();
  try {
    const background = await invokeScenario(client, "hammer-owner-canary-diagnostic-background-0001");
    const backgroundFailure = background.diagnostics.at(-1);
    const reachedCallerClassRejection = background.database_evidence.bounded_bindings === 1
      && backgroundFailure?.stage === "aggregate_admission"
      && backgroundFailure.safe_details.reason === "caller_not_permitted";
    const interactive = reachedCallerClassRejection
      ? await invokeScenario(client, "hammer-owner-canary-diagnostic-interactive-0002", "interactive")
      : null;
    const durable = (await client.query(`select jsonb_build_object(
      'quotes',(select count(*) from tongs.openai_text_customer_quote_bindings where route_code='hammer.transcript_cleanup'),
      'reservations',(select count(*) from tongs.openai_text_funding_bindings where route_code='hammer.transcript_cleanup'),
      'bounded_bindings',(select count(*) from tongs.bounded_provider_request_bindings),
      'aggregate_bindings',(select count(*) from tongs.paid_operation_aggregate_bindings),
      'holds',(select count(*) from tongs.restricted_beta_exposure_holds),
      'provider_attempts',(select count(*) from tongs.funding_reservation_events where provider_attempt_key is not null),
      'expenses',(select count(*) from tongs.supplier_expenses)
    ) evidence`)).rows[0].evidence;
    if (Object.values(durable).some((value) => Number(value) !== 0)) throw new Error(`rollback left durable financial activity: ${JSON.stringify(durable)}`);
    console.log(JSON.stringify({
      ok: true,
      background,
      interactive_comparison_performed: interactive !== null,
      interactive,
      durable,
    }, null, 2));
  } finally {
    await client.end();
  }
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database], { label: "drop isolated database" });
}
