import { chmodSync, closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { buildHammerCapacityEvidence, responseReceipt } from "./lib/hammer-capacity-evidence.mjs";

function safeFailureDiagnostic(error) {
  const message = String(error?.message ?? "");
  if (/^[a-z][a-z0-9_]*(?::[0-9]{3})?$/.test(message)) return message;
  if (/fetch failed/i.test(message)) return "authenticated_api_fetch_failed";
  if (/\bENOENT\b/.test(message)) return "runtime_path_unavailable";
  if (/\b(?:EACCES|EPERM)\b/.test(message)) return "runtime_path_permission_denied";
  if (/\bEEXIST\b/.test(message)) return "private_evidence_output_already_exists";
  return "unclassified";
}
function reportFailure(error) {
  process.stderr.write(`forge_capacity_error=${safeFailureDiagnostic(error)}\n`);
  process.exit(1);
}
process.on("uncaughtException", reportFailure);
process.on("unhandledRejection", reportFailure);

function parse(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error("capacity_argument_invalid");
    result[key.slice(2)] = value;
  }
  return result;
}
async function get(url, token, name, accept = "application/json") {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept, "cache-control": "no-cache" } });
  if (!response.ok) throw new Error(`${name}_request_failed:${response.status}`);
  const payload = accept === "application/json" ? await response.json() : await response.text();
  const receipt = {
    ...responseReceipt(payload, new Date().toISOString()),
    server_response_date: response.headers.get("date"),
    cache_age_seconds: Number(response.headers.get("age") ?? 0),
  };
  return { payload, receipt };
}

const args = parse(process.argv.slice(2));
const netlifyToken = process.env.FORGE_NETLIFY_CAPACITY_READ_TOKEN;
const supabaseToken = process.env.FORGE_SUPABASE_CAPACITY_READ_TOKEN;
if (!netlifyToken || !supabaseToken) throw new Error("managed_capacity_read_credentials_required");
const databaseObservation = JSON.parse(Buffer.from(args["database-observation-base64"] ?? "", "base64url").toString("utf8"));
const attestationPath = resolve(process.cwd(), args["supabase-control-attestation"] ?? "");
const supabaseControlAttestation = JSON.parse(readFileSync(attestationPath, "utf8"));
const requestNonce = Date.now();
const [netlifyAccount, netlifyCredits, supabaseMetrics] = await Promise.all([
  get(`https://api.netlify.com/api/v1/accounts/${encodeURIComponent(args["netlify-team-slug"])}?forge_observed_at=${requestNonce}`, netlifyToken, "netlify_account"),
  get(`https://api.netlify.com/api/v1/${encodeURIComponent(args["netlify-team-slug"])}/billing/credits?forge_observed_at=${requestNonce}`, netlifyToken, "netlify_credits"),
  get(`https://api.supabase.com/v1/projects/${encodeURIComponent(args["supabase-project-ref"])}/analytics/endpoints/metrics`, supabaseToken, "supabase_metrics", "text/plain"),
]);
const observedAt = new Date();
const expiresAt = new Date(observedAt.getTime() + 24 * 60 * 60 * 1_000);
const observation = buildHammerCapacityEvidence({
  netlifyAccount: netlifyAccount.payload,
  netlifyCredits: netlifyCredits.payload,
  supabaseMetrics: supabaseMetrics.payload,
  supabaseControlAttestation,
  databaseObservation,
  observedAt: observedAt.toISOString(),
  expiresAt: expiresAt.toISOString(),
  sourceReceipts: { netlify_account: netlifyAccount.receipt, netlify_credits: netlifyCredits.receipt, supabase_metrics: supabaseMetrics.receipt },
});
const outputName = basename(args["output-name"] ?? "hammer-capacity-evidence.json");
if (outputName !== args["output-name"] || !/^[a-z0-9][a-z0-9._-]*\.json$/.test(outputName)) throw new Error("capacity_output_name_invalid");
const outputDirectory = resolve(process.cwd(), ".git", "forge-private-evidence");
mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
try { chmodSync(outputDirectory, 0o700); } catch {}
const outputPath = resolve(outputDirectory, outputName);
const descriptor = openSync(outputPath, "wx", 0o600);
try { writeFileSync(descriptor, `${JSON.stringify(observation, null, 2)}\n`, "utf8"); } finally { closeSync(descriptor); }
process.stdout.write(`${JSON.stringify({ ok: true, schema: "forge.hammer.capacity-evidence-created.v3", outputPath, evidenceSha256: observation.evidence.evidenceSha256, checkedAt: observation.evidence.checkedAt, expiresAt: observation.evidence.expiresAt, credentialsReturned: false, responseBodiesRetained: false })}\n`);
