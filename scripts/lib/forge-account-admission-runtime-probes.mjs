import crypto from "node:crypto";

export const RUNTIME_PROBE_BUNDLE_SCHEMA = "forge.account-admission-runtime-probe-bundle.v1";
export const RUNTIME_PROBE_RECEIPT_SCHEMA = "forge.account-admission-runtime-probe-receipt.v1";
export const RUNTIME_PROBE_ROLES = Object.freeze([
  "admitted",
  "unadmitted",
  "revoked",
  "unadmitted_operator",
]);

const MAX_BUNDLE_AGE_MS = 5 * 60 * 1000;
const MAX_BUNDLE_LIFETIME_MS = 15 * 60 * 1000;
const MIN_TOKEN_REMAINING_MS = 60 * 1000;

function required(value, name) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${name}_missing`);
  return text;
}

function uuid(value, name) {
  const text = required(value, name).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    throw new Error(`${name}_invalid`);
  }
  return text;
}

function instant(value, name) {
  const parsed = new Date(required(value, name));
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${name}_invalid`);
  return parsed;
}

function exact(actual, expected, name) {
  if (actual !== expected) throw new Error(`${name}_mismatch`);
}

function canonicalOrigin(value) {
  const parsed = new URL(required(value, "api_origin"));
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("api_origin_invalid");
  }
  return parsed.origin;
}

function isLoopback(hostname) {
  return new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(hostname);
}

