import { resolveForgeUserAccessToken } from "./hearth-chat-api";
import { tongsFetch } from "./tongs-fetch";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FEATURE_CACHE_TTL_MS = 45_000;
const WORKSPACE_FEATURES_STORAGE_KEY = "forge:workspace-features:changed:v1";
export const WORKSPACE_FEATURES_CHANGED_EVENT = "forge:workspace-features:changed";
const FEATURE_CACHE = new Map<string, FeatureCacheEntry>();
const STYLE_PROFILE_CACHE = new Map<string, StyleProfile | null>();
const WRITING_PROFILE_CACHE = new Map<string, WritingProfile | null>();
const ALIGNMENT_PAUSE_PREFIX = "hearth:style-alignment-paused:v1:";
let workspaceFeatureSyncInitialized = false;

export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

export function selectSupabaseConfigAuthority(input: {
  runtimeClient?: { url?: unknown; anonKey?: unknown } | null;
  runtimeGlobal?: { url?: unknown; anonKey?: unknown } | null;
  compileTime?: { url?: unknown; anonKey?: unknown } | null;
}): SupabaseConfig | null {
  for (const candidate of [input.runtimeClient, input.runtimeGlobal, input.compileTime]) {
    const url = readTokenString(candidate?.url);
    const anonKey = readTokenString(candidate?.anonKey);
    if (url && anonKey) return { url, anonKey };
  }
  return null;
}

type RpcFailure = {
  ok: false;
  status: number;
  error: string;
};

type RpcSuccess<T> = {
  ok: true;
  status: number;
  data: T;
};

export type WorkspaceFeatures = {
  workspaceId: string;
  adaptiveStyleAlignmentEnabled: boolean;
  adaptiveStyleAiAccelerateEnabled: boolean;
};

type FeatureCacheEntry = {
  data: WorkspaceFeatures;
  fetchedAtMs: number;
};

export type WorkspaceFeaturesChangedEventDetail = {
  workspaceId: string;
  features: WorkspaceFeatures;
  origin: "rpc" | "storage";
};

export type StyleMetrics = {
  avgSentenceLength: number;
  sentenceLengthVariance: number;
  pausePer1000Words: number;
  reflectivePauseRatio: number;
  avgS1BlockLength: number;
  avgS2BlockLength: number;
  structuralIntentVector: Record<string, number>;
};

export type StyleProfile = {
  workspaceId: string;
  userId: string;
  avgSentenceLength: number;
  sentenceLengthVariance: number;
  pausePer1000Words: number;
  reflectivePauseRatio: number;
  avgS1BlockLength: number;
  avgS2BlockLength: number;
  structuralIntentVector: Record<string, number>;
  adaptationWeight: number;
  scriptsAnalyzedCount: number;
  lastUpdated: string | null;
};

export type WritingProfile = {
  workspaceId: string;
  userId: string;
  defaultAudience: string | null;
  defaultStructure: string | null;
  styleNotes: string | null;
  lastUsedTonePreset: string | null;
  updatedAt: string | null;
};

export type WritingProfileInput = {
  defaultAudience?: string | null;
  defaultStructure?: string | null;
  styleNotes?: string | null;
};

export type StyleSampleSourceKind = "upload" | "paste" | "forge_script" | "forge_transcript" | "other";

