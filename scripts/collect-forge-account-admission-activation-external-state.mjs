import crypto from "node:crypto";
import { buildAdmissionActivationExternalState } from "./lib/forge-account-admission-activation-external-state.mjs";

const siteId = "d5c7485d-35eb-4c66-b22d-410b09b38a73";
const projectRef = "wtvdjndyxegudufrompx";
const netlifyToken = process.env.FORGE_NETLIFY_CAPACITY_READ_TOKEN;
const supabaseToken = process.env.FORGE_SUPABASE_CAPACITY_READ_TOKEN;
if (!netlifyToken || !supabaseToken) throw new Error("managed_read_credentials_required");

async function get(url, token, name, accept = "application/json") {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept, "cache-control": "no-cache" },
  });
  if (!response.ok) throw new Error(`${name}_request_failed:${response.status}`);
  const payload = accept === "application/json" ? await response.json() : await response.text();
  return {
    payload,
    receipt: {
      endpoint: new URL(url).pathname,
      status: response.status,
      responseDate: response.headers.get("date"),
      responseSha256: crypto.createHash("sha256").update(typeof payload === "string" ? payload : JSON.stringify(payload)).digest("hex"),
    },
  };
}

const nonce = Date.now();
const siteResult = await get(`https://api.netlify.com/api/v1/sites/${siteId}?forge_observed_at=${nonce}`, netlifyToken, "netlify_site");
const accountSlug = siteResult.payload.account_slug;
if (typeof accountSlug !== "string" || !accountSlug) throw new Error("netlify_account_slug_missing");
const [environmentResult, authResult] = await Promise.all([
  get(`https://api.netlify.com/api/v1/accounts/${encodeURIComponent(accountSlug)}/env?site_id=${siteId}&forge_observed_at=${nonce}`, netlifyToken, "netlify_environment"),
  get(`https://api.supabase.com/v1/projects/${projectRef}/config/auth?forge_observed_at=${nonce}`, supabaseToken, "supabase_auth_config"),
]);

const productionUrl = siteResult.payload.ssl_url ?? siteResult.payload.url;
if (typeof productionUrl !== "string" || !productionUrl.startsWith("https://")) throw new Error("netlify_production_url_invalid");
const healthEntries = await Promise.all(["/", "/login", "/app", "/beta", "/welcome/invitation"].map(async (path) => {
  const response = await fetch(new URL(path, productionUrl), { redirect: "follow", headers: { "cache-control": "no-cache" } });
  const body = path === "/login" ? await response.text() : "";
  return [path, response.status, body];
}));
const health = Object.fromEntries(healthEntries.map(([path, status]) => [path, status]));
const loginBody = healthEntries.find(([path]) => path === "/login")?.[2] ?? "";
health.loginHasGoogleUi = /continue\s+with\s+google|sign\s+in\s+with\s+google/i.test(loginBody);

const result = buildAdmissionActivationExternalState({
  site: siteResult.payload,
  environment: environmentResult.payload,
  authConfig: authResult.payload,
  projectRef,
  observedAt: new Date().toISOString(),
  health,
  receipts: {
    netlifySite: siteResult.receipt,
    netlifyEnvironment: environmentResult.receipt,
    supabaseAuthConfig: authResult.receipt,
  },
});
process.stdout.write(`${JSON.stringify(result)}\n`);
