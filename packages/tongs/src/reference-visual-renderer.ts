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
};

export type ReferenceVisualRender = {
  rendererName: string;
  rendererVersion: "1";
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

function textLines(lines: string[], x: number, y: number, size: number, gap = 1.22, weight = 500): string {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * size * gap}" font-size="${size}" font-weight="${weight}" fill="#f5f7fb">${escapeXml(line)}</text>`).join("");
}

function renderBody(recipe: ReferenceVisualRecipe, evidence: ReferenceVisualEvidence[]): string {
  const first = evidence[0];
  if (recipe.visual_subtype === "stat_card") {
    const value = first?.numeric_value == null ? "—" : `${first.numeric_value}${first.unit === "percent" ? "%" : first.unit ? ` ${first.unit}` : ""}`;
    return `<text x="120" y="535" font-size="210" font-weight="800" fill="#73cbff">${escapeXml(value)}</text>${textLines(wrap(first?.label ?? "Confirmed statistic", 44), 128, 640, 52, 1.18, 600)}`;
  }
  if (recipe.visual_subtype === "quote_card" || recipe.visual_subtype === "document_excerpt") {
    return `${textLines(wrap(first?.raw_excerpt ?? "", 58), 150, 365, 54, 1.3, 500)}`;
  }
  if (recipe.visual_subtype === "timeline") {
    return evidence.slice(0, 6).map((entry, index) => {
      const x = 180 + index * 290;
      return `<circle cx="${x}" cy="580" r="16" fill="#73cbff"/><text x="${x - 80}" y="520" font-size="34" fill="#f5f7fb">${escapeXml(entry.evidence_date ?? entry.label ?? "")}</text><text x="${x - 110}" y="650" font-size="28" fill="#cad8ea">${escapeXml(entry.category ?? "")}</text>`;
    }).join("") + `<line x1="180" y1="580" x2="1630" y2="580" stroke="#73cbff" stroke-width="5"/>`;
  }
  const numeric = evidence.filter((entry) => entry.numeric_value != null).slice(0, 6);
  const max = Math.max(1, ...numeric.map((entry) => Math.abs(entry.numeric_value ?? 0)));
  return numeric.map((entry, index) => {
    const height = Math.round(430 * Math.abs(entry.numeric_value ?? 0) / max);
    const x = 190 + index * 260;
    return `<rect x="${x}" y="${830 - height}" width="150" height="${height}" fill="#73cbff"/><text x="${x}" y="890" font-size="30" fill="#f5f7fb">${escapeXml(entry.label ?? entry.category ?? `Value ${index + 1}`)}</text>`;
  }).join("");
}

export async function renderCanonicalReferenceVisual(recipe: ReferenceVisualRecipe, evidence: ReferenceVisualEvidence[]): Promise<ReferenceVisualRender> {
  if (!evidence.length) throw new Error("Reference Visual rendering requires confirmed canonical evidence.");
  const rendererName = `forge_${recipe.visual_subtype}_v1`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="1920" height="1080" fill="#0b1220"/><rect x="70" y="70" width="1780" height="940" rx="28" fill="#142238"/><g font-family="Inter,Arial,sans-serif">${textLines(wrap(recipe.title, 58), 120, 175, 66, 1.15, 750)}${recipe.subtitle ? textLines(wrap(recipe.subtitle, 78), 124, 250, 34, 1.15, 450) : ""}${renderBody(recipe, evidence)}<text x="120" y="990" font-size="28" fill="#9fb2c9">Source: ${escapeXml(recipe.attribution_text)}</text></g></svg>`;
  const pngBytes = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
  return { rendererName, rendererVersion: "1", width: WIDTH, height: HEIGHT, mimeType: "image/png", canonicalSvg: svg, pngBytes };
}