export type StyleSample = {
  sampleId: string;
  workspaceId: string;
  userId: string;
  sourceKind: StyleSampleSourceKind;
  sourceLabel: string | null;
  sourceWorkpieceId: string | null;
  sourcePath: string | null;
  content: string;
  contentChars: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type StyleSampleInput = {
  sourceKind: StyleSampleSourceKind;
  sourceLabel?: string | null;
  sourceWorkpieceId?: string | null;
  sourcePath?: string | null;
  content: string;
};

export type RecentScriptReference = {
  workspaceId: string;
  workpieceId: string;
  scriptPath: string;
  title: string;
  markedReadyAt: string | null;
};

export type StyleUpdateResult =
  | {
      ok: true;
      skipped: true;
      reason: "missing_workspace" | "empty_script" | "feature_disabled" | "paused";
      features: WorkspaceFeatures | null;
    }
  | {
      ok: true;
      skipped: false;
      features: WorkspaceFeatures;
      metrics: StyleMetrics;
      profile: StyleProfile;
      insights: string[];
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

type WorkspaceFeaturesRpcRow = {
  workspace_id?: unknown;
  adaptive_style_alignment_enabled?: unknown;
  adaptive_style_ai_accelerate_enabled?: unknown;
};

type ReferenceMaterialRolloutRpcRow = {
  workspace_id?: unknown;
  reference_material_review_enabled?: unknown;
};

export type ReferenceMaterialRollout = {
  workspaceId: string;
  enabled: boolean;
};

type StyleProfileRpcRow = {
  workspace_id?: unknown;
  user_id?: unknown;
  avg_sentence_length?: unknown;
  sentence_length_variance?: unknown;
  pause_per_1000_words?: unknown;
  reflective_pause_ratio?: unknown;
  avg_s1_block_length?: unknown;
  avg_s2_block_length?: unknown;
  structural_intent_vector?: unknown;
  adaptation_weight?: unknown;
  scripts_analyzed_count?: unknown;
  last_updated?: unknown;
};

type WritingProfileRpcRow = {
  workspace_id?: unknown;
  user_id?: unknown;
  default_audience?: unknown;
  default_structure?: unknown;
  style_notes?: unknown;
  last_used_tone_preset?: unknown;
  updated_at?: unknown;
};

type StyleSampleRpcRow = {
  sample_id?: unknown;
  workspace_id?: unknown;
  user_id?: unknown;
  source_kind?: unknown;
  source_label?: unknown;
  source_workpiece_id?: unknown;
  source_path?: unknown;
  content?: unknown;
  content_chars?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

type RecentScriptReferenceRpcRow = {
  workspace_id?: unknown;
  workpiece_id?: unknown;
  script_path?: unknown;
  title?: unknown;
  marked_ready_at?: unknown;
};

type RpcErrorPayload = {
  message?: unknown;
  error?: unknown;
};

type WorkspaceFeatureBroadcastPayload = {
  workspace_id?: unknown;
  adaptive_style_alignment_enabled?: unknown;
  adaptive_style_ai_accelerate_enabled?: unknown;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function normalizeUuid(value: unknown): string | null {
  const text = readString(value);
  if (!text) return null;
  return UUID_RE.test(text) ? text.toLowerCase() : null;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function readTokenString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cacheWorkspaceFeatures(features: WorkspaceFeatures): void {
  FEATURE_CACHE.set(features.workspaceId, {
    data: features,
    fetchedAtMs: Date.now(),
  });
}

function readCachedWorkspaceFeatures(workspaceId: string): WorkspaceFeatures | null {
  const cached = FEATURE_CACHE.get(workspaceId);
  if (!cached) return null;
  if ((Date.now() - cached.fetchedAtMs) > FEATURE_CACHE_TTL_MS) {
    FEATURE_CACHE.delete(workspaceId);
    return null;
  }
  return cached.data;
}

function toWorkspaceFeaturesFromBroadcastPayload(payload: unknown): WorkspaceFeatures | null {
  if (!isRecord(payload)) return null;
  const raw = payload as WorkspaceFeatureBroadcastPayload;
  const workspaceId = normalizeUuid(raw.workspace_id);
  if (!workspaceId) return null;
  return {
    workspaceId,
    adaptiveStyleAlignmentEnabled: raw.adaptive_style_alignment_enabled === true,
    adaptiveStyleAiAccelerateEnabled: raw.adaptive_style_ai_accelerate_enabled === true,
  };
}

function dispatchWorkspaceFeaturesChanged(detail: WorkspaceFeaturesChangedEventDetail): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent<WorkspaceFeaturesChangedEventDetail>(WORKSPACE_FEATURES_CHANGED_EVENT, {
      detail,
    }));
  } catch {
    // ignore event dispatch failures
  }
}

function broadcastWorkspaceFeaturesChanged(features: WorkspaceFeatures): void {
  if (typeof window === "undefined") return;
  try {
    const payload = {
      workspace_id: features.workspaceId,
      adaptive_style_alignment_enabled: features.adaptiveStyleAlignmentEnabled,
      adaptive_style_ai_accelerate_enabled: features.adaptiveStyleAiAccelerateEnabled,
      emitted_at: new Date().toISOString(),
      nonce: Math.random().toString(36).slice(2),
    };
    window.localStorage.setItem(WORKSPACE_FEATURES_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage write failures
  }
}

function ensureWorkspaceFeatureSync(): void {
  if (workspaceFeatureSyncInitialized) return;
  if (typeof window === "undefined") return;
  workspaceFeatureSyncInitialized = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== WORKSPACE_FEATURES_STORAGE_KEY) return;
    if (!event.newValue) return;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(event.newValue);
    } catch {
      return;
    }
    const features = toWorkspaceFeaturesFromBroadcastPayload(parsed);
    if (!features) return;
    cacheWorkspaceFeatures(features);
    STYLE_PROFILE_CACHE.delete(features.workspaceId);
    dispatchWorkspaceFeaturesChanged({
      workspaceId: features.workspaceId,
      features,
      origin: "storage",
    });
  });
}

function readSupabaseConfig(): SupabaseConfig | null {
  const meta = import.meta as unknown as {
    env?: Record<string, string | undefined>;
  };
  const compileTime = { url: meta.env?.VITE_SUPABASE_URL, anonKey: meta.env?.VITE_SUPABASE_ANON_KEY };
  if (typeof window === "undefined") return selectSupabaseConfigAuthority({ compileTime });
  const runtimeWindow = window as Window & typeof globalThis & {
    __forgeSupabaseUrl?: unknown;
    __forgeSupabaseAnonKey?: unknown;
    __tpSupabaseUrl?: unknown;
    __tpSupabaseAnonKey?: unknown;
    __forge_supabase_client__?: {
      supabaseUrl?: unknown;
      supabaseKey?: unknown;
    };
  };

  return selectSupabaseConfigAuthority({
    runtimeClient: { url: runtimeWindow.__forge_supabase_client__?.supabaseUrl, anonKey: runtimeWindow.__forge_supabase_client__?.supabaseKey },
    runtimeGlobal: {
      url: readTokenString(runtimeWindow.__forgeSupabaseUrl) ?? readTokenString(runtimeWindow.__tpSupabaseUrl),
      anonKey: readTokenString(runtimeWindow.__forgeSupabaseAnonKey) ?? readTokenString(runtimeWindow.__tpSupabaseAnonKey),
    },
    compileTime,
  });
}

function readRpcError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const row = payload as RpcErrorPayload;
  return readString(row.message) ?? readString(row.error) ?? fallback;
}

async function callTongsRpc<T>(
  fn: string,
  params: Record<string, unknown>,
): Promise<RpcSuccess<T> | RpcFailure> {
  const config = readSupabaseConfig();
  if (!config) {
    return {
      ok: false,
      status: 500,
      error: "Supabase config missing.",
    };
  }

  const accessToken = await resolveForgeUserAccessToken();
  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "Sign in required.",
    };
  }

  const headers = new Headers();
  headers.set("apikey", config.anonKey);
  headers.set("authorization", `Bearer ${accessToken}`);
  headers.set("accept-profile", "tongs");
  headers.set("content-profile", "tongs");
  headers.set("content-type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/${encodeURIComponent(fn)}`, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Network error",
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readRpcError(payload, `RPC ${fn} failed (${response.status})`),
    };
  }

  return {
    ok: true,
    status: response.status,
    data: payload as T,
  };
}

