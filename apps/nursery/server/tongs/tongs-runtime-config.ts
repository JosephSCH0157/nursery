import fs from "node:fs";
import path from "node:path";
import type { TongsCommitApiOptions } from "../../../../packages/tongs/src/workpiece-commit-api.ts";
import { resolveOpenAiImageApiKey } from "../image-runtime-config.ts";

const ENV_FILES = [".env.local", ".env"];
const ENV_ROOT_CANDIDATES = [
  process.cwd(),
  path.join(process.cwd(), "apps", "nursery"),
];

let envLoaded = false;

function loadEnvFile(filePath: string): void {
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

function bootstrapTongsRuntimeEnv(): void {
  if (envLoaded) return;
  for (const envRoot of ENV_ROOT_CANDIDATES) {
    for (const filename of ENV_FILES) {
      loadEnvFile(path.join(envRoot, filename));
    }
  }
  envLoaded = true;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export type ResolvedTongsRuntimeConfig = {
  options: TongsCommitApiOptions;
  missing: string[];
  allowUnsafeNoToken: boolean;
  ownerHearthOpenAiApiKey?: string;
  /** Restricted server-only credential for owner-funded Hearth Runway B-roll. */
  ownerHearthRunwayApiKey?: string;
};

export function resolveTongsRuntimeConfig(): ResolvedTongsRuntimeConfig {
  bootstrapTongsRuntimeEnv();

  const supabaseUrl = readEnv("TONGS_SUPABASE_URL") || readEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = readEnv("TONGS_SERVICE_ROLE_KEY") || readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const apiToken = readEnv("TONGS_API_TOKEN");
  const allowUnsafeNoToken = readEnv("TONGS_ALLOW_UNSAFE_NO_TOKEN") === "1";

  const missing: string[] = [];
  if (!supabaseUrl) missing.push("TONGS_SUPABASE_URL (or SUPABASE_URL)");
  if (!supabaseServiceRoleKey) missing.push("TONGS_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY)");
  if (!apiToken && !allowUnsafeNoToken) missing.push("TONGS_API_TOKEN");

  if (missing.length) {
    return {
      options: {
        supabaseUrl: "",
        supabaseServiceRoleKey: "",
      },
      missing,
      allowUnsafeNoToken,
      ownerHearthOpenAiApiKey: readEnv("OPENAI_HEARTH_OWNER_API_KEY"),
      ownerHearthRunwayApiKey: readEnv("HEARTH_OWNER_RUNWAY_API_KEY"),
    };
  }

  return {
    options: {
      supabaseUrl: supabaseUrl!,
      supabaseServiceRoleKey: supabaseServiceRoleKey!,
      apiToken,
      bucket: readEnv("TONGS_WORKPIECE_BUCKET"),
      openAiImageApiKey: resolveOpenAiImageApiKey() ?? undefined,
      openAiImageModel: readEnv("HEARTH_IMAGE_MODEL") || readEnv("HEARTH_THUMBNAIL_MODEL"),
      runwayApiKey: readEnv("FORGE_BROLL_RUNWAY_API_KEY"),
    },
    missing,
    allowUnsafeNoToken,
    ownerHearthOpenAiApiKey: readEnv("OPENAI_HEARTH_OWNER_API_KEY"),
    ownerHearthRunwayApiKey: readEnv("HEARTH_OWNER_RUNWAY_API_KEY"),
  };
}
