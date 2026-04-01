export type ReferenceClipInput = {
  beatId: string;
  anchorText: string;
  promptBasis: string;
  description?: string;
  dataType?: "categorical" | "trend" | "single_stat" | "historical" | "comparison";
  contextType?: "historical" | "economic" | "cultural" | "geographic" | "scientific";
  chartType?: "auto" | "bar" | "line" | "stat_card" | "title_explainer";
  title?: string;
  emphasisKey?: string;
  labels?: string[];
  values?: string[];
  backgroundContextDescription?: string;
  foregroundDataDescription?: string;
  visualStyle?: string;
};

export type ReferenceClipOutputType = "bar" | "line" | "stat_card" | "title_explainer";

export type ReferenceClipOutput = {
  assetId: string;
  beatId: string;
  outputType: ReferenceClipOutputType;
  mimeType: "image/png";
  width: number;
  height: number;
  path: string;
  generatedAt: string;
  generatorVersion: "cdc-v1";
  summary: string;
};

export type ReferenceClipAnalysis = {
  outputType: ReferenceClipOutputType;
  title: string;
  summary: string;
  labels: string[];
  values: number[];
  statHeadline: string | null;
  statLabel: string | null;
};

export type GeneratedReferenceClipPayload = {
  outputType: ReferenceClipOutputType;
  title: string;
  summary: string;
  width: number;
  height: number;
  generatorVersion: "cdc-v1";
  mimeType: "image/png";
  blob: Blob;
};

const WIDTH = 1920;
const HEIGHT = 1080;
const NUMERIC_RE = /\b\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?%?\b/g;
const FROM_TO_RE = /from\s+([0-9][0-9.,]*(?:\s*-\s*[0-9][0-9.,]*)?)\s+(?:[a-z]+\s+){0,6}?to\s+([0-9][0-9.,]*(?:\s*-\s*[0-9][0-9.,]*)?)/i;
const COMPARE_RE = /\b([A-Z][a-zA-Z]+)\s+(?:vs\.?|versus|compared\s+with)\s+([A-Z][a-zA-Z]+)\b/i;
const TREND_RE = /\b(trend|over time|timeline|from|to|increase|decrease|drop|dropped|rise|rose|fall|fell|over)\b/i;
const CONTEXT_RE = /\b(history|historical|civil war|railroad|market|context|explains|background)\b/i;

function toPlainNumber(value: string): number {
  const clean = value.replace(/[^0-9.-]/g, "");
  if (!clean) return Number.NaN;
  if (clean.includes("-")) {
    const [a, b] = clean.split("-").map((entry) => Number(entry));
    if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
  }
  return Number(clean);
}

function readNumbers(text: string): number[] {
  const matches = text.match(NUMERIC_RE) ?? [];
  const values = matches
    .map((match) => toPlainNumber(match))
    .filter((value) => Number.isFinite(value));
  return values;
}

function sentenceTitle(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "Reference Context";
  const base = trimmed.split(/[.!?]/)[0]?.trim() ?? trimmed;
  const clipped = base.length > 78 ? `${base.slice(0, 75).trimEnd()}...` : base;
  return clipped;
}

function pickOutputType(input: ReferenceClipInput, labels: string[], values: number[]): ReferenceClipOutputType {
  if (input.chartType && input.chartType !== "auto") {
    return input.chartType;
  }
  const text = `${input.anchorText} ${input.promptBasis}`.trim();
  const hasPct = /%/.test(text);
  const hasFromTo = FROM_TO_RE.test(text);
  const hasCompare = COMPARE_RE.test(text) || /\b(vs|versus|compared)\b/i.test(text);
  const hasTrend = TREND_RE.test(text);
  const hasContext = CONTEXT_RE.test(text);

  if ((hasPct || input.dataType === "single_stat") && values.length >= 1 && values.length <= 2) {
    return "stat_card";
  }
  if ((hasFromTo || hasTrend || input.dataType === "trend") && values.length >= 2) {
    return "line";
  }
  if ((hasCompare || input.dataType === "comparison" || input.dataType === "categorical") && labels.length >= 2 && values.length >= 2) {
    return "bar";
  }
  if (hasContext || input.dataType === "historical") {
    return "title_explainer";
  }
  if (values.length === 1) return "stat_card";
  if (values.length >= 2) return "line";
  return "title_explainer";
}

function extractLabels(input: ReferenceClipInput): string[] {
  if (input.labels?.length) return input.labels.slice(0, 6);
  const compare = `${input.anchorText} ${input.promptBasis}`.match(COMPARE_RE);
  if (compare) {
    return [compare[1], compare[2]];
  }
  return [];
}

function extractStat(input: ReferenceClipInput): { headline: string | null; label: string | null } {
  const text = `${input.anchorText} ${input.promptBasis}`.trim();
  const percentMatch = text.match(/\d+(?:\.\d+)?\s*%/);
  if (percentMatch) {
    const headline = percentMatch[0].replace(/\s+/g, "");
    return { headline, label: input.emphasisKey ?? "Key percentage" };
  }
  const numMatch = text.match(/\b\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?\b/);
  if (numMatch) {
    return { headline: numMatch[0], label: input.emphasisKey ?? "Key stat" };
  }
  return { headline: null, label: null };
}