function toWorkspaceFeatures(row: unknown, fallbackWorkspaceId: string): WorkspaceFeatures {
  const raw = (Array.isArray(row) ? row[0] : row) as WorkspaceFeaturesRpcRow | undefined;
  const workspaceId = normalizeUuid(raw?.workspace_id) ?? fallbackWorkspaceId;
  return {
    workspaceId,
    adaptiveStyleAlignmentEnabled: raw?.adaptive_style_alignment_enabled === true,
    adaptiveStyleAiAccelerateEnabled: raw?.adaptive_style_ai_accelerate_enabled === true,
  };
}

function toStyleProfile(row: unknown, workspaceId: string): StyleProfile | null {
  const raw = (Array.isArray(row) ? row[0] : row) as StyleProfileRpcRow | undefined;
  if (!raw || typeof raw !== "object") return null;
  const resolvedWorkspaceId = normalizeUuid(raw.workspace_id) ?? workspaceId;
  const userId = normalizeUuid(raw.user_id);
  if (!resolvedWorkspaceId || !userId) return null;

  const vectorRaw = raw.structural_intent_vector;
  const vector: Record<string, number> = {};
  if (vectorRaw && typeof vectorRaw === "object" && !Array.isArray(vectorRaw)) {
    for (const [key, value] of Object.entries(vectorRaw as Record<string, unknown>)) {
      const numberValue = readNumber(value);
      if (numberValue == null) continue;
      vector[key] = numberValue;
    }
  }

  return {
    workspaceId: resolvedWorkspaceId,
    userId,
    avgSentenceLength: Math.max(0, readNumber(raw.avg_sentence_length) ?? 0),
    sentenceLengthVariance: Math.max(0, readNumber(raw.sentence_length_variance) ?? 0),
    pausePer1000Words: Math.max(0, readNumber(raw.pause_per_1000_words) ?? 0),
    reflectivePauseRatio: clamp(readNumber(raw.reflective_pause_ratio) ?? 0, 0, 1),
    avgS1BlockLength: Math.max(0, readNumber(raw.avg_s1_block_length) ?? 0),
    avgS2BlockLength: Math.max(0, readNumber(raw.avg_s2_block_length) ?? 0),
    structuralIntentVector: vector,
    adaptationWeight: clamp(readNumber(raw.adaptation_weight) ?? 0.15, 0.01, 1),
    scriptsAnalyzedCount: Math.max(0, Math.floor(readNumber(raw.scripts_analyzed_count) ?? 0)),
    lastUpdated: readString(raw.last_updated),
  };
}

function toWritingProfile(row: unknown, workspaceId: string): WritingProfile | null {
  const raw = (Array.isArray(row) ? row[0] : row) as WritingProfileRpcRow | undefined;
  if (!raw || typeof raw !== "object") return null;
  const resolvedWorkspaceId = normalizeUuid(raw.workspace_id) ?? workspaceId;
  const userId = normalizeUuid(raw.user_id);
  if (!resolvedWorkspaceId || !userId) return null;
  return {
    workspaceId: resolvedWorkspaceId,
    userId,
    defaultAudience: readString(raw.default_audience),
    defaultStructure: readString(raw.default_structure),
    styleNotes: readString(raw.style_notes),
    lastUsedTonePreset: readString(raw.last_used_tone_preset),
    updatedAt: readString(raw.updated_at),
  };
}

function normalizeStyleSampleSourceKind(value: unknown): StyleSampleSourceKind | null {
  const kind = readString(value)?.toLowerCase() ?? null;
  if (kind === "upload") return "upload";
  if (kind === "paste") return "paste";
  if (kind === "forge_script") return "forge_script";
  if (kind === "forge_transcript") return "forge_transcript";
  if (kind === "other") return "other";
  return null;
}

function normalizeRelativePath(value: unknown): string | null {
  const path = readString(value);
  if (!path) return null;
  if (path.startsWith("/")) return null;
  if (path.includes("..")) return null;
  if (path.includes("\\")) return null;
  return path;
}

function toStyleSample(row: unknown, workspaceId: string): StyleSample | null {
  const raw = row as StyleSampleRpcRow | null | undefined;
  if (!raw || typeof raw !== "object") return null;
  const sampleId = normalizeUuid(raw.sample_id);
  const resolvedWorkspaceId = normalizeUuid(raw.workspace_id) ?? workspaceId;
  const userId = normalizeUuid(raw.user_id);
  const sourceKind = normalizeStyleSampleSourceKind(raw.source_kind) ?? "other";
  const contentRaw = typeof raw.content === "string" ? raw.content : "";
  const content = contentRaw.trim();
  if (!sampleId || !resolvedWorkspaceId || !userId || !content) return null;

  return {
    sampleId,
    workspaceId: resolvedWorkspaceId,
    userId,
    sourceKind,
    sourceLabel: readString(raw.source_label),
    sourceWorkpieceId: normalizeUuid(raw.source_workpiece_id),
    sourcePath: normalizeRelativePath(raw.source_path),
    content,
    contentChars: Math.max(0, Math.floor(readNumber(raw.content_chars) ?? content.length)),
    createdAt: readString(raw.created_at),
    updatedAt: readString(raw.updated_at),
  };
}

