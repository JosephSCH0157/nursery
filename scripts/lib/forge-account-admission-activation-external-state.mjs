import crypto from "node:crypto";

const REQUIRED_SITE_ID = "d5c7485d-35eb-4c66-b22d-410b09b38a73";
const REQUIRED_PROJECT_REF = "wtvdjndyxegudufrompx";

const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function exactString(value, name) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${name}_missing`);
  return text;
}

function productionValue(records, key) {
  const record = records.find((entry) => entry?.key === key);
  if (!record) return { present: false, value: "", scopes: [] };
  const values = Array.isArray(record.values) ? record.values : [];
  const production = values.find((entry) => entry?.context === "production")
    ?? values.find((entry) => entry?.context === "all")
    ?? null;
  return {
    present: Boolean(production),
    value: typeof production?.value === "string" ? production.value.trim().toLowerCase() : "",
    scopes: Array.isArray(record.scopes) ? [...record.scopes].sort() : [],
  };
}

export function buildAdmissionActivationExternalState({
  site,
  environment,
  authConfig,
  projectRef,
  observedAt,
  health,
  receipts,
}) {
  if (site?.id !== REQUIRED_SITE_ID) throw new Error("netlify_site_mismatch");
  if (projectRef !== REQUIRED_PROJECT_REF) throw new Error("supabase_project_mismatch");
  const deploy = site.published_deploy;
  const commit = exactString(deploy?.commit_ref, "netlify_deployed_commit");
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("netlify_deployed_commit_invalid");
  if (deploy?.state !== "ready") throw new Error("netlify_deploy_not_ready");
  if (site.build_settings?.repo_branch !== "main") throw new Error("netlify_branch_mismatch");

  const server = productionValue(environment, "FORGE_ADMISSION_ENFORCEMENT_ENABLED");
  const frontend = productionValue(environment, "VITE_FORGE_ADMISSION_ENFORCEMENT_ENABLED");
  const invitations = productionValue(environment, "FORGE_BETA_INVITATIONS_ENABLED");
  const intake = productionValue(environment, "FORGE_BETA_INTAKE_ENABLED");
  const flags = {
    serverAdmissionEnforcement: server.value === "true",
    frontendAdmissionBoundary: frontend.value === "true",
    invitationDispatch: invitations.value === "true",
    intake: intake.value === "true",
    serverScopes: server.scopes,
    frontendScopes: frontend.scopes,
    invitationScopes: invitations.scopes,
  };

  if (authConfig?.disable_signup !== true) throw new Error("auth_public_signup_not_disabled");
  if (authConfig?.external_google_enabled !== true) throw new Error("auth_google_provider_changed");

  const routeHealth = Object.fromEntries(Object.entries(health ?? {})
    .filter(([path]) => path.startsWith("/"))
    .map(([path, value]) => [path, Number(value)]));
  for (const [path, status] of Object.entries(routeHealth)) {
    if (!Number.isInteger(status) || status < 200 || status >= 400) throw new Error(`production_route_unhealthy:${path}`);
  }
  if (routeHealth["/login"] === undefined || routeHealth["/app"] === undefined) throw new Error("production_health_incomplete");

  const observation = {
    schema: "forge.account-admission-activation-external-state.v1",
    observedAt: exactString(observedAt, "observed_at"),
    siteId: REQUIRED_SITE_ID,
    deployId: exactString(deploy?.id, "netlify_deploy_id"),
    deployedCommit: commit,
    deployState: deploy.state,
    branch: site.build_settings.repo_branch,
    projectRef,
    auth: {
      publicSignupDisabled: true,
      googleProviderConfigured: true,
    },
    flags,
    routeHealth,
    loginHasGoogleUi: health?.loginHasGoogleUi === true,
    receipts,
  };
  return { ...observation, evidenceSha256: sha256(observation) };
}

function validateReceipt(receipt, endpoint, name) {
  if (receipt?.endpoint !== endpoint || receipt?.status !== 200) throw new Error(`${name}_receipt_invalid`);
  if (!/^[0-9a-f]{64}$/.test(receipt?.responseSha256 ?? "")) throw new Error(`${name}_receipt_hash_invalid`);
}

export function validateAdmissionActivationExternalState(state, expectedCommit, now = new Date()) {
  if (state?.schema !== "forge.account-admission-activation-external-state.v1") throw new Error("external_state_schema_invalid");
  if (state.siteId !== REQUIRED_SITE_ID || state.projectRef !== REQUIRED_PROJECT_REF) throw new Error("external_state_identity_mismatch");
  if (state.deployState !== "ready" || state.branch !== "main") throw new Error("external_state_deploy_invalid");
  if (state.deployedCommit !== expectedCommit) throw new Error("external_state_commit_mismatch");
  if (state.auth?.publicSignupDisabled !== true || state.auth?.googleProviderConfigured !== true) throw new Error("external_state_auth_invalid");
  if (state.flags?.serverAdmissionEnforcement !== true || state.flags?.frontendAdmissionBoundary !== true) throw new Error("external_state_enforcement_flags_inactive");
  if (state.flags?.invitationDispatch !== true) throw new Error("external_state_invitation_dispatch_inactive");
  if (state.flags?.intake !== false) throw new Error("external_state_intake_unexpected");
  if (!state.flags.serverScopes?.some((scope) => /functions|runtime/i.test(scope))) throw new Error("external_state_server_scope_invalid");
  if (!state.flags.frontendScopes?.some((scope) => /build/i.test(scope))) throw new Error("external_state_frontend_scope_invalid");
  if (!state.flags.invitationScopes?.some((scope) => /functions|runtime/i.test(scope))) throw new Error("external_state_invitation_scope_invalid");
  if (state.loginHasGoogleUi !== false) throw new Error("external_state_google_ui_present");
  const observedAt = new Date(state.observedAt);
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(observedAt.getTime()) || !Number.isFinite(current.getTime())) throw new Error("external_state_time_invalid");
  if (observedAt.getTime() > current.getTime() + 30_000) throw new Error("external_state_observed_in_future");
  if (current.getTime() - observedAt.getTime() > 10 * 60_000) throw new Error("external_state_stale");
  for (const path of ["/", "/login", "/app", "/beta", "/welcome/invitation"]) {
    const status = state.routeHealth?.[path];
    if (!Number.isInteger(status) || status < 200 || status >= 400) throw new Error(`external_state_route_unhealthy:${path}`);
  }
  validateReceipt(state.receipts?.netlifySite, `/api/v1/sites/${REQUIRED_SITE_ID}`, "netlify_site");
  if (!/^\/api\/v1\/accounts\/[^/]+\/env$/.test(state.receipts?.netlifyEnvironment?.endpoint ?? "")) throw new Error("netlify_environment_receipt_endpoint_invalid");
  if (state.receipts?.netlifyEnvironment?.status !== 200 || !/^[0-9a-f]{64}$/.test(state.receipts?.netlifyEnvironment?.responseSha256 ?? "")) throw new Error("netlify_environment_receipt_invalid");
  validateReceipt(state.receipts?.supabaseAuthConfig, `/v1/projects/${REQUIRED_PROJECT_REF}/config/auth`, "supabase_auth_config");
  if (!/^[0-9a-f]{64}$/.test(state.evidenceSha256 ?? "")) throw new Error("external_state_hash_invalid");
  const { evidenceSha256, ...unsigned } = state;
  if (sha256(unsigned) !== evidenceSha256) throw new Error("external_state_hash_mismatch");
  return state;
}

export const ADMISSION_ACTIVATION_SITE_ID = REQUIRED_SITE_ID;
export const ADMISSION_ACTIVATION_PROJECT_REF = REQUIRED_PROJECT_REF;
