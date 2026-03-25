import type {
  EpisodeBrollAssetCandidate,
  EpisodeBrollCoverageStrength,
  EpisodeBrollMotionIntent,
  EpisodeBrollPlan,
  EpisodeBrollPlanBeat,
  EpisodeBrollShotType,
} from "./episode-package-v2";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nowIso(): string {
  return new Date().toISOString();
}

function createClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanSentenceText(value: string): string {
  return value
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\([^\)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitScriptSentences(scriptText: string): string[] {
  const base = scriptText
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
  const sentences = base
    .split(/(?<=[.!?])\s+/g)
    .map((entry) => cleanSentenceText(entry))
    .filter((entry) => entry.length >= 18);
  return sentences;
}

function inferMotionIntent(text: string): EpisodeBrollMotionIntent {
  const lower = text.toLowerCase();
  if (/\bcompared to\b|\bversus\b|\bcontrast\b/.test(lower)) return "cutaway";
  if (/\bfor example\b|\bfor instance\b|\blet'?s say\b/.test(lower)) return "explanatory";
  if (/\bhistory\b|\bback in\b|\bin \d{4}\b/.test(lower)) return "establishing";
  if (/\bpunchline\b|\bjoke\b|\bfunny\b/.test(lower)) return "reaction";
  if (/\bmeanwhile\b|\bnext\b|\bmoving on\b/.test(lower)) return "transition";
  if (/\bdata\b|\bchart\b|\bstat\b|\bpercentage\b/.test(lower)) return "graphic";
  if (/\bfeel\b|\bemotion\b|\bstress\b|\banxiety\b|\bhope\b/.test(lower)) return "ambient";
  return "broll";
}

function inferShotType(intent: EpisodeBrollMotionIntent): EpisodeBrollShotType {
  if (intent === "establishing") return "wide";
  if (intent === "reaction") return "close";
  if (intent === "graphic") return "mixed";
  if (intent === "ambient") return "medium";
  return "mixed";
}

function inferMood(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\burgent\b|\bcritical\b|\bimmediately\b/.test(lower)) return "urgent";
  if (/\bcalm\b|\bsteady\b|\bgentle\b/.test(lower)) return "calm";
  if (/\bexcited\b|\bamazing\b|\bincredible\b/.test(lower)) return "energetic";
  if (/\bserious\b|\bwarning\b|\brisk\b/.test(lower)) return "serious";
  return null;
}

function inferPriority(index: number): "primary" | "supporting" | "background" {
  if (index % 5 === 0) return "primary";
  if (index % 2 === 0) return "supporting";
  return "background";
}

function inferSuggestedDurationMs(intent: EpisodeBrollMotionIntent): number {
  if (intent === "reaction" || intent === "transition") return 2500;
  if (intent === "ambient") return 5500;
  if (intent === "establishing") return 6000;
  return 4000;
}

function inferKeywords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/g)
        .filter((token) => token.length >= 4),
    ),
  ).slice(0, 8);
}

function inferMotionSuggestion(intent: EpisodeBrollMotionIntent): string {
  if (intent === "graphic") return "Use animated overlays or data callouts.";
  if (intent === "transition") return "Use a short connector shot to bridge sections.";
  if (intent === "establishing") return "Open with a wide contextual shot before tightening coverage.";
  if (intent === "reaction") return "Prefer a quick reaction insert to punctuate the line.";
  if (intent === "ambient") return "Layer atmospheric footage with subtle movement.";
  if (intent === "explanatory") return "Use explanatory visuals that track the spoken concept.";
  return "Use supporting B-roll that reinforces the spoken narrative.";
}

function resolveCoverageStrength(beatCount: number): EpisodeBrollCoverageStrength {
  if (beatCount >= 12) return "high";
  if (beatCount >= 5) return "medium";
  return "low";
}