function toRecentScriptReference(row: unknown, workspaceId: string): RecentScriptReference | null {
  const raw = row as RecentScriptReferenceRpcRow | null | undefined;
  if (!raw || typeof raw !== "object") return null;
  const resolvedWorkspaceId = normalizeUuid(raw.workspace_id) ?? workspaceId;
  const workpieceId = normalizeUuid(raw.workpiece_id);
  const scriptPath = normalizeRelativePath(raw.script_path);
  if (!resolvedWorkspaceId || !workpieceId || !scriptPath) return null;
  return {
    workspaceId: resolvedWorkspaceId,
    workpieceId,
    scriptPath,
    title: readString(raw.title) ?? `Episode ${workpieceId.slice(0, 8)}`,
    markedReadyAt: readString(raw.marked_ready_at),
  };
}

function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const matches = normalized.match(/[^.!?]+[.!?]*/g) ?? [];
  const out = matches
    .map((line) => line.trim())
    .filter(Boolean);
  if (out.length > 0) return out;
  return normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function average(values: readonly number[]): number {
  if (!values.length) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function variance(values: readonly number[], avg: number): number {
  if (!values.length) return 0;
  const total = values.reduce((sum, value) => {
    const delta = value - avg;
    return sum + (delta * delta);
  }, 0);
  return total / values.length;
}

function averageSpeakerBlockLength(text: string, speaker: "s1" | "s2"): number {
  const regex = new RegExp(`\\[${speaker}\\]([\\s\\S]*?)\\[\\/${speaker}\\]`, "gi");
  const lengths: number[] = [];
  let match = regex.exec(text);
  while (match) {
    const body = match[1] ?? "";
    const words = tokenizeWords(body);
    if (words.length) lengths.push(words.length);
    match = regex.exec(text);
  }
  return average(lengths);
}

function computeStructuralIntentVector(text: string): Record<string, number> {
  const lower = text.toLowerCase();
  const counts = {
    hook: 0,
    evidence: 0,
    narrative: 0,
    close: 0,
  };

  const groups: Record<keyof typeof counts, RegExp[]> = {
    hook: [/\bintro\b/g, /\bhook\b/g, /\bcold open\b/g, /\blead\b/g],
    evidence: [/\bsource\b/g, /\bcite\b/g, /\bevidence\b/g, /\baccording to\b/g],
    narrative: [/\bstory\b/g, /\bexample\b/g, /\bpoint\b/g, /\bsegment\b/g],
    close: [/\bclose\b/g, /\boutro\b/g, /\bcall to action\b/g, /\bcta\b/g, /\bwrap\b/g],
  };

  for (const [intent, patterns] of Object.entries(groups) as Array<[keyof typeof counts, RegExp[]]>) {
    let total = 0;
    for (const pattern of patterns) {
      const matches = lower.match(pattern);
      total += matches ? matches.length : 0;
    }
    counts[intent] = total;
  }

  const sum = Object.values(counts).reduce((acc, value) => acc + value, 0);
  if (sum <= 0) {
    return {
      hook: 0.25,
      evidence: 0.25,
      narrative: 0.25,
      close: 0.25,
    };
  }

  return {
    hook: counts.hook / sum,
    evidence: counts.evidence / sum,
    narrative: counts.narrative / sum,
    close: counts.close / sum,
  };
}

export function extractStyleMetrics(scriptText: string): StyleMetrics {
  const text = scriptText.trim();
  if (!text) {
    return {
      avgSentenceLength: 0,
      sentenceLengthVariance: 0,
      pausePer1000Words: 0,
      reflectivePauseRatio: 0,
      avgS1BlockLength: 0,
      avgS2BlockLength: 0,
      structuralIntentVector: {
        hook: 0.25,
        evidence: 0.25,
        narrative: 0.25,
        close: 0.25,
      },
    };
  }

  const sentences = splitSentences(text);
  const sentenceLengths = sentences
    .map((sentence) => tokenizeWords(sentence).length)
    .filter((count) => count > 0);

  const avgSentenceLength = average(sentenceLengths);
  const sentenceLengthVariance = variance(sentenceLengths, avgSentenceLength);
  const totalWords = tokenizeWords(text).length;
  const pauseCount = (text.match(/\[(pause|beat|reflective pause)\]/gi) ?? []).length;
  const reflectivePauseCount = (text.match(/\[reflective pause\]/gi) ?? []).length;
  const pausePer1000Words = totalWords > 0 ? (pauseCount * 1000) / totalWords : 0;
  const reflectivePauseRatio = pauseCount > 0 ? reflectivePauseCount / pauseCount : 0;
  const avgS1BlockLength = averageSpeakerBlockLength(text, "s1");
  const avgS2BlockLength = averageSpeakerBlockLength(text, "s2");
  const structuralIntentVector = computeStructuralIntentVector(text);

  return {
    avgSentenceLength,
    sentenceLengthVariance,
    pausePer1000Words,
    reflectivePauseRatio,
    avgS1BlockLength,
    avgS2BlockLength,
    structuralIntentVector,
  };
}

function dominantIntentLabel(vector: Record<string, number>): string | null {
  const entries = Object.entries(vector).filter((entry) => Number.isFinite(entry[1]));
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  if (entries[0][1] <= 0) return null;
  const key = entries[0][0];
  if (key === "hook") return "You open with clear hooks.";
  if (key === "evidence") return "You lean heavily on evidence and source framing.";
  if (key === "narrative") return "You favor narrative progression.";
  if (key === "close") return "You prioritize strong closes and takeaways.";
  return null;
}

export function translateStyleProfileInsights(profile: StyleProfile): string[] {
  const lines: string[] = [];
  if (profile.avgSentenceLength < 12) {
    lines.push("You favor punchy sentences.");
  } else if (profile.avgSentenceLength > 24) {
    lines.push("You prefer long-form, flowing sentences.");
  } else {
    lines.push("You keep sentence length balanced.");
  }

  if (profile.pausePer1000Words >= 14) {
    lines.push("You lean into pacing markers during emphasis.");
  } else if (profile.pausePer1000Words <= 4) {
    lines.push("You keep pacing markers light and sparse.");
  } else {
    lines.push("You use pacing markers in moderation.");
  }

  if (profile.reflectivePauseRatio >= 0.45) {
    lines.push("You often use reflective pauses for tone control.");
  }

  const blockDelta = Math.abs(profile.avgS1BlockLength - profile.avgS2BlockLength);
  if (blockDelta <= 12 && profile.avgS1BlockLength > 0 && profile.avgS2BlockLength > 0) {
    lines.push("Speaker balance is currently even.");
  } else if (profile.avgS1BlockLength > profile.avgS2BlockLength) {
    lines.push("S1 blocks run longer than S2 blocks.");
  } else if (profile.avgS2BlockLength > profile.avgS1BlockLength) {
    lines.push("S2 blocks run longer than S1 blocks.");
  }

  const intent = dominantIntentLabel(profile.structuralIntentVector);
  if (intent) lines.push(intent);
  return lines;
}

export function isAdaptiveStyleEnabled(features: WorkspaceFeatures | null): boolean {
  return features?.adaptiveStyleAlignmentEnabled === true;
}

export function isAdaptiveStyleAccelerateEnabled(features: WorkspaceFeatures | null): boolean {
  return features?.adaptiveStyleAiAccelerateEnabled === true;
}

export function clearWorkspaceFeatureCache(workspaceId?: string | null): void {
  const normalized = normalizeUuid(workspaceId);
  if (!normalized) {
    FEATURE_CACHE.clear();
    STYLE_PROFILE_CACHE.clear();
    WRITING_PROFILE_CACHE.clear();
    return;
  }
  FEATURE_CACHE.delete(normalized);
  STYLE_PROFILE_CACHE.delete(normalized);
  WRITING_PROFILE_CACHE.delete(normalized);
}

export type ResolveWorkspaceIdFromSearchOptions = {
  allowLocalStorageFallback?: boolean;
};

export function resolveWorkspaceIdFromSearch(
  search: string,
  options?: ResolveWorkspaceIdFromSearchOptions,
): string | null {
  try {
    const params = new URLSearchParams(search);
    const fromQuery = normalizeUuid(
      params.get("workspace_id")
      ?? params.get("workspaceId")
      ?? params.get("workspace"),
    );
    if (fromQuery) return fromQuery;
  } catch {
    // ignore parsing failures
  }

  if (!options?.allowLocalStorageFallback) return null;
  if (typeof window === "undefined") return null;
  try {
    return normalizeUuid(window.localStorage.getItem("forge_workspace_id_v1"));
  } catch {
    return null;
  }
}

export function resolveWorkspaceIdFromSearchWithFallback(search: string): string | null {
  return resolveWorkspaceIdFromSearch(search, { allowLocalStorageFallback: true });
}

export function isStyleAlignmentPaused(workspaceId: string | null): boolean {
  const normalized = normalizeUuid(workspaceId);
  if (!normalized || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(`${ALIGNMENT_PAUSE_PREFIX}${normalized}`) === "1";
  } catch {
    return false;
  }
}

export function setStyleAlignmentPaused(workspaceId: string | null, paused: boolean): void {
  const normalized = normalizeUuid(workspaceId);
  if (!normalized || typeof window === "undefined") return;
  try {
    const key = `${ALIGNMENT_PAUSE_PREFIX}${normalized}`;
    if (paused) {
      window.localStorage.setItem(key, "1");
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore storage failures
  }
}

export async function getWorkspaceFeatures(
  workspaceId: string,
  options?: { force?: boolean },
): Promise<RpcSuccess<WorkspaceFeatures> | RpcFailure> {
  ensureWorkspaceFeatureSync();
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) {
    return { ok: false, status: 400, error: "workspace_id is required." };
  }

  if (!options?.force) {
    const cached = readCachedWorkspaceFeatures(normalizedWorkspaceId);
    if (cached) {
      return { ok: true, status: 200, data: cached };
    }
  }

  const rpc = await callTongsRpc<WorkspaceFeaturesRpcRow[] | WorkspaceFeaturesRpcRow>(
    "get_my_workspace_features",
    { p_workspace_id: normalizedWorkspaceId },
  );
  if (!rpc.ok) return rpc;

  const features = toWorkspaceFeatures(rpc.data, normalizedWorkspaceId);
  cacheWorkspaceFeatures(features);
  return {
    ok: true,
    status: rpc.status,
    data: features,
  };
}

export async function getReferenceMaterialRollout(
  workspaceId: string,
): Promise<RpcSuccess<ReferenceMaterialRollout> | RpcFailure> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) {
    return { ok: false, status: 400, error: "workspace_id is required." };
  }

  const rpc = await callTongsRpc<ReferenceMaterialRolloutRpcRow[] | ReferenceMaterialRolloutRpcRow>(
    "get_my_reference_material_rollout",
    { p_workspace_id: normalizedWorkspaceId },
  );
  if (!rpc.ok) return rpc;

  const raw = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as
    | ReferenceMaterialRolloutRpcRow
    | undefined;
  return {
    ok: true,
    status: rpc.status,
    data: {
      workspaceId: normalizeUuid(raw?.workspace_id) ?? normalizedWorkspaceId,
      enabled: raw?.reference_material_review_enabled === true,
    },
  };
}