export function analyzeReferenceClipInput(input: ReferenceClipInput): ReferenceClipAnalysis {
  const labels = extractLabels(input);
  const values = (input.values ?? []).map((entry) => toPlainNumber(entry)).filter((entry) => Number.isFinite(entry));
  const fallbackValues = values.length > 0 ? values : readNumbers(`${input.anchorText} ${input.promptBasis}`);
  const stat = extractStat(input);
  const outputType = pickOutputType(input, labels, fallbackValues);
  const title = input.title?.trim() || sentenceTitle(input.anchorText);
  const summary = outputType === "stat_card"
    ? "Single-stat reference card generated from explicit text values."
    : outputType === "line"
    ? "Trend line generated from explicit numeric progression in the script."
    : outputType === "bar"
    ? "Comparison chart generated from explicit entities and values."
    : "Title explainer still generated because structured numeric data is insufficient.";
  return {
    outputType,
    title,
    summary,
    labels,
    values: fallbackValues,
    statHeadline: stat.headline,
    statLabel: stat.label,
  };
}

function drawFrame(ctx: CanvasRenderingContext2D): void {
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, "#0b1020");
  bg.addColorStop(1, "#16253f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(80, 80, WIDTH - 160, HEIGHT - 160);
}

function drawTitle(ctx: CanvasRenderingContext2D, title: string): void {
  ctx.fillStyle = "#f7fbff";
  ctx.font = "700 62px 'Segoe UI', sans-serif";
  ctx.fillText(title, 120, 180, WIDTH - 240);
}

function drawStatCard(ctx: CanvasRenderingContext2D, analysis: ReferenceClipAnalysis, input: ReferenceClipInput): void {
  drawTitle(ctx, analysis.title);
  ctx.fillStyle = "#7fd3ff";
  ctx.font = "800 180px 'Segoe UI', sans-serif";
  ctx.fillText(analysis.statHeadline ?? "N/A", 120, 470);
  ctx.fillStyle = "#eaf2ff";
  ctx.font = "600 52px 'Segoe UI', sans-serif";
  ctx.fillText(analysis.statLabel ?? "Reference fact", 125, 560, WIDTH - 260);
  ctx.fillStyle = "#bfd4ee";
  ctx.font = "400 40px 'Segoe UI', sans-serif";
  ctx.fillText(input.promptBasis || input.anchorText, 125, 650, WIDTH - 260);
}

function drawLineChart(ctx: CanvasRenderingContext2D, analysis: ReferenceClipAnalysis): void {
  drawTitle(ctx, analysis.title);
  const values = analysis.values.slice(0, 8);
  if (values.length < 2) {
    drawTitleExplainer(ctx, analysis, "");
    return;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x0 = 180;
  const y0 = 860;
  const w = WIDTH - 360;
  const h = 500;
  ctx.strokeStyle = "rgba(220,234,255,0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i += 1) {
    const y = y0 - (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#72c9ff";
  ctx.lineWidth = 6;
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = x0 + (w / (values.length - 1)) * index;
    const ratio = max === min ? 0.5 : (value - min) / (max - min);
    const y = y0 - ratio * h;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    ctx.fillStyle = "#f7fbff";
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.stroke();
}

function drawBarChart(ctx: CanvasRenderingContext2D, analysis: ReferenceClipAnalysis): void {
  drawTitle(ctx, analysis.title);
  const labels = analysis.labels.slice(0, 6);
  const values = analysis.values.slice(0, labels.length);
  if (labels.length < 2 || values.length < 2) {
    drawTitleExplainer(ctx, analysis, "");
    return;
  }
  const max = Math.max(...values, 1);
  const x = 220;
  const y = 300;
  const w = WIDTH - 440;
  const h = 620;
  const barGap = 20;
  const barWidth = (w - barGap * (labels.length - 1)) / labels.length;
  labels.forEach((label, index) => {
    const value = values[index] ?? 0;
    const ratio = value / max;
    const barHeight = ratio * (h - 120);
    const bx = x + index * (barWidth + barGap);
    const by = y + (h - barHeight - 40);
    ctx.fillStyle = "#74c5ff";
    ctx.fillRect(bx, by, barWidth, barHeight);
    ctx.fillStyle = "#f7fbff";
    ctx.font = "500 28px 'Segoe UI', sans-serif";
    ctx.fillText(label, bx, y + h, barWidth);
  });
}

function drawTitleExplainer(ctx: CanvasRenderingContext2D, analysis: ReferenceClipAnalysis, contextLine: string): void {
  drawTitle(ctx, analysis.title);
  ctx.fillStyle = "#eaf2ff";
  ctx.font = "500 52px 'Segoe UI', sans-serif";
  ctx.fillText(analysis.summary, 120, 420, WIDTH - 240);
  if (contextLine.trim()) {
    ctx.fillStyle = "#bfd4ee";
    ctx.font = "400 40px 'Segoe UI', sans-serif";
    ctx.fillText(contextLine, 120, 500, WIDTH - 240);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Reference clip generator could not produce PNG output."));
    }, "image/png");
  });
}

export async function generateReferenceClipPng(input: ReferenceClipInput): Promise<GeneratedReferenceClipPayload> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Reference clip generator could not access canvas context.");
  const analysis = analyzeReferenceClipInput(input);
  drawFrame(ctx);
  if (analysis.outputType === "stat_card") {
    drawStatCard(ctx, analysis, input);
  } else if (analysis.outputType === "line") {
    drawLineChart(ctx, analysis);
  } else if (analysis.outputType === "bar") {
    drawBarChart(ctx, analysis);
  } else {
    drawTitleExplainer(ctx, analysis, input.backgroundContextDescription ?? input.promptBasis);
  }
  const blob = await canvasToBlob(canvas);
  return {
    outputType: analysis.outputType,
    title: analysis.title,
    summary: analysis.summary,
    width: WIDTH,
    height: HEIGHT,
    generatorVersion: "cdc-v1",
    mimeType: "image/png",
    blob,
  };
}
