import { pathToFileURL } from "node:url";

export const HOSTED_SMOKE_AUTHORIZATION = "RUN_NONPRODUCTION_HOSTED_SMOKE";
export const HOSTED_SMOKE_ENVIRONMENT = "forge-nonproduction-hosted-smoke";
export const KNOWN_PRODUCTION_PROJECT_REFS = Object.freeze([
  "wtvdjndyxegudufrompx",
]);

const projectRefPattern = /^[a-z0-9]{20}$/;
const commitPattern = /^[0-9a-f]{40}$/;

function requiredString(value, name, failures) {
  const normalized = String(value ?? "").trim();
  if (!normalized) failures.push(`${name} is missing.`);
  return normalized;
}

export function verifyHostedSmokeAuthorization(input) {
  const failures = [];
  const eventName = requiredString(input.eventName, "event name", failures);
  const gitRef = requiredString(input.gitRef, "Git ref", failures);
  const gitSha = requiredString(input.gitSha, "Git SHA", failures);
  const authorization = requiredString(input.authorization, "authorization", failures);
  const environmentName = requiredString(input.environmentName, "environment name", failures);
  const enabled = requiredString(input.enabled, "environment enablement", failures);
  const configuredProjectRef = requiredString(
    input.configuredProjectRef,
    "nonproduction project ref",
    failures,
  );
  const supabaseUrl = requiredString(input.supabaseUrl, "Supabase URL", failures);

  if (eventName && eventName !== "workflow_dispatch") {
    failures.push("Hosted smoke requires workflow_dispatch.");
  }
  if (gitRef && gitRef !== "refs/heads/main") {
    failures.push("Hosted smoke requires refs/heads/main.");
  }
  if (gitSha && !commitPattern.test(gitSha)) {
    failures.push("Git SHA must be a full lowercase commit SHA.");
  }
  if (authorization && authorization !== HOSTED_SMOKE_AUTHORIZATION) {
    failures.push("Hosted smoke authorization phrase is invalid.");
  }
  if (environmentName && environmentName !== HOSTED_SMOKE_ENVIRONMENT) {
    failures.push("Hosted smoke environment is not approved.");
  }
  if (enabled && enabled !== "true") {
    failures.push("The protected environment has not enabled hosted smoke.");
  }
  if (configuredProjectRef && !projectRefPattern.test(configuredProjectRef)) {
    failures.push("The protected environment project ref is malformed.");
  }
  if (KNOWN_PRODUCTION_PROJECT_REFS.includes(configuredProjectRef)) {
    failures.push("The configured project is a known production project.");
  }

  let urlProjectRef = "";
  if (supabaseUrl) {
    try {
      const parsed = new URL(supabaseUrl);
      const suffix = ".supabase.co";
      if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(suffix)) {
        failures.push("Supabase URL must use the hosted HTTPS project endpoint.");
      } else {
        urlProjectRef = parsed.hostname.slice(0, -suffix.length);
        if (!projectRefPattern.test(urlProjectRef)) {
          failures.push("Supabase URL does not contain a valid project ref.");
        }
      }
      if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
        failures.push("Supabase URL must be the project origin without path, query, or fragment.");
      }
    } catch {
      failures.push("Supabase URL is invalid.");
    }
  }
  if (urlProjectRef && configuredProjectRef && urlProjectRef !== configuredProjectRef) {
    failures.push("Supabase URL and protected environment project ref do not match.");
  }
  if (KNOWN_PRODUCTION_PROJECT_REFS.includes(urlProjectRef)) {
    failures.push("The Supabase URL identifies a known production project.");
  }

  const requiredCredentials = [
    ["anonKeyPresent", "NURSERY_SUPABASE_ANON_KEY"],
    ["serviceRoleKeyPresent", "NURSERY_SUPABASE_SERVICE_ROLE_KEY"],
    ["authEmailPresent", "NURSERY_PLAYWRIGHT_EMAIL"],
    ["authPasswordPresent", "NURSERY_PLAYWRIGHT_PASSWORD"],
    ["workspaceIdPresent", "NURSERY_HEARTH_PHASE4_WORKSPACE_ID"],
    ["workpieceIdPresent", "NURSERY_HEARTH_PHASE4_WORKPIECE_ID"],
  ];
  for (const [field, name] of requiredCredentials) {
    if (input[field] !== true) failures.push(`${name} is missing.`);
  }

  if (failures.length > 0) {
    throw new Error(`Hosted smoke authorization rejected: ${failures.join(" ")}`);
  }

  return Object.freeze({
    ok: true,
    eventName,
    gitRef,
    gitSha,
    environmentName,
    projectRef: configuredProjectRef,
    credentialsPresent: true,
  });
}

export function inputFromEnvironment(env = process.env) {
  return {
    eventName: env.FORGE_HOSTED_SMOKE_EVENT_NAME,
    gitRef: env.FORGE_HOSTED_SMOKE_REF,
    gitSha: env.FORGE_HOSTED_SMOKE_SHA,
    authorization: env.FORGE_HOSTED_SMOKE_AUTHORIZATION,
    environmentName: env.FORGE_HOSTED_SMOKE_ENVIRONMENT,
    enabled: env.FORGE_HOSTED_SMOKE_ENABLED,
    configuredProjectRef: env.FORGE_NONPROD_SUPABASE_PROJECT_REF,
    supabaseUrl: env.VITE_SUPABASE_URL,
    anonKeyPresent: Boolean(env.VITE_SUPABASE_ANON_KEY),
    serviceRoleKeyPresent: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    authEmailPresent: Boolean(env.FORGE_CI_AUTH_EMAIL),
    authPasswordPresent: Boolean(env.FORGE_CI_AUTH_PASSWORD),
    workspaceIdPresent: Boolean(env.FORGE_TEST_WORKSPACE_ID),
    workpieceIdPresent: Boolean(env.FORGE_TEST_WORKPIECE_ID),
  };
}

function main() {
  const result = verifyHostedSmokeAuthorization(inputFromEnvironment());
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Hosted smoke authorization rejected."}\n`);
    process.exitCode = 1;
  }
}