export async function setAdaptiveStyleFeatures(
  workspaceId: string,
  flags: {
    alignmentEnabled: boolean;
    aiAccelerateEnabled: boolean;
  },
): Promise<RpcSuccess<WorkspaceFeatures> | RpcFailure> {
  ensureWorkspaceFeatureSync();
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) {
    return { ok: false, status: 400, error: "workspace_id is required." };
  }

  const rpc = await callTongsRpc<WorkspaceFeaturesRpcRow[] | WorkspaceFeaturesRpcRow>(
    "set_adaptive_style_features",
    {
      p_workspace_id: normalizedWorkspaceId,
      p_alignment_enabled: flags.alignmentEnabled,
      p_ai_accelerate_enabled: flags.aiAccelerateEnabled,
    },
  );
  if (!rpc.ok) return rpc;

  const features = toWorkspaceFeatures(rpc.data, normalizedWorkspaceId);
  cacheWorkspaceFeatures(features);
  STYLE_PROFILE_CACHE.delete(normalizedWorkspaceId);
  dispatchWorkspaceFeaturesChanged({
    workspaceId: normalizedWorkspaceId,
    features,
    origin: "rpc",
  });
  broadcastWorkspaceFeaturesChanged(features);
  return {
    ok: true,
    status: rpc.status,
    data: features,
  };
}