export function buildBrollPlanFromScript(args: {
  workpieceId: string;
  scriptText: string;
  previousPlan?: EpisodeBrollPlan | null;
}): EpisodeBrollPlan {
  const sentences = splitScriptSentences(args.scriptText);
  const stride = Math.max(1, Math.floor(sentences.length / 12));
  const selected = sentences.filter((_, index) => index % stride === 0).slice(0, 18);
  const generatedAt = nowIso();
  const beats: EpisodeBrollPlanBeat[] = selected.map((sentence, index) => {
    const motionIntent = inferMotionIntent(sentence);
    const previous = args.previousPlan?.beats.find((beat) => beat.anchor_text === sentence) ?? null;
    return {
      id: previous?.id ?? createClientId("broll-beat"),
      workpiece_id: args.workpieceId,
      anchor_text: sentence,
      placement_hint: "first_occurrence",
      timestamp_ms: previous?.timestamp_ms ?? null,
      description: previous?.description ?? sentence,
      motion_intent: motionIntent,
      visual_style: previous?.visual_style ?? null,
      priority: previous?.priority ?? inferPriority(index),
      keywords: previous?.keywords?.length ? previous.keywords : inferKeywords(sentence),
      mood: previous?.mood ?? inferMood(sentence),
      shot_type: previous?.shot_type ?? inferShotType(motionIntent),
      motion_suggestion: previous?.motion_suggestion ?? inferMotionSuggestion(motionIntent),
      suggested_duration_ms: previous?.suggested_duration_ms ?? inferSuggestedDurationMs(motionIntent),
      source_type: previous?.source_type ?? "planned",
      selected_asset_id: previous?.selected_asset_id ?? null,
      candidate_assets: previous?.candidate_assets ?? [],
      fulfillment_state: previous?.selected_asset_id
        ? "resolved"
        : previous?.candidate_assets?.length
          ? "candidate_assets_available"
          : "unresolved",
      origin: previous?.origin ?? "hearth",
      created_at: previous?.created_at ?? generatedAt,
      updated_at: generatedAt,
    };
  });

  return {
    id: args.previousPlan?.id ?? "broll-plan-v1",
    workpiece_id: args.workpieceId,
    version: Math.max(1, (args.previousPlan?.version ?? 0) + 1),
    beats,
    coverage_strength: resolveCoverageStrength(beats.length),
    generated_at: generatedAt,
  };
}

export function regenerateBrollBeatFromDescription(beat: EpisodeBrollPlanBeat): EpisodeBrollPlanBeat {
  const description = readString(beat.description) || beat.anchor_text;
  const motionIntent = inferMotionIntent(description);
  const next = {
    ...beat,
    motion_intent: motionIntent,
    keywords: inferKeywords(description),
    mood: inferMood(description),
    shot_type: inferShotType(motionIntent),
    motion_suggestion: inferMotionSuggestion(motionIntent),
    suggested_duration_ms: inferSuggestedDurationMs(motionIntent),
    updated_at: nowIso(),
  };
  if (next.selected_asset_id) {
    next.fulfillment_state = "stale";
  }
  return next;
}

export function buildStockCandidatesForBrollBeat(beat: EpisodeBrollPlanBeat): EpisodeBrollAssetCandidate[] {
  const query = encodeURIComponent(
    [beat.description, beat.mood, beat.motion_intent, ...beat.keywords]
      .filter(Boolean)
      .join(" "),
  );
  const now = nowIso();
  return [
    {
      asset_id: createClientId("stock"),
      source: "stock",
      label: "Stock Search (Pexels)",
      uri: `https://www.pexels.com/search/videos/${query}/`,
      mime_type: "text/uri-list",
      created_at: now,
    },
    {
      asset_id: createClientId("stock"),
      source: "stock",
      label: "Stock Search (Pixabay)",
      uri: `https://pixabay.com/videos/search/${query}/`,
      mime_type: "text/uri-list",
      created_at: now,
    },
  ];
}
