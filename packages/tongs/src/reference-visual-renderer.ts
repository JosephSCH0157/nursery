import sharp from "sharp";
import { evaluateReferenceVisualReadiness } from "@forge/shared/reference-visual-readiness";

export type ReferenceVisualEvidence = {
  id: string;
  label?: string | null;
  raw_excerpt?: string | null;
  numeric_value?: number | null;
  unit?: string | null;
  evidence_date?: string | null;
  category?: string | null;
  source_set_member_id?: string | null;
  source_title?: string | null;
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

function textLines(lines: string[], x: number, y: number, size: number, gap = 1.22, weight = 500, fill = "#f5f7fb"): string {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * size * gap}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`).join("");
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

function renderDocumentExcerpt(recipe: ReferenceVisualRecipe, evidence: ReferenceVisualEvidence[]): string {
  const excerpt = evidence.find((entry) => entry.raw_excerpt?.trim())?.raw_excerpt?.trim() ?? recipe.subtitle?.trim() ?? recipe.title.trim();
  const heading = recipe.title.trim() && !sameViewerText(recipe.title, excerpt) ? recipe.title.trim() : "Source document";
  const supporting = recipe.subtitle?.trim() && !sameViewerText(recipe.subtitle, excerpt) && !sameViewerText(recipe.subtitle, heading) ? recipe.subtitle.trim() : "";
  const headingLines = wrapAll(heading, 68).slice(0, 3);
  const supportingLines = supporting ? wrapAll(supporting, 88).slice(0, 3) : [];
  const bodyLines = wrapAll(excerpt, excerpt.length > 700 ? 105 : excerpt.length > 400 ? 92 : 78);
  const bodyTop = 315 + supportingLines.length * 31;
  const bodyBottom = 900;
  const bodySize = Math.max(15, Math.min(42, (bodyBottom - bodyTop) / Math.max(1, bodyLines.length * 1.22)));
  return `<g data-document-layout="responsive" data-document-line-count="${bodyLines.length}"><rect x="126" y="126" width="1668" height="774" rx="18" fill="#182a43" stroke="#31506f" stroke-width="2"/><rect x="126" y="126" width="12" height="774" rx="6" fill="#f4a900"/>${textLines(headingLines, 174, 196, 46, 1.13, 760)}${supportingLines.length ? textLines(supportingLines, 174, 270, 27, 1.15, 450) : ""}${textLines(bodyLines, 174, bodyTop, bodySize, 1.22, 500)}</g>`;
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

function hasTimelineDate(entry: ReferenceVisualEvidence): boolean {
  return timelineDate(entry).display !== "Date not provided";
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

function comparisonValue(entry: ReferenceVisualEvidence): string {
  if (entry.numeric_value != null) return `${entry.numeric_value}${entry.unit === "percent" ? "%" : entry.unit ? ` ${entry.unit}` : ""}`;
  return entry.raw_excerpt?.trim() || entry.label?.trim() || "Confirmed detail";
}

function statValue(entry: ReferenceVisualEvidence): string {
  if (entry.numeric_value != null) {
    const approximate = /\b(?:roughly|about|approximately|nearly|around)\b|~/i.test(entry.raw_excerpt ?? "");
    return `${approximate ? "~" : ""}${entry.numeric_value}${entry.unit === "percent" ? "%" : entry.unit ? ` ${entry.unit}` : ""}`;
  }
  return entry.raw_excerpt?.trim() || "Confirmed";
}

function renderStatCard(evidence: ReferenceVisualEvidence[]): string {
  const columns = evidence.length === 1 ? 1 : 2;
  const rows = Math.ceil(evidence.length / columns);
  const gap = 24;
  const left = 120;
  const top = 315;
  const availableWidth = WIDTH - left * 2;
  const availableHeight = 620;
  const cardWidth = (availableWidth - gap * (columns - 1)) / columns;
  const cardHeight = (availableHeight - gap * (rows - 1)) / rows;
  return evidence.map((entry, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = left + column * (cardWidth + gap);
    const y = top + row * (cardHeight + gap);
    const source = entry.source_title?.trim() || "Canonical Source";
    const label = entry.label?.trim() || entry.category?.trim() || "Confirmed statistic";
    const value = statValue(entry);
    const sourceSize = Math.max(15, Math.min(22, cardHeight * 0.09));
    const sourceLines = wrapAll(source, columns === 1 ? 72 : 42);
    const valueLines = wrapAll(value, columns === 1 ? 32 : 20);
    const labelLines = wrapAll(label, columns === 1 ? 58 : 34);
    const valueSize = Math.max(24, Math.min(columns === 1 ? 116 : 66, cardHeight * 0.3 / Math.max(1, valueLines.length)));
    const labelSize = Math.max(17, Math.min(28, cardHeight * 0.12 / Math.max(1, labelLines.length)));
    const valueOffset = Math.min(170, Math.max(110, cardHeight * 0.42));
    const valueY = y + Math.max(valueOffset, sourceLines.length * sourceSize * 1.08 + 70);
    const labelY = valueY + valueLines.length * valueSize * 1.05 + 20;
    return `<g data-stat-item="${index}" data-evidence-id="${escapeXml(entry.id)}" data-source-set-member-id="${escapeXml(entry.source_set_member_id)}"><rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="22" fill="#1a2d48" stroke="#31506f" stroke-width="2"/>${textLines(sourceLines, x + 28, y + 35, sourceSize, 1.08, 650)}${textLines(valueLines, x + 28, valueY, valueSize, 1.05, 850, "#73cbff")}${textLines(labelLines, x + 28, labelY, labelSize, 1.15, 550)}<rect x="${x + 28}" y="${y + cardHeight - 22}" width="${Math.min(220, cardWidth - 56)}" height="6" rx="3" fill="#f4a900"/></g>`;
  }).join("");
}

function renderComparison(evidence: ReferenceVisualEvidence[]): string {
  const groups = new Map<string, ReferenceVisualEvidence[]>();
  for (const entry of evidence) {
    const key = entry.source_set_member_id || entry.source_title || `evidence:${entry.id}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const columns = [...groups.values()];
  if (columns.length !== 2) throw new Error("A comparison requires confirmed evidence from exactly two canonical Source members.");
  return columns.map((entries, columnIndex) => {
    const x = columnIndex === 0 ? 120 : 990, width = 810;
    const sourceTitle = entries[0]?.source_title?.trim() || `Source ${columnIndex + 1}`;
    const rows = entries.map((entry) => ({ label: entry.label?.trim() || entry.category?.trim() || "Confirmed detail", value: comparisonValue(entry) }));
    const lineCount = rows.reduce((count, row) => count + wrapAll(row.label, 34).length + wrapAll(row.value, 42).length, 0);
    const fontSize = Math.max(18, Math.min(30, 620 / Math.max(6, lineCount * 1.35)));
    let y = 420;
    const content = rows.map((row, index) => {
      const labelLines = wrapAll(row.label, 34), valueLines = wrapAll(row.value, 42), valueY = y + labelLines.length * fontSize * 1.18 + 8;
      const block = `<g data-comparison-row="${index}" data-evidence-id="${escapeXml(entries[index]?.id)}">${textLines(labelLines, x + 34, y, fontSize, 1.18, 750)}${textLines(valueLines, x + 34, valueY, fontSize, 1.18, 500)}</g>`;
      y = valueY + valueLines.length * fontSize * 1.18 + 34;
      return block;
    }).join("");
    return `<g data-comparison-source="${escapeXml(entries[0]?.source_set_member_id || String(columnIndex + 1))}"><rect x="${x}" y="300" width="${width}" height="640" rx="24" fill="#1a2d48" stroke="#31506f" stroke-width="2"/>${textLines(wrapAll(sourceTitle, 34), x + 34, 355, 34, 1.12, 800)}${content}</g>`;
  }).join("");
}

