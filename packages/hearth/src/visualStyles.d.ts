export type HearthVisualStyleValue =
  | "cinematic_realism"
  | "studio_photography"
  | "digital_illustration"
  | "three_d_animation"
  | "stop_motion"
  | "marker_render"
  | "colored_pencil"
  | "oil_painting";

export type HearthVisualStyleDefinition = {
  value: HearthVisualStyleValue;
  label: string;
  promptHint: string;
};

export declare const DEFAULT_HEARTH_VISUAL_STYLE: HearthVisualStyleValue;
export declare const HEARTH_VISUAL_STYLE_DEFINITIONS: HearthVisualStyleDefinition[];
export declare const HEARTH_VISUAL_STYLE_VALUES: HearthVisualStyleValue[];

export declare function parseHearthVisualStyle(value: unknown): HearthVisualStyleValue | null;
export declare function isHearthVisualStyle(value: unknown): value is HearthVisualStyleValue;
export declare function normalizeHearthVisualStyle(
  value: unknown,
  fallback?: HearthVisualStyleValue,
): HearthVisualStyleValue;
export declare function resolveHearthVisualStyleDefinition(value: unknown): HearthVisualStyleDefinition;
export declare function resolveHearthVisualStyleLabel(value: unknown): string;
export declare function buildHearthVisualStylePromptLines(value: unknown): string[];
