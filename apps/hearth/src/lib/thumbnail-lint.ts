import {
  normalizeEpisodeThumbnailTitleStyle,
  type EpisodeThumbnailTitleStyle,
} from "./hearth-title-fonts";
import { HEARTH_THUMBNAIL_TITLE_CONTRACT } from "./hearth-thumbnail-title-contract";

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ThumbnailPixelData = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type RenderedThumbnail = {
  width: number;
  height: number;
  textBoundingBox: Rect;
  textLineCount?: number;
  backgroundImageData?: ThumbnailPixelData | ImageData | null;
};

export type ThumbnailMetadata = {
  overlayText: string;
  titleStyle: EpisodeThumbnailTitleStyle;
  brandTemplateId?: string | null;
  seoTitle?: string | null;
};

export type ThumbnailLintStatus = "pass" | "warning" | "fail";

export type ThumbnailLintCheck = {
  id: string;
  label: string;
  status: ThumbnailLintStatus;
  message: string;
};

export type ThumbnailLintResult = {
  overall: ThumbnailLintStatus;
  checks: ThumbnailLintCheck[];
};

type Rgb = {
  r: number;
  g: number;
  b: number;
};

const SAFE_ZONE_X_PCT = 0.05;
const SAFE_ZONE_Y_PCT = 0.1;
const TEXT_LENGTH_WARNING_WORDS = HEARTH_THUMBNAIL_TITLE_CONTRACT.preferred_max_words;
const TEXT_LENGTH_FAIL_WORDS = HEARTH_THUMBNAIL_TITLE_CONTRACT.hard_max_words;
const LINE_COUNT_WARNING = 2;
const LINE_COUNT_FAIL = 3;
const FRAME_COVERAGE_WARNING = 0.25;
const FRAME_COVERAGE_FAIL = 0.4;
const CONTRAST_FAIL = 4.5;
const CONTRAST_WARNING = 5.5;
const CLUTTER_WARNING = 0.16;
const CLUTTER_FAIL = 0.24;
const REDUNDANCY_WARNING = 0.8;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function countWords(value: string): number {
  return tokenize(value).length;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizePhrase(value: string): string {
  return tokenize(value).join(" ");
}

function statusRank(status: ThumbnailLintStatus): number {
  switch (status) {
    case "fail":
      return 2;
    case "warning":
      return 1;
    default:
      return 0;
  }
}

function resolveOverallStatus(checks: ThumbnailLintCheck[]): ThumbnailLintStatus {
  let overall: ThumbnailLintStatus = "pass";
  for (const check of checks) {
    if (statusRank(check.status) > statusRank(overall)) {
      overall = check.status;
    }
  }
  return overall;
}

function clampRect(rect: Rect, width: number, height: number): Rect {
  const x = clamp(rect.x, 0, width);
  const y = clamp(rect.y, 0, height);
  const right = clamp(rect.x + rect.width, 0, width);
  const bottom = clamp(rect.y + rect.height, 0, height);
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

function rectArea(rect: Rect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function intersectRect(left: Rect, right: Rect): Rect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  return {
    x,
    y,
    width: Math.max(0, rightEdge - x),
    height: Math.max(0, bottomEdge - y),
  };
}

function parseCssColor(value: string): Rgb | null {
  const hex6 = value.match(/^#([0-9a-f]{6})$/i);
  if (hex6?.[1]) {
    return {
      r: Number.parseInt(hex6[1].slice(0, 2), 16),
      g: Number.parseInt(hex6[1].slice(2, 4), 16),
      b: Number.parseInt(hex6[1].slice(4, 6), 16),
    };
  }

  const hex3 = value.match(/^#([0-9a-f]{3})$/i);
  if (hex3?.[1]) {
    const [r, g, b] = hex3[1].split("");
    return {
      r: Number.parseInt(`${r}${r}`, 16),
      g: Number.parseInt(`${g}${g}`, 16),
      b: Number.parseInt(`${b}${b}`, 16),
    };
  }

  const rgb = value.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgb) {
    return {
      r: clamp(Number.parseInt(rgb[1] ?? "0", 10), 0, 255),
      g: clamp(Number.parseInt(rgb[2] ?? "0", 10), 0, 255),
      b: clamp(Number.parseInt(rgb[3] ?? "0", 10), 0, 255),
    };
  }

  return null;
}

function srgbChannelToLinear(value: number): number {
  const scaled = value / 255;
  if (scaled <= 0.03928) {
    return scaled / 12.92;
  }
  return ((scaled + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: Rgb): number {
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(left: number, right: number): number {
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

function formatRatio(value: number): string {
  return `${value.toFixed(2)}:1`;
}

function measureRegionLuminance(
  background: ThumbnailPixelData | ImageData,
  rect: Rect,
): { average: number; clutter: number } | null {
  const width = background.width;
  const height = background.height;
  const sampleRect = clampRect(rect, width, height);
  if (sampleRect.width < 1 || sampleRect.height < 1) {
    return null;
  }

  const x0 = Math.floor(sampleRect.x);
  const y0 = Math.floor(sampleRect.y);
  const x1 = Math.max(x0 + 1, Math.ceil(sampleRect.x + sampleRect.width));
  const y1 = Math.max(y0 + 1, Math.ceil(sampleRect.y + sampleRect.height));

  const luminances: number[] = [];
  let total = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = (y * width + x) * 4;
      const rgb = {
        r: background.data[index] ?? 0,
        g: background.data[index + 1] ?? 0,
        b: background.data[index + 2] ?? 0,
      };
      const luminance = relativeLuminance(rgb);
      luminances.push(luminance);
      total += luminance;
    }
  }

  if (luminances.length === 0) return null;

  const average = total / luminances.length;
  let varianceTotal = 0;
  for (const luminance of luminances) {
    const delta = luminance - average;
    varianceTotal += delta * delta;
  }
  const stdDev = Math.sqrt(varianceTotal / luminances.length);

  let edgeTotal = 0;
  let edgeComparisons = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const localIndex = (y - y0) * (x1 - x0) + (x - x0);
      const current = luminances[localIndex] ?? average;
      if (x + 1 < x1) {
        const right = luminances[localIndex + 1] ?? current;
        edgeTotal += Math.abs(current - right);
        edgeComparisons += 1;
      }
      if (y + 1 < y1) {
        const below = luminances[localIndex + (x1 - x0)] ?? current;
        edgeTotal += Math.abs(current - below);
        edgeComparisons += 1;
      }
    }
  }

  const edgeDensity = edgeComparisons > 0 ? edgeTotal / edgeComparisons : 0;
  return {
    average,
    clutter: Math.max(stdDev, edgeDensity),
  };
}

function buildTextLengthCheck(wordCount: number): ThumbnailLintCheck {
  if (wordCount > TEXT_LENGTH_FAIL_WORDS) {
    return {
      id: "text-length",
      label: "Text length",
      status: "fail",
      message: `${wordCount} words is too long for mobile readability. Keep overlay text to ${TEXT_LENGTH_FAIL_WORDS} words or fewer.`,
    };
  }
  if (wordCount > TEXT_LENGTH_WARNING_WORDS) {
    return {
      id: "text-length",
      label: "Text length",
      status: "warning",
      message: `${wordCount} words is getting long. Aim for ${TEXT_LENGTH_WARNING_WORDS} words or fewer when possible.`,
    };
  }
  return {
    id: "text-length",
    label: "Text length",
    status: "pass",
    message: `${wordCount} words stays within the mobile-friendly range.`,
  };
}

function buildLineCountCheck(lineCount: number): ThumbnailLintCheck {
  if (lineCount > LINE_COUNT_FAIL) {
    return {
      id: "line-count",
      label: "Line count",
      status: "fail",
      message: `${lineCount} rendered lines is too dense. Keep the title to 3 lines or fewer.`,
    };
  }
  if (lineCount > LINE_COUNT_WARNING) {
    return {
      id: "line-count",
      label: "Line count",
      status: "warning",
      message: `${lineCount} rendered lines may feel cramped at feed size.`,
    };
  }
  return {
    id: "line-count",
    label: "Line count",
    status: "pass",
    message: `${lineCount} rendered line${lineCount === 1 ? "" : "s"} is within the recommended range.`,
  };
}

function buildContrastCheck(
  sampledRegion: { average: number; clutter: number } | null,
  textColor: string,
): ThumbnailLintCheck {
  if (!sampledRegion) {
    return {
      id: "contrast",
      label: "Contrast under text",
      status: "warning",
      message: "Background sampling was unavailable, so contrast could not be measured reliably.",
    };
  }

  const rgb = parseCssColor(textColor);
  if (!rgb) {
    return {
      id: "contrast",
      label: "Contrast under text",
      status: "warning",
      message: `Text color "${textColor}" could not be measured for contrast.`,
    };
  }

  const textLuminance = relativeLuminance(rgb);
  const ratio = contrastRatio(sampledRegion.average, textLuminance);
  if (ratio < CONTRAST_FAIL) {
    return {
      id: "contrast",
      label: "Contrast under text",
      status: "fail",
      message: `Contrast is ${formatRatio(ratio)}, below the AA readability floor.`,
    };
  }
  if (ratio < CONTRAST_WARNING) {
    return {
      id: "contrast",
      label: "Contrast under text",
      status: "warning",
      message: `Contrast is ${formatRatio(ratio)}. The title is readable, but it is close to the minimum.`,
    };
  }
  return {
    id: "contrast",
    label: "Contrast under text",
    status: "pass",
    message: `Contrast is ${formatRatio(ratio)}, which is strong for feed readability.`,
  };
}

function buildSafeZoneCheck(rendered: RenderedThumbnail): ThumbnailLintCheck {
  const box = clampRect(rendered.textBoundingBox, rendered.width, rendered.height);
  const safeRect: Rect = {
    x: rendered.width * SAFE_ZONE_X_PCT,
    y: rendered.height * SAFE_ZONE_Y_PCT,
    width: rendered.width * (1 - SAFE_ZONE_X_PCT * 2),
    height: rendered.height * (1 - SAFE_ZONE_Y_PCT * 2),
  };
  const intersection = intersectRect(box, safeRect);
  const boxArea = rectArea(box);
  const insideFraction = boxArea > 0 ? rectArea(intersection) / boxArea : 0;
  if (insideFraction < 0.5) {
    return {
      id: "safe-zone",
      label: "Safe-zone fit",
      status: "fail",
      message: "Most of the title sits outside the YouTube-safe area. Reposition it inward before publishing.",
    };
  }
  if (insideFraction < 1) {
    return {
      id: "safe-zone",
      label: "Safe-zone fit",
      status: "warning",
      message: "The title touches the unsafe edge margin. Pull it inward for better crop safety.",
    };
  }
  return {
    id: "safe-zone",
    label: "Safe-zone fit",
    status: "pass",
    message: "The title stays inside the safe display area.",
  };
}

function buildCoverageCheck(rendered: RenderedThumbnail): ThumbnailLintCheck {
  const frameArea = Math.max(1, rendered.width * rendered.height);
  const coverage = rectArea(clampRect(rendered.textBoundingBox, rendered.width, rendered.height)) / frameArea;
  if (coverage > FRAME_COVERAGE_FAIL) {
    return {
      id: "frame-coverage",
      label: "Text coverage",
      status: "fail",
      message: `${Math.round(coverage * 100)}% of the frame is covered by text. The overlay is taking over the image.`,
    };
  }
  if (coverage > FRAME_COVERAGE_WARNING) {
    return {
      id: "frame-coverage",
      label: "Text coverage",
      status: "warning",
      message: `${Math.round(coverage * 100)}% of the frame is covered by text. Consider tightening the overlay.`,
    };
  }
  return {
    id: "frame-coverage",
    label: "Text coverage",
    status: "pass",
    message: `${Math.round(coverage * 100)}% of the frame is covered by text, which leaves room for the image to read.`,
  };
}

function buildRedundancyCheck(overlayText: string, seoTitle: string | null | undefined): ThumbnailLintCheck {
  if (!seoTitle?.trim()) {
    return {
      id: "title-redundancy",
      label: "Title redundancy",
      status: "pass",
      message: "No SEO title is selected, so redundancy was not detected.",
    };
  }

  const normalizedOverlay = normalizePhrase(overlayText);
  const normalizedSeo = normalizePhrase(seoTitle);
  if (!normalizedOverlay || !normalizedSeo) {
    return {
      id: "title-redundancy",
      label: "Title redundancy",
      status: "pass",
      message: "The overlay and SEO title are distinct enough to avoid duplication.",
    };
  }

  if (normalizedOverlay === normalizedSeo) {
    return {
      id: "title-redundancy",
      label: "Title redundancy",
      status: "fail",
      message: "The overlay exactly matches the video title. Use the thumbnail to add a different hook.",
    };
  }

  const overlayTokens = new Set(tokenize(overlayText));
  const seoTokens = new Set(tokenize(seoTitle));
  const intersectionCount = Array.from(overlayTokens).filter((token) => seoTokens.has(token)).length;
  const unionCount = new Set([...overlayTokens, ...seoTokens]).size;
  const jaccard = unionCount > 0 ? intersectionCount / unionCount : 0;
  if (jaccard >= REDUNDANCY_WARNING) {
    return {
      id: "title-redundancy",
      label: "Title redundancy",
      status: "warning",
      message: "The overlay is very close to the video title. Consider making the thumbnail text more complementary.",
    };
  }

  return {
    id: "title-redundancy",
    label: "Title redundancy",
    status: "pass",
    message: "The overlay adds a distinct hook instead of repeating the title.",
  };
}

function buildClutterCheck(sampledRegion: { average: number; clutter: number } | null): ThumbnailLintCheck {
  if (!sampledRegion) {
    return {
      id: "background-clutter",
      label: "Background clutter",
      status: "warning",
      message: "Background texture could not be sampled under the title.",
    };
  }

  if (sampledRegion.clutter >= CLUTTER_FAIL) {
    return {
      id: "background-clutter",
      label: "Background clutter",
      status: "fail",
      message: "The background under the title is extremely busy. Simplify or blur that region.",
    };
  }
  if (sampledRegion.clutter >= CLUTTER_WARNING) {
    return {
      id: "background-clutter",
      label: "Background clutter",
      status: "warning",
      message: "The background under the title is busy enough to compete with the text.",
    };
  }
  return {
    id: "background-clutter",
    label: "Background clutter",
    status: "pass",
    message: "The background under the title is calm enough for clean text rendering.",
  };
}

function buildTemplateConsistencyCheck(brandTemplateId: string | null | undefined): ThumbnailLintCheck {
  if (!brandTemplateId) {
    return {
      id: "template-consistency",
      label: "Template consistency",
      status: "warning",
      message: "No workspace brand template is attached. Consistency may drift between thumbnails.",
    };
  }
  return {
    id: "template-consistency",
    label: "Template consistency",
    status: "pass",
    message: "A workspace brand template is attached to this thumbnail concept.",
  };
}

function buildFontReadabilityCheck(args: {
  titleStyle: EpisodeThumbnailTitleStyle;
  wordCount: number;
  lineCount: number;
  contrastStatus: ThumbnailLintStatus;
  clutterStatus: ThumbnailLintStatus;
}): ThumbnailLintCheck {
  const titleStyle = normalizeEpisodeThumbnailTitleStyle(args.titleStyle);
  if (titleStyle.font_preset === "cinematic_serif") {
    return {
      id: "font-readability",
      label: "Font readability",
      status: "warning",
      message: "Cinematic serif is more fragile at mobile size. Consider a cleaner display face for thumbnail text.",
    };
  }

  if (titleStyle.font_preset === "condensed_sans" && (args.wordCount > 4 || args.lineCount > 1)) {
    return {
      id: "font-readability",
      label: "Font readability",
      status: "warning",
      message: "Condensed text is getting cramped at this copy length. Shorter copy or a wider preset will read better.",
    };
  }

  if (!titleStyle.shadow.enabled && (args.contrastStatus !== "pass" || args.clutterStatus !== "pass")) {
    return {
      id: "font-readability",
      label: "Font readability",
      status: "warning",
      message: "Shadow is disabled while contrast or background texture is already under pressure.",
    };
  }

  return {
    id: "font-readability",
    label: "Font readability",
    status: "pass",
    message: "The current font preset and readability settings are suitable for thumbnail use.",
  };
}

export function lintThumbnail(
  rendered: RenderedThumbnail,
  metadata: ThumbnailMetadata,
): ThumbnailLintResult {
  const wordCount = countWords(metadata.overlayText);
  const lineCount = Math.max(1, Math.floor(rendered.textLineCount ?? metadata.overlayText.split(/\n+/).length));
  const sampledRegion = rendered.backgroundImageData
    ? measureRegionLuminance(rendered.backgroundImageData, rendered.textBoundingBox)
    : null;

  const checks: ThumbnailLintCheck[] = [];
  checks.push(buildTextLengthCheck(wordCount));
  checks.push(buildLineCountCheck(lineCount));
  const contrastCheck = buildContrastCheck(sampledRegion, normalizeEpisodeThumbnailTitleStyle(metadata.titleStyle).text_color);
  checks.push(contrastCheck);
  checks.push(buildSafeZoneCheck(rendered));
  checks.push(buildCoverageCheck(rendered));
  checks.push(buildRedundancyCheck(metadata.overlayText, metadata.seoTitle));
  const clutterCheck = buildClutterCheck(sampledRegion);
  checks.push(clutterCheck);
  checks.push(buildTemplateConsistencyCheck(metadata.brandTemplateId));
  checks.push(buildFontReadabilityCheck({
    titleStyle: metadata.titleStyle,
    wordCount,
    lineCount,
    contrastStatus: contrastCheck.status,
    clutterStatus: clutterCheck.status,
  }));

  return {
    overall: resolveOverallStatus(checks),
    checks,
  };
}
