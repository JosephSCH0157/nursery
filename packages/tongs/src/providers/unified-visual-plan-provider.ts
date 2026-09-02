export type UnifiedVisualSourceCatalogEntry = {
  source_key: string;
  title: string;
  publisher: string | null;
  source_type: string;
  canonical_url: string;
  user_supplied: boolean;
};
export type UnifiedVisualSourceRelationship =
  | "direct"
  | "supporting"
  | "ambiguous"
  | "none";
type SourceProposal = {
  source_keys: string[];
  source_relationship: UnifiedVisualSourceRelationship;
  source_rationale: string;
};
export type UnifiedVisualPlanResult = {
  images: Array<
    {
      context_before: string;
      context_focus: string;
      context_after: string;
      description: string;
      visual_intent: string;
      creator_direction: string;
      style: string;
      placement_hint: string;
    } & SourceProposal
  >;
  broll: Array<
    {
      context_before: string;
      context_focus: string;
      context_after: string;
      narrative_purpose: string;
      placement_hint: string;
      duration_target_ms: number;
      shot_type: string;
      motion_intent: string;
      mood_pacing: string;
      asset_category: string;
    } & SourceProposal
  >;
  reference_clips: Array<
    {
      context_before: string;
      context_focus: string;
      context_after: string;
      editorial_reason: string;
      desired_material: string;
      search_terms: string[];
      narrative_purpose: string;
      placement_hint: string;
      duration_target_ms: number;
    } & SourceProposal
  >;
  reference_visuals: Array<
    {
      context_before: string;
      context_focus: string;
      context_after: string;
      visual_subtype:
        | "chart"
        | "timeline"
        | "document_excerpt"
        | "quote_card"
        | "stat_card"
        | "comparison"
        | "archival_still"
        | "archival_sequence";
      editorial_reason: string;
      audience_understanding: string;
      required_evidence: string;
      required_source_type: string;
      desired_material: string;
      search_terms: string[];
      placement_hint: string;
      duration_target_ms: number;
      creator_direction: string;
    } & SourceProposal
  >;
};
export type UnifiedVisualPlanGenerationScope =
  | "images_only"
  | "images_broll"
  | "images_reference_clips"
  | "full_media_plan";