export async function getStyleProfile(
  workspaceId: string,
  options?: { force?: boolean },
): Promise<RpcSuccess<StyleProfile | null> | RpcFailure> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) {
    return { ok: false, status: 400, error: "workspace_id is required." };
  }

  if (!options?.force && STYLE_PROFILE_CACHE.has(normalizedWorkspaceId)) {
    return {
      ok: true,
      status: 200,
      data: STYLE_PROFILE_CACHE.get(normalizedWorkspaceId) ?? null,
    };
  }

  const rpc = await callTongsRpc<StyleProfileRpcRow[] | StyleProfileRpcRow>(
    "get_my_style_profile",
    { p_workspace_id: normalizedWorkspaceId },
  );
  if (!rpc.ok) return rpc;

  const profile = toStyleProfile(rpc.data, normalizedWorkspaceId);
  STYLE_PROFILE_CACHE.set(normalizedWorkspaceId, profile);
  return {
    ok: true,
    status: rpc.status,
    data: profile,
  };
}

export async function getMyWritingProfile(
  workspaceId: string,
  options?: { force?: boolean },
): Promise<RpcSuccess<WritingProfile | null> | RpcFailure> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) {
    return { ok: false, status: 400, error: "workspace_id is required." };
  }

  if (!options?.force && WRITING_PROFILE_CACHE.has(normalizedWorkspaceId)) {
    return {
      ok: true,
      status: 200,
      data: WRITING_PROFILE_CACHE.get(normalizedWorkspaceId) ?? null,
    };
  }

  const rpc = await callTongsRpc<WritingProfileRpcRow[] | WritingProfileRpcRow>(
    "get_my_writing_profile",
    { p_workspace_id: normalizedWorkspaceId },
  );
  if (!rpc.ok) return rpc;

  const profile = toWritingProfile(rpc.data, normalizedWorkspaceId);
  WRITING_PROFILE_CACHE.set(normalizedWorkspaceId, profile);
  return {
    ok: true,
    status: rpc.status,
    data: profile,
  };
}

export async function saveMyWritingProfile(
  workspaceId: string,
  input: WritingProfileInput,
): Promise<RpcSuccess<WritingProfile> | RpcFailure> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) {
    return { ok: false, status: 400, error: "workspace_id is required." };
  }

  const rpc = await callTongsRpc<WritingProfileRpcRow[] | WritingProfileRpcRow>(
    "set_my_writing_profile",
    {
      p_workspace_id: normalizedWorkspaceId,
      p_default_audience: input.defaultAudience ?? null,
      p_default_structure: input.defaultStructure ?? null,
      p_style_notes: input.styleNotes ?? null,
    },
  );
  if (!rpc.ok) return rpc;

  const profile = toWritingProfile(rpc.data, normalizedWorkspaceId);
  if (!profile) {
    return {
      ok: false,
      status: 502,
      error: "Writing profile update returned an invalid payload.",
    };
  }
  WRITING_PROFILE_CACHE.set(normalizedWorkspaceId, profile);
  return {
    ok: true,
    status: rpc.status,
    data: profile,
  };
}

export async function resetMyWritingProfile(
  workspaceId: string,
): Promise<RpcSuccess<WritingProfile> | RpcFailure> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) {
    return { ok: false, status: 400, error: "workspace_id is required." };
  }

  const rpc = await callTongsRpc<WritingProfileRpcRow[] | WritingProfileRpcRow>(
    "reset_my_writing_profile",
    { p_workspace_id: normalizedWorkspaceId },
  );
  if (!rpc.ok) return rpc;

  const profile = toWritingProfile(rpc.data, normalizedWorkspaceId);
  if (!profile) {
    return {
      ok: false,
      status: 502,
      error: "Writing profile reset returned an invalid payload.",
    };
  }

  WRITING_PROFILE_CACHE.set(normalizedWorkspaceId, profile);
  return {
    ok: true,
    status: rpc.status,
    data: profile,
  };
}

