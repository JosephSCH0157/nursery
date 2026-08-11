import sharp from "sharp";

export type ReferenceVisualEvidence = {
  id: string;
  label?: string | null;
  raw_excerpt?: string | null;
  numeric_value?: number | null;
  unit?: string | null;
  evidence_date?: string | null;
  category?: string | null;
};

export type ReferenceVisualRecipe = {
  visual_subtype: "chart" | "timeline" | "document_excerpt" | "quote_card" | "stat_card" | "comparison";
  title: string;
  subtitle?: string | null;
  attribution_text: string;
  accessibility_text: string;
  recipe_json: Record<string, unknown>;
  renderer_contract_version?: string | null;
};

export type ReferenceVisualRender = {
  rendererName: string;
  rendererVersion: "1" | "2" | "3";
  width: number;
  height: number;
  mimeType: "image/png";
  canonicalSvg: string;
  pngBytes: Buffer;
};

const WIDTH = 1920;
const HEIGHT = 1080;

function escapeXml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}

function wrap(value: string, max = 54): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current || `${current} ${word}`.length > max) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  return lines.slice(0, 7);
}

function wrapAll(value: string, max = 54): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean).flatMap((word) => word.length > max ? word.match(new RegExp(`.{1,${max}}`, "g")) ?? [word] : [word]);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current || `${current} ${word}`.length > max) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  return lines.length ? lines : ["Confirmed event"];
}

function textLines(lines: string[], x: number, y: number, size: number, gap = 1.22, weight = 500): string {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * size * gap}" font-size="${size}" font-weight="${weight}" fill="#f5f7fb">${escapeXml(line)}</text>`).join("");
}

