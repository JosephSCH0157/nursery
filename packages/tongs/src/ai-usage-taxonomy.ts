export const AI_USAGE_FEATURE = {
  SCRIPT_ASSIST: "script_assist",
  SPEECH_TRANSCRIPTION: "speech_transcription",
  CDC_EXTRACT: "cdc_extract",
  THUMBNAIL_GENERATE: "thumbnail_generate",
  IMAGE_MAP_CANDIDATE_GENERATE: "image_map_candidate_generate",
  HAMMER_SHORTS_DISCOVERY: "hammer_shorts_discovery",
} as const;

export const AI_USAGE_SUBFEATURE = {
  CHAT: "chat",
  REWRITE: "rewrite",
  OUTLINE: "outline",
  READINESS_CHECK: "readiness_check",
  MEDIA_MAP: "media_map",
  WORKPIECE_AUDIO: "workpiece_audio",
  ANVIL_WHISPER: "anvil_whisper",
  HAMMER_PREP_NONBILLABLE: "hammer_prep_nonbillable",
  CONCEPT_RENDER: "concept_render",
  EXPLAINER: "explainer",
  ILLUSTRATIVE: "illustrative",
  ILLUSTRATIVE_RETRY: "illustrative_retry",
  INTERPRETATION: "interpretation",
  SHORTS_DISCOVERY: "shorts_discovery",
} as const;

export const AI_USAGE_LANE = {
  FORGE: "forge",
  BYO: "byo",
} as const;

export const AI_USAGE_TRIGGER = {
  USER: "user",
  SYSTEM: "system",
} as const;

export const AI_USAGE_STATUS = {
  SUCCESS: "success",
  ERROR: "error",
} as const;

export type AiUsageFeature = (typeof AI_USAGE_FEATURE)[keyof typeof AI_USAGE_FEATURE];
export type AiUsageSubfeature = (typeof AI_USAGE_SUBFEATURE)[keyof typeof AI_USAGE_SUBFEATURE];
export type AiUsageLane = (typeof AI_USAGE_LANE)[keyof typeof AI_USAGE_LANE];
export type AiUsageTrigger = (typeof AI_USAGE_TRIGGER)[keyof typeof AI_USAGE_TRIGGER];
export type AiUsageStatus = (typeof AI_USAGE_STATUS)[keyof typeof AI_USAGE_STATUS];

const FEATURE_SET = new Set<AiUsageFeature>(Object.values(AI_USAGE_FEATURE));
const SUBFEATURE_SET = new Set<AiUsageSubfeature>(Object.values(AI_USAGE_SUBFEATURE));
const LANE_SET = new Set<AiUsageLane>(Object.values(AI_USAGE_LANE));
const TRIGGER_SET = new Set<AiUsageTrigger>(Object.values(AI_USAGE_TRIGGER));
const STATUS_SET = new Set<AiUsageStatus>(Object.values(AI_USAGE_STATUS));

const FEATURE_TO_SUBFEATURES: Readonly<Record<AiUsageFeature, ReadonlySet<AiUsageSubfeature>>> = {
  [AI_USAGE_FEATURE.SCRIPT_ASSIST]: new Set<AiUsageSubfeature>([
    AI_USAGE_SUBFEATURE.CHAT,
    AI_USAGE_SUBFEATURE.REWRITE,
    AI_USAGE_SUBFEATURE.OUTLINE,
    AI_USAGE_SUBFEATURE.READINESS_CHECK,
  ]),
  [AI_USAGE_FEATURE.SPEECH_TRANSCRIPTION]: new Set<AiUsageSubfeature>([
    AI_USAGE_SUBFEATURE.WORKPIECE_AUDIO,
    AI_USAGE_SUBFEATURE.ANVIL_WHISPER,
    AI_USAGE_SUBFEATURE.HAMMER_PREP_NONBILLABLE,
  ]),
  [AI_USAGE_FEATURE.CDC_EXTRACT]: new Set<AiUsageSubfeature>([
    AI_USAGE_SUBFEATURE.MEDIA_MAP,
  ]),
  [AI_USAGE_FEATURE.THUMBNAIL_GENERATE]: new Set<AiUsageSubfeature>([
    AI_USAGE_SUBFEATURE.CONCEPT_RENDER,
  ]),
  [AI_USAGE_FEATURE.IMAGE_MAP_CANDIDATE_GENERATE]: new Set<AiUsageSubfeature>([
    AI_USAGE_SUBFEATURE.EXPLAINER,
    AI_USAGE_SUBFEATURE.ILLUSTRATIVE,
    AI_USAGE_SUBFEATURE.ILLUSTRATIVE_RETRY,
    AI_USAGE_SUBFEATURE.INTERPRETATION,
  ]),
  [AI_USAGE_FEATURE.HAMMER_SHORTS_DISCOVERY]: new Set<AiUsageSubfeature>([
    AI_USAGE_SUBFEATURE.SHORTS_DISCOVERY,
  ]),
};

export function isAiUsageFeature(value: unknown): value is AiUsageFeature {
  return typeof value === "string" && FEATURE_SET.has(value as AiUsageFeature);
}

export function isAiUsageSubfeature(value: unknown): value is AiUsageSubfeature {
  return typeof value === "string" && SUBFEATURE_SET.has(value as AiUsageSubfeature);
}

export function isAiUsageLane(value: unknown): value is AiUsageLane {
  return typeof value === "string" && LANE_SET.has(value as AiUsageLane);
}

export function isAiUsageTrigger(value: unknown): value is AiUsageTrigger {
  return typeof value === "string" && TRIGGER_SET.has(value as AiUsageTrigger);
}

export function isAiUsageStatus(value: unknown): value is AiUsageStatus {
  return typeof value === "string" && STATUS_SET.has(value as AiUsageStatus);
}

export function validateAiUsageFeatureSubfeature(
  feature: unknown,
  subfeature: unknown,
): { ok: true } | { ok: false; reason: string } {
  if (!isAiUsageFeature(feature)) {
    return { ok: false, reason: `Invalid ai_usage_events feature '${String(feature)}'` };
  }

  if (subfeature == null) {
    return { ok: true };
  }

  if (!isAiUsageSubfeature(subfeature)) {
    return { ok: false, reason: `Invalid ai_usage_events subfeature '${String(subfeature)}'` };
  }

  const allowed = FEATURE_TO_SUBFEATURES[feature];
  if (!allowed.has(subfeature)) {
    return {
      ok: false,
      reason: `Invalid ai_usage_events feature/subfeature pair '${feature}:${subfeature}'`,
    };
  }

  return { ok: true };
}

export function assertValidAiUsageFeatureSubfeature(
  feature: unknown,
  subfeature: unknown,
): asserts feature is AiUsageFeature {
  const validation = validateAiUsageFeatureSubfeature(feature, subfeature);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }
}
