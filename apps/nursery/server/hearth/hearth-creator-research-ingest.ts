import type {
  HearthCreatorResearchClaim,
  HearthResearchArtifact,
  HearthResearchBrief,
  HearthResearchClaimProvenanceStatus,
  HearthResearchFinding,
  HearthResearchResult,
  HearthResearchSource,
} from "../../../hearth/src/lib/hearth-research-contract";

export type HearthCreatorResearchCitation = {
  raw: string;
  normalizedUrl: string | null;
  status: "normalized" | "malformed_url";
};

export type HearthCreatorResearchInput = {
  citations: HearthCreatorResearchCitation[];
  claims: HearthCreatorResearchClaim[];
  textWithoutCitations: string;
  appearsTruncated: boolean;
};

const CREATOR_URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const MONEY_CLAIM_RE = /\$\s*\d[\d,.]*(?:\s*(?:million|billion|thousand)|[kmb]\b)/i;
const ADJACENT_FUNDING_RE = /\b(?:broader|citywide|countywide|downtown\s+bond|infrastructure\s+package|bond\s+package|adjacent\s+funding|separate\s+context)\b/i;
const INCOMPLETE_TRAILING_RE = /\b(?:for|to|of|at|by|with|and|or|is|are|was|were|will|slated\s+for)\s*$/i;
const BUSINESS_RESEARCH_CONTEXT_RE = /\b(?:business(?:es)?|restaurant(?:s)?|bar(?:s)?|cafe|coffee|shop(?:s)?|storefront(?:s)?|open doors?|operating|closed|corridor)\b/i;
const BUSINESS_LEAD_RE = /\b(?:chophouse|restaurant|pizza|bar|bao|coffee|cafe|birria|crepe|gastro|exchange|office|arena|center|centre|adventures?|tours?|travel|leisure|shop|store|market|bakery|brewery|pub|grill|kitchen|dining|rooftop|salon|studio|museum|hotel)\b/i;
const GENERIC_BUSINESS_HEADING_RE = /^(?:open|closed|active|current|adjacent|local|downtown|church street)?\s*(?:business(?:es)?|restaurant(?:s)?|storefront(?:s)?|open doors?|leads?|sources?)\s*:?[\s-]*$/i;

function countCharacter(value: string, character: "(" | ")"): number {
  return [...value].filter((entry) => entry === character).length;
}

function normalizeCreatorUrlToken(rawToken: string): {
  normalizedUrl: string | null;
  proseSuffix: string;
} {
  let candidate = rawToken;
  let proseSuffix = "";

  const escapedBoundary = candidate.search(/\\\)(?=.)/u);
  if (escapedBoundary >= 0) {
    proseSuffix = candidate.slice(escapedBoundary + 2);
    candidate = candidate.slice(0, escapedBoundary);
  } else {
    let depth = 0;
    for (let index = 0; index < candidate.length; index += 1) {
      const character = candidate[index];
      if (character === "(") {
        depth += 1;
        continue;
      }
      if (character !== ")") continue;
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      const suffix = candidate.slice(index + 1);
      if (suffix.length > 0) {
        proseSuffix = suffix;
        candidate = candidate.slice(0, index);
        break;
      }
    }
  }

  candidate = candidate.replace(/[.,;:!?\]}]+$/g, "");
  while (
    candidate.endsWith(")")
    && countCharacter(candidate, ")") > countCharacter(candidate, "(")
  ) {
    candidate = candidate.slice(0, -1);
  }

  if (!candidate || candidate.includes("\\")) {
    return { normalizedUrl: null, proseSuffix };
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { normalizedUrl: null, proseSuffix };
    }
    return { normalizedUrl: parsed.toString(), proseSuffix };
  } catch {
    return { normalizedUrl: null, proseSuffix };
  }
}

