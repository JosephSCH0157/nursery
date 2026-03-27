import type {
  EpisodeContextualDataCompositePlan,
  EpisodeReferenceClipChartType,
  EpisodeReferenceClipDataType,
  EpisodeReferenceClipFormat,
  EpisodeReferenceClipMotionLevel,
  EpisodeReferenceClipTone,
} from "./episode-package-v2";

function nowIso(): string {
  return new Date().toISOString();
}

function createClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function inferReferenceClipSuitabilitySignals(scriptText: string): string[] {
  const lower = scriptText.toLowerCase();
  const signals: string[] = [];
  if (/\bincrease\b|\bdecrease\b|\bdecline\b|\bgrowth\b|\btrend\b/.test(lower)) signals.push("trend");
  if (/\bover the last\b|\bsince \d{4}\b|\byears?\b/.test(lower)) signals.push("over_time");
  if (/\bversus\b|\bcompared to\b|\bcomparison\b/.test(lower)) signals.push("comparison");
  if (/\bmap\b|\bregion\b|\bcity\b|\bcounty\b|\bcountry\b/.test(lower)) signals.push("geographic");
  if (/\bpercent\b|\bpercentage\b|\bstat\b|\bmetric\b|\brate\b/.test(lower)) signals.push("statistics");
  if (/\bpolicy\b|\brollout\b|\bimpact\b/.test(lower)) signals.push("policy_impact");
  return signals;
}

function inferDataType(signals: string[]): EpisodeReferenceClipDataType {
  if (signals.includes("geographic")) return "geographic";
  if (signals.includes("over_time")) return "timeline";
  if (signals.includes("comparison")) return "comparison";
  if (signals.includes("statistics")) return "quantitative";
  return "categorical";
}

function inferChartType(dataType: EpisodeReferenceClipDataType): EpisodeReferenceClipChartType {
  if (dataType === "timeline") return "timeline";
  if (dataType === "geographic") return "map";
  if (dataType === "comparison") return "comparison";
  if (dataType === "categorical") return "bar";
  return "line";
}

function inferTone(signals: string[]): EpisodeReferenceClipTone {
  if (signals.includes("policy_impact")) return "investigative";
  if (signals.includes("trend")) return "analytical";
  return "neutral";
}

function inferMotionLevel(format: EpisodeReferenceClipFormat): EpisodeReferenceClipMotionLevel {
  if (format === "animated" || format === "hybrid") return "full_animation";
  return "static";
}

export function createReferenceClipPlan(args: {
  workpieceId: string;
  anchorText: string;
  description?: string;
  format?: EpisodeReferenceClipFormat;
}): EpisodeContextualDataCompositePlan {
  const generatedAt = nowIso();
  const description = (args.description ?? args.anchorText).trim();
  const signals = inferReferenceClipSuitabilitySignals(description);
  const dataType = inferDataType(signals);
  const chartType = inferChartType(dataType);
  const format = args.format ?? "still";
  return {
    id: createClientId("cdc"),
    workpiece_id: args.workpieceId,
    media_type: "contextual_data_composite",
    anchor_text: args.anchorText.trim(),
    placement_hint: "first_occurrence",
    timestamp_ms: null,
    format,
    data_type: dataType,
    context_type: signals.includes("geographic") ? "location" : "historical",
    tone: inferTone(signals),
    motion_level: inferMotionLevel(format),
    description,
    background_context_description: "",
    foreground_data_description: "",
    visual_style: null,
    chart_type: chartType,
    title: null,
    labels: [],
    values: [],
    emphasis_key: null,
    candidate_assets: [],
    external_request: {
      state: "planned",
      updated_at: generatedAt,
    },
    selected_asset_id: null,
    source_type: "planned",
    origin: "hearth",
    created_at: generatedAt,
    updated_at: generatedAt,
  };
}

export const inferCdcSuitabilitySignals = inferReferenceClipSuitabilitySignals;
export const createContextualDataCompositePlan = createReferenceClipPlan;
