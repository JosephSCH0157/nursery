import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  ALL_MOUNT_ROLES,
  resolveCanonicalWorkspaceRolePrefix,
  resolveLegacyOwnerWorkspaceRolePrefix,
} from "../dist/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const ENV_DIRS = [
  REPO_ROOT,
  path.join(REPO_ROOT, "apps", "nursery"),
];
const ENV_FILES = [".env.local", ".env"];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

for (const envDir of ENV_DIRS) {
  for (const envFile of ENV_FILES) {
    loadEnvFile(path.join(envDir, envFile));
  }
}

function readEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseArgs(argv) {
  const args = new Set(argv);
  return {
    apply: args.has("--apply"),
    verbose: args.has("--verbose"),
    workspaceId: readArgValue(argv, "--workspace-id"),
    role: readArgValue(argv, "--role"),
  };
}

function readArgValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index < 0 || index + 1 >= argv.length) return null;
  const value = argv[index + 1]?.trim();
  return value ? value : null;
}

function inferEntryKind(entry) {
  if (typeof entry.id === "string" && entry.id.trim()) return "file";
  const metadata = entry.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const size = metadata.size;
    if (typeof size === "number" && Number.isFinite(size)) return "file";
  }
  return "directory";
}

function joinStoragePath(basePath, name) {
  return basePath ? `${basePath}/${name}` : name;
}

async function listAllFiles(storage, prefix, acc = []) {
  const { data, error } = await storage.list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    const message = String(error.message || "").toLowerCase();
    const statusCode = String(error.statusCode ?? error.status ?? "");
    if (message.includes("not found") || statusCode === "404") {
      return acc;
    }
    throw new Error(`Failed to list ${prefix}: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  for (const row of rows) {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) continue;
    const nextPath = joinStoragePath(prefix, name);
    if (inferEntryKind(row) === "directory") {
      await listAllFiles(storage, nextPath, acc);
    } else {
      acc.push(nextPath);
    }
  }

  return acc;
}

async function existsAtDestination(storage, key) {
  const parent = key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : "";
  const fileName = key.includes("/") ? key.slice(key.lastIndexOf("/") + 1) : key;
  const { data, error } = await storage.list(parent, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    const message = String(error.message || "").toLowerCase();
    const statusCode = String(error.statusCode ?? error.status ?? "");
    if (message.includes("not found") || statusCode === "404") return false;
    throw new Error(`Failed to inspect destination ${key}: ${error.message}`);
  }

  return (Array.isArray(data) ? data : []).some((entry) => {
    return typeof entry.name === "string" && entry.name.trim() === fileName && inferEntryKind(entry) === "file";
  });
}

async function copyObject(storage, fromKey, toKey) {
  const { error } = await storage.copy(fromKey, toKey);
  if (!error) return { copied: true, skipped: false };

  const message = String(error.message || "").toLowerCase();
  if (message.includes("already exists") || message.includes("duplicate")) {
    return { copied: false, skipped: true };
  }
  throw new Error(`Failed to copy ${fromKey} -> ${toKey}: ${error.message}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = readEnv("TONGS_SUPABASE_URL") || readEnv("SUPABASE_URL");
  const serviceRoleKey = readEnv("TONGS_SERVICE_ROLE_KEY") || readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = readEnv("TONGS_WORKPIECE_BUCKET") || "forge-workpieces";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing TONGS_SUPABASE_URL/SUPABASE_URL or TONGS_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  let workspaceQuery = supabase.schema("tongs").from("workspaces").select("id,created_by").order("id", { ascending: true });
  if (args.workspaceId) {
    workspaceQuery = workspaceQuery.eq("id", args.workspaceId);
  }

  const { data: workspaces, error: workspaceError } = await workspaceQuery;
  if (workspaceError) {
    throw new Error(`Failed to load workspaces: ${workspaceError.message}`);
  }

  const roles = args.role ? [args.role] : [...ALL_MOUNT_ROLES];
  for (const role of roles) {
    if (!ALL_MOUNT_ROLES.includes(role)) {
      throw new Error(`Unsupported role ${role}. Expected one of: ${ALL_MOUNT_ROLES.join(", ")}`);
    }
  }

  const storage = supabase.storage.from(bucket);
  const summary = {
    workspaces: 0,
    rolesScanned: 0,
    filesFound: 0,
    filesCopied: 0,
    filesSkipped: 0,
  };

  console.log(`[tongs:migrate-cloud-role-roots] mode=${args.apply ? "apply" : "dry-run"} bucket=${bucket}`);

  for (const workspace of workspaces ?? []) {
    const workspaceId = typeof workspace.id === "string" ? workspace.id : null;
    const ownerUserId = typeof workspace.created_by === "string" ? workspace.created_by : null;
    if (!workspaceId || !ownerUserId) continue;

    summary.workspaces += 1;

    for (const role of roles) {
      const legacyPrefix = resolveLegacyOwnerWorkspaceRolePrefix({
        workspaceId,
        legacyOwnerUserId: ownerUserId,
      }, role);
      const canonicalPrefix = resolveCanonicalWorkspaceRolePrefix(workspaceId, role);
      if (!legacyPrefix || !canonicalPrefix) continue;

      summary.rolesScanned += 1;
      const legacyFiles = await listAllFiles(storage, legacyPrefix, []);
      if (legacyFiles.length === 0) {
        if (args.verbose) {
          console.log(`[tongs:migrate-cloud-role-roots] empty ${workspaceId} ${role}`);
        }
        continue;
      }

      summary.filesFound += legacyFiles.length;

      for (const fromKey of legacyFiles) {
        const relativePath = fromKey.slice(legacyPrefix.length + 1);
        const toKey = `${canonicalPrefix}/${relativePath}`;

        if (!args.apply) {
          console.log(`[dry-run] copy ${fromKey} -> ${toKey}`);
          continue;
        }

        if (await existsAtDestination(storage, toKey)) {
          summary.filesSkipped += 1;
          if (args.verbose) {
            console.log(`[skip] exists ${toKey}`);
          }
          continue;
        }

        const result = await copyObject(storage, fromKey, toKey);
        if (result.copied) {
          summary.filesCopied += 1;
          console.log(`[copied] ${fromKey} -> ${toKey}`);
        } else {
          summary.filesSkipped += 1;
          if (args.verbose) {
            console.log(`[skip] duplicate ${toKey}`);
          }
        }
      }
    }
  }

  console.log("[tongs:migrate-cloud-role-roots] summary", summary);
  if (!args.apply) {
    console.log("[tongs:migrate-cloud-role-roots] dry-run only; rerun with --apply to copy objects");
  }
}

main().catch((error) => {
  console.error("[tongs:migrate-cloud-role-roots] failed", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});