function cleanClaimText(value: string): string {
  return value
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/\[([^\]]+)\]\(/g, "$1 ")
    .replace(/[*_~]+/g, "")
    .replace(/[()[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function creatorBusinessStatus(text: string): HearthCreatorResearchClaim["businessStatus"] {
  if (/\b(?:corporate|administrative|regional)\s+office\b/i.test(text)) return "non_customer_facing";
  if (/\b(?:adjacent|farther\s+(?:east|west|north|south)|not\s+on|outside|off)\b.*\b(?:corridor|church street)\b/i.test(text)) {
    return "adjacent_location";
  }
  return "creator_supplied_unverified";
}

function extractBusinessName(rawLine: string, cleaned: string): string | null {
  const emphasized = rawLine.match(/^\s*(?:(?:[-*•]|\d+[.)])\s+)?\*\*([^*]{2,160})\*\*/)?.[1]?.trim();
  const candidate = emphasized
    || cleaned.split(/\s+(?:—|–|\|)\s+|:\s+|,\s+(?=\d)/, 1)[0]?.trim()
    || "";
  if (!candidate || candidate.length > 160 || GENERIC_BUSINESS_HEADING_RE.test(candidate)) return null;
  return candidate;
}

function extractCreatorClaims(text: string, appearsTruncated: boolean): HearthCreatorResearchClaim[] {
  const rawLines = text.split(/\r?\n/);
  const lastNonEmptyIndex = rawLines.reduce((last, line, index) => line.trim() ? index : last, -1);
  const segments = rawLines.flatMap((line, lineIndex) => (
    line
      .split(/(?<=[.!?])\s+/)
      .map((part) => ({ part, lineIndex }))
  ));
  const claims: HearthCreatorResearchClaim[] = [];
  for (const { part, lineIndex } of segments) {
    if (appearsTruncated && lineIndex === lastNonEmptyIndex && INCOMPLETE_TRAILING_RE.test(part.trim())) continue;
    const claim = cleanClaimText(part);
    if (!claim || !MONEY_CLAIM_RE.test(claim)) continue;
    claims.push({
      claimId: `creator-claim-${claims.length + 1}`,
      text: claim,
      provenanceStatus: "creator_supplied_unverified",
      scope: ADJACENT_FUNDING_RE.test(claim) ? "adjacent_context" : "current_subject",
      sourceIds: [],
      claimKind: "budget",
    });
    if (claims.length >= 24) break;
  }
  if (BUSINESS_RESEARCH_CONTEXT_RE.test(text) || BUSINESS_LEAD_RE.test(text)) {
    for (const [lineIndex, rawLine] of rawLines.entries()) {
      if (!/^\s*(?:[-*•]|\d+[.)])\s+/.test(rawLine)) continue;
      if (appearsTruncated && lineIndex === lastNonEmptyIndex && INCOMPLETE_TRAILING_RE.test(rawLine.trim())) continue;
      const claim = cleanClaimText(rawLine);
      if (!claim || GENERIC_BUSINESS_HEADING_RE.test(claim) || !BUSINESS_LEAD_RE.test(claim)) continue;
      const businessName = extractBusinessName(rawLine, claim);
      if (!businessName) continue;
      if (claims.some((existing) => existing.text === claim)) continue;
      const businessStatus = creatorBusinessStatus(claim);
      claims.push({
        claimId: `creator-claim-${claims.length + 1}`,
        text: claim,
        provenanceStatus: "creator_supplied_unverified",
        scope: businessStatus === "adjacent_location" ? "adjacent_context" : "current_subject",
        sourceIds: [],
        claimKind: "business_status",
        businessName,
        businessStatus,
      });
      if (claims.length >= 24) break;
    }
  }
  return claims;
}

export function parseCreatorSuppliedResearch(input: string, maxCitations = 8): HearthCreatorResearchInput {
  const raw = String(input ?? "");
  const citations: HearthCreatorResearchCitation[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  let textWithoutCitations = "";
  CREATOR_URL_RE.lastIndex = 0;
  for (const match of raw.matchAll(CREATOR_URL_RE)) {
    const start = match.index ?? 0;
    const token = match[0];
    const normalized = normalizeCreatorUrlToken(token);
    textWithoutCitations += raw.slice(cursor, start);
    textWithoutCitations += normalized.proseSuffix;
    cursor = start + token.length;

    const key = (normalized.normalizedUrl ?? token).toLowerCase();
    if (seen.has(key) || citations.length >= maxCitations) continue;
    seen.add(key);
    citations.push({
      raw: token,
      normalizedUrl: normalized.normalizedUrl,
      status: normalized.normalizedUrl ? "normalized" : "malformed_url",
    });
  }
  textWithoutCitations += raw.slice(cursor);
  textWithoutCitations = textWithoutCitations
    .replace(/\[([^\]]+)\]\(/g, "$1 ")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\s*\r?\n\s*/g, "\n")
    .trim();

  const trailingText = raw.trim();
  const appearsTruncated = Boolean(trailingText)
    && !/[.!?]["')\]]?$/.test(trailingText)
    && INCOMPLETE_TRAILING_RE.test(trailingText);

  return {
    citations,
    claims: extractCreatorClaims(textWithoutCitations, appearsTruncated),
    textWithoutCitations,
    appearsTruncated,
  };
}

export function buildMalformedCreatorCitationSource(args: {
  citation: HearthCreatorResearchCitation;
  sourceId: string;
  brief: HearthResearchBrief;
}): HearthResearchSource {
  return {
    sourceId: args.sourceId,
    sourceType: "unknown",
    title: null,
    url: args.citation.raw,
    originalUrl: args.citation.raw,
    resolvedUrl: null,
    canonicalUrl: null,
    domain: null,
    publishedAt: null,
    snippet: null,
    extractedText: null,
    extractionStatus: "failed",
    extractionError: "Malformed creator-supplied URL could not be normalized safely.",
    provenance: {
      origin: "creator_url",
      briefFingerprint: args.brief.briefFingerprint,
      inspectedAt: null,
      inspectionStatus: "inaccessible",
      accessFailureReason: "malformed_url",
      verifiedInCurrentRequest: false,
    },
  };
}

function moneyClaimMarkers(value: string): string[] {
  const markers: string[] = [];
  const pattern = /\$\s*(\d[\d,.]*)(?:\s*(million|billion|thousand)|\s*([kmb])\b)?/gi;
  for (const match of value.matchAll(pattern)) {
    const amount = Number(match[1]?.replace(/,/g, ""));
    if (!Number.isFinite(amount)) continue;
    const scale = (match[2] || match[3] || "").toLowerCase();
    const multiplier = scale === "billion" || scale === "b"
      ? 1_000_000_000
      : scale === "million" || scale === "m"
        ? 1_000_000
        : scale === "thousand" || scale === "k"
          ? 1_000
          : 1;
    markers.push(String(Math.round(amount * multiplier)));
  }
  return Array.from(new Set(markers));
}

function findingMatchesCreatorClaim(
  finding: HearthResearchFinding,
  claim: HearthCreatorResearchClaim,
): boolean {
  if (claim.claimKind === "business_status" && claim.businessName) {
    const claimName = claim.businessName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const findingName = (finding.businessName || finding.text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (claimName.length >= 3 && (findingName === claimName || findingName.includes(claimName))) return true;
  }
  const findingMarkers = moneyClaimMarkers(finding.text);
  const claimMarkers = moneyClaimMarkers(claim.text);
  return findingMarkers.length > 0
    && claimMarkers.some((marker) => findingMarkers.includes(marker));
}

function inspectedSourcesSupportMoneyClaim(
  finding: HearthResearchFinding,
  result: HearthResearchResult,
): boolean {
  const markers = moneyClaimMarkers(finding.text);
  if (markers.length === 0) return true;
  const evidenceText = result.sources
    .filter((source) => (
      finding.sourceIds.includes(source.sourceId)
      && source.provenance?.inspectionStatus === "inspected"
      && source.provenance.verifiedInCurrentRequest
    ))
    .map((source) => [source.extractedText, source.transcript, source.snippet].filter(Boolean).join(" "))
    .join(" ");
  const evidenceMarkers = new Set(moneyClaimMarkers(evidenceText));
  return markers.every((marker) => evidenceMarkers.has(marker));
}

function formatBudgetAmount(amount: number): string {
  if (amount >= 1_000_000_000) {
    const billions = amount / 1_000_000_000;
    return `$${Number.isInteger(billions) ? billions : billions.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} billion`;
  }
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `$${Number.isInteger(millions) ? millions : millions.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} million`;
  }
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function buildCreatorBudgetArithmeticConflict(
  claims: HearthCreatorResearchClaim[],
): HearthResearchFinding | null {
  const phaseAmounts = new Map<string, number>();
  const statedTotals: number[] = [];

  for (const claim of claims) {
    if (claim.scope !== "current_subject") continue;
    const amounts = moneyClaimMarkers(claim.text).map(Number).filter(Number.isFinite);
    if (amounts.length !== 1) continue;
    const phaseMatch = claim.text.match(/\bphase\s+([ivx]+|\d+)\b/i);
    if (phaseMatch) {
      const phaseLabel = `Phase ${phaseMatch[1].toUpperCase()}`;
      if (!phaseAmounts.has(phaseLabel)) phaseAmounts.set(phaseLabel, amounts[0]);
      continue;
    }
    if (/\b(?:stated|claimed|reported|project|overall|complete|entire)?\s*total\b/i.test(claim.text)) {
      statedTotals.push(amounts[0]);
    }
  }

  if (phaseAmounts.size < 2 || statedTotals.length === 0) return null;
  const phaseSum = [...phaseAmounts.values()].reduce((sum, amount) => sum + amount, 0);
  const conflictingTotal = statedTotals.find((total) => phaseSum > total);
  if (!conflictingTotal) return null;
  const phaseNames = [...phaseAmounts.keys()].join(" + ");
  return {
    text: `The creator-supplied figures conflict: ${phaseNames} total ${formatBudgetAmount(phaseSum)}, which exceeds the stated ${formatBudgetAmount(conflictingTotal)} total; the figures may refer to different budget scopes or revisions.`,
    status: "uncertain",
    provenanceStatus: "conflicting",
    sourceIds: [],
    scope: "current_subject",
  };
}

export function reconcileCreatorSuppliedResearchArtifact(
  result: HearthResearchResult,
): HearthResearchArtifact | null {
  const brief = result.brief;
  const creatorClaims = result.creatorClaims ?? [];
  const modelArtifact = result.artifact;
  if (!brief) return modelArtifact ?? null;
  if (!modelArtifact && creatorClaims.length === 0) return null;

  const sourceById = new Map(result.sources.map((source) => [source.sourceId, source]));
  const artifact: HearthResearchArtifact = modelArtifact ?? {
    briefFingerprint: brief.briefFingerprint,
    workpieceId: brief.workpieceId,
    status: "partial",
    findings: [],
    uncertainties: [],
    editorialInterpretation: [],
  };
  if (artifact.briefFingerprint !== brief.briefFingerprint || artifact.workpieceId !== brief.workpieceId) {
    return null;
  }

  const reconciledFindings = artifact.findings.map((finding): HearthResearchFinding => {
    const matchingClaim = creatorClaims.find((claim) => findingMatchesCreatorClaim(finding, claim));
    const inspectedCitations = finding.sourceIds.filter((sourceId) => {
      const source = sourceById.get(sourceId);
      return source?.provenance?.inspectionStatus === "inspected"
        && source.provenance.verifiedInCurrentRequest;
    });
    const citedOnlyInaccessible = finding.sourceIds.length > 0
      && finding.sourceIds.every((sourceId) => sourceById.get(sourceId)?.provenance?.inspectionStatus === "inaccessible");
    const sourceSupportsClaim = inspectedCitations.length > 0
      && inspectedSourcesSupportMoneyClaim(finding, result);
    const scope = matchingClaim?.scope ?? finding.scope ?? "current_subject";

    if (finding.status === "editorial_interpretation") {
      return { ...finding, scope };
    }
    if (finding.status === "verified_fact" && sourceSupportsClaim) {
      return {
        ...finding,
        scope,
        provenanceStatus: "verified_by_current_run",
        ...(matchingClaim?.businessName && !finding.businessName ? { businessName: matchingClaim.businessName } : {}),
        ...(matchingClaim?.claimKind === "business_status" && !finding.businessStatus
          ? { businessStatus: "appears_active_unconfirmed" as const }
          : {}),
      };
    }
    if (finding.status === "reported_claim" && sourceSupportsClaim) {
      return {
        ...finding,
        scope,
        provenanceStatus: "reported_by_accessible_secondary",
        ...(matchingClaim?.businessName && !finding.businessName ? { businessName: matchingClaim.businessName } : {}),
        ...(matchingClaim?.claimKind === "business_status" && !finding.businessStatus
          ? { businessStatus: "appears_active_unconfirmed" as const }
          : {}),
      };
    }

    const provenanceStatus: HearthResearchClaimProvenanceStatus = finding.provenanceStatus === "conflicting"
      ? "conflicting"
      : citedOnlyInaccessible
        ? "inaccessible_source_only"
        : matchingClaim
          ? "creator_supplied_unverified"
          : "unsupported";
    return {
      ...finding,
      status: "uncertain",
      scope,
      provenanceStatus,
      sourceIds: finding.sourceIds.filter((sourceId) => sourceById.has(sourceId)),
      ...(matchingClaim?.businessName && !finding.businessName ? { businessName: matchingClaim.businessName } : {}),
      ...(matchingClaim?.claimKind === "business_status"
        ? {
            businessStatus: matchingClaim.businessStatus === "non_customer_facing" || matchingClaim.businessStatus === "adjacent_location"
              ? matchingClaim.businessStatus
              : "creator_supplied_unverified" as const,
          }
        : {}),
    };
  });

  for (const claim of creatorClaims) {
    if (reconciledFindings.some((finding) => findingMatchesCreatorClaim(finding, claim))) continue;
    reconciledFindings.push({
      text: claim.text,
      status: "uncertain",
      provenanceStatus: "creator_supplied_unverified",
      sourceIds: claim.sourceIds,
      scope: claim.scope,
      ...(claim.businessName ? { businessName: claim.businessName } : {}),
      ...(claim.businessStatus ? { businessStatus: claim.businessStatus } : {}),
    });
  }

  const arithmeticConflict = buildCreatorBudgetArithmeticConflict(creatorClaims);
  if (arithmeticConflict && !reconciledFindings.some((finding) => (
    finding.provenanceStatus === "conflicting"
    && finding.text === arithmeticConflict.text
  ))) {
    reconciledFindings.push(arithmeticConflict);
  }

  const unresolvedCreatorClaims = reconciledFindings.some((finding) => (
    finding.provenanceStatus === "creator_supplied_unverified"
    || finding.provenanceStatus === "conflicting"
    || finding.provenanceStatus === "unsupported"
    || finding.provenanceStatus === "inaccessible_source_only"
  ));
  const hasSubstantiveFindings = reconciledFindings.some((finding) => finding.text.trim().length >= 24);
  const status = !hasSubstantiveFindings
    ? artifact.status
    : artifact.status === "failed"
      || unresolvedCreatorClaims
      || result.runtimeStatus !== "ok"
      || result.creatorInputTruncated
        ? "partial"
        : artifact.status;
  const uncertainties = [...artifact.uncertainties];
  if (creatorClaims.length > 0 && unresolvedCreatorClaims) {
    uncertainties.push("Creator-supplied claims are preserved as leads and remain unverified unless current-run inspected evidence supports them.");
  }
  if (result.creatorInputTruncated) {
    uncertainties.push("The creator-supplied note appears truncated; no missing ending was inferred.");
  }

  return {
    ...artifact,
    status,
    findings: reconciledFindings,
    uncertainties: Array.from(new Set(uncertainties)),
  };
}
