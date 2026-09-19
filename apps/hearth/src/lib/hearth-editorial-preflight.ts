import type { HearthResearchResult } from "./hearth-research-contract";

export const HEARTH_PREFLIGHT_CHECKER_VERSION =
  "forge.hearth.editorial-preflight.deterministic.v1" as const;

export type HearthEditorialPreflightSeverity = "blocker" | "warning" | "note";

export type HearthEditorialPreflightFinding = Readonly<{
  id: string;
  code: string;
  severity: HearthEditorialPreflightSeverity;
  category: string;
  message: string;
  excerpt: string | null;
}>;

export type HearthEditorialPreflightReport = Readonly<{
  schema: "forge.hearth.editorial-preflight.v1";
  checkerContractVersion: typeof HEARTH_PREFLIGHT_CHECKER_VERSION;
  usedPaidAi: false;
  findings: HearthEditorialPreflightFinding[];
  summary: {
    blockers: number;
    warnings: number;
    notes: number;
  };
}>;

type FindingInput = Omit<HearthEditorialPreflightFinding, "id">;

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sentenceFor(text: string, index: number): string {
  const start = Math.max(0, text.lastIndexOf(".", index) + 1);
  const next = text.indexOf(".", index);
  return normalize(text.slice(start, next < 0 ? Math.min(text.length, index + 180) : next + 1)).slice(0, 240);
}

