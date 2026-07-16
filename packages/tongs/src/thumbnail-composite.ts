import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

export const THUMBNAIL_COMPOSITION_ENGINE_VERSION = "forge-thumbnail-compositor-v1";
export const THUMBNAIL_BUNDLED_FONT_VERSION = "inter-5.2.8-latin-700";

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

export async function renderThumbnailComposite(args: {
  baseBytes: Uint8Array;
  width: number;
  height: number;
  recipe: ThumbnailCompositeRecipe;
  encoding: ThumbnailCompositeEncoding;
}): Promise<{ bytes: Uint8Array; mimeType: string }> {
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
  const text = lines.map((line, index) => (
    `<text x="${padding}" y="${startY + index * lineHeight}" class="title">${escapeXml(line)}</text>`
  )).join("");
  const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <style>
      @font-face { font-family: 'ForgeInter'; src: url(data:font/woff2;base64,${fontData}) format('woff2'); font-weight: 700; }
      .title { font-family: 'ForgeInter'; font-size: ${fontSize}px; font-weight: 700; fill: ${escapeXml(recipe.text_color)}; paint-order: stroke; stroke: ${escapeXml(recipe.shadow_color)}; stroke-width: ${Math.max(2, Math.round(fontSize * 0.08))}px; stroke-opacity: ${Math.max(0, Math.min(1, recipe.shadow_opacity))}; }
    </style>${text}</svg>`);

  let pipeline = sharp(args.baseBytes).resize(width, height, { fit: "cover" }).composite([{ input: svg }]);
  if (args.encoding.format === "jpeg") pipeline = pipeline.jpeg({ quality: args.encoding.quality, chromaSubsampling: "4:4:4" });
  else if (args.encoding.format === "webp") pipeline = pipeline.webp({ quality: args.encoding.quality, smartSubsample: true });
  else pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: false });
  const bytes = await pipeline.toBuffer();
  return {
    bytes,
    mimeType: args.encoding.format === "jpeg" ? "image/jpeg" : args.encoding.format === "webp" ? "image/webp" : "image/png",
  };
}