function renderBodyV2(recipe: ReferenceVisualRecipe, evidence: ReferenceVisualEvidence[]): string {
  if (recipe.visual_subtype === "comparison") return renderComparison(evidence);
  if (recipe.visual_subtype !== "stat_card") return renderBodyV1(recipe, evidence);
  return renderStatCard(evidence);
}

export async function renderCanonicalReferenceVisual(recipe: ReferenceVisualRecipe, evidence: ReferenceVisualEvidence[]): Promise<ReferenceVisualRender> {
  const sourceMemberIds = [...new Set(evidence.flatMap((entry) => entry.source_set_member_id ? [entry.source_set_member_id] : []))];
  const readiness = evaluateReferenceVisualReadiness({
    subtype: recipe.visual_subtype,
    evidence,
    currentSourceMemberIds: sourceMemberIds.length ? sourceMemberIds : undefined,
  });
  if (!readiness.evidenceReady) throw new Error(readiness.message);
  const v2 = recipe.renderer_contract_version === "forge.reference-visual-renderer.v2";
  const modernLayout = v2 || recipe.visual_subtype === "stat_card";
  const rendererVersion = recipe.visual_subtype === "timeline" || recipe.visual_subtype === "quote_card" || recipe.visual_subtype === "document_excerpt" || recipe.visual_subtype === "comparison" || recipe.visual_subtype === "stat_card" ? "3" : v2 ? "2" : "1";
  const rendererName = `forge_${recipe.visual_subtype}_v${rendererVersion}`;
  const attribution = recipe.attribution_text.trim() ? `<text x="120" y="990" font-size="28" fill="#9fb2c9">Source: ${escapeXml(recipe.attribution_text)}</text>` : "";
  const quoteCard = recipe.visual_subtype === "quote_card";
  const documentExcerpt = recipe.visual_subtype === "document_excerpt";
  const svg = quoteCard || documentExcerpt
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="1920" height="1080" fill="#08111f"/><rect x="70" y="70" width="1780" height="940" rx="32" fill="#142238"/><rect x="70" y="70" width="18" height="940" rx="9" fill="#f4a900"/><g font-family="Inter,Arial,sans-serif">${quoteCard ? renderQuoteCard(recipe, evidence) : renderDocumentExcerpt(recipe, evidence)}${attribution}</g></svg>`
    : modernLayout
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="1920" height="1080" fill="#08111f"/><rect x="70" y="70" width="1780" height="940" rx="32" fill="#142238"/><rect x="70" y="70" width="18" height="940" rx="9" fill="#f4a900"/><g font-family="Inter,Arial,sans-serif">${textLines(wrap(recipe.title, 58), 128, 175, 66, 1.15, 750)}${recipe.subtitle ? textLines(wrap(recipe.subtitle, 78), 132, 265, 34, 1.15, 450) : ""}${renderBodyV2(recipe, evidence)}${attribution}</g></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="1920" height="1080" fill="#0b1220"/><rect x="70" y="70" width="1780" height="940" rx="28" fill="#142238"/><g font-family="Inter,Arial,sans-serif">${textLines(wrap(recipe.title, 58), 120, 175, 66, 1.15, 750)}${recipe.subtitle ? textLines(wrap(recipe.subtitle, 78), 124, 250, 34, 1.15, 450) : ""}${renderBodyV1(recipe, evidence)}<text x="120" y="990" font-size="28" fill="#9fb2c9">Source: ${escapeXml(recipe.attribution_text)}</text></g></svg>`;
  const pngBytes = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
  return { rendererName, rendererVersion, width: WIDTH, height: HEIGHT, mimeType: "image/png", canonicalSvg: svg, pngBytes };
}
