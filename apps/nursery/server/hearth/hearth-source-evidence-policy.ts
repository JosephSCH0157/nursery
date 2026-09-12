import type {
  HearthCreatorEntityLead,
  HearthResearchSource,
  HearthResearchSourceAuthority,
} from "../../../hearth/src/lib/hearth-research-contract";

function normalizeIdentity(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function classifyResearchSourceAuthority(source: HearthResearchSource): HearthResearchSourceAuthority {
  const identity = `${source.domain ?? ""} ${source.publisher ?? ""} ${source.title ?? ""}`.toLowerCase();
  const inspectedContent = [source.extractedText, source.transcript, source.snippet]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    source.extractionStatus !== "extracted"
    || !inspectedContent
    || /^(?:place viewer|search viewer|map viewer|google maps|view larger map|loading)[.!]?$/i.test(inspectedContent)
  ) return "unassessed";
  const identityAndEvidence = `${identity} ${inspectedContent.slice(0, 600).toLowerCase()}`;
  if (/\b(?:wikipedia|wikimedia|wikiquote|britannica|encyclop(?:a)?edia)\b/.test(identity)) return "general_reference";
  if (/\.gov\b|\b(city of|county of|state of|department of|agency|commission|authority|public records?)\b/.test(identity)) return "primary_government";
  if (/\.edu\b|\b(university|college|journal|doi|peer.review|research institute)\b/.test(identity)) return "scholarly_technical";
  if (/\b(?:official account|official page|managed by|operated by|development board|public authority)\b/.test(identityAndEvidence)) return "primary_institutional";
  if (/\b(official|corporation|company|foundation|association|board|operator|developer)\b/.test(identity)) return "primary_institutional";
  if (/\b(visit|tourism|lifestyle|promotion|sponsored|advertorial|generic facts)\b/.test(identity)) return "promotional_general";
  return "reputable_secondary";
}

export function inspectedSourceSupportsEntity(
  entity: HearthCreatorEntityLead,
  source: HearthResearchSource,
): boolean {
  if (
    source.provenance?.inspectionStatus !== "inspected"
    || !source.provenance.verifiedInCurrentRequest
    || source.extractionStatus !== "extracted"
  ) return false;
  const name = normalizeIdentity(entity.name);
  if (name.length < 3) return false;
  const sourceIdentity = normalizeIdentity([source.title, source.publisher, source.domain].filter(Boolean).join(" "));
  const evidenceIdentity = normalizeIdentity([source.extractedText, source.transcript, source.snippet].filter(Boolean).join(" "));
  if (!sourceIdentity.includes(name) && !evidenceIdentity.includes(name)) return false;
  if (!entity.address) return true;
  const address = normalizeIdentity(entity.address);
  const streetNumber = address.match(/(?:^|\s)(\d{1,6})(?:\s|$)/)?.[1] ?? null;
  const streetTokens = address.split(" ").filter((token) => (
    token.length > 2 && !/^(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|suite|ste|north|south|east|west)$/.test(token)
  ));
  if (streetNumber && !new RegExp(`(?:^|\\s)${streetNumber}(?:\\s|$)`).test(evidenceIdentity)) return false;
  const distinctiveStreetToken = streetTokens.find((token) => !/^\d+$/.test(token));
  return !distinctiveStreetToken || evidenceIdentity.includes(distinctiveStreetToken);
}