function stableId(input: FindingInput, ordinal: number): string {
  const token = `${input.code}-${input.excerpt ?? input.message}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return `${token || input.code}-${ordinal + 1}`;
}

function supportedResearchText(result: HearthResearchResult | null): string {
  return normalize([
    ...(result?.artifact?.findings ?? [])
      .filter((finding) => finding.status === "verified_fact" || finding.status === "reported_claim")
      .flatMap((finding) => [finding.text]),
    ...(result?.evidence ?? [])
      .filter((evidence) => evidence.state === "inspected")
      .flatMap((evidence) => [evidence.excerpt ?? ""]),
    ...(result?.sources ?? [])
      .filter((source) => source.provenance?.verifiedInCurrentRequest && source.provenance.inspectionStatus === "inspected")
      .flatMap((source) => [source.title ?? "", source.snippet ?? "", source.extractedText ?? ""]),
  ].join(" ")).toLowerCase();
}

export function buildHearthEditorialPreflightReport(input: {
  scriptText: string;
  researchResult: HearthResearchResult | null;
}): HearthEditorialPreflightReport {
  const script = input.scriptText.replace(/\r\n?/g, "\n").normalize("NFC");
  const supported = supportedResearchText(input.researchResult);
  const findings: FindingInput[] = [];
  const add = (finding: FindingInput) => {
    if (!findings.some((existing) => existing.code === finding.code && existing.excerpt === finding.excerpt)) findings.push(finding);
  };

  const placeholder = /\b(?:TODO|TBD|TK|FIXME|INSERT|VERIFY)(?:\b|:)|\[\s*\?\s*\]/i.exec(script);
  if (placeholder) add({ code: "placeholder_or_todo", severity: "blocker", category: "completeness", message: "An unfinished placeholder remains; address it before recording if it is not intentional.", excerpt: sentenceFor(script, placeholder.index) });

  const productionNote = /^(?:\s*\[(?:production|editor|visual|b-?roll|sfx|camera)\b[^\]]*\]|\s*(?:PRODUCTION NOTE|EDITOR NOTE|B-?ROLL)\s*:)/im.exec(script);
  if (productionNote) add({ code: "production_note_in_spoken_copy", severity: "blocker", category: "recordability", message: "Production direction may appear in spoken copy; separate or tag it if that is not intentional.", excerpt: sentenceFor(script, productionNote.index) });

  for (const match of script.matchAll(/(?:\$\s*)?\b\d[\d,.]*(?:\s*(?:million|billion|percent|%|years?|months?|days?))?\b/gi)) {
    const value = normalize(match[0]).toLowerCase();
    if (value.length < 2 || supported.includes(value)) continue;
    add({ code: "unsupported_number_or_date", severity: "warning", category: "claims", message: `The number or date “${normalize(match[0])}” is not supported by the current canonical evidence snapshot.`, excerpt: sentenceFor(script, match.index ?? 0) });
  }

  const spokenCopy = script.replace(/\[[^\]\n]+\]/g, " ");
  const properNamePattern = /\b[A-Z][\p{L}'’.-]+(?:\s+(?:(?:of|the|and|de|van)\s+)*[A-Z][\p{L}'’.-]+){1,4}\b/gu;
  for (const match of spokenCopy.matchAll(properNamePattern)) {
    const name = normalize(match[0]);
    if (supported.includes(name.toLowerCase())) continue;
    add({ code: "unsupported_name", severity: "warning", category: "claims", message: `The name “${name}” is not supported by the current canonical evidence snapshot.`, excerpt: sentenceFor(spokenCopy, match.index ?? 0) });
  }

  const currentStatus = /\b(?:is|are|remains?|currently|today|still)\s+(?:open|closed|operating|active|available|vacant|under construction)\b/i.exec(script);
  if (currentStatus && !supported.includes(normalize(currentStatus[0]).toLowerCase())) add({ code: "current_status_claim", severity: "warning", category: "currency", message: "A time-sensitive status claim needs current inspected evidence.", excerpt: sentenceFor(script, currentStatus.index) });

  for (const match of script.matchAll(/[“\"]([^”\"]{12,})[”\"]/g)) {
    const quoted = normalize(match[1]);
    if (!supported.includes(quoted.toLowerCase())) add({ code: "quotation_unverified", severity: "warning", category: "claims", message: "A direct quotation is not present in the current canonical evidence snapshot.", excerpt: quoted.slice(0, 240) });
  }

  const causal = /\b(?:caused?|led to|resulted in|because of|therefore|which is why)\b/i.exec(script);
  if (causal) add({ code: "causal_assertion", severity: "warning", category: "claims", message: "This causal link should be supported directly or framed as interpretation.", excerpt: sentenceFor(script, causal.index) });

  const superlative = /\b(?:biggest|largest|smallest|first|last|only|best|worst|most|least|never|always)\b/i.exec(script);
  if (superlative) add({ code: "superlative_claim", severity: "warning", category: "claims", message: "A superlative or absolute claim needs evidence matching that strength.", excerpt: sentenceFor(script, superlative.index) });

  const strength = /\b(?:proves?|definitely|undeniably|without question|everyone knows|certainly)\b/i.exec(script);
  if (strength) add({ code: "wording_stronger_than_evidence", severity: "warning", category: "claims", message: "The wording is stronger than the available evidence warrants.", excerpt: sentenceFor(script, strength.index) });

  for (const finding of input.researchResult?.artifact?.findings ?? []) {
    if (finding.provenanceStatus === "creator_supplied_unverified") add({ code: "creator_claim_unverified", severity: "warning", category: "provenance", message: "A creator-supplied claim remains unverified in the canonical evidence snapshot.", excerpt: finding.text.slice(0, 240) });
    if (finding.provenanceStatus === "unsupported") add({ code: "unsupported_research_claim", severity: "warning", category: "provenance", message: finding.text, excerpt: finding.text.slice(0, 240) });
    if (finding.provenanceStatus === "conflicting" || finding.provenanceStatus === "inaccessible_source_only") add({ code: finding.provenanceStatus === "conflicting" ? "conflicting_evidence" : "inaccessible_only_evidence", severity: "warning", category: "evidence", message: finding.text, excerpt: finding.text.slice(0, 240) });
    if (finding.scope === "adjacent_context" && script.toLowerCase().includes(finding.text.toLowerCase().slice(0, 40))) add({ code: "adjacent_context_in_script", severity: "warning", category: "scope", message: "Adjacent context appears in the script and must not be presented as evidence for the current subject.", excerpt: finding.text.slice(0, 240) });
  }

  for (const claim of input.researchResult?.creatorClaims ?? []) {
    if (claim.provenanceStatus === "creator_supplied_unverified") add({ code: "creator_claim_unverified", severity: "warning", category: "provenance", message: "A creator-supplied claim remains unverified in the canonical evidence snapshot.", excerpt: claim.text.slice(0, 240) });
  }

  for (const uncertainty of input.researchResult?.artifact?.uncertainties ?? []) add({ code: "unanswered_research", severity: "warning", category: "evidence", message: uncertainty, excerpt: null });

  const paragraphs = script.split(/\n\s*\n/).map(normalize).filter(Boolean);
  if (normalize(script).length < 160) add({ code: "narrative_incomplete", severity: "warning", category: "narrative", message: "The script is very short; confirm that the opening, development, and ending are complete.", excerpt: null });
  const repeated = new Map<string, number>();
  for (const paragraph of paragraphs) repeated.set(paragraph.toLowerCase(), (repeated.get(paragraph.toLowerCase()) ?? 0) + 1);
  if ([...repeated.values()].some((count) => count > 1)) add({ code: "repeated_passage", severity: "note", category: "narrative", message: "An identical passage appears more than once.", excerpt: null });

  const words = normalize(script).split(" ").filter(Boolean).length;
  if (words > 3500) add({ code: "recordability_pacing", severity: "note", category: "recordability", message: "This is a long recording draft; review pacing and breath points before Ready.", excerpt: null });
  if ((script.match(/\[/g)?.length ?? 0) !== (script.match(/\]/g)?.length ?? 0)) add({ code: "tag_structure", severity: "blocker", category: "recordability", message: "A script tag is not closed.", excerpt: null });

  const identified = findings.map((finding, index) => ({ ...finding, id: stableId(finding, index) }));
  return {
    schema: "forge.hearth.editorial-preflight.v1",
    checkerContractVersion: HEARTH_PREFLIGHT_CHECKER_VERSION,
    usedPaidAi: false,
    findings: identified,
    summary: {
      blockers: identified.filter((finding) => finding.severity === "blocker").length,
      warnings: identified.filter((finding) => finding.severity === "warning").length,
      notes: identified.filter((finding) => finding.severity === "note").length,
    },
  };
}
