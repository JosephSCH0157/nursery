import type {
  EpisodeBrollAssetCandidate,
  EpisodeBrollPlanBeat,
  EpisodeContextualDataCompositePlan,
  EpisodeExternalRequestState,
  EpisodeExternalRequestTracker,
  EpisodeVisualAssetClass,
} from "./episode-package-v2";

export type ExternalGenerationProviderKind =
  | "image_generator"
  | "video_generator"
  | "stock_library"
  | "research_source";

export type ExternalGenerationProviderPromptFormat = "plain_text" | "json" | "both";

export type ExternalGenerationProvider = {
  id: string;
  name: string;
  kind: ExternalGenerationProviderKind;
  launchUrl: string;
  supportsDirectApi: boolean;
  supportsManualBridge: boolean;
  promptFormat: ExternalGenerationProviderPromptFormat;
  supportedAssetClasses: EpisodeVisualAssetClass[];
};

export type VisualBriefCommon = {
  asset_class: EpisodeVisualAssetClass;
  workpiece_id: string;
  workpiece_title: string | null;
  beat_id: string;
  anchor_text: string;
  placement_hint: string;
  desired_format: string;
  tone: string | null;
  style: string | null;
  suggested_duration_ms: number | null;
  keywords: string[];
  source_expectations: string;
  licensing_editorial_notes: string;
  shot_intent: string;
};

export type BrollBeatBrief = VisualBriefCommon & {
  asset_class: "broll";
  motion_level: string | null;
  mood: string | null;
  framing: string | null;
  environment: string | null;
  editorial_role: string;
};

export type ReferenceClipBrief = VisualBriefCommon & {
  asset_class: "reference_clip";
  motion_level: string | null;
  data_type: string;
  context_type: string;
  framing_mode: string;
  background_data_notes: string | null;
  foreground_data_notes: string | null;
  result_mode: "still" | "video" | "graphic_composite";
  chart: {
    type: string | null;
    title: string | null;
    labels: string[];
    values: Array<number | string>;
    emphasis_key: string | null;
  };
};

export const DEFAULT_EXTERNAL_GENERATION_PROVIDERS: ExternalGenerationProvider[] = [
  {
    id: "generic-image-tool",
    name: "Generic Image Tool",
    kind: "image_generator",
    launchUrl: "https://chatgpt.com/",
    supportsDirectApi: false,
    supportsManualBridge: true,
    promptFormat: "both",
    supportedAssetClasses: ["reference_clip"],
  },
  {
    id: "generic-video-tool",
    name: "Generic Video Tool",
    kind: "video_generator",
    launchUrl: "https://chatgpt.com/",
    supportsDirectApi: false,
    supportsManualBridge: true,
    promptFormat: "both",
    supportedAssetClasses: ["broll", "reference_clip"],
  },
  {
    id: "pexels-stock",
    name: "Pexels Stock",
    kind: "stock_library",
    launchUrl: "https://www.pexels.com/videos/",
    supportsDirectApi: false,
    supportsManualBridge: true,
    promptFormat: "plain_text",
    supportedAssetClasses: ["broll", "reference_clip"],
  },
  {
    id: "pixabay-stock",
    name: "Pixabay Stock",
    kind: "stock_library",
    launchUrl: "https://pixabay.com/videos/",
    supportsDirectApi: false,
    supportsManualBridge: true,
    promptFormat: "plain_text",
    supportedAssetClasses: ["broll", "reference_clip"],
  },
  {
    id: "research-wikipedia",
    name: "Wikipedia Research",
    kind: "research_source",
    launchUrl: "https://www.wikipedia.org/",
    supportsDirectApi: false,
    supportsManualBridge: true,
    promptFormat: "plain_text",
    supportedAssetClasses: ["reference_clip"],
  },
];

function createClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanArray(values: readonly string[] | null | undefined): string[] {
  if (!values) return [];
  return values.map((value) => value.trim()).filter(Boolean);
}

function resolveResultMode(format: string): "still" | "video" | "graphic_composite" {
  if (format === "still") return "still";
  if (format === "animated") return "video";
  return "graphic_composite";
}

export function listExternalGenerationProviders(
  assetClass: EpisodeVisualAssetClass,
  providers: readonly ExternalGenerationProvider[] = DEFAULT_EXTERNAL_GENERATION_PROVIDERS,
): ExternalGenerationProvider[] {
  return providers.filter((provider) => provider.supportedAssetClasses.includes(assetClass));
}

