import type {
  EpisodeBrollAssetCandidate,
  EpisodeBrollDataVisualSpec,
  EpisodeBrollCoverageStrength,
  EpisodeBrollMotionAssetCategory,
  EpisodeBrollMotionIntent,
  EpisodeBrollPlan,
  EpisodeBrollPlanBeat,
  EpisodeBrollShotType,
} from "./episode-package-v2";
import { deriveBrollPurpose } from "./hearth-visual-purpose";

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
  if (/\bmap\b|\bregion\b|\bcountry\b|\bcity\b|\broute\b/.test(lower)) return "map";
  if (/\btimeline\b|\bchronolog|\bmilestone\b|\bphase\b|\bstage\b/.test(lower)) return "timeline";
  if (/\bdata\b|\bchart\b|\bstat\b|\bpercentage\b|\bmetric\b|\btrend\b/.test(lower)) return "data_visual";
  if (/\bcompared to\b|\bversus\b|\bcontrast\b/.test(lower)) return "cutaway";
  if (/\bfor example\b|\bfor instance\b|\blet'?s say\b/.test(lower)) return "explanatory";
  if (/\bhistory\b|\bback in\b|\bin \d{4}\b/.test(lower)) return "establishing";
  if (/\bpunchline\b|\bjoke\b|\bfunny\b/.test(lower)) return "reaction";
  if (/\bmeanwhile\b|\bnext\b|\bmoving on\b/.test(lower)) return "transition";
  if (/\bdiagram\b|\bgraphic\b|\bvisualize\b/.test(lower)) return "graphic";
  if (/\bfeel\b|\bemotion\b|\bstress\b|\banxiety\b|\bhope\b/.test(lower)) return "ambient";
  return "broll";
}

