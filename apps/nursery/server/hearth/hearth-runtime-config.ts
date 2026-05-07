import fs from "node:fs";
import path from "node:path";
import type { HearthAiLane } from "../../../hearth/src/lib/hearth-ai-runtime-contract";
import { FORGE_ALLOWED_CHAT_MODELS } from "./ai-pricing";

const DEFAULT_STT_MODEL = "gpt-4o-mini-transcribe";
const DEFAULT_STT_BUCKET = "forge-workpieces";
const DEFAULT_CHAT_MODEL = "gpt-5.3";
const DEFAULT_FORGE_TOKEN_BALANCE = 12430;
const ALLOWED_CHAT_MODELS = new Set<string>(FORGE_ALLOWED_CHAT_MODELS);

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
  textApiKey?: string | null;
  imageApiKey?: string | null;
  researchApiKey?: string | null;
  apiKey?: string | null;
  model: string;
  sttModel: string;
  configuredBillingMode: HearthAiLane;
  initialTokenBalance: number | null;
  supabaseUrl: string | null;
  supabaseServiceRoleKey: string | null;
  supabaseRpcKey: string | null;
  sttBucket: string;
  disableForgeLaneAi: boolean;
  disableUserKeys: boolean;
  disableExpensiveAiActions: boolean;
  disableCdcGeneration: boolean;
};

function readBooleanEnv(name: string, defaultValue = false): boolean {
  const raw = readEnv(name);
  if (!raw) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function resolveAllowedChatModel(candidate: string | undefined): string {
  const normalized = candidate?.trim().toLowerCase();
  if (normalized && ALLOWED_CHAT_MODELS.has(normalized)) return normalized;
  return DEFAULT_CHAT_MODEL;
}

export function bootstrapHearthRuntimeEnv(): void {
  if (envLoaded) return;
  for (const envRoot of ENV_ROOT_CANDIDATES) {
    for (const filename of ENV_FILES) {
      loadEnvFile(path.join(envRoot, filename));
    }
  }
  envLoaded = true;
}

export function resolveHearthRuntimeConfig(): HearthRuntimeConfig {
  bootstrapHearthRuntimeEnv();

  const supabaseUrl = readEnv("TONGS_SUPABASE_URL") || readEnv("SUPABASE_URL") || null;
  const supabaseServiceRoleKey = readEnv("TONGS_SERVICE_ROLE_KEY") || readEnv("SUPABASE_SERVICE_ROLE_KEY") || null;
  const textApiKey = readEnv("OPENAI_TEXT_API_KEY") || readEnv("OPENAI_API_KEY") || null;
  const imageApiKey = readEnv("OPENAI_IMAGE_API_KEY") || readEnv("OPENAI_API_KEY") || null;
  const researchApiKey = (
    readEnv("HEARTH_RESEARCH_API_KEY")
    || readEnv("HEARTH_RESEARCH_BRAVE_API_KEY")
    || readEnv("BRAVE_SEARCH_API_KEY")
    || readEnv("BRAVE_API_KEY")
    || null
  );
  const supabaseRpcKey = (
    readEnv("TONGS_SUPABASE_ANON_KEY")
    || readEnv("SUPABASE_ANON_KEY")
    || readEnv("VITE_SUPABASE_ANON_KEY")
    || supabaseServiceRoleKey
    || null
  );

  return {
    textApiKey,
    imageApiKey,
    researchApiKey,
    apiKey: textApiKey,
    model: resolveAllowedChatModel(readEnv("HEARTH_AI_MODEL")),
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
    disableForgeLaneAi: readBooleanEnv("FORGE_AI_DISABLE_FORGE_LANE", false),
    disableUserKeys: readBooleanEnv("FORGE_DISABLE_USER_KEYS", false),
    disableExpensiveAiActions: readBooleanEnv("FORGE_AI_DISABLE_EXPENSIVE_ACTIONS", false),
    disableCdcGeneration: readBooleanEnv("FORGE_AI_DISABLE_CDC_GENERATION", false),
  };
}