function parseJwt(token, name) {
  const value = required(token, `${name}_access_token`);
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error(`${name}_access_token_invalid`);
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return { token: value, payload };
  } catch {
    throw new Error(`${name}_access_token_invalid`);
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeCode(body) {
  return body && typeof body === "object" && typeof body.code === "string" ? body.code : null;
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function headers(apiKey, accessToken, write = false) {
  const result = {
    apikey: apiKey,
    authorization: `Bearer ${accessToken}`,
    "accept-profile": "tongs",
  };
  if (write) {
    result["content-profile"] = "tongs";
    result["content-type"] = "application/json";
  }
  return result;
}

async function authIdentity(fetchImpl, apiOrigin, apiKey, role, identity, expectedIssuer, now) {
  const userId = uuid(identity?.user_id, `${role}_user_id`);
  const parsed = parseJwt(identity?.access_token, role);
  exact(parsed.payload.sub, userId, `${role}_jwt_sub`);
  exact(parsed.payload.role, "authenticated", `${role}_jwt_role`);
  if (Array.isArray(parsed.payload.aud)) {
    if (!parsed.payload.aud.includes("authenticated")) throw new Error(`${role}_jwt_audience_mismatch`);
  } else {
    exact(parsed.payload.aud, "authenticated", `${role}_jwt_audience`);
  }
  exact(parsed.payload.iss, expectedIssuer, `${role}_jwt_issuer`);
  if (!Number.isSafeInteger(parsed.payload.exp) || parsed.payload.exp * 1000 <= now.valueOf() + MIN_TOKEN_REMAINING_MS) {
    throw new Error(`${role}_jwt_expired`);
  }
  const response = await fetchImpl(`${apiOrigin}/auth/v1/user`, {
    headers: { apikey: apiKey, authorization: `Bearer ${parsed.token}` },
  });
  const body = await responseJson(response);
  if (!response.ok) throw new Error(`${role}_auth_verification_failed_${response.status}`);
  exact(uuid(body?.id, `${role}_auth_user_id`), userId, `${role}_auth_user_id`);
  return { role, userId, token: parsed.token, expiresAt: new Date(parsed.payload.exp * 1000).toISOString() };
}

async function rpc(fetchImpl, apiOrigin, apiKey, identity, name, body = {}) {
  const response = await fetchImpl(`${apiOrigin}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: headers(apiKey, identity.token, true),
    body: JSON.stringify(body),
  });
  return { status: response.status, ok: response.ok, body: await responseJson(response) };
}

function requireAllowed(result, name) {
  if (!result.ok) throw new Error(`${name}_unexpectedly_denied_${result.status}_${safeCode(result.body) ?? "unknown"}`);
}

function requireAdmissionDenial(result, name) {
  if (result.ok || safeCode(result.body) !== "42501") throw new Error(`${name}_not_admission_denied`);
}

function onboardingState(result, name, expectedState, expectedAdmitted) {
  requireAllowed(result, name);
  exact(result.body?.effective_state ?? null, expectedState, `${name}_effective_state`);
  exact(result.body?.admitted, expectedAdmitted, `${name}_admitted`);
}

export function validateRuntimeProbeBundle(bundle, options = {}) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) throw new Error("runtime_probe_bundle_missing");
  exact(bundle.schema, RUNTIME_PROBE_BUNDLE_SCHEMA, "runtime_probe_bundle_schema");
  const projectRef = required(options.projectRef, "expected_project_ref");
  exact(bundle.project_ref, projectRef, "runtime_probe_project_ref");
  const apiOrigin = canonicalOrigin(bundle.api_origin);
  exact(apiOrigin, canonicalOrigin(options.apiOrigin), "runtime_probe_api_origin");
  const environment = required(options.environment, "runtime_probe_environment");
  if (environment === "hosted") {
    exact(apiOrigin, `https://${projectRef}.supabase.co`, "runtime_probe_hosted_origin");
  } else if (environment === "local") {
    const parsed = new URL(apiOrigin);
    if (parsed.protocol !== "http:" || !isLoopback(parsed.hostname)) throw new Error("runtime_probe_local_origin_invalid");
  } else {
    throw new Error("runtime_probe_environment_invalid");
  }
  const now = options.now instanceof Date ? options.now : new Date();
  const createdAt = instant(bundle.created_at, "runtime_probe_created_at");
  const expiresAt = instant(bundle.expires_at, "runtime_probe_expires_at");
  if (createdAt.valueOf() > now.valueOf() || now.valueOf() - createdAt.valueOf() > MAX_BUNDLE_AGE_MS) {
    throw new Error("runtime_probe_bundle_stale");
  }
  if (expiresAt.valueOf() <= now.valueOf() || expiresAt.valueOf() - createdAt.valueOf() > MAX_BUNDLE_LIFETIME_MS) {
    throw new Error("runtime_probe_bundle_expired");
  }
  const apiKey = required(bundle.api_key, "runtime_probe_api_key");
  const identities = bundle.identities;
  if (!identities || typeof identities !== "object" || Array.isArray(identities)) throw new Error("runtime_probe_identities_missing");
  const unexpected = Object.keys(identities).filter((name) => !RUNTIME_PROBE_ROLES.includes(name));
  if (unexpected.length) throw new Error("runtime_probe_identity_role_unexpected");
  const userIds = RUNTIME_PROBE_ROLES.map((role) => uuid(identities[role]?.user_id, `${role}_user_id`));
  if (new Set(userIds).size !== RUNTIME_PROBE_ROLES.length) throw new Error("runtime_probe_identity_reused");
  return {
    apiOrigin,
    apiKey,
    identities,
    expectedIssuer: `${apiOrigin}/auth/v1`,
    now,
    expiresAt,
    projectRef,
    environment,
  };
}

export async function executeAdmissionRuntimeProbes(bundle, options = {}) {
  const mode = required(options.mode, "runtime_probe_mode");
  if (!new Set(["preflight", "active"]).has(mode)) throw new Error("runtime_probe_mode_invalid");
  const validated = validateRuntimeProbeBundle(bundle, options);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("runtime_probe_fetch_missing");
  const verified = {};
  for (const role of RUNTIME_PROBE_ROLES) {
    verified[role] = await authIdentity(
      fetchImpl,
      validated.apiOrigin,
      validated.apiKey,
      role,
      validated.identities[role],
      validated.expectedIssuer,
      validated.now,
    );
  }

  const onboarding = {};
  for (const role of RUNTIME_PROBE_ROLES) {
    onboarding[role] = await rpc(fetchImpl, validated.apiOrigin, validated.apiKey, verified[role], "read_my_admission_onboarding");
  }
  onboardingState(onboarding.admitted, "admitted_onboarding", "admitted", true);
  onboardingState(onboarding.revoked, "revoked_onboarding", "revoked", false);
  onboardingState(onboarding.unadmitted, "unadmitted_onboarding", null, false);
  onboardingState(onboarding.unadmitted_operator, "operator_onboarding", null, false);

  const admittedProtected = await rpc(fetchImpl, validated.apiOrigin, validated.apiKey, verified.admitted, "is_account_admitted", {
    p_user_id: verified.admitted.userId,
  });
  requireAllowed(admittedProtected, "admitted_protected_rpc");
  exact(admittedProtected.body, true, "admitted_protected_result");

  const operatorException = await rpc(
    fetchImpl,
    validated.apiOrigin,
    validated.apiKey,
    verified.unadmitted_operator,
    "list_beta_invitation_applications",
    { p_state: null, p_limit: 1, p_before_submitted_at: null, p_before_application_id: null },
  );
  requireAllowed(operatorException, "operator_exception");

  const nonOperatorException = await rpc(
    fetchImpl,
    validated.apiOrigin,
    validated.apiKey,
    verified.unadmitted,
    "list_beta_invitation_applications",
    { p_state: null, p_limit: 1, p_before_submitted_at: null, p_before_application_id: null },
  );
  requireAdmissionDenial(nonOperatorException, "non_operator_exception");

  const protectedResults = {};
  for (const role of ["unadmitted", "revoked", "unadmitted_operator"]) {
    protectedResults[role] = await rpc(fetchImpl, validated.apiOrigin, validated.apiKey, verified[role], "is_account_admitted", {
      p_user_id: verified[role].userId,
    });
    if (mode === "active") requireAdmissionDenial(protectedResults[role], `${role}_protected_rpc`);
    else {
      requireAllowed(protectedResults[role], `${role}_preflight_state_rpc`);
      exact(protectedResults[role].body, false, `${role}_preflight_state_result`);
    }
  }

  const unsigned = {
    schema: RUNTIME_PROBE_RECEIPT_SCHEMA,
    projectRef: validated.projectRef,
    environment: validated.environment,
    mode,
    observedAt: validated.now.toISOString(),
    bundleExpiresAt: validated.expiresAt.toISOString(),
    authIdentitiesVerified: RUNTIME_PROBE_ROLES.length,
    canonicalStatesVerified: true,
    admittedProtectedOperationAllowed: true,
    unadmittedProtectedOperationDenied: mode === "active",
    revokedProtectedOperationDenied: mode === "active",
    operatorProtectedOperationDenied: mode === "active",
    operatorExceptionAllowed: true,
    nonOperatorExceptionDenied: true,
    actualPostgrestRequestsExecuted: true,
    complete: true,
    tokensReturned: false,
    refreshTokensAccepted: false,
    serviceRoleSubstitutionAccepted: false,
    customerDataReturned: false,
    unverifiedExternalState: ["netlify_configuration", "hosted_auth_configuration"],
  };
  return { ...unsigned, evidenceSha256: sha256(canonicalJson(unsigned)) };
}

export function validateRuntimeProbeReceipt(receipt, options = {}) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw new Error("runtime_probe_receipt_missing");
  exact(receipt.schema, RUNTIME_PROBE_RECEIPT_SCHEMA, "runtime_probe_receipt_schema");
  exact(receipt.projectRef, required(options.projectRef, "runtime_probe_receipt_project_ref"), "runtime_probe_receipt_project_ref");
  exact(receipt.mode, required(options.mode, "runtime_probe_receipt_mode"), "runtime_probe_receipt_mode");
  if (options.environment) exact(receipt.environment, options.environment, "runtime_probe_receipt_environment");
  const now = options.now instanceof Date ? options.now : new Date();
  const observedAt = instant(receipt.observedAt, "runtime_probe_receipt_observed_at");
  const bundleExpiresAt = instant(receipt.bundleExpiresAt, "runtime_probe_receipt_bundle_expires_at");
  if (observedAt.valueOf() > now.valueOf() || now.valueOf() - observedAt.valueOf() > MAX_BUNDLE_AGE_MS) {
    throw new Error("runtime_probe_receipt_stale");
  }
  if (bundleExpiresAt.valueOf() <= now.valueOf()) throw new Error("runtime_probe_receipt_bundle_expired");
  exact(receipt.complete, true, "runtime_probe_complete");
  exact(receipt.actualPostgrestRequestsExecuted, true, "runtime_probe_http_execution");
  exact(receipt.authIdentitiesVerified, RUNTIME_PROBE_ROLES.length, "runtime_probe_identity_count");
  exact(receipt.canonicalStatesVerified, true, "runtime_probe_canonical_state");
  exact(receipt.admittedProtectedOperationAllowed, true, "runtime_probe_admitted");
  exact(receipt.operatorExceptionAllowed, true, "runtime_probe_operator_exception");
  exact(receipt.nonOperatorExceptionDenied, true, "runtime_probe_non_operator_exception");
  if (options.mode === "active") {
    exact(receipt.unadmittedProtectedOperationDenied, true, "runtime_probe_unadmitted");
    exact(receipt.revokedProtectedOperationDenied, true, "runtime_probe_revoked");
    exact(receipt.operatorProtectedOperationDenied, true, "runtime_probe_operator_customer");
  }
  exact(receipt.tokensReturned, false, "runtime_probe_tokens_returned");
  exact(receipt.refreshTokensAccepted, false, "runtime_probe_refresh_tokens");
  exact(receipt.serviceRoleSubstitutionAccepted, false, "runtime_probe_service_role");
  exact(receipt.customerDataReturned, false, "runtime_probe_customer_data");
  const { evidenceSha256, ...unsigned } = receipt;
  if (!/^[0-9a-f]{64}$/.test(evidenceSha256 ?? "") || evidenceSha256 !== sha256(canonicalJson(unsigned))) {
    throw new Error("runtime_probe_receipt_hash_invalid");
  }
  return receipt;
}