function inferShotType(intent: EpisodeBrollMotionIntent): EpisodeBrollShotType {
  if (intent === "establishing") return "wide";
  if (intent === "reaction") return "close";
  if (intent === "graphic" || intent === "data_visual" || intent === "map" || intent === "timeline") return "mixed";
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
  if (intent === "timeline") return 4500;
  if (intent === "ambient") return 5500;
  if (intent === "establishing") return 6000;
  if (intent === "data_visual" || intent === "map" || intent === "graphic") return 5000;
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

export type BrollVisualIntentTranslation = {
  intent: string;
  pattern: string;
  is_abstract: boolean;
  visual_happening: string;
  support_reason: string;
  viewer_feeling: string;
  scene_description: string;
  camera_framing: string;
  motion: string;
  tone: string;
  keywords: string[];
  shot_type: EpisodeBrollShotType;
  mood: string | null;
  motion_suggestion: string;
};

const ABSTRACT_BROLL_SIGNALS = [
  "access",
  "accountability",
  "argument",
  "decision",
  "democracy",
  "influence",
  "law",
  "laws",
  "leverage",
  "outcome",
  "policy",
  "power",
  "process",
  "rules",
  "system",
  "vote",
];

const CONCRETE_BROLL_SIGNALS = [
  "bridge",
  "building",
  "camera",
  "car",
  "chamber",
  "city",
  "crowd",
  "desk",
  "document",
  "door",
  "folder",
  "hand",
  "hallway",
  "map",
  "office",
  "paper",
  "person",
  "room",
  "screen",
  "street",
  "table",
  "train",
  "wall",
  "window",
];

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

function isAbstractBrollLine(text: string): boolean {
  const lower = text.toLowerCase();
  const abstractHits = ABSTRACT_BROLL_SIGNALS.filter((signal) => hasWord(lower, signal)).length;
  const concreteHits = CONCRETE_BROLL_SIGNALS.filter((signal) => hasWord(lower, signal)).length;
  return abstractHits >= 2 && concreteHits <= 1;
}

function formatMotionSuggestion(args: {
  visualHappening: string;
  supportReason: string;
  viewerFeeling: string;
  cameraFraming: string;
  motion: string;
  tone: string;
}): string {
  return [
    `What is happening visually: ${args.visualHappening}`,
    `Why it supports the line: ${args.supportReason}`,
    `What the viewer should feel: ${args.viewerFeeling}`,
    `Camera framing: ${args.cameraFraming}`,
    `Motion: ${args.motion}`,
    `Tone: ${args.tone}`,
    "Do not render the narration as literal keywords; use the visual intent and scene pattern.",
  ].join(" ");
}

function createBrollVisualTranslation(args: {
  intent: string;
  pattern: string;
  isAbstract: boolean;
  visualHappening: string;
  supportReason: string;
  viewerFeeling: string;
  sceneDescription: string;
  cameraFraming: string;
  motion: string;
  tone: string;
  keywords: string[];
  shotType?: EpisodeBrollShotType;
  mood?: string | null;
}): BrollVisualIntentTranslation {
  return {
    intent: args.intent,
    pattern: args.pattern,
    is_abstract: args.isAbstract,
    visual_happening: args.visualHappening,
    support_reason: args.supportReason,
    viewer_feeling: args.viewerFeeling,
    scene_description: args.sceneDescription,
    camera_framing: args.cameraFraming,
    motion: args.motion,
    tone: args.tone,
    keywords: args.keywords.slice(0, 8),
    shot_type: args.shotType ?? "mixed",
    mood: args.mood ?? null,
    motion_suggestion: formatMotionSuggestion({
      visualHappening: args.visualHappening,
      supportReason: args.supportReason,
      viewerFeeling: args.viewerFeeling,
      cameraFraming: args.cameraFraming,
      motion: args.motion,
      tone: args.tone,
    }),
  };
}

export function translateBrollVisualIntent(anchorText: string): BrollVisualIntentTranslation {
  const text = cleanSentenceText(anchorText);
  const lower = text.toLowerCase();
  const isAbstract = isAbstractBrollLine(text);

  if (/\bdon'?t lose laws?\b.*\bvote\b|\blaws?\b.*\bvote\b/.test(lower)) {
    return createBrollVisualTranslation({
      intent: "predetermined outcome",
      pattern: "paperwork finalized before formal action",
      isAbstract: true,
      visualHappening: "Already-signed folders sit on a committee table while an empty voting chamber waits in the background.",
      supportReason: "It turns the spoken idea into a process visual: the outcome appears settled before the visible vote happens.",
      viewerFeeling: "quiet inevitability, like the public ceremony is arriving after the real decision.",
      sceneDescription: "A cinematic editorial shot of already-signed folders and stamped paperwork on a committee table, with an empty voting chamber softly out of focus behind it.",
      cameraFraming: "Start in a close foreground detail on the paperwork, then reveal the empty chamber as context.",
      motion: "Slow push-in or subtle rack focus from finished paperwork to vacant seats.",
      tone: "restrained, procedural, slightly uneasy",
      keywords: ["signed documents", "committee table", "empty chamber", "paperwork", "vacant seats", "procedural vote"],
      shotType: "mixed",
      mood: "serious",
    });
  }

  if (/\b(access|influence|pressure|lobby|leverage|power)\b/.test(lower)) {
    return createBrollVisualTranslation({
      intent: "hidden influence",
      pattern: "quiet access before public explanation",
      isAbstract,
      visualHappening: "A closed office door, a hallway exchange, and a folder changing hands suggest decisions forming offstage.",
      supportReason: "It shows influence as access and proximity rather than literal money or slogans.",
      viewerFeeling: "curious unease, as if something important is happening just out of public view.",
      sceneDescription: "A documentary hallway outside government offices, with a quiet folder handoff near a closed door and staff moving in soft background blur.",
      cameraFraming: "Medium telephoto framing through the hallway, keeping faces non-identifying and the folder as the focal subject.",
      motion: "Slow lateral drift or handheld observational movement.",
      tone: "observational, controlled, lightly tense",
      keywords: ["closed office door", "hallway exchange", "folder handoff", "government office", "staffers"],
      shotType: "medium",
      mood: "serious",
    });
  }

  if (/\b(process|rules|policy|system|bureaucracy|procedure)\b/.test(lower)) {
    return createBrollVisualTranslation({
      intent: "bureaucratic process",
      pattern: "documents moving through a system",
      isAbstract,
      visualHappening: "Forms move from inbox to stamp to file tray, turning an invisible process into visible workflow.",
      supportReason: "It makes the abstract machinery of policy feel concrete without literalizing the spoken words.",
      viewerFeeling: "the weight of a slow, procedural machine.",
      sceneDescription: "A close editorial sequence of forms being stamped, sorted into trays, and filed under fluorescent office light.",
      cameraFraming: "Macro and close detail shots of hands, stamps, folders, and trays.",
      motion: "Rhythmic cuts or a slow overhead slide across the paper trail.",
      tone: "methodical, institutional, grounded",
      keywords: ["forms", "file trays", "rubber stamp", "paperwork", "office workflow"],
      shotType: "close",
      mood: "serious",
    });
  }

  if (/\b(public|voter|democracy|accountability|trust)\b/.test(lower)) {
    return createBrollVisualTranslation({
      intent: "institutional distance",
      pattern: "public separated from decision space",
      isAbstract,
      visualHappening: "A public gallery or waiting area sits separated from the room where officials work.",
      supportReason: "It visualizes the gap between public stakes and institutional decision-making.",
      viewerFeeling: "distance, exclusion, and the need to look closer.",
      sceneDescription: "A wide editorial shot through glass or railing, showing a quiet public gallery separated from a formal meeting room.",
      cameraFraming: "Wide frame with foreground barrier and decision space in the distance.",
      motion: "Very slow push toward the barrier without crossing it.",
      tone: "quiet, reflective, civic",
      keywords: ["public gallery", "glass barrier", "meeting room", "empty seats", "institutional distance"],
      shotType: "wide",
      mood: "serious",
    });
  }

  if (isAbstract) {
    return createBrollVisualTranslation({
      intent: "abstract process visual",
      pattern: "metaphor for an invisible decision path",
      isAbstract: true,
      visualHappening: "A marked folder travels across desks and disappears into a final tray.",
      supportReason: "It converts the abstract point into a visible chain of action instead of copying the narration literally.",
      viewerFeeling: "a sense of systems moving beneath the surface.",
      sceneDescription: "A grounded editorial process visual: a marked folder moving across desks, signatures, stamps, and a final tray under muted office light.",
      cameraFraming: "Close and medium inserts that emphasize hands, documents, and spatial progression.",
      motion: "Measured tracking movement following the folder from step to step.",
      tone: "subtle, procedural, thoughtful",
      keywords: ["marked folder", "paper trail", "office process", "signed form", "file tray"],
      shotType: "mixed",
      mood: "serious",
    });
  }

  return createBrollVisualTranslation({
    intent: "literal coverage",
    pattern: "concrete supporting scene",
    isAbstract: false,
    visualHappening: text,
    supportReason: "It gives the editor a direct visual anchor for the spoken beat.",
    viewerFeeling: inferMood(text) ?? "clear context",
    sceneDescription: text,
    cameraFraming: "Use clear editorial framing with one readable focal subject.",
    motion: "Use gentle documentary movement that supports the beat without distracting from narration.",
    tone: inferMood(text) ?? "neutral editorial",
    keywords: inferKeywords(text),
    shotType: inferShotType(inferMotionIntent(text)),
    mood: inferMood(text),
  });
}

function inferMotionSuggestion(intent: EpisodeBrollMotionIntent): string {
  if (intent === "data_visual") return "Use an animated data visual that highlights the key comparison.";
  if (intent === "map") return "Use a map animation to orient the audience geographically.";
  if (intent === "timeline") return "Use a timeline animation to sequence major milestones.";
  if (intent === "graphic") return "Use animated overlays or data callouts.";
  if (intent === "transition") return "Use a short connector shot to bridge sections.";
  if (intent === "establishing") return "Open with a wide contextual shot before tightening coverage.";
  if (intent === "reaction") return "Prefer a quick reaction insert to punctuate the line.";
  if (intent === "ambient") return "Layer atmospheric footage with subtle movement.";
  if (intent === "explanatory") return "Use explanatory visuals that track the spoken concept.";
  return "Use supporting B-roll that reinforces the spoken narrative.";
}

function inferAssetCategory(intent: EpisodeBrollMotionIntent): EpisodeBrollMotionAssetCategory {
  if (intent === "data_visual") return "animated_chart";
  if (intent === "map") return "map_animation";
  if (intent === "timeline") return "timeline_graphic";
  if (intent === "graphic") return "animated_graphic";
  if (intent === "explanatory") return "stat_card";
  return "stock_video";
}

function inferDataVisualSpec(args: {
  description: string;
  motionIntent: EpisodeBrollMotionIntent;
  previous?: EpisodeBrollDataVisualSpec | null;
}): EpisodeBrollDataVisualSpec | null {
  if (args.motionIntent !== "data_visual") return null;
  if (args.previous) return args.previous;

  const values = Array.from(args.description.matchAll(/(?<!\d)(\d{1,3})(?:\.\d+)?/g))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value))
    .slice(0, 4);
  const labels = values.map((_, index) => `Metric ${index + 1}`);
  return {
    chart_type: values.length > 0 && values.length <= 2 ? "stat" : "bar",
    title: args.description.slice(0, 120),
    labels,
    values,
    emphasis_key: values.length > 0 ? labels[0] : null,
    animation_style: "smooth-rise",
  };
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
    const visualTranslation = translateBrollVisualIntent(sentence);
    const previousDescription = readString(previous?.description);
    const hasManualPreviousDescription = Boolean(previousDescription && previousDescription !== sentence);
    const resolvedDescription = hasManualPreviousDescription ? previousDescription : visualTranslation.scene_description;
    const resolvedKeywords = previous?.keywords?.length && hasManualPreviousDescription
      ? previous.keywords
      : visualTranslation.keywords;
    const resolvedMood = previous?.mood ?? visualTranslation.mood ?? inferMood(sentence);
    const resolvedShotType = previous?.shot_type ?? visualTranslation.shot_type ?? inferShotType(motionIntent);
    const resolvedMotionSuggestion = previous?.motion_suggestion && hasManualPreviousDescription
      ? previous.motion_suggestion
      : visualTranslation.motion_suggestion;
    const purpose = deriveBrollPurpose({
      rawPurpose: previous?.purpose ?? null,
      motionIntent,
      description: resolvedDescription,
      anchorText: sentence,
    });
    return {
      id: previous?.id ?? createClientId("broll-beat"),
      workpiece_id: args.workpieceId,
      anchor_text: sentence,
      placement_hint: "first_occurrence",
      timestamp_ms: previous?.timestamp_ms ?? null,
      purpose,
      description: resolvedDescription,
      motion_intent: motionIntent,
      visual_style: previous?.visual_style ?? null,
      priority: previous?.priority ?? inferPriority(index),
      keywords: resolvedKeywords,
      mood: resolvedMood,
      shot_type: resolvedShotType,
      motion_suggestion: resolvedMotionSuggestion,
      suggested_duration_ms: previous?.suggested_duration_ms ?? inferSuggestedDurationMs(motionIntent),
      source_type: previous?.source_type ?? "planned",
      asset_category: previous?.asset_category ?? inferAssetCategory(motionIntent),
      data_visual_spec: inferDataVisualSpec({
        description: resolvedDescription,
        motionIntent,
        previous: previous?.data_visual_spec ?? null,
      }),
      selected_asset_id: previous?.selected_asset_id ?? null,
      candidate_assets: previous?.candidate_assets ?? [],
      external_request: previous?.external_request ?? {
        state: "planned",
        updated_at: generatedAt,
      },
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
  const visualTranslation = translateBrollVisualIntent(description);
  const isTranslated = visualTranslation.is_abstract || description === beat.anchor_text;
  const resolvedDescription = isTranslated ? visualTranslation.scene_description : description;
  const next = {
    ...beat,
    purpose: deriveBrollPurpose({
      rawPurpose: beat.purpose,
      motionIntent,
      description: resolvedDescription,
      anchorText: beat.anchor_text,
    }),
    motion_intent: motionIntent,
    asset_category: inferAssetCategory(motionIntent),
    description: resolvedDescription,
    keywords: isTranslated ? visualTranslation.keywords : inferKeywords(description),
    mood: visualTranslation.mood ?? inferMood(description),
    shot_type: visualTranslation.shot_type ?? inferShotType(motionIntent),
    motion_suggestion: isTranslated ? visualTranslation.motion_suggestion : inferMotionSuggestion(motionIntent),
    suggested_duration_ms: inferSuggestedDurationMs(motionIntent),
    data_visual_spec: inferDataVisualSpec({
      description: resolvedDescription,
      motionIntent,
      previous: beat.data_visual_spec ?? null,
    }),
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
      asset_class: "broll",
      source_beat_id: beat.id,
      source_label: "Pexels",
      source_url: `https://www.pexels.com/search/videos/${query}/`,
      asset_category: beat.motion_intent === "data_visual"
        ? "animated_chart"
        : beat.motion_intent === "map"
          ? "map_animation"
          : beat.motion_intent === "timeline"
            ? "timeline_graphic"
            : "stock_video",
      label: "Stock Search (Pexels)",
      uri: `https://www.pexels.com/search/videos/${query}/`,
      mime_type: "text/uri-list",
      data_visual_spec: beat.data_visual_spec ?? null,
      created_at: now,
    },
    {
      asset_id: createClientId("stock"),
      source: "stock",
      asset_class: "broll",
      source_beat_id: beat.id,
      source_label: "Pixabay",
      source_url: `https://pixabay.com/videos/search/${query}/`,
      asset_category: beat.motion_intent === "data_visual"
        ? "animated_chart"
        : beat.motion_intent === "map"
          ? "map_animation"
          : beat.motion_intent === "timeline"
            ? "timeline_graphic"
            : "stock_video",
      label: "Stock Search (Pixabay)",
      uri: `https://pixabay.com/videos/search/${query}/`,
      mime_type: "text/uri-list",
      data_visual_spec: beat.data_visual_spec ?? null,
      created_at: now,
    },
  ];
}
