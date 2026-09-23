import type { ApprovedTitleScript } from "./hearth-paid-title-generation";

/** One approved episode, one bounded supplier attempt, one canonical framing result. */
export const HEARTH_FRAMING_PACK_ROUTE = "hearth.framing_pack_generation" as const;
export const HEARTH_FRAMING_PACK_MODEL = "gpt-5.6-luna" as const;
export const HEARTH_FRAMING_PACK_CONTRACT = "forge.hearth.framing-pack-generation.v1" as const;
export const HEARTH_FRAMING_PACK_OUTPUT_CONTRACT = "framing_pack_seven_sections.v1" as const;
export const HEARTH_FRAMING_PACK_MAX_INPUT_TOKENS = 12_000;
export const HEARTH_FRAMING_PACK_MAX_OUTPUT_TOKENS = 2_048;
export const HEARTH_FRAMING_PACK_MAX_ATTEMPTS = 1;
export const HEARTH_FRAMING_PACK_MAX_RESPONSE_BYTES = 16_384;

export const HEARTH_FRAMING_PACK_SECTION_NAMES = [
  "YOUTUBE_OPTIMIZED_CUT",
  "SHORT_DESCRIPTION",
  "LONG_DESCRIPTION",
  "SHORT_FORM_HOOK_20S",
  "TONE_VARIANT_CREATOR",
  "AUDIENCE_VARIANT",
  "MONETIZATION_ANGLE",
] as const;

export type HearthFramingPackSectionName = typeof HEARTH_FRAMING_PACK_SECTION_NAMES[number];
export type HearthFramingPackSections = Record<HearthFramingPackSectionName, string>;

const SECTION_SET = new Set<string>(HEARTH_FRAMING_PACK_SECTION_NAMES);
const SECTION_MAX_CODE_POINTS: Record<HearthFramingPackSectionName, number> = {
  YOUTUBE_OPTIMIZED_CUT: 2_500,
  SHORT_DESCRIPTION: 180,
  LONG_DESCRIPTION: 2_500,
  SHORT_FORM_HOOK_20S: 500,
  TONE_VARIANT_CREATOR: 1_200,
  AUDIENCE_VARIANT: 1_200,
  MONETIZATION_ANGLE: 1_500,
};

export const HEARTH_FRAMING_PACK_SYSTEM_PROMPT = [
  "Generate one release Framing Pack from the approved podcast script only.",
  "Do not browse, retrieve sources, call tools, use attachments, or add facts not supported by the script.",
  "This is derived release-framing material. Do not rewrite or modify the approved script, canonical title, title variants, or canonical tags. Do not generate title options.",
  "Return plain text only. Use exactly these seven section headers once each, in this order, with non-empty content. Do not add any other section, TITLE_OPTIONS, markdown fences, preamble, epilogue, or wrapper commentary:",
  "YOUTUBE_OPTIMIZED_CUT:",
  "SHORT_DESCRIPTION:",
  "LONG_DESCRIPTION:",
  "SHORT_FORM_HOOK_20S:",
  "TONE_VARIANT_CREATOR:",
  "AUDIENCE_VARIANT:",
  "MONETIZATION_ANGLE:",
  "YOUTUBE_OPTIMIZED_CUT must give practical notes for a tighter opening and promise plus retention-aware structure or cut guidance without rewriting the script.",
  "SHORT_DESCRIPTION must be one concise publish-ready description of no more than 180 characters.",
  "LONG_DESCRIPTION must be a detailed publish-ready description grounded in the approved script, between 80 and 2500 characters.",
  "SHORT_FORM_HOOK_20S must be one cold-open hook for Shorts, TikTok, or Reels, no more than 60 words and 500 characters.",
  "TONE_VARIANT_CREATOR must be one more conversational, personality-led opening variant.",
  "AUDIENCE_VARIANT must be one opening or framing variant for a plausible audience angle supported by the script.",
  "MONETIZATION_ANGLE must include sponsorship positioning and one CTA direction; include premium-episode framing only when appropriate.",
  "Replace every instruction with finished copy or actionable notes. Do not emit placeholders.",
].join("\n");

export function buildPaidFramingPackMessages(approved: ApprovedTitleScript) {
  return [
    { role: "system" as const, content: HEARTH_FRAMING_PACK_SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: [
        `EPISODE_TITLE: ${approved.episodeTitle}`,
        `SCRIPT_APPROVAL_ID: ${approved.approvalId}`,
        `SCRIPT_VERSION: ${approved.approvalRevision}`,
        `SCRIPT_CONTENT_HASH: ${approved.scriptHash}`,
        "APPROVED_SCRIPT_TEXT:",
        approved.scriptText,
      ].join("\n"),
    },
  ];
}