export function buildBrollBeatBrief(args: {
  beat: EpisodeBrollPlanBeat;
  workpieceId: string;
  workpieceTitle?: string | null;
}): BrollBeatBrief {
  const beat = args.beat;
  return {
    asset_class: "broll",
    workpiece_id: args.workpieceId,
    workpiece_title: clean(args.workpieceTitle),
    beat_id: beat.id,
    anchor_text: beat.anchor_text,
    placement_hint: beat.placement_hint,
    desired_format: beat.asset_category ?? "stock_video",
    motion_level: beat.motion_intent,
    tone: clean(beat.mood),
    mood: clean(beat.mood),
    style: clean(beat.visual_style ?? null),
    framing: clean(beat.shot_type ?? null),
    environment: clean(beat.motion_suggestion ?? null),
    shot_intent: beat.description || beat.anchor_text,
    editorial_role: beat.priority,
    suggested_duration_ms: beat.suggested_duration_ms ?? null,
    keywords: cleanArray(beat.keywords),
    source_expectations: "Provide safe-to-use supporting visuals suitable for editorial use.",
    licensing_editorial_notes: "Return source and usage rights note with each candidate.",
  };
}

export function buildReferenceClipBrief(args: {
  entry: EpisodeContextualDataCompositePlan;
  workpieceId: string;
  workpieceTitle?: string | null;
}): ReferenceClipBrief {
  const entry = args.entry;
  return {
    asset_class: "reference_clip",
    workpiece_id: args.workpieceId,
    workpiece_title: clean(args.workpieceTitle),
    beat_id: entry.id,
    anchor_text: entry.anchor_text,
    placement_hint: entry.placement_hint,
    desired_format: entry.format,
    motion_level: entry.motion_level,
    tone: entry.tone,
    style: clean(entry.visual_style ?? null),
    data_type: entry.data_type,
    context_type: entry.context_type,
    framing_mode: entry.description || entry.anchor_text,
    shot_intent: entry.description || entry.anchor_text,
    suggested_duration_ms: entry.timestamp_ms ?? null,
    keywords: cleanArray(entry.labels),
    background_data_notes: clean(entry.background_context_description),
    foreground_data_notes: clean(entry.foreground_data_description),
    result_mode: resolveResultMode(entry.format),
    source_expectations: "Include source links and context attribution suitable for editorial verification.",
    licensing_editorial_notes: "Mark archival/licensing constraints and derivative-use limitations.",
    chart: {
      type: clean(entry.chart_type),
      title: clean(entry.title),
      labels: cleanArray(entry.labels),
      values: Array.isArray(entry.values) ? entry.values : [],
      emphasis_key: clean(entry.emphasis_key),
    },
  };
}

export function formatVisualBriefAsText(brief: BrollBeatBrief | ReferenceClipBrief): string {
  const lines: string[] = [
    `Asset Class: ${brief.asset_class}`,
    `Workpiece ID: ${brief.workpiece_id}`,
    `Workpiece Title: ${brief.workpiece_title ?? "(untitled)"}`,
    `Beat ID: ${brief.beat_id}`,
    `Anchor Text: ${brief.anchor_text}`,
    `Placement Hint: ${brief.placement_hint}`,
    `Desired Format: ${brief.desired_format}`,
    `Tone: ${brief.tone ?? "(none specified)"}`,
    `Style: ${brief.style ?? "(none specified)"}`,
    `Shot Intent / Editorial Purpose: ${brief.shot_intent}`,
    `Suggested Duration (ms): ${brief.suggested_duration_ms ?? "unspecified"}`,
    `Keywords: ${brief.keywords.length > 0 ? brief.keywords.join(", ") : "(none)"}`,
    `Source Expectations: ${brief.source_expectations}`,
    `Licensing / Editorial Notes: ${brief.licensing_editorial_notes}`,
  ];

  if (brief.asset_class === "broll") {
    lines.push(
      `Motion Level: ${brief.motion_level ?? "(none specified)"}`,
      `Mood: ${brief.mood ?? "(none specified)"}`,
      `Framing: ${brief.framing ?? "(none specified)"}`,
      `Environment: ${brief.environment ?? "(none specified)"}`,
      `Editorial Role: ${brief.editorial_role}`,
    );
  } else {
    lines.push(
      `Motion Level: ${brief.motion_level ?? "(none specified)"}`,
      `Data Type: ${brief.data_type}`,
      `Context Type: ${brief.context_type}`,
      `Framing Mode: ${brief.framing_mode}`,
      `Result Mode: ${brief.result_mode}`,
      `Background Data Notes: ${brief.background_data_notes ?? "(none specified)"}`,
      `Foreground Data Notes: ${brief.foreground_data_notes ?? "(none specified)"}`,
      `Chart Type: ${brief.chart.type ?? "(none specified)"}`,
      `Chart Title: ${brief.chart.title ?? "(none specified)"}`,
      `Chart Labels: ${brief.chart.labels.length > 0 ? brief.chart.labels.join(", ") : "(none)"}`,
      `Chart Values: ${brief.chart.values.length > 0 ? brief.chart.values.join(", ") : "(none)"}`,
      `Chart Emphasis Key: ${brief.chart.emphasis_key ?? "(none specified)"}`,
    );
  }

  lines.push(
    "",
    "Delivery Requirements:",
    "- Return candidate source URL(s).",
    "- Include provider note with method/tool used.",
    "- Include licensing or usage note.",
  );

  return lines.join("\n");
}

