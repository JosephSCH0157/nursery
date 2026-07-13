export type HearthVisualStyleValue =
  | "cinematic_realism" | "studio_photography" | "digital_illustration"
  | "three_d_animation" | "stop_motion" | "marker_render"
  | "colored_pencil" | "oil_painting";

export type HearthVisualStyleDefinition = {
  value: HearthVisualStyleValue;
  label: string;
  promptHint: string;
};

const STYLE_DEFINITIONS: HearthVisualStyleDefinition[] = [
  { value: "cinematic_realism", label: "Cinematic Realism", promptHint: "cinematic realism, grounded lighting, lens-based composition, atmospheric detail, editorial clarity" },
  { value: "studio_photography", label: "Studio Photography", promptHint: "studio photography, controlled lighting, crisp subject separation, polished commercial finish" },
  { value: "digital_illustration", label: "Digital Illustration", promptHint: "digital illustration, intentional linework, clean shapes, editorial clarity, polished color blocking" },
  { value: "three_d_animation", label: "3D Animation", promptHint: "3D animation, stylized dimensional forms, rendered depth, cinematic lighting, polished surfaces" },
  { value: "stop_motion", label: "Stop Motion", promptHint: "stop motion miniature craftsmanship, tactile materials, handcrafted set detail, physical model texture" },
  { value: "marker_render", label: "Marker Render", promptHint: "marker rendering, bold strokes, designer concept-sketch energy, visible marker texture, hand-rendered edges" },
  { value: "colored_pencil", label: "Colored Pencil", promptHint: "colored pencil illustration, layered pencil texture, hand-drawn shading, paper grain, soft blended color" },
  { value: "oil_painting", label: "Oil Painting", promptHint: "oil painting on canvas, painterly brushwork, rich texture, layered color, gallery-quality composition" },
];

const ALIASES: Record<string, HearthVisualStyleValue> = {
  cinematic: "cinematic_realism", cinematic_realism: "cinematic_realism", realism: "cinematic_realism", realistic: "cinematic_realism",
  studio: "studio_photography", studio_photography: "studio_photography", studio_lighting: "studio_photography", photography: "studio_photography", photo: "studio_photography",
  digital_illustration: "digital_illustration", illustration: "digital_illustration", illustrated: "digital_illustration",
  three_d_animation: "three_d_animation", "3d_animation": "three_d_animation", "3d": "three_d_animation", cg: "three_d_animation",
  stop_motion: "stop_motion", marker_render: "marker_render", marker: "marker_render", marker_sketch: "marker_render",
  colored_pencil: "colored_pencil", pencil: "colored_pencil", color_pencil: "colored_pencil",
  oil_painting: "oil_painting", oil_on_canvas: "oil_painting",
};
const BY_VALUE = new Map(STYLE_DEFINITIONS.map((definition) => [definition.value, definition]));
const key = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^\w]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
const resolve = (value: unknown): HearthVisualStyleValue | null => typeof value === "string" && value.trim() ? ALIASES[key(value)] ?? null : null;

export const DEFAULT_HEARTH_VISUAL_STYLE: HearthVisualStyleValue = "cinematic_realism";
export const HEARTH_VISUAL_STYLE_DEFINITIONS = STYLE_DEFINITIONS;
export const HEARTH_VISUAL_STYLE_VALUES = STYLE_DEFINITIONS.map(({ value }) => value);
export const parseHearthVisualStyle = resolve;
export const isHearthVisualStyle = (value: unknown): value is HearthVisualStyleValue => resolve(value) !== null;
export const normalizeHearthVisualStyle = (value: unknown, fallback = DEFAULT_HEARTH_VISUAL_STYLE) => resolve(value) ?? fallback;
export const resolveHearthVisualStyleDefinition = (value: unknown) => BY_VALUE.get(normalizeHearthVisualStyle(value)) ?? BY_VALUE.get(DEFAULT_HEARTH_VISUAL_STYLE)!;
export const resolveHearthVisualStyleLabel = (value: unknown) => resolveHearthVisualStyleDefinition(value).label;
export const buildHearthVisualStylePromptLines = (value: unknown) => {
  const definition = resolveHearthVisualStyleDefinition(value);
  return [`Visual style: ${definition.label}.`, `Style direction: ${definition.promptHint}.`];
};
