import { mkdirSync, openSync, writeFileSync, closeSync, chmodSync } from "node:fs";
import { resolve, basename } from "node:path";
import { buildHammerCapacityEvidence, responseReceipt } from "./lib/hammer-capacity-evidence.mjs";

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

async function getJson(url, token, name) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  const responseDate = response.headers.get("date");
  if (!response.ok || !responseDate) throw new Error(`${name}_request_failed:${response.status}`);
  const payload = await response.json();
  return { payload, receipt: responseReceipt(payload, responseDate) };
}

const args = parse(process.argv.slice(2));
const netlifyToken = process.env.FORGE_NETLIFY_CAPACITY_READ_TOKEN;
const supabaseToken = process.env.FORGE_SUPABASE_CAPACITY_READ_TOKEN;
if (!netlifyToken || !supabaseToken) throw new Error("managed_capacity_read_credentials_required");
const databaseObservation = JSON.parse(Buffer.from(args["database-observation-base64"] ?? "", "base64url").toString("utf8"));
const subscriptionUrl = `https://api.supabase.com/platform/organizations/${encodeURIComponent(args["supabase-org-slug"])}/billing/subscription`;
const subscription = await getJson(subscriptionUrl, supabaseToken, "supabase_subscription");
const periodStart = new Date(Number(subscription.payload.current_period_start) * 1_000).toISOString().slice(0, 10);
const periodEnd = new Date().toISOString().slice(0, 10);
const usageUrl = new URL(`https://api.supabase.com/platform/organizations/${encodeURIComponent(args["supabase-org-slug"])}/usage/daily`);
usageUrl.searchParams.set("start", periodStart);
usageUrl.searchParams.set("end", periodEnd);
const [netlifyAccount, netlifyCredits, supabaseDailyUsage] = await Promise.all([
  getJson(`https://api.netlify.com/api/v1/accounts/${encodeURIComponent(args["netlify-team-slug"])}`, netlifyToken, "netlify_account"),
  getJson(`https://api.netlify.com/api/v1/${encodeURIComponent(args["netlify-team-slug"])}/billing/credits`, netlifyToken, "netlify_credits"),
  getJson(usageUrl, supabaseToken, "supabase_daily_usage"),
]);
const observedAt = new Date();
const expiresAt = new Date(observedAt.getTime() + 24 * 60 * 60 * 1_000);
const observation = buildHammerCapacityEvidence({
  netlifyAccount: netlifyAccount.payload,
  netlifyCredits: netlifyCredits.payload,
  supabaseSubscription: subscription.payload,
  supabaseDailyUsage: supabaseDailyUsage.payload,
  databaseObservation,
  observedAt: observedAt.toISOString(),
  expiresAt: expiresAt.toISOString(),
  sourceReceipts: {
    netlify_account: netlifyAccount.receipt,
    netlify_credits: netlifyCredits.receipt,
    supabase_subscription: subscription.receipt,
    supabase_daily_usage: supabaseDailyUsage.receipt,
  },
});
const outputName = basename(args["output-name"] ?? "hammer-capacity-evidence.json");
if (outputName !== args["output-name"] || !/^[a-z0-9][a-z0-9._-]*\.json$/.test(outputName)) throw new Error("capacity_output_name_invalid");
const outputDirectory = resolve(process.cwd(), ".git", "forge-private-evidence");
mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
try { chmodSync(outputDirectory, 0o700); } catch {}
const outputPath = resolve(outputDirectory, outputName);
const descriptor = openSync(outputPath, "wx", 0o600);
try { writeFileSync(descriptor, `${JSON.stringify(observation, null, 2)}\n`, "utf8"); } finally { closeSync(descriptor); }
process.stdout.write(`${JSON.stringify({
  ok: true,
  schema: "forge.hammer.capacity-evidence-created.v2",
  outputPath,
  evidenceSha256: observation.evidence.evidenceSha256,
  checkedAt: observation.evidence.checkedAt,
  expiresAt: observation.evidence.expiresAt,
  credentialsReturned: false,
  responseBodiesRetained: false,
})}\n`);
