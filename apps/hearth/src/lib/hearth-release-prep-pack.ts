export type ReleasePrepSectionKey =
  | "youtube_optimized_cut"
  | "title_options"
  | "short_form_hook_20s"
  | "tone_variant_creator"
  | "audience_variant"
  | "monetization_angle";

export type ReleasePrepSection = {
  key: ReleasePrepSectionKey;
  label: string;
  content: string;
};

export function parseReleasePrepPackSections(rawText: string): ReleasePrepSection[] {
  const text = rawText.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  const headerRe = /^(YOUTUBE_OPTIMIZED_CUT|TITLE_OPTIONS|SHORT_FORM_HOOK_20S|TONE_VARIANT_CREATOR|AUDIENCE_VARIANT|MONETIZATION_ANGLE):\s*$/gm;
  const matches = [...text.matchAll(headerRe)];
  if (matches.length === 0) {
    return [{
      key: "youtube_optimized_cut",
      label: "Framing Pack",
      content: text,
    }];
  }

  const out: ReleasePrepSection[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const header = (current?.[1] ?? "").trim().toUpperCase();
    const start = (current?.index ?? 0) + (current?.[0]?.length ?? 0);
    const end = next?.index ?? text.length;
    const body = text.slice(start, end).trim();
    const key = header.toLowerCase() as ReleasePrepSectionKey;
    const label = header
      .toLowerCase()
      .split("_")
      .map((part) => (part === "20s" ? "20s" : part.charAt(0).toUpperCase() + part.slice(1)))
      .join(" ");
    out.push({
      key,
      label,
      content: body || "(No content generated)",
    });
  }
  return out;
}