export async function setMyWritingTonePreset(
  workspaceId: string,
  tonePreset: string,
): Promise<RpcSuccess<WritingProfile> | RpcFailure> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) {
    return { ok: false, status: 400, error: "workspace_id is required." };
  }
  const normalizedTonePreset = readString(tonePreset);
  if (!normalizedTonePreset) {
    return { ok: false, status: 400, error: "tone_preset is required." };
  }

  const rpc = await callTongsRpc<WritingProfileRpcRow[] | WritingProfileRpcRow>(
    "set_my_writing_tone_preset",
    {
      p_workspace_id: normalizedWorkspaceId,
      p_tone_preset: normalizedTonePreset,
    },
  );
  if (!rpc.ok) return rpc;

  const profile = toWritingProfile(rpc.data, normalizedWorkspaceId);
  if (!profile) {
    return {
      ok: false,
      status: 502,
      error: "Writing tone preset update returned an invalid payload.",
    };
  }

  WRITING_PROFILE_CACHE.set(normalizedWorkspaceId, profile);
  return {
    ok: true,
    status: rpc.status,
    data: profile,
  };
}

export async function addMyStyleSample(
  workspaceId: string,
  input: StyleSampleInput,
): Promise<RpcSuccess<StyleSample> | RpcFailure> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) {
    return { ok: false, status: 400, error: "workspace_id is required." };
  }

  const sourceKind = normalizeStyleSampleSourceKind(input.sourceKind);
  if (!sourceKind) {
    return { ok: false, status: 400, error: "source_kind is required." };
  }

  const content = readString(input.content);
  if (!content) {
    return { ok: false, status: 400, error: "content is required." };
  }

  const sourcePath = input.sourcePath == null ? null : normalizeRelativePath(input.sourcePath);
  if (input.sourcePath != null && !sourcePath) {
    return { ok: false, status: 400, error: "source_path must be a safe relative path." };
  }

  const rpc = await callTongsRpc<StyleSampleRpcRow[] | StyleSampleRpcRow>(
    "add_my_style_sample",
    {
      p_workspace_id: normalizedWorkspaceId,
      p_source_kind: sourceKind,
      p_source_label: readString(input.sourceLabel ?? null),
      p_source_workpiece_id: normalizeUuid(input.sourceWorkpieceId) ?? null,
      p_source_path: sourcePath,
      p_content: content,
    },
  );
  if (!rpc.ok) return rpc;

  const sample = toStyleSample(rpc.data, normalizedWorkspaceId);
  if (!sample) {
    return {
      ok: false,
      status: 502,
      error: "Style sample insert returned an invalid payload.",
    };
  }

  return {
    ok: true,
    status: rpc.status,
    data: sample,
  };
}

export async function addMyStyleSamples(
  workspaceId: string,
  inputs: readonly StyleSampleInput[],
): Promise<
  | RpcSuccess<{
      inserted: number;
      failed: number;
      errors: string[];
      samples: StyleSample[];
    }>
  | RpcFailure
> {
  if (inputs.length === 0) {
    return {
      ok: true,
      status: 200,
      data: {
        inserted: 0,
        failed: 0,
        errors: [],
        samples: [],
      },
    };
  }

  const samples: StyleSample[] = [];
  const errors: string[] = [];
  let fallbackFailure: RpcFailure | null = null;

  for (let index = 0; index < inputs.length; index += 1) {
    const result = await addMyStyleSample(workspaceId, inputs[index]);
    if (!result.ok) {
      if (!fallbackFailure) fallbackFailure = result;
      errors.push(`Sample ${index + 1}: ${result.error}`);
      continue;
    }
    samples.push(result.data);
  }

  if (samples.length === 0 && fallbackFailure) {
    return {
      ok: false,
      status: fallbackFailure.status,
      error: errors[0] ?? fallbackFailure.error,
    };
  }

  return {
    ok: true,
    status: 200,
    data: {
      inserted: samples.length,
      failed: errors.length,
      errors,
      samples,
    },
  };
}

export async function listMyStyleSamples(
  workspaceId: string,
  options?: { limit?: number },
): Promise<RpcSuccess<StyleSample[]> | RpcFailure> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) {
    return { ok: false, status: 400, error: "workspace_id is required." };
  }

  const limitRaw = options?.limit;
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(500, Math.floor(limitRaw as number)))
    : 200;

  const rpc = await callTongsRpc<StyleSampleRpcRow[] | StyleSampleRpcRow>(
    "list_my_style_samples",
    {
      p_workspace_id: normalizedWorkspaceId,
      p_limit: limit,
    },
  );
  if (!rpc.ok) return rpc;

  const rows = Array.isArray(rpc.data) ? rpc.data : (rpc.data ? [rpc.data] : []);
  const samples = rows
    .map((row) => toStyleSample(row, normalizedWorkspaceId))
    .filter((row): row is StyleSample => Boolean(row));

  return {
    ok: true,
    status: rpc.status,
    data: samples,
  };
}

export async function listRecentWorkspaceScriptReferences(
  workspaceId: string,
  options?: { limit?: number },
): Promise<RpcSuccess<RecentScriptReference[]> | RpcFailure> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) {
    return { ok: false, status: 400, error: "workspace_id is required." };
  }

  const limitRaw = options?.limit;
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(100, Math.floor(limitRaw as number)))
    : 24;

  const rpc = await callTongsRpc<RecentScriptReferenceRpcRow[] | RecentScriptReferenceRpcRow>(
    "list_my_recent_script_references",
    {
      p_workspace_id: normalizedWorkspaceId,
      p_limit: limit,
    },
  );
  if (!rpc.ok) return rpc;

  const rows = Array.isArray(rpc.data) ? rpc.data : (rpc.data ? [rpc.data] : []);
  const refs = rows
    .map((row) => toRecentScriptReference(row, normalizedWorkspaceId))
    .filter((row): row is RecentScriptReference => Boolean(row));

  return {
    ok: true,
    status: rpc.status,
    data: refs,
  };
}

type TongsReadTextPayload = {
  ok?: unknown;
  data?: unknown;
  exists?: unknown;
  error?: unknown;
  message?: unknown;
};

