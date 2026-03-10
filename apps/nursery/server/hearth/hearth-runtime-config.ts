import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HearthAiLane } from "../../../hearth/src/lib/hearth-ai-runtime-contract";

const DEFAULT_STT_MODEL = "gpt-4o-mini-transcribe";
const DEFAULT_STT_BUCKET = "forge-workpieces";
const DEFAULT_CHAT_MODEL = "gpt-5";
const DEFAULT_FORGE_TOKEN_BALANCE = 12430;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_ROOT = path.join(__dirname, "..", "..");
const ENV_FILES = [".env.local", ".env"];

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

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readIntegerEnv(name: string): number | null {
  const raw = readEnv(name);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed >= 0 ? parsed : null;
}

export type HearthRuntimeConfig = {
  apiKey: string | null;
  model: string;
  sttModel: string;
  configuredBillingMode: HearthAiLane;
  initialTokenBalance: number | null;
  supabaseUrl: string | null;
  supabaseServiceRoleKey: string | null;
  supabaseRpcKey: string | null;
  sttBucket: string;
};

export function bootstrapHearthRuntimeEnv(): void {
  if (envLoaded) return;
  for (const filename of ENV_FILES) {
    loadEnvFile(path.join(ENV_ROOT, filename));
  }
  envLoaded = true;
}

export function resolveHearthRuntimeConfig(): HearthRuntimeConfig {
  bootstrapHearthRuntimeEnv();

  const supabaseUrl = readEnv("TONGS_SUPABASE_URL") || readEnv("SUPABASE_URL") || null;
  const supabaseServiceRoleKey = readEnv("TONGS_SERVICE_ROLE_KEY") || readEnv("SUPABASE_SERVICE_ROLE_KEY") || null;
  const supabaseRpcKey = (
    readEnv("TONGS_SUPABASE_ANON_KEY")
    || readEnv("SUPABASE_ANON_KEY")
    || readEnv("VITE_SUPABASE_ANON_KEY")
    || supabaseServiceRoleKey
    || null
  );

  return {
    apiKey: readEnv("OPENAI_API_KEY") || null,
    model: readEnv("HEARTH_AI_MODEL") || DEFAULT_CHAT_MODEL,
    sttModel: readEnv("HEARTH_STT_MODEL") || DEFAULT_STT_MODEL,
    configuredBillingMode: readEnv("HEARTH_AI_BILLING_MODE") === "byo" ? "byo" : "forge",
    initialTokenBalance: readIntegerEnv("HEARTH_AI_TOKEN_BALANCE") ?? DEFAULT_FORGE_TOKEN_BALANCE,
    supabaseUrl,
    supabaseServiceRoleKey,
    supabaseRpcKey,
    sttBucket: (
      readEnv("TONGS_WORKPIECE_BUCKET")
      || readEnv("HEARTH_STT_BUCKET")
      || DEFAULT_STT_BUCKET
    ).trim(),
  };
}