export function paidFramingPackFingerprintPayload(args: {
  userId: string;
  workspaceId: string;
  workpieceId: string;
  approved: ApprovedTitleScript;
  operationIntentId: string;
}) {
  return {
    schema: HEARTH_FRAMING_PACK_CONTRACT,
    route_code: HEARTH_FRAMING_PACK_ROUTE,
    user_id: args.userId,
    workspace_id: args.workspaceId,
    workpiece_id: args.workpieceId,
    script_approval_id: args.approved.approvalId,
    script_approval_revision: args.approved.approvalRevision,
    script_content_hash: args.approved.scriptHash,
    operation_intent_id: args.operationIntentId,
    episode_title: args.approved.episodeTitle,
    output_contract: HEARTH_FRAMING_PACK_OUTPUT_CONTRACT,
    model: HEARTH_FRAMING_PACK_MODEL,
    maximum_input_tokens: HEARTH_FRAMING_PACK_MAX_INPUT_TOKENS,
    maximum_output_tokens: HEARTH_FRAMING_PACK_MAX_OUTPUT_TOKENS,
    maximum_attempts: HEARTH_FRAMING_PACK_MAX_ATTEMPTS,
    browsing_requests: 0,
    retrieval_requests: 0,
    tools: 0,
    attachments: 0,
  };
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function normalizeSectionContent(lines: string[]): string {
  const normalized = lines.map((line) => line.replace(/[\t ]+$/g, ""));
  while (normalized.length && !normalized[0]?.trim()) normalized.shift();
  while (normalized.length && !normalized[normalized.length - 1]?.trim()) normalized.pop();
  const compact: string[] = [];
  let priorBlank = false;
  for (const line of normalized) {
    const blank = !line.trim();
    if (blank && priorBlank) continue;
    compact.push(line);
    priorBlank = blank;
  }
  return compact.join("\n").trim();
}

function isObviousPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  return /<[^>\r\n]{1,200}>/.test(trimmed)
    || /^(?:tbd|todo|n\/?a|none|placeholder)(?:[.!])?$/i.test(trimmed)
    || /^(?:replace every instruction|insert (?:copy|content|text) here)(?:[.!])?$/i.test(trimmed)
    || /^(?:-\s*)?(?:one concise publish-ready description|one detailed publish-ready description|one cold-open hook|more conversational personality-led version|one tailored opening variant|sponsorship positioning idea)\b/i.test(trimmed);
}

export type HearthFramingPackValidation =
  | { ok: true; text: string; sections: HearthFramingPackSections }
  | { ok: false; error: string };

export function validatePaidFramingPackOutput(value: unknown): HearthFramingPackValidation {
  if (typeof value !== "string") return { ok: false, error: "invalid_framing_pack_output" };
  if (new TextEncoder().encode(value).byteLength > HEARTH_FRAMING_PACK_MAX_RESPONSE_BYTES) {
    return { ok: false, error: "invalid_framing_pack_output_size" };
  }
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (!text || /```/.test(text)) return { ok: false, error: "invalid_framing_pack_wrapper" };

  const collected = new Map<HearthFramingPackSectionName, string[]>();
  let current: HearthFramingPackSectionName | null = null;
  for (const rawLine of text.split("\n")) {
    const recognized = /^[\t ]*([A-Za-z][A-Za-z0-9_]*)[\t ]*:[\t ]*(.*)$/.exec(rawLine);
    if (recognized) {
      const candidate = recognized[1]!.toUpperCase();
      if (candidate === "TITLE_OPTIONS") return { ok: false, error: "forbidden_title_options" };
      if (SECTION_SET.has(candidate)) {
        const section = candidate as HearthFramingPackSectionName;
        if (collected.has(section)) return { ok: false, error: "duplicate_framing_pack_section" };
        current = section;
        collected.set(section, recognized[2] ? [recognized[2]] : []);
        continue;
      }
      return { ok: false, error: "unknown_framing_pack_section" };
    }
    if (!current) {
      if (rawLine.trim()) return { ok: false, error: "invalid_framing_pack_wrapper" };
      continue;
    }
    collected.get(current)!.push(rawLine);
  }

  for (const section of HEARTH_FRAMING_PACK_SECTION_NAMES) {
    if (!collected.has(section)) return { ok: false, error: "missing_framing_pack_section" };
  }

  const sections = {} as HearthFramingPackSections;
  for (const section of HEARTH_FRAMING_PACK_SECTION_NAMES) {
    let content = normalizeSectionContent(collected.get(section)!);
    if (section === "SHORT_DESCRIPTION" && /\n\s*\n/.test(content)) {
      return { ok: false, error: "invalid_framing_pack_short_description" };
    }
    if (section === "SHORT_DESCRIPTION") content = content.replace(/\s+/g, " ").trim();
    if (!content) return { ok: false, error: "empty_framing_pack_section" };
    if (isObviousPlaceholder(content)) return { ok: false, error: "invalid_framing_pack_placeholder" };
    if (codePointLength(content) > SECTION_MAX_CODE_POINTS[section]) {
      return { ok: false, error: section === "SHORT_DESCRIPTION"
        ? "invalid_framing_pack_short_description"
        : section === "LONG_DESCRIPTION"
          ? "invalid_framing_pack_long_description"
          : section === "SHORT_FORM_HOOK_20S"
            ? "invalid_framing_pack_short_hook"
            : "invalid_framing_pack_section_size" };
    }
    sections[section] = content;
  }
  if (codePointLength(sections.LONG_DESCRIPTION) < 80) {
    return { ok: false, error: "invalid_framing_pack_long_description" };
  }
  if (sections.SHORT_FORM_HOOK_20S.split(/\s+/).filter(Boolean).length > 60) {
    return { ok: false, error: "invalid_framing_pack_short_hook" };
  }
  const canonical = HEARTH_FRAMING_PACK_SECTION_NAMES
    .map((section) => `${section}:\n${sections[section]}`)
    .join("\n\n");
  return { ok: true, text: canonical, sections };
}
