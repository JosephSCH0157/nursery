import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { evaluateReadabilityMasks, parseHexColor, THUMBNAIL_CONTRAST_EVALUATOR_VERSION, THUMBNAIL_READABILITY_CONTRACT_VERSION,
  THUMBNAIL_READABILITY_THRESHOLD, type ReadabilityTreatmentKind, type ThumbnailReadabilityEvidence } from "./thumbnail-readability.js";

export const THUMBNAIL_COMPOSITION_ENGINE_VERSION = "forge-thumbnail-compositor-v1";
export const THUMBNAIL_BUNDLED_FONT_VERSION = "inter-5.2.8-latin-700";
export { THUMBNAIL_CONTRAST_EVALUATOR_VERSION, THUMBNAIL_READABILITY_CONTRACT_VERSION };

export type ThumbnailCompositeEncoding = {
  format: "png" | "jpeg" | "webp";
  quality: number;
};

export type ThumbnailCompositeRecipe = {
  title_text: string;
  title_revision: number;
  template_revision: number;
  text_color: string;
  shadow_color: string;
  shadow_opacity: number;
  placement: "top" | "center" | "bottom";
  max_lines: number;
  horizontal_padding_percent: number;
  brand?: {
    text_color: string;
    shadow_color: string;
    palette_colors?: string[];
    logo_placement: "top_left" | "top_right" | "bottom_left" | "bottom_right";
    logo_opacity: number;
  } | null;
  presentation_override?: {
    text_color?: string | null;
    treatment?: ReadabilityTreatmentKind | null;
    logo_visible?: boolean | null;
    logo_placement?: "top_left" | "top_right" | "bottom_left" | "bottom_right" | null;
    logo_opacity?: number | null;
    decision_origin?: "automatic" | "explicit_user";
  } | null;
};

let fontDataPromise: Promise<string> | null = null;

function bundledFontData(): Promise<string> {
  fontDataPromise ??= (async () => {
    const require = createRequire(import.meta.url);
    const fontPath = require.resolve("@fontsource/inter/files/inter-latin-700-normal.woff2");
    return (await readFile(fontPath)).toString("base64");
  })();
  return fontDataPromise;
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function wrapTitle(title: string, maxLines: number): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const target = Math.max(1, Math.ceil(words.length / maxLines));
  const lines: string[] = [];
  for (const word of words) {
    const current = lines[lines.length - 1];
    if (!current || (current.split(" ").length >= target && lines.length < maxLines)) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  return lines.slice(0, maxLines);
}

export async function normalizeThumbnailLogoForRender(logoBytes: Uint8Array): Promise<Uint8Array> {
  const normalized = await sharp(logoBytes)
    .toColourspace("srgb")
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });
  if (normalized.info.channels !== 4) {
    throw new Error("Thumbnail logo normalization did not produce RGBA sRGB pixels.");
  }
  return normalized.data;
}

