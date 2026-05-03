import type {
  EpisodeContextualDataCompositePlan,
  EpisodeBrollPlacementHint,
  EpisodeImageMapEntry,
  EpisodeReferenceClipSubtype,
} from "./episode-package-v2";
import { buildBulletBeatAnchorLabel } from "./episode-package-v2";
import { createReferenceClipPlan } from "./hearth-reference-clip-plan";

type ReferenceClipEvidence = {
  source: string;
  context: string;
  highlight: string;
  visualSpec: string;
  subtype: EpisodeReferenceClipSubtype;
};

const KNOWN_SOURCE_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\bOpenSecrets\b/i, label: "OpenSecrets" },
  { pattern: /\bCRS\b|\bCongressional Research Service\b/i, label: "Congressional Research Service" },
  { pattern: /\bGAO\b|\bGovernment Accountability Office\b/i, label: "Government Accountability Office" },
  { pattern: /\bFEC\b|\bFederal Election Commission\b/i, label: "Federal Election Commission" },
  { pattern: /\bDOJ\b|\bDepartment of Justice\b/i, label: "Department of Justice" },
  { pattern: /\bSOPR\b|\bSenate Office of Public Records\b/i, label: "Senate Office of Public Records" },
  { pattern: /\bHouse Clerk\b|\bOffice of the Clerk\b/i, label: "U.S. House Clerk" },
  { pattern: /\bLobbying Disclosure Act\b|\bLDA\b/i, label: "Lobbying Disclosure Act" },
  { pattern: /\bHLOGA\b|\bHonest Leadership and Open Government Act\b/i, label: "Honest Leadership and Open Government Act" },
];

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function firstSentence(value: string): string {
  return normalizeText(value).split(/(?<=[.!?])\s+/)[0]?.trim() || normalizeText(value);
}

function resolveEvidenceContext(text: string, source: string): string {
  const sentences = normalizeText(text).split(/(?<=[.!?])\s+/).map((entry) => entry.trim()).filter(Boolean);
  return sentences.find((sentence) => (
    !new RegExp(`^source\\s*:\\s*${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.?$`, "i").test(sentence)
    && !/\bsource\s*:/i.test(sentence)
    && /\b(vs\.?|versus|compared to|comparison|trend|over time|from \d{4}\s*(?:-|to)\s*\d{4}|\d{4}\s*(?:-|to)\s*\d{4}|since \d{4}|increase|decrease|growth|decline|spike|timeline|document|filing|report|testimony|guidance|disclosure)\b/i.test(sentence)
  )) ?? firstSentence(text);
}

function resolveExplicitSource(text: string): string | null {
  const sourcePrefix = text.match(/\bsource\s*:\s*([^.;\n]{2,80})/i)?.[1];
  if (sourcePrefix) return normalizeText(sourcePrefix);

  const accordingTo = text.match(/\baccording to\s+([^.;,\n]{2,80})/i)?.[1];
  if (accordingTo) return normalizeText(accordingTo);

  for (const source of KNOWN_SOURCE_PATTERNS) {
    if (source.pattern.test(text)) return source.label;
  }

  return null;
}

function classifyReferenceClipEvidence(entry: EpisodeImageMapEntry): ReferenceClipEvidence | null {
  const text = normalizeText([
    entry.anchor,
    entry.description,
    entry.visual_intent,
    entry.prompt_basis,
    entry.section_intent_note ?? "",
  ].filter(Boolean).join(" "));
  if (!text) return null;

  const source = resolveExplicitSource(text);
  const hasComparison = /\b(vs\.?|versus|compared to|comparison|trend|over time|from \d{4}\s*(?:-|to)\s*\d{4}|\d{4}\s*(?:-|to)\s*\d{4}|since \d{4}|increase|decrease|growth|decline|spike)\b/i.test(text);
  const isDocument = /\b(document|filing|report|study|testimony|hearing|database|record|law|act|statute|guidance|disclosure|LD-[12])\b/i.test(text);
  const isData = /\b(\d[\d,]*(?:\.\d+)?%?|chart|graph|trend|metric|spend|spending|filings?|database|over time|timeline)\b/i.test(text);
  const isClaim = entry.purpose === "explanation" || /\b(claim|shows?|proves?|evidence|reveals?|documents?|explains?|because)\b/i.test(text);

  if (!(isData || isClaim)) return null;
  if (!source || !(hasComparison || isDocument)) return null;

  const subtype: EpisodeReferenceClipSubtype = isDocument
    ? "document"
    : hasComparison && /\b(timeline|over time|from \d{4}\s*(?:-|to)\s*\d{4}|\d{4}\s*(?:-|to)\s*\d{4}|since \d{4})\b/i.test(text)
      ? "timeline"
      : "graph";
  const context = hasComparison
    ? resolveEvidenceContext(text, source)
    : `Document reference from ${source}`;
  const highlight = normalizeText(entry.section_intent_note)
    || normalizeText(entry.prompt_basis)
    || firstSentence(text);

  return {
    source,
    context,
    highlight,
    subtype,
    visualSpec: `${subtype} reference clip. Use ${source} as the evidence source. Show ${context}. Highlight ${highlight}.`,
  };
}

export function resolveReferenceClipPlanForMediaMapBootstrap(args: {
  workpieceId: string;
  currentEntries: EpisodeContextualDataCompositePlan[];
  imageMapEntries: EpisodeImageMapEntry[];
}): {
  seededFromImageMap: boolean;
  entries: EpisodeContextualDataCompositePlan[];
} {
  if (args.currentEntries.length > 0) {
    return {
      seededFromImageMap: false,
      entries: args.currentEntries,
    };
  }

  const evidenceEntries = args.imageMapEntries
    .map((entry) => ({ entry, evidence: classifyReferenceClipEvidence(entry) }))
    .filter((candidate): candidate is { entry: EpisodeImageMapEntry; evidence: ReferenceClipEvidence } => Boolean(candidate.evidence));

  if (evidenceEntries.length === 0) {
    return {
      seededFromImageMap: false,
      entries: [],
    };
  }

  const entries = evidenceEntries.map(({ entry, evidence }) => {
    const anchorText = entry.anchor?.trim()
      || (entry.beat_anchor ? buildBulletBeatAnchorLabel(entry.beat_anchor) : "")
      || entry.description?.trim()
      || entry.prompt_basis?.trim()
      || "Reference clip beat";
    const description = entry.description?.trim()
      || entry.visual_intent?.trim()
      || entry.prompt_basis?.trim()
      || anchorText;
    const seeded = createReferenceClipPlan({
      workpieceId: args.workpieceId,
      anchorText,
      description,
      format: "still",
      subtype: evidence.subtype,
      source: evidence.source,
      context: evidence.context,
      highlight: evidence.highlight,
      visualSpec: evidence.visualSpec,
    });

    const placementHint: EpisodeBrollPlacementHint = entry.placement_hint === "exact_timestamp"
      ? "exact_timestamp"
      : "first_occurrence";

    return {
      ...seeded,
      placement_hint: placementHint,
      purpose: "explanation" as const,
      visual_style: entry.style_preset ?? seeded.visual_style ?? null,
      background_context_description: evidence.context,
      foreground_data_description: evidence.visualSpec,
      title: seeded.title ?? anchorText,
      labels: [evidence.source, ...(seeded.labels ?? [])],
      emphasis_key: evidence.highlight,
    };
  });

  return {
    seededFromImageMap: true,
    entries,
  };
}
