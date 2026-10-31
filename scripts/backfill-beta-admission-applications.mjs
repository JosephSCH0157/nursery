import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

export const APPLY_AUTHORIZATION = "IMPORT-FORGE-BETA-APPLICATIONS";
const AUTHORITY_VERSION = "forge-account-admission-v1";
const API_ROOT = "https://api.netlify.com/api/v1";

export function nextLink(header) {
  if (!header) return null;
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

function text(value, maximum, required = false) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if ((required && !normalized) || normalized.length > maximum) {
    throw new Error("invalid Netlify beta submission field");
  }
  return normalized || null;
}

export function buildBackfillRecord(submission) {
  if (!submission || typeof submission !== "object" || !submission.id) {
    throw new Error("invalid Netlify beta submission");
  }
  const data = submission.data && typeof submission.data === "object" ? submission.data : {};
  const sourceReference = text(data.application_ref, 200) ?? `netlify:${submission.id}`;
  const record = {
    sourceReference,
    email: text(data.email ?? submission.email, 320, true).toLowerCase(),
    name: text(data.name ?? submission.name, 200, true),
    creatorType: text(data.creator_type, 120, true),
    frequency: text(data.frequency, 120, true),
    goals: text(data.goals, 5000, true),
    teleprompterUsed: text(data.teleprompter_used, 1000),
    frustrations: text(data.frustrations, 5000),
    notes: text(data.notes, 5000),
    submittedAt: new Date(submission.created_at).toISOString(),
  };
  const canonical = JSON.stringify({
    source_reference: record.sourceReference,
    email: record.email,
    name: record.name,
    creator_type: record.creatorType,
    frequency: record.frequency,
    goals: record.goals,
    teleprompter_used: record.teleprompterUsed,
    frustrations: record.frustrations,
    notes: record.notes,
  });
  return { ...record, payloadSha256: createHash("sha256").update(canonical).digest("hex") };
}

export async function listAllFormSubmissions({ formId, token, fetchImpl = fetch }) {
  let url = `${API_ROOT}/forms/${encodeURIComponent(formId)}/submissions?per_page=100`;
  const submissions = [];
  while (url) {
    const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Netlify submission read failed (${response.status})`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error("Netlify submission response was not an array");
    submissions.push(...page);
    url = nextLink(response.headers.get("link"));
  }
  return submissions;
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment: ${name}`);
  return value;
}

export async function runBackfill({ argv = process.argv.slice(2), fetchImpl = fetch } = {}) {
  const apply = argv.includes("--apply");
  const authorizationIndex = argv.indexOf("--authorization");
  const authorization = authorizationIndex >= 0 ? argv[authorizationIndex + 1] : null;
  if (apply && authorization !== APPLY_AUTHORIZATION) {
    throw new Error(`Apply requires --authorization ${APPLY_AUTHORIZATION}`);
  }

  const submissions = await listAllFormSubmissions({
    formId: requiredEnvironment("NETLIFY_BETA_FORM_ID"),
    token: requiredEnvironment("NETLIFY_AUTH_TOKEN"),
    fetchImpl,
  });
  const records = submissions.map(buildBackfillRecord);
  const referenceDigest = createHash("sha256")
    .update(records.map((record) => record.sourceReference).sort().join("\n"))
    .digest("hex");

  if (!apply) return { mode: "dry-run", count: records.length, reference_sha256: referenceDigest };

  const client = createClient(requiredEnvironment("SUPABASE_URL"), requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).schema("tongs");
  const version = await client.rpc("account_admission_authority_version");
  if (version.error) throw version.error;
  if (version.data !== AUTHORITY_VERSION) throw new Error("Forge account-admission database dependency is unavailable");

  for (const record of records) {
    const result = await client.rpc("ingest_beta_access_application", {
      p_source_reference: record.sourceReference,
      p_payload_sha256: record.payloadSha256,
      p_email: record.email,
      p_name: record.name,
      p_creator_type: record.creatorType,
      p_frequency: record.frequency,
      p_goals: record.goals,
      p_teleprompter_used: record.teleprompterUsed,
      p_frustrations: record.frustrations,
      p_notes: record.notes,
      p_submitted_at: record.submittedAt,
    });
    if (result.error) throw result.error;
  }
  return { mode: "apply", count: records.length, reference_sha256: referenceDigest };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBackfill()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "Beta admission backfill failed"}\n`);
      process.exitCode = 1;
    });
}