export async function renderThumbnailComposite(args: {
  baseBytes: Uint8Array;
  width: number;
  height: number;
  recipe: ThumbnailCompositeRecipe;
  encoding: ThumbnailCompositeEncoding;
  logoBytes?: Uint8Array | null;
}): Promise<{ bytes: Uint8Array; mimeType: string; readability: ThumbnailReadabilityEvidence & { evaluation_hash: string } }> {
  const { width, height, recipe } = args;
  if (!Number.isInteger(width) || width < 320 || width > 7680 || !Number.isInteger(height) || height < 180 || height > 4320) {
    throw new Error("Composite dimensions are outside the supported range.");
  }
  const lines = wrapTitle(recipe.title_text, Math.max(1, Math.min(4, recipe.max_lines)));
  if (lines.length === 0) throw new Error("Composite title text is required.");
  const fontData = await bundledFontData();
  const padding = Math.round(width * Math.max(0.02, Math.min(0.25, recipe.horizontal_padding_percent / 100)));
  const fontSize = Math.max(24, Math.round(Math.min(width / 10, height / (lines.length + 2))));
  const lineHeight = Math.round(fontSize * 1.05);
  const blockHeight = lines.length * lineHeight;
  const startY = recipe.placement === "top"
    ? padding + fontSize
    : recipe.placement === "center"
      ? Math.round((height - blockHeight) / 2) + fontSize
      : height - padding - blockHeight + fontSize;
  const preferredColor = (recipe.brand?.text_color ?? recipe.text_color).toUpperCase(); parseHexColor(preferredColor);
  const supportColor = (recipe.brand?.shadow_color ?? recipe.shadow_color).toUpperCase(); parseHexColor(supportColor);
  const supportRadius = Math.max(2, Math.ceil(fontSize * 0.08));
  const fontStyle = `@font-face { font-family:'ForgeInter';src:url(data:font/woff2;base64,${fontData}) format('woff2');font-weight:700}.title{font-family:'ForgeInter';font-size:${fontSize}px;font-weight:700}`;
  const textNodes = (onlyLine: number | null = null, attrs = "") => lines.map((line, index) => onlyLine == null || onlyLine === index
    ? `<text x="${padding}" y="${startY + index * lineHeight}" class="title" ${attrs}>${escapeXml(line)}</text>` : "").join("");
  const svg = (body: string) => Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>${fontStyle}</style>${body}</svg>`);
  const coreMaskSvg = svg(textNodes(null, `fill="#fff"`));
  const lineMaskSvgs = lines.map((_line, index) => svg(textNodes(index, `fill="#fff"`)));
  const baseArtwork = await sharp(args.baseBytes).resize(width, height, { fit: "cover" }).ensureAlpha().png().toBuffer();
  const logoVisible = recipe.presentation_override?.logo_visible !== false;
  let logoOverlay: { input: Buffer; top: number; left: number; blend: "over" } | null = null;
  if (logoVisible && args.logoBytes?.length && recipe.brand) {
    const logoWidth = Math.max(48, Math.round(width * 0.16));
    const logoHeight = Math.max(32, Math.round(height * 0.16));
    const logoOpacity = recipe.presentation_override?.logo_opacity ?? recipe.brand.logo_opacity;
    const normalizedLogo = await normalizeThumbnailLogoForRender(args.logoBytes);
    const logo = await sharp(normalizedLogo).resize(logoWidth, logoHeight, { fit: "inside", withoutEnlargement: true })
      .linear([1, 1, 1, Math.max(0, Math.min(1, logoOpacity))], [0, 0, 0, 0])
      .png().toBuffer({ resolveWithObject: true });
    const logoPlacement = recipe.presentation_override?.logo_placement ?? recipe.brand.logo_placement;
    const top = logoPlacement.startsWith("top") ? padding : height - logo.info.height - padding;
    const left = logoPlacement.endsWith("left") ? padding : width - logo.info.width - padding;
    logoOverlay = { input: logo.data, top: Math.max(0, top), left: Math.max(0, left), blend: "over" };
  }
  const brandedBase = logoOverlay ? await sharp(baseArtwork).composite([logoOverlay]).png().toBuffer() : baseArtwork;
  const untreated = await sharp(brandedBase).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const maskRaw = async (input: Buffer) => { const value = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: value.data, width: value.info.width, height: value.info.height, channels: value.info.channels }; };
  const coreMask = await maskRaw(coreMaskSvg); const lineMasks = await Promise.all(lineMaskSvgs.map(maskRaw));
  const treatments: ReadabilityTreatmentKind[] = ["none", "outline", "shadow", "gradient", "backing"];
  const approvedColors = [preferredColor, ...(recipe.brand?.palette_colors ?? []).map((color) => color.toUpperCase())]
    .filter((color, index, all) => /^#[0-9A-F]{6}$/.test(color) && all.indexOf(color) === index);
  const choices = approvedColors.flatMap((color) => treatments.map((treatment) => ({ color, treatment })))
    .concat(["#FFFFFF", "#000000"].map((color) => ({ color, treatment: "none" as const })));
  const explicit = recipe.presentation_override?.decision_origin === "explicit_user";
  const requestedColor = recipe.presentation_override?.text_color?.toUpperCase() ?? null;
  const requestedTreatment = recipe.presentation_override?.treatment ?? null;
  const orderedChoices = explicit ? choices.filter((choice) => (!requestedColor || choice.color === requestedColor) && (!requestedTreatment || choice.treatment === requestedTreatment)) : choices;
  if (!orderedChoices.length) throw new Error("Explicit thumbnail presentation override is outside the approved treatment hierarchy.");
  let selected: { bytes: Buffer; evidence: ThumbnailReadabilityEvidence } | null = null;
  let hierarchyStep = 0;
  for (const choice of orderedChoices) {
    hierarchyStep += 1;
    const blockTop = Math.max(0, startY - fontSize - supportRadius); const blockBottom = Math.min(height, startY + (lines.length - 1) * lineHeight + supportRadius);
    const backgroundBody = choice.treatment === "gradient" ? `<defs><linearGradient id="g"><stop stop-color="#000" stop-opacity="0.82"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect x="0" y="${blockTop}" width="${width}" height="${blockBottom - blockTop}" fill="url(#g)"/>`
      : choice.treatment === "backing" ? `<rect x="${Math.max(0, padding - supportRadius)}" y="${blockTop}" width="${Math.min(width - padding, width) - Math.max(0, padding - supportRadius)}" height="${blockBottom - blockTop}" rx="${supportRadius}" fill="#000" fill-opacity="0.78"/>` : "";
    const background = await sharp(brandedBase).composite(backgroundBody ? [{ input: svg(backgroundBody) }] : []).png().toBuffer();
    const supportAttrs = choice.treatment === "outline" ? `fill="none" stroke="${supportColor}" stroke-width="${supportRadius}" stroke-opacity="1" paint-order="stroke"`
      : choice.treatment === "shadow" ? `fill="${supportColor}" fill-opacity="${Math.max(0, Math.min(1, recipe.shadow_opacity))}" transform="translate(${Math.max(2, Math.round(supportRadius / 2))} ${Math.max(2, Math.round(supportRadius / 2))})"` : `fill="none"`;
    const supportSvg = svg(textNodes(null, supportAttrs));
    const fillSvg = svg(textNodes(null, `fill="${choice.color}"`));
    const finalBytes = await sharp(background).composite(choice.treatment === "outline" || choice.treatment === "shadow" ? [{ input: supportSvg }, { input: fillSvg }] : [{ input: fillSvg }]).png().toBuffer();
    const backgroundRawValue = await sharp(background).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const finalRawValue = await sharp(finalBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const supportMask = choice.treatment === "outline" || choice.treatment === "shadow" ? await maskRaw(supportSvg) : { data: Buffer.alloc(width * height * 4), width, height, channels: 4 };
    const result = evaluateReadabilityMasks({ untreatedImage: { data: untreated.data, width, height, channels: untreated.info.channels },
      treatedBackground: { data: backgroundRawValue.data, width, height, channels: backgroundRawValue.info.channels }, finalComposite: { data: finalRawValue.data, width, height, channels: finalRawValue.info.channels }, glyphCoreMask: coreMask, supportMask, lineMasks, supportRadiusPx: supportRadius });
    const evidence: ThumbnailReadabilityEvidence = { contract_version: THUMBNAIL_READABILITY_CONTRACT_VERSION, evaluator_version: THUMBNAIL_CONTRAST_EVALUATOR_VERSION,
      threshold: THUMBNAIL_READABILITY_THRESHOLD, output_width: width, output_height: height, glyph_core_alpha_threshold: 204, support_radius_px: supportRadius,
      percentile: "nearest_rank_p10", preferred_brand_color: preferredColor, applied_color: choice.color, applied_treatment: choice.treatment,
      treatment_parameters: { support_color: supportColor, support_radius_px: supportRadius, backing_opacity: choice.treatment === "backing" ? 0.78 : null, gradient_start_opacity: choice.treatment === "gradient" ? 0.82 : null },
      line_scores: result.lineScores, aggregate_score: result.aggregateScore, evaluated_pixel_count: result.evaluatedPixelCount, hierarchy_step: hierarchyStep,
      override_reason: choice.color === preferredColor && choice.treatment === "none" ? null : "Preferred brand presentation did not meet the deterministic readability threshold.",
      decision_origin: explicit ? "explicit_user" : "automatic", passed: result.passed, compositor_version: THUMBNAIL_COMPOSITION_ENGINE_VERSION, font_version: THUMBNAIL_BUNDLED_FONT_VERSION };
    if (result.passed) { selected = { bytes: finalBytes, evidence }; break; }
  }
  if (!selected) throw new Error("No approved thumbnail presentation meets forge.thumbnail-readability.v1.");
  let pipeline = sharp(selected.bytes);
  if (args.encoding.format === "jpeg") pipeline = pipeline.jpeg({ quality: args.encoding.quality, chromaSubsampling: "4:4:4" });
  else if (args.encoding.format === "webp") pipeline = pipeline.webp({ quality: args.encoding.quality, smartSubsample: true });
  else pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: false });
  const bytes = await pipeline.toBuffer();
  const evaluationHash = createHash("sha256").update(JSON.stringify(selected.evidence)).digest("hex");
  return {
    bytes,
    mimeType: args.encoding.format === "jpeg" ? "image/jpeg" : args.encoding.format === "webp" ? "image/webp" : "image/png",
    readability: { ...selected.evidence, evaluation_hash: evaluationHash },
  };
}