export type UnifiedVisualPlanProviderOutput = {
  plan: UnifiedVisualPlanResult;
  rawResponse: Record<string, unknown>;
  providerRequestId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
};
export interface UnifiedVisualPlanProvider {
  generate(input: {
    scriptText: string;
    creatorDirection: string | null;
    generationScope: UnifiedVisualPlanGenerationScope;
    sourceCatalog: UnifiedVisualSourceCatalogEntry[];
    model?: string | null;
  }): Promise<UnifiedVisualPlanProviderOutput>;
}
const itemContext = {
  context_before: { type: "string" },
  context_focus: { type: "string" },
  context_after: { type: "string" },
} as const;
const sourceFields = {
  source_keys: { type: "array", maxItems: 8, items: { type: "string" } },
  source_relationship: {
    type: "string",
    enum: ["direct", "supporting", "ambiguous", "none"],
  },
  source_rationale: { type: "string" },
} as const;
const sourceRequired = [
  "source_keys",
  "source_relationship",
  "source_rationale",
] as const;
const scopeInstructions = `Treat generation_scope as a strict media-family allowlist: images_only permits only Images; images_broll permits only Images and B-roll; images_reference_clips permits only Images and Reference Clips; full_media_plan permits every declared category. Return empty arrays for every disallowed category. Creator direction may change distribution inside the selected scope but must never widen it. `;
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["images", "broll", "reference_clips", "reference_visuals"],
  properties: {
    images: {
      type: "array",
      minItems: 1,
      maxItems: 90,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "context_before",
          "context_focus",
          "context_after",
          "description",
          "visual_intent",
          "creator_direction",
          "style",
          "placement_hint",
          ...sourceRequired,
        ],
        properties: {
          ...itemContext,
          ...sourceFields,
          description: { type: "string" },
          visual_intent: { type: "string" },
          creator_direction: { type: "string" },
          style: { type: "string" },
          placement_hint: { type: "string" },
        },
      },
    },
    broll: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "context_before",
          "context_focus",
          "context_after",
          "narrative_purpose",
          "placement_hint",
          "duration_target_ms",
          "shot_type",
          "motion_intent",
          "mood_pacing",
          "asset_category",
          ...sourceRequired,
        ],
        properties: {
          ...itemContext,
          ...sourceFields,
          narrative_purpose: { type: "string" },
          placement_hint: { type: "string" },
          duration_target_ms: {
            type: "integer",
            minimum: 1000,
            maximum: 30000,
          },
          shot_type: { type: "string" },
          motion_intent: { type: "string" },
          mood_pacing: { type: "string" },
          asset_category: { type: "string" },
        },
      },
    },
    reference_clips: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "context_before",
          "context_focus",
          "context_after",
          "editorial_reason",
          "desired_material",
          "search_terms",
          "narrative_purpose",
          "placement_hint",
          "duration_target_ms",
          ...sourceRequired,
        ],
        properties: {
          ...itemContext,
          ...sourceFields,
          editorial_reason: { type: "string" },
          desired_material: { type: "string" },
          search_terms: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string" },
          },
          narrative_purpose: { type: "string" },
          placement_hint: { type: "string" },
          duration_target_ms: {
            type: "integer",
            minimum: 1000,
            maximum: 30000,
          },
        },
      },
    },
    reference_visuals: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "context_before",
          "context_focus",
          "context_after",
          "visual_subtype",
          "editorial_reason",
          "audience_understanding",
          "required_evidence",
          "required_source_type",
          "desired_material",
          "search_terms",
          "placement_hint",
          "duration_target_ms",
          "creator_direction",
          ...sourceRequired,
        ],
        properties: {
          ...itemContext,
          ...sourceFields,
          visual_subtype: {
            type: "string",
            enum: [
              "chart",
              "timeline",
              "document_excerpt",
              "quote_card",
              "stat_card",
              "comparison",
              "archival_still",
              "archival_sequence",
            ],
          },
          editorial_reason: { type: "string" },
          audience_understanding: { type: "string" },
          required_evidence: { type: "string" },
          required_source_type: { type: "string" },
          desired_material: { type: "string" },
          search_terms: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string" },
          },
          placement_hint: { type: "string" },
          duration_target_ms: {
            type: "integer",
            minimum: 250,
            maximum: 120000,
          },
          creator_direction: { type: "string" },
        },
      },
    },
  },
};
const instructions = `Create one mixed editorial visual plan from the exact approved podcast script. Each script passage belongs to exactly one visual family: never reuse or overlap a context_focus across Images, B-roll, Reference Clips, or Reference Visuals. Choose the single treatment that communicates that moment best. Prefer a Reference Visual for sourced numbers, comparisons, timelines, quotes, or documents; an authentic Reference Clip when the source media itself is essential and obtainable; B-roll for motion, process, atmosphere, or newly filmed coverage; and an Image for a static person, place, object, or concept. For each item identify provenance only with opaque source_key values from source_catalog. Never invent a URL or source key. Use direct only when one source is the specific basis; supporting for an intentionally joint ordered set; ambiguous when several catalog sources are plausible; none with an empty source_keys array when no catalog source applies. When the script centers named public figures, use verified-photo opportunities rather than inventing their appearance. Planning is editorial only: never invent a Source, statistic, quote, URL, archive, rights claim, or existing asset. Every context_focus must be an exact nonempty excerpt from the supplied script. Return only the structured result.`;
function outputText(payload: Record<string, unknown>): string | null {
  const output = payload.output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content)
      if (
        part &&
        typeof part === "object" &&
        typeof (part as Record<string, unknown>).text === "string"
      )
        return (part as Record<string, string>).text;
  }
  return null;
}
export class OpenAiUnifiedVisualPlanProvider {
  private readonly apiKey: string;
  private readonly defaultModel: string;
  constructor(apiKey: string, defaultModel = "gpt-5-mini") {
    if (!apiKey.trim())
      throw new Error("OpenAI visual-plan API key is required");
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }
  async generate(input: {
    scriptText: string;
    creatorDirection: string | null;
    generationScope: UnifiedVisualPlanGenerationScope;
    sourceCatalog: UnifiedVisualSourceCatalogEntry[];
    model?: string | null;
  }): Promise<UnifiedVisualPlanProviderOutput> {
    const model = input.model?.trim() || this.defaultModel;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: `${scopeInstructions}${instructions}`,
        input: JSON.stringify({
          approved_script: input.scriptText,
          creator_direction: input.creatorDirection,
          generation_scope: input.generationScope,
          source_catalog: input.sourceCatalog,
        }),
        text: {
          format: {
            type: "json_schema",
            name: "unified_visual_plan",
            strict: true,
            schema,
          },
        },
      }),
    });
    const rawText = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawText) as Record<string, unknown>;
    } catch {}
    if (!response.ok)
      throw new Error(
        (payload.error as { message?: string } | undefined)?.message ||
          rawText ||
          `Visual planning failed (${response.status})`,
      );
    const text = outputText(payload);
    if (!text)
      throw new Error("Visual-plan provider returned no structured output");
    const plan = JSON.parse(text) as UnifiedVisualPlanResult;
    const usage = (
      payload.usage && typeof payload.usage === "object" ? payload.usage : {}
    ) as Record<string, unknown>;
    const inputTokens =
      typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
    const outputTokens =
      typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
    return {
      plan,
      rawResponse: payload,
      providerRequestId: response.headers.get("x-request-id"),
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      model,
    };
  }
}
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function exactScriptSpan(scriptText: string, candidate: string): string | null {
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  if (scriptText.includes(trimmed)) return trimmed;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const matcher = new RegExp(tokens.map(escapeRegExp).join("\\s+"), "g");
  const matches = [...scriptText.matchAll(matcher)];
  if (matches.length === 1 && typeof matches[0].index === "number")
    return scriptText.slice(
      matches[0].index,
      matches[0].index + matches[0][0].length,
    );
  const exactSegments = trimmed
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(
      (part) =>
        part.length >= 12 &&
        scriptText.indexOf(part) >= 0 &&
        scriptText.indexOf(part) === scriptText.lastIndexOf(part),
    )
    .sort((left, right) => right.length - left.length);
  return exactSegments[0] ?? null;
}
export function normalizeUnifiedVisualPlanContextAnchors(
  plan: UnifiedVisualPlanResult,
  scriptText: string,
): UnifiedVisualPlanResult {
  for (const kind of [
    "images",
    "broll",
    "reference_clips",
    "reference_visuals",
  ] as const)
    for (const item of plan[kind] ?? []) {
      const exact = exactScriptSpan(
        scriptText,
        String(item.context_focus ?? ""),
      );
      if (exact) item.context_focus = exact;
    }
  return plan;
}
type UnifiedVisualFamily = keyof UnifiedVisualPlanResult;
const familyOrder: UnifiedVisualFamily[] = [
  "reference_visuals",
  "reference_clips",
  "broll",
  "images",
];
const DEFAULT_NARRATION_WPM = 150;
function countSpeakableWords(scriptText: string): number {
  return (
    scriptText.replace(/\[[^\]]+\]/g, " ").match(/\b[\p{L}\p{N}'’-]+\b/gu)
      ?.length ?? 0
  );
}
export function deriveUnifiedVisualMomentBudget(scriptText: string): number {
  const durationMinutes = Math.max(
    0.25,
    countSpeakableWords(scriptText) / DEFAULT_NARRATION_WPM,
  );
  const minimum =
    durationMinutes <= 3
      ? Math.max(1, Math.floor(durationMinutes))
      : Math.max(
          1,
          Math.floor(durationMinutes * 1.2) + (durationMinutes >= 24 ? 0 : 2),
        );
  return durationMinutes <= 3
    ? Math.max(minimum, Math.ceil(durationMinutes * 1.5))
    : Math.max(
        minimum,
        Math.ceil(durationMinutes * 1.4) + (durationMinutes >= 24 ? 1 : 2),
      );
}
function coverageScore(
  family: UnifiedVisualFamily,
  item: UnifiedVisualPlanResult[UnifiedVisualFamily][number],
): number {
  const focus = String(item.context_focus ?? "");
  const sourced =
    item.source_relationship === "direct"
      ? 40
      : item.source_relationship === "supporting"
        ? 20
        : 0;
  const numeric = /[$%]|\b\d[\d,.]*\b/.test(focus),
    quoted =
      /[“”"]|\b(?:said|reported|according to|document|budget|study)\b/i.test(
        focus,
      ),
    motion =
      /\b(?:move|moving|travel|ride|drive|walk|run|build|working|arrive|depart|crowd|traffic|process)\w*\b/i.test(
        focus,
      );
  if (family === "reference_visuals")
    return 400 + sourced + (numeric ? 120 : 0) + (quoted ? 80 : 0);
  if (family === "reference_clips") return 350 + sourced + (quoted ? 110 : 0);
  if (family === "broll") return 250 + (motion ? 120 : 0);
  return 200 + (numeric || quoted || motion ? 0 : 60);
}
export function arbitrateUnifiedVisualPlanCoverage(
  plan: UnifiedVisualPlanResult,
  scriptText: string,
): UnifiedVisualPlanResult {
  const candidates = familyOrder
    .flatMap((family) =>
      plan[family].map((item, index) => {
        const start = scriptText.indexOf(item.context_focus),
          end = start + item.context_focus.length;
        return {
          family,
          index,
          item,
          start,
          end,
          score: coverageScore(family, item),
        };
      }),
    )
    .filter((candidate) => candidate.start >= 0)
    .sort(
      (left, right) =>
        left.start - right.start ||
        right.end - left.end ||
        right.score - left.score,
    );
  const winners: typeof candidates = [];
  for (const candidate of candidates) {
    const conflicts = winners.filter(
      (winner) => candidate.start < winner.end && winner.start < candidate.end,
    );
    if (!conflicts.length) {
      winners.push(candidate);
      continue;
    }
    const best = [candidate, ...conflicts].sort(
      (left, right) =>
        right.score - left.score ||
        familyOrder.indexOf(left.family) - familyOrder.indexOf(right.family) ||
        left.index - right.index,
    )[0]!;
    if (best === candidate) {
      for (const conflict of conflicts)
        winners.splice(winners.indexOf(conflict), 1);
      winners.push(candidate);
    }
  }
  const budgeted = winners
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.start - right.start ||
          familyOrder.indexOf(left.family) - familyOrder.indexOf(right.family),
      )
      .slice(0, deriveUnifiedVisualMomentBudget(scriptText)),
    keep = new Set(
      budgeted.map((winner) => `${winner.family}:${winner.index}`),
    );
  return {
    images: plan.images.filter((_, index) => keep.has(`images:${index}`)),
    broll: plan.broll.filter((_, index) => keep.has(`broll:${index}`)),
    reference_clips: plan.reference_clips.filter((_, index) =>
      keep.has(`reference_clips:${index}`),
    ),
    reference_visuals: plan.reference_visuals.filter((_, index) =>
      keep.has(`reference_visuals:${index}`),
    ),
  };
}
export function validateUnifiedVisualPlan(
  plan: UnifiedVisualPlanResult,
  scriptText: string,
  allowedSourceKeys?: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  for (const kind of [
    "images",
    "broll",
    "reference_clips",
    "reference_visuals",
  ] as const) {
    const items = plan[kind];
    if (!Array.isArray(items)) {
      errors.push(`${kind}:array_required`);
      continue;
    }
    for (const [index, item] of items.entries()) {
      if (!item || typeof item !== "object") {
        errors.push(`${kind}[${index}]:object_required`);
        continue;
      }
      const focus = String(item.context_focus ?? "").trim();
      if (!focus || !scriptText.includes(focus))
        errors.push(`${kind}[${index}]:context_focus_not_exact`);
      if (allowedSourceKeys) {
        if (!Array.isArray(item.source_keys))
          errors.push(`${kind}[${index}]:source_keys_required`);
        else
          for (const key of item.source_keys)
            if (!allowedSourceKeys.has(key))
              errors.push(`${kind}[${index}]:unknown_source_key`);
        if (item.source_relationship === "none" && item.source_keys?.length)
          errors.push(`${kind}[${index}]:none_source_keys_forbidden`);
        if (
          item.source_relationship === "direct" &&
          item.source_keys?.length !== 1
        )
          errors.push(`${kind}[${index}]:direct_source_count`);
        if (
          item.source_relationship === "ambiguous" &&
          item.source_keys?.length < 2
        )
          errors.push(`${kind}[${index}]:ambiguous_source_count`);
      }
    }
  }
  if (
    [
      plan.images,
      plan.broll,
      plan.reference_clips,
      plan.reference_visuals,
    ].every((items) => Array.isArray(items) && items.length === 0)
  )
    errors.push("visual_plan:empty");
  for (const kind of ["reference_clips", "reference_visuals"] as const)
    for (const [index, item] of (plan[kind] ?? []).entries())
      if (
        !item.search_terms?.length ||
        item.search_terms.some((term) => !term.trim())
      )
        errors.push(`${kind}[${index}]:search_terms_required`);
  return [...new Set(errors)];
}
export function validateUnifiedVisualPlanScope(
  plan: UnifiedVisualPlanResult,
  scope: UnifiedVisualPlanGenerationScope,
): string[] {
  const allowed = new Set(
    scope === "images_only"
      ? ["images"]
      : scope === "images_broll"
        ? ["images", "broll"]
        : scope === "images_reference_clips"
          ? ["images", "reference_clips"]
          : ["images", "broll", "reference_clips", "reference_visuals"],
  );
  return (
    ["images", "broll", "reference_clips", "reference_visuals"] as const
  ).flatMap((kind) =>
    allowed.has(kind) || !Array.isArray(plan[kind]) || plan[kind].length === 0
      ? []
      : [`${kind}:disallowed_by_generation_scope`],
  );
}