function comparableText(value: string | null | undefined): string {
  return (value ?? "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sameViewerText(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = comparableText(left);
  const b = comparableText(right);
  return Boolean(a && b && (a === b || (Math.min(a.length, b.length) >= 48 && (a.includes(b) || b.includes(a)))));
}

function renderQuoteCard(recipe: ReferenceVisualRecipe, evidence: ReferenceVisualEvidence[]): string {
  const excerpt = evidence.find((entry) => entry.raw_excerpt?.trim())?.raw_excerpt?.trim() ?? "";
  const quote = excerpt || recipe.subtitle?.trim() || recipe.title.trim();
  const heading = recipe.title.trim() && !sameViewerText(recipe.title, quote) ? recipe.title.trim() : "";
  const supporting = recipe.subtitle?.trim() && !sameViewerText(recipe.subtitle, quote) && !sameViewerText(recipe.subtitle, heading) ? recipe.subtitle.trim() : "";
  const quoteLines = wrapAll(quote, quote.length > 500 ? 88 : quote.length > 260 ? 72 : quote.length > 150 ? 62 : 54);
  const headingLines = heading ? wrapAll(heading, 64) : [];
  const supportingLines = supporting ? wrapAll(supporting, 82) : [];
  const headingSize = Math.max(30, Math.min(48, 116 / Math.max(1, headingLines.length * 1.15)));
  const bodyTop = headingLines.length ? 300 : 220;
  const bodyBottom = supportingLines.length ? 790 : 870;
  const quoteSize = Math.max(14, Math.min(62, (bodyBottom - bodyTop) / Math.max(1, quoteLines.length * 1.22)));
  const quoteEnd = bodyTop + Math.max(0, quoteLines.length - 1) * quoteSize * 1.22;
  const supportingY = Math.min(900, quoteEnd + quoteSize * 1.65);
  return `<g data-quote-layout="responsive" data-quote-line-count="${quoteLines.length}">${headingLines.length ? textLines(headingLines, 148, 170, headingSize, 1.15, 720) : ""}<text x="126" y="${bodyTop + 12}" font-size="92" font-weight="800" fill="#f4a900">“</text>${textLines(quoteLines, 190, bodyTop, quoteSize, 1.22, 650)}${supportingLines.length ? textLines(supportingLines, 190, supportingY, 28, 1.2, 450) : ""}</g>`;
}

function timelineDate(entry: ReferenceVisualEvidence): { display: string; sort: number } {
  const canonical = entry.evidence_date?.trim();
  if (canonical) {
    const time = Date.parse(/^\d{4}$/.test(canonical) ? `${canonical}-01-01T00:00:00Z` : `${canonical}T00:00:00Z`);
    if (Number.isFinite(time)) return { display: canonical, sort: time };
  }
  const inferred = (entry.label ?? entry.raw_excerpt ?? "").match(/\b((?:1[5-9]\d{2}|20\d{2}|21\d{2})(?:\s*(?:-|–|—|to)\s*(?:1[5-9]\d{2}|20\d{2}|21\d{2}))?)\b/i)?.[1] ?? null;
  const year = inferred?.match(/\d{4}/)?.[0];
  return { display: inferred ?? "Date not provided", sort: year ? Date.parse(`${year}-01-01T00:00:00Z`) : Number.POSITIVE_INFINITY };
}

function timelineLabel(entry: ReferenceVisualEvidence, dateDisplay: string): string {
  const label = entry.label?.trim() || entry.raw_excerpt?.trim() || "Confirmed event";
  if (dateDisplay === "Date not provided") return label;
  return label.replace(new RegExp(`^\\s*${dateDisplay.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:–—-]?\\s*`, "i"), "").trim() || label;
}

function renderDenseTimeline(events: Array<{ entry: ReferenceVisualEvidence; date: { display: string; sort: number } }>): string {
  const columns = events.length > 18 ? 4 : 3;
  const rows = Math.ceil(events.length / columns);
  const left = 128;
  const right = 1792;
  const top = 342;
  const bottom = 925;
  const columnGap = 18;
  const rowGap = 10;
  const cardWidth = (right - left - columnGap * (columns - 1)) / columns;
  const cardHeight = (bottom - top - rowGap * (rows - 1)) / rows;
  return events.map(({ entry, date }, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = left + column * (cardWidth + columnGap);
    const y = top + row * (cardHeight + rowGap);
    const label = timelineLabel(entry, date.display);
    const lines = wrapAll(label, columns === 4 ? 48 : 62);
    const available = cardHeight - 39;
    const fontSize = Math.max(9, Math.min(14, available / Math.max(1, lines.length * 1.14)));
    return `<g data-timeline-event="${index}" data-evidence-id="${escapeXml(entry.id)}" data-evidence-date="${escapeXml(date.display)}" data-timeline-layout="grid"><rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="13" fill="#1a2d48" stroke="#31506f" stroke-width="2"/><rect x="${x}" y="${y}" width="6" height="${cardHeight}" rx="3" fill="#73cbff"/><circle cx="${x + 20}" cy="${y + 20}" r="7" fill="#73cbff"/><text x="${x + 36}" y="${y + 25}" font-size="18" font-weight="750" fill="#73cbff">${escapeXml(date.display)}</text>${textLines(lines, x + 18, y + 46, fontSize, 1.14, 540)}</g>`;
  }).join("");
}


function renderTimeline(evidence: ReferenceVisualEvidence[]): string {
  const events = evidence.map((entry, sourceIndex) => ({ entry, sourceIndex, date: timelineDate(entry) })).sort((left, right) => {
    return left.date.sort - right.date.sort || left.sourceIndex - right.sourceIndex;
  });
  if (events.length > 8) return renderDenseTimeline(events);
  const top = 350;
  const bottom = 920;
  const axisX = 960;
  const slot = (bottom - top) / Math.max(1, events.length);
  const cardWidth = 660;
  const cardHeight = Math.min(152, Math.max(72, slot * 1.78));
  const cardLeft = 150;
  const cardRight = WIDTH - cardLeft - cardWidth;
  return `<line x1="${axisX}" y1="${top}" x2="${axisX}" y2="${bottom}" stroke="#3d698c" stroke-width="5"/>${events.map(({ entry, date }, index) => {
    const side = index % 2 === 0 ? "left" : "right";
    const cardX = side === "left" ? cardLeft : cardRight;
    const nodeY = top + slot * (index + 0.5);
    const cardY = Math.max(top, Math.min(bottom - cardHeight, nodeY - cardHeight / 2));
    const label = timelineLabel(entry, date.display);
    const lines = wrapAll(label, 52);
    const availableTextHeight = cardHeight - 48;
    const fontSize = Math.max(16, Math.min(25, availableTextHeight / Math.max(1, lines.length * 1.18)));
    const textX = cardX + 24;
    const connectorStart = side === "left" ? cardX + cardWidth : cardX;
    const connectorEnd = side === "left" ? axisX - 16 : axisX + 16;
    return `<g data-timeline-event="${index}" data-evidence-id="${escapeXml(entry.id)}" data-evidence-date="${escapeXml(date.display)}" data-timeline-side="${side}"><line x1="${connectorStart}" y1="${nodeY}" x2="${connectorEnd}" y2="${nodeY}" stroke="#73cbff" stroke-width="3"/><rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="18" fill="#1a2d48" stroke="#31506f" stroke-width="2"/><text x="${textX}" y="${cardY + 31}" font-size="24" font-weight="750" fill="#73cbff">${escapeXml(date.display)}</text>${textLines(lines, textX, cardY + 64, fontSize, 1.18, 550)}<circle cx="${axisX}" cy="${nodeY}" r="13" fill="#73cbff" stroke="#142238" stroke-width="6"/></g>`;
  }).join("")}`;
}

function renderBodyV1(recipe: ReferenceVisualRecipe, evidence: ReferenceVisualEvidence[]): string {
  const first = evidence[0];
  if (recipe.visual_subtype === "stat_card") {
    const value = first?.numeric_value == null ? "—" : `${first.numeric_value}${first.unit === "percent" ? "%" : first.unit ? ` ${first.unit}` : ""}`;
    return `<text x="120" y="535" font-size="210" font-weight="800" fill="#73cbff">${escapeXml(value)}</text>${textLines(wrap(first?.label ?? "Confirmed statistic", 44), 128, 640, 52, 1.18, 600)}`;
  }
  if (recipe.visual_subtype === "quote_card" || recipe.visual_subtype === "document_excerpt") {
    return `${textLines(wrap(first?.raw_excerpt ?? "", 58), 150, 365, 54, 1.3, 500)}`;
  }
  if (recipe.visual_subtype === "timeline") {
    return renderTimeline(evidence);
  }
  const numeric = evidence.filter((entry) => entry.numeric_value != null).slice(0, 6);
  const max = Math.max(1, ...numeric.map((entry) => Math.abs(entry.numeric_value ?? 0)));
  return numeric.map((entry, index) => {
    const height = Math.round(430 * Math.abs(entry.numeric_value ?? 0) / max);
    const x = 190 + index * 260;
    return `<rect x="${x}" y="${830 - height}" width="150" height="${height}" fill="#73cbff"/><text x="${x}" y="890" font-size="30" fill="#f5f7fb">${escapeXml(entry.label ?? entry.category ?? `Value ${index + 1}`)}</text>`;
  }).join("");
}

function renderBodyV2(recipe: ReferenceVisualRecipe, evidence: ReferenceVisualEvidence[]): string {
  if (recipe.visual_subtype !== "stat_card") return renderBodyV1(recipe, evidence);
  const first = evidence[0];
  const approximate = /\b(?:roughly|about|approximately|nearly|around)\b|~/i.test(first?.raw_excerpt ?? "");
  const value = first?.numeric_value == null ? "—" : `${approximate ? "~" : ""}${first.numeric_value}${first.unit === "percent" ? "%" : first.unit ? ` ${first.unit}` : ""}`;
  return `<text x="120" y="610" font-size="248" font-weight="850" letter-spacing="-8" fill="#73cbff">${escapeXml(value)}</text><rect x="124" y="670" width="260" height="8" rx="4" fill="#f4a900"/>${textLines(wrap(first?.label ?? "Confirmed statistic", 48), 128, 760, 48, 1.18, 650)}`;
}

export async function renderCanonicalReferenceVisual(recipe: ReferenceVisualRecipe, evidence: ReferenceVisualEvidence[]): Promise<ReferenceVisualRender> {
  if (!evidence.length) throw new Error("Reference Visual rendering requires confirmed canonical evidence.");
  const v2 = recipe.renderer_contract_version === "forge.reference-visual-renderer.v2";
  const rendererVersion = recipe.visual_subtype === "timeline" || recipe.visual_subtype === "quote_card" ? "3" : v2 ? "2" : "1";
  const rendererName = `forge_${recipe.visual_subtype}_v${rendererVersion}`;
  const attribution = recipe.attribution_text.trim() ? `<text x="120" y="990" font-size="28" fill="#9fb2c9">Source: ${escapeXml(recipe.attribution_text)}</text>` : "";
  const quoteCard = recipe.visual_subtype === "quote_card";
  const svg = quoteCard
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="1920" height="1080" fill="#08111f"/><rect x="70" y="70" width="1780" height="940" rx="32" fill="#142238"/><rect x="70" y="70" width="18" height="940" rx="9" fill="#f4a900"/><g font-family="Inter,Arial,sans-serif">${renderQuoteCard(recipe, evidence)}${attribution}</g></svg>`
    : v2
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="1920" height="1080" fill="#08111f"/><rect x="70" y="70" width="1780" height="940" rx="32" fill="#142238"/><rect x="70" y="70" width="18" height="940" rx="9" fill="#f4a900"/><g font-family="Inter,Arial,sans-serif">${textLines(wrap(recipe.title, 58), 128, 175, 66, 1.15, 750)}${recipe.subtitle ? textLines(wrap(recipe.subtitle, 78), 132, 265, 34, 1.15, 450) : ""}${renderBodyV2(recipe, evidence)}${attribution}</g></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="1920" height="1080" fill="#0b1220"/><rect x="70" y="70" width="1780" height="940" rx="28" fill="#142238"/><g font-family="Inter,Arial,sans-serif">${textLines(wrap(recipe.title, 58), 120, 175, 66, 1.15, 750)}${recipe.subtitle ? textLines(wrap(recipe.subtitle, 78), 124, 250, 34, 1.15, 450) : ""}${renderBodyV1(recipe, evidence)}<text x="120" y="990" font-size="28" fill="#9fb2c9">Source: ${escapeXml(recipe.attribution_text)}</text></g></svg>`;
  const pngBytes = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
  return { rendererName, rendererVersion, width: WIDTH, height: HEIGHT, mimeType: "image/png", canonicalSvg: svg, pngBytes };
}
