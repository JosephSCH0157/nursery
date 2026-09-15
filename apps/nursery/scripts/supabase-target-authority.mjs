export const SUPABASE_NONPRODUCTION_ALLOWLIST_ENV = "FORGE_NONPROD_SUPABASE_PROJECT_REFS";

function readProjectRef(url) {
  let parsed;
  try {
    parsed = new URL(String(url ?? ""));
  } catch {
    throw new Error("Invalid Supabase target URL.");
  }
  if (["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) return "local";
  const match = /^([a-z0-9-]+)\.supabase\.co$/i.exec(parsed.hostname);
  if (!match?.[1]) throw new Error("Unsupported Supabase host.");
  return match[1].toLowerCase();
}

export function extractSupabaseProjectRef(url) {
  return readProjectRef(url);
}

export function assertMutableSupabaseTarget(url, allowlistRaw, operation = "mutable verification") {
  const projectRef = readProjectRef(url);
  if (projectRef === "local") return projectRef;
  const allowlist = String(allowlistRaw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!allowlist.includes(projectRef)) {
    throw new Error(
      `Refusing ${operation} for unapproved persistent Supabase project ${projectRef}. ` +
      `Add only an approved non-production ref to ${SUPABASE_NONPRODUCTION_ALLOWLIST_ENV}.`,
    );
  }
  return projectRef;
}

export function normalizedSupabaseTargetKey(url) {
  let parsed;
  try {
    parsed = new URL(String(url ?? ""));
  } catch {
    throw new Error("Invalid Supabase target URL.");
  }
  return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.port ? `:${parsed.port}` : ""}`;
}
