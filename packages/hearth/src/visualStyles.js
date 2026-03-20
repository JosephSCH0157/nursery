const STYLE_DEFINITIONS = [
  {
    value: "cinematic_realism",
    label: "Cinematic Realism",
    promptHint: "cinematic realism, grounded lighting, lens-based composition, atmospheric detail, editorial clarity",
  },
  {
    value: "studio_photography",
    label: "Studio Photography",
    promptHint: "studio photography, controlled lighting, crisp subject separation, polished commercial finish",
  },
  {
    value: "digital_illustration",
    label: "Digital Illustration",
    promptHint: "digital illustration, intentional linework, clean shapes, editorial clarity, polished color blocking",
  },
  {
    value: "three_d_animation",
    label: "3D Animation",
    promptHint: "3D animation, stylized dimensional forms, rendered depth, cinematic lighting, polished surfaces",
  },
  {
    value: "stop_motion",
    label: "Stop Motion",
    promptHint: "stop motion miniature craftsmanship, tactile materials, handcrafted set detail, physical model texture",
  },
  {
    value: "marker_render",
    label: "Marker Render",
    promptHint: "marker rendering, bold strokes, designer concept-sketch energy, visible marker texture, hand-rendered edges",
  },
  {
    value: "colored_pencil",
    label: "Colored Pencil",
    promptHint: "colored pencil illustration, layered pencil texture, hand-drawn shading, paper grain, soft blended color",
  },
  {
    value: "oil_painting",
    label: "Oil Painting",
    promptHint: "oil painting on canvas, painterly brushwork, rich texture, layered color, gallery-quality composition",
  },
];

const STYLE_ALIAS_TABLE = {
  cinematic: "cinematic_realism",
  cinematic_realism: "cinematic_realism",
  "cinematic realism": "cinematic_realism",
  realism: "cinematic_realism",
  realistic: "cinematic_realism",
  studio: "studio_photography",
  studio_photography: "studio_photography",
  "studio photography": "studio_photography",
  "studio lighting": "studio_photography",
  photography: "studio_photography",
  photo: "studio_photography",
  digital_illustration: "digital_illustration",
  "digital illustration": "digital_illustration",
  illustration: "digital_illustration",
  illustrated: "digital_illustration",
  three_d_animation: "three_d_animation",
  "three d animation": "three_d_animation",
  "3d animation": "three_d_animation",
  "3d": "three_d_animation",
  cg: "three_d_animation",
  stop_motion: "stop_motion",
  "stop motion": "stop_motion",
  marker_render: "marker_render",
  "marker render": "marker_render",
  marker: "marker_render",
  "marker sketch": "marker_render",
  colored_pencil: "colored_pencil",
  "colored pencil": "colored_pencil",
  pencil: "colored_pencil",
  "color pencil": "colored_pencil",
  oil_painting: "oil_painting",
  "oil painting": "oil_painting",
  "oil on canvas": "oil_painting",
};

const STYLE_BY_VALUE = new Map(STYLE_DEFINITIONS.map((definition) => [definition.value, definition]));

function normalizeLookupValue(value) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolveVisualStyleKey(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalizedKey = normalizeLookupValue(trimmed);
  if (STYLE_BY_VALUE.has(normalizedKey)) return normalizedKey;
  if (STYLE_ALIAS_TABLE[normalizedKey]) return STYLE_ALIAS_TABLE[normalizedKey];
  if (STYLE_ALIAS_TABLE[trimmed.toLowerCase()]) return STYLE_ALIAS_TABLE[trimmed.toLowerCase()];
  return null;
}

export const DEFAULT_HEARTH_VISUAL_STYLE = "cinematic_realism";
export const HEARTH_VISUAL_STYLE_DEFINITIONS = STYLE_DEFINITIONS;
export const HEARTH_VISUAL_STYLE_VALUES = STYLE_DEFINITIONS.map((definition) => definition.value);

export function parseHearthVisualStyle(value) {
  return resolveVisualStyleKey(value);
}

export function isHearthVisualStyle(value) {
  return resolveVisualStyleKey(value) !== null;
}

export function normalizeHearthVisualStyle(value, fallback = DEFAULT_HEARTH_VISUAL_STYLE) {
  return resolveVisualStyleKey(value) ?? fallback;
}

export function resolveHearthVisualStyleDefinition(value) {
  const key = normalizeHearthVisualStyle(value);
  return STYLE_BY_VALUE.get(key) ?? STYLE_BY_VALUE.get(DEFAULT_HEARTH_VISUAL_STYLE);
}

export function resolveHearthVisualStyleLabel(value) {
  return resolveHearthVisualStyleDefinition(value)?.label ?? "Cinematic Realism";
}

export function buildHearthVisualStylePromptLines(value) {
  const definition = resolveHearthVisualStyleDefinition(value);
  if (!definition) return [];
  return [
    `Visual style: ${definition.label}.`,
    `Style direction: ${definition.promptHint}.`,
  ];
}