export function createExternalRequestTracker(args?: {
  state?: EpisodeExternalRequestState;
  providerId?: string | null;
  sourceUrl?: string | null;
  providerNote?: string | null;
  usageNote?: string | null;
  resultMetadata?: string | null;
  attachedAssetId?: string | null;
  updatedAt?: string;
}): EpisodeExternalRequestTracker {
  return {
    state: args?.state ?? "planned",
    provider_id: clean(args?.providerId),
    source_url: clean(args?.sourceUrl),
    provider_note: clean(args?.providerNote),
    usage_note: clean(args?.usageNote),
    result_metadata: clean(args?.resultMetadata),
    attached_asset_id: clean(args?.attachedAssetId),
    updated_at: args?.updatedAt ?? new Date().toISOString(),
  };
}

export function advanceExternalRequestTracker(
  current: EpisodeExternalRequestTracker | null | undefined,
  nextState: EpisodeExternalRequestState,
  patch?: {
    providerId?: string | null;
    sourceUrl?: string | null;
    providerNote?: string | null;
    usageNote?: string | null;
    resultMetadata?: string | null;
    attachedAssetId?: string | null;
  },
): EpisodeExternalRequestTracker {
  return {
    state: nextState,
    provider_id: clean(patch?.providerId) ?? clean(current?.provider_id) ?? null,
    source_url: clean(patch?.sourceUrl) ?? clean(current?.source_url) ?? null,
    provider_note: clean(patch?.providerNote) ?? clean(current?.provider_note) ?? null,
    usage_note: clean(patch?.usageNote) ?? clean(current?.usage_note) ?? null,
    result_metadata: clean(patch?.resultMetadata) ?? clean(current?.result_metadata) ?? null,
    attached_asset_id: clean(patch?.attachedAssetId) ?? clean(current?.attached_asset_id) ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function createManualResultCandidate(args: {
  assetClass: EpisodeVisualAssetClass;
  beatId: string;
  sourceLabel?: string | null;
  sourceUrl: string;
  title?: string | null;
  durationMs?: number | null;
  thumbnailPath?: string | null;
  providerNote?: string | null;
  usageNote?: string | null;
}): EpisodeBrollAssetCandidate {
  const now = new Date().toISOString();
  return {
    asset_id: createClientId(args.assetClass === "broll" ? "broll-manual-result" : "reference-manual-result"),
    source: "external",
    asset_class: args.assetClass,
    source_beat_id: args.beatId,
    source_label: clean(args.sourceLabel),
    source_url: clean(args.sourceUrl),
    provider_note: clean(args.providerNote),
    usage_note: clean(args.usageNote),
    label: clean(args.title) ?? clean(args.sourceLabel) ?? "Manual Result",
    uri: clean(args.sourceUrl),
    duration_ms: args.durationMs ?? null,
    thumbnail_path: clean(args.thumbnailPath),
    attached_at: now,
    created_at: now,
  };
}
