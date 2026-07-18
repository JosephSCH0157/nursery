export const THUMBNAIL_READABILITY_CONTRACT_VERSION = "forge.thumbnail-readability.v1" as const;
export const THUMBNAIL_CONTRAST_EVALUATOR_VERSION = "forge-thumbnail-contrast-evaluator-v1" as const;
export const THUMBNAIL_READABILITY_THRESHOLD = 4.5;
export const THUMBNAIL_GLYPH_CORE_ALPHA = 204;

export type ReadabilityTreatmentKind = "none" | "outline" | "shadow" | "gradient" | "backing";
export type ReadabilityLineEvidence = { line_index: number; pixel_count: number; score: number; passed: boolean };
export type ThumbnailReadabilityEvidence = {
  contract_version: typeof THUMBNAIL_READABILITY_CONTRACT_VERSION;
  evaluator_version: typeof THUMBNAIL_CONTRAST_EVALUATOR_VERSION;
  threshold: number;
  output_width: number;
  output_height: number;
  glyph_core_alpha_threshold: number;
  support_radius_px: number;
  percentile: "nearest_rank_p10";
  preferred_brand_color: string;
  applied_color: string;
  applied_treatment: ReadabilityTreatmentKind;
  treatment_parameters: Record<string, string | number | boolean | null>;
  line_scores: ReadabilityLineEvidence[];
  aggregate_score: number;
  evaluated_pixel_count: number;
  hierarchy_step: number;
  override_reason: string | null;
  decision_origin: "automatic" | "explicit_user";
  passed: boolean;
  compositor_version: string;
  font_version: string;
};

function linearChannel(channel: number): number {
  const srgb = Math.max(0, Math.min(255, channel)) / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: readonly [number, number, number]): number {
  return 0.2126 * linearChannel(rgb[0]) + 0.7152 * linearChannel(rgb[1]) + 0.0722 * linearChannel(rgb[2]);
}

export function contrastRatio(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  const l1 = relativeLuminance(left); const l2 = relativeLuminance(right);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function nearestRankP10(values: readonly number[]): number {
  if (!values.length) throw new Error("Readability evaluation requires at least one glyph-core pixel.");
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(0.10 * sorted.length));
  return sorted[rank - 1]!;
}

export function parseHexColor(value: string): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error("Readability colors must be six-digit hexadecimal values.");
  return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)];
}

type Raster = { data: Uint8Array; width: number; height: number; channels: number };

function rgbAt(raster: Raster, pixel: number): [number, number, number] {
  const offset = pixel * raster.channels;
  return [raster.data[offset]!, raster.data[offset + 1]!, raster.data[offset + 2]!];
}

function alphaAt(raster: Raster, pixel: number): number {
  const offset = pixel * raster.channels;
  return raster.channels >= 4 ? raster.data[offset + 3]! : raster.data[offset]!;
}

export function evaluateReadabilityMasks(args: {
  untreatedImage: Raster;
  treatedBackground: Raster;
  finalComposite: Raster;
  glyphCoreMask: Raster;
  supportMask: Raster;
  lineMasks: Raster[];
  supportRadiusPx: number;
}): { lineScores: ReadabilityLineEvidence[]; aggregateScore: number; evaluatedPixelCount: number; passed: boolean } {
  const { width, height } = args.glyphCoreMask;
  for (const raster of [args.untreatedImage, args.treatedBackground, args.finalComposite, args.supportMask, ...args.lineMasks]) {
    if (raster.width !== width || raster.height !== height) throw new Error("Readability raster dimensions do not match final output dimensions.");
  }
  const coreValues = new Map<number, number>();
  const radius = Math.max(2, Math.floor(args.supportRadiusPx));
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (alphaAt(args.glyphCoreMask, pixel) < THUMBNAIL_GLYPH_CORE_ALPHA) continue;
    const x = pixel % width; const y = Math.floor(pixel / width);
    let effective = contrastRatio(rgbAt(args.finalComposite, pixel), rgbAt(args.treatedBackground, pixel));
    for (let sy = Math.max(0, y - radius); sy <= Math.min(height - 1, y + radius); sy += 1) {
      for (let sx = Math.max(0, x - radius); sx <= Math.min(width - 1, x + radius); sx += 1) {
        const supportPixel = sy * width + sx;
        if (alphaAt(args.supportMask, supportPixel) === 0) continue;
        effective = Math.max(effective, contrastRatio(rgbAt(args.finalComposite, supportPixel), rgbAt(args.untreatedImage, supportPixel)));
      }
    }
    coreValues.set(pixel, effective);
  }
  if (!coreValues.size) throw new Error("Rendered title contains no glyph-core pixels.");
  const lineScores = args.lineMasks.map((mask, lineIndex) => {
    const values: number[] = [];
    for (const [pixel, value] of coreValues) if (alphaAt(mask, pixel) >= THUMBNAIL_GLYPH_CORE_ALPHA) values.push(value);
    if (!values.length) throw new Error(`Rendered title line ${lineIndex + 1} contains no glyph-core pixels.`);
    const score = nearestRankP10(values);
    return { line_index: lineIndex, pixel_count: values.length, score, passed: score >= THUMBNAIL_READABILITY_THRESHOLD };
  });
  const aggregateScore = nearestRankP10([...coreValues.values()]);
  return { lineScores, aggregateScore, evaluatedPixelCount: coreValues.size,
    passed: aggregateScore >= THUMBNAIL_READABILITY_THRESHOLD && lineScores.every((line) => line.passed) };
}