export async function readWorkpieceStyleSourceText(
  workpieceId: string,
  path: string,
): Promise<RpcSuccess<string> | RpcFailure> {
  const normalizedWorkpieceId = normalizeUuid(workpieceId);
  if (!normalizedWorkpieceId) {
    return { ok: false, status: 400, error: "workpiece_id is required." };
  }
  const normalizedPath = normalizeRelativePath(path);
  if (!normalizedPath) {
    return { ok: false, status: 400, error: "path must be a safe relative path." };
  }

  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(normalizedWorkpieceId)}/read-file?path=${encodeURIComponent(normalizedPath)}`,
      { method: "GET" },
    );
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Network error",
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readRpcError(payload, `read-file failed (${response.status})`),
    };
  }

  const row = (isRecord(payload) ? payload : null) as TongsReadTextPayload | null;
  const text = typeof row?.data === "string" ? row.data.trim() : "";
  if (!text) {
    return {
      ok: false,
      status: 404,
      error: "Selected Forge file is empty or unavailable.",
    };
  }

  return {
    ok: true,
    status: response.status,
    data: text,
  };
}

export async function resetStyleProfile(workspaceId: string): Promise<RpcSuccess<boolean> | RpcFailure> {
  const normalizedWorkspaceId = normalizeUuid(workspaceId);
  if (!normalizedWorkspaceId) {
    return { ok: false, status: 400, error: "workspace_id is required." };
  }

  const rpc = await callTongsRpc<Array<{ reset?: unknown }> | { reset?: unknown }>(
    "reset_my_style_profile",
    { p_workspace_id: normalizedWorkspaceId },
  );
  if (!rpc.ok) return rpc;

  const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
  const reset = row?.reset === true;
  STYLE_PROFILE_CACHE.set(normalizedWorkspaceId, null);
  return {
    ok: true,
    status: rpc.status,
    data: reset,
  };
}

export async function updateStyleProfileFromReadyCheckpoint(args: {
  workspaceId: string | null;
  scriptText: string;
  adaptationWeight?: number;
}): Promise<StyleUpdateResult> {
  ensureWorkspaceFeatureSync();
  const workspaceId = normalizeUuid(args.workspaceId);
  if (!workspaceId) {
    return {
      ok: true,
      skipped: true,
      reason: "missing_workspace",
      features: null,
    };
  }

  const scriptText = args.scriptText.trim();
  if (!scriptText) {
    return {
      ok: true,
      skipped: true,
      reason: "empty_script",
      features: readCachedWorkspaceFeatures(workspaceId),
    };
  }

  if (isStyleAlignmentPaused(workspaceId)) {
    return {
      ok: true,
      skipped: true,
      reason: "paused",
      features: readCachedWorkspaceFeatures(workspaceId),
    };
  }

  // Always force-refresh feature flags before write attempts so admin kill-switches
  // are honored immediately even when a Hearth tab has warmed cache.
  const featureResult = await getWorkspaceFeatures(workspaceId, { force: true });
  if (!featureResult.ok) {
    return {
      ok: false,
      status: featureResult.status,
      error: featureResult.error,
    };
  }

  const features = featureResult.data;
  if (!features.adaptiveStyleAlignmentEnabled) {
    return {
      ok: true,
      skipped: true,
      reason: "feature_disabled",
      features,
    };
  }

  const metrics = extractStyleMetrics(scriptText);
  const rpc = await callTongsRpc<StyleProfileRpcRow[] | StyleProfileRpcRow>(
    "upsert_style_profile_metrics",
    {
      p_workspace_id: workspaceId,
      p_avg_sentence_length: metrics.avgSentenceLength,
      p_sentence_length_variance: metrics.sentenceLengthVariance,
      p_pause_per_1000_words: metrics.pausePer1000Words,
      p_reflective_pause_ratio: metrics.reflectivePauseRatio,
      p_avg_s1_block_length: metrics.avgS1BlockLength,
      p_avg_s2_block_length: metrics.avgS2BlockLength,
      p_structural_intent_vector: metrics.structuralIntentVector,
      p_adaptation_weight: args.adaptationWeight ?? 0.15,
    },
  );

  if (!rpc.ok) {
    return {
      ok: false,
      status: rpc.status,
      error: rpc.error,
    };
  }

  const profile = toStyleProfile(rpc.data, workspaceId);
  if (!profile) {
    return {
      ok: false,
      status: 502,
      error: "Style profile update returned an invalid payload.",
    };
  }
  STYLE_PROFILE_CACHE.set(workspaceId, profile);

  return {
    ok: true,
    skipped: false,
    features,
    metrics,
    profile,
    insights: translateStyleProfileInsights(profile),
  };
}

export async function getStyleInsights(workspaceId: string): Promise<
  | {
      ok: true;
      enabled: boolean;
      features: WorkspaceFeatures;
      profile: StyleProfile | null;
      insights: string[];
    }
  | {
      ok: false;
      status: number;
      error: string;
    }
> {
  const featureResult = await getWorkspaceFeatures(workspaceId);
  if (!featureResult.ok) {
    return {
      ok: false,
      status: featureResult.status,
      error: featureResult.error,
    };
  }

  const features = featureResult.data;
  if (!features.adaptiveStyleAlignmentEnabled) {
    return {
      ok: true,
      enabled: false,
      features,
      profile: null,
      insights: [],
    };
  }

  const profileResult = await getStyleProfile(workspaceId);
  if (!profileResult.ok) {
    return {
      ok: false,
      status: profileResult.status,
      error: profileResult.error,
    };
  }

  const profile = profileResult.data;
  return {
    ok: true,
    enabled: true,
    features,
    profile,
    insights: profile ? translateStyleProfileInsights(profile) : [],
  };
}
