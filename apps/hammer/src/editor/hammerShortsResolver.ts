import {
  HAMMER_SHORT_CANDIDATE_SCHEMA,
  type HammerShortCandidateV1,
  type HammerShortsAiProposalV1,
  type HammerShortsDiscoveryOutcome,
  type HammerShortSourceInterval,
} from "../../../../packages/contracts/hammer/shorts.contract";

export interface HammerShortsOutputSegment {
  segment_id: string;
  text: string;
  output_start_sec: number;
  output_end_sec: number;
  source_start_sec: number;
  source_end_sec: number;
  disabled?: boolean;
}
export interface HammerResolvedShortsDiscovery {
  outcome: HammerShortsDiscoveryOutcome;
  candidates: HammerShortCandidateV1[];
  rejected: Array<{ proposal_id: string; reason: string }>;
}

const round = (value: number) => Math.round(value * 1_000) / 1_000;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("hammer_shorts_non_finite");
    return typeof value === "number" ? round(value) : value;
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
}

export async function fingerprintHammerShortsValue(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical(value))));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hammerShortCoreOverlapRatio(a: Pick<HammerShortCandidateV1, "core_output_start_sec" | "core_output_end_sec">, b: Pick<HammerShortCandidateV1, "core_output_start_sec" | "core_output_end_sec">): number {
  const intersection = Math.max(0, Math.min(a.core_output_end_sec, b.core_output_end_sec) - Math.max(a.core_output_start_sec, b.core_output_start_sec));
  const shorter = Math.min(a.core_output_end_sec - a.core_output_start_sec, b.core_output_end_sec - b.core_output_start_sec);
  return shorter > 0 ? intersection / shorter : 0;
}

function sourceIntervals(segments: readonly HammerShortsOutputSegment[]): HammerShortSourceInterval[] {
  const intervals: HammerShortSourceInterval[] = [];
  for (const segment of segments) {
    const previous = intervals.at(-1);
    if (previous && Math.abs(previous.source_end_sec - segment.source_start_sec) <= 0.05 && Math.abs(previous.output_end_sec - segment.output_start_sec) <= 0.05) {
      previous.source_end_sec = round(segment.source_end_sec);
      previous.output_end_sec = round(segment.output_end_sec);
      previous.segment_ids.push(segment.segment_id);
    } else {
      intervals.push({ source_start_sec: round(segment.source_start_sec), source_end_sec: round(segment.source_end_sec), output_start_sec: round(segment.output_start_sec), output_end_sec: round(segment.output_end_sec), segment_ids: [segment.segment_id] });
    }
  }
  return intervals;
}

export async function resolveHammerShortCandidates(args: {
  discoveryId: string;
  basisLockId: string;
  basisFingerprint: string;
  minimumDurationSec: number;
  maximumDurationSec: number;
  proposal: HammerShortsAiProposalV1;
  outputSegments: readonly HammerShortsOutputSegment[];
}): Promise<HammerResolvedShortsDiscovery> {
  if (!(args.minimumDurationSec > 0) || args.maximumDurationSec < args.minimumDurationSec) throw new Error("hammer_shorts_duration_range_invalid");
  const active = args.outputSegments.filter((segment) => !segment.disabled).sort((a, b) => a.output_start_sec - b.output_start_sec);
  const byId = new Map(active.map((segment, index) => [segment.segment_id, index]));
  const candidates: HammerShortCandidateV1[] = [];
  const rejected: Array<{ proposal_id: string; reason: string }> = [];
  for (const proposal of [...args.proposal.proposals].sort((a, b) => a.rank - b.rank)) {
    const first = byId.get(proposal.first_segment_id), last = byId.get(proposal.last_segment_id);
    if (first == null || last == null || last < first) { rejected.push({ proposal_id: proposal.proposal_id, reason: "anchor_invalid" }); continue; }
    const core = active.slice(first, last + 1);
    if (core.some((segment, index) => index > 0 && segment.output_start_sec - (core[index - 1]?.output_end_sec ?? 0) > 0.1)) { rejected.push({ proposal_id: proposal.proposal_id, reason: "output_discontinuous" }); continue; }
    const coreStart = core[0]?.output_start_sec ?? 0, coreEnd = core.at(-1)?.output_end_sec ?? 0, duration = coreEnd - coreStart;
    if (duration < args.minimumDurationSec || duration > args.maximumDurationSec) { rejected.push({ proposal_id: proposal.proposal_id, reason: "duration_out_of_range" }); continue; }
    let envelopeFirst = first, envelopeLast = last;
    while (envelopeFirst > 0 && coreStart - (active[envelopeFirst - 1]?.output_start_sec ?? coreStart) <= 3) envelopeFirst -= 1;
    while (envelopeLast < active.length - 1 && (active[envelopeLast + 1]?.output_end_sec ?? coreEnd) - coreEnd <= 3) envelopeLast += 1;
    const unsigned = {
      schema_version: HAMMER_SHORT_CANDIDATE_SCHEMA, candidate_id: crypto.randomUUID(), discovery_id: args.discoveryId,
      basis_lock_id: args.basisLockId, basis_fingerprint: args.basisFingerprint, proposal_id: proposal.proposal_id, rank: proposal.rank,
      segment_ids: core.map((segment) => segment.segment_id), core_output_start_sec: round(coreStart), core_output_end_sec: round(coreEnd), duration_sec: round(duration),
      envelope_output_start_sec: round(active[envelopeFirst]?.output_start_sec ?? coreStart), envelope_output_end_sec: round(active[envelopeLast]?.output_end_sec ?? coreEnd),
      source_intervals: sourceIntervals(core), transcript_excerpt: core.map((segment) => segment.text.trim()).filter(Boolean).join(" "), rationale: proposal.rationale, goal_fit: proposal.goal_fit,
    };
    const candidate = { ...unsigned, candidate_fingerprint: await fingerprintHammerShortsValue(unsigned) } satisfies HammerShortCandidateV1;
    if (candidates.some((prior) => hammerShortCoreOverlapRatio(prior, candidate) > 0.5)) { rejected.push({ proposal_id: proposal.proposal_id, reason: "duplicate_core_overlap" }); continue; }
    candidates.push(candidate);
  }
  return { outcome: candidates.length === 0 ? "empty" : candidates.length < 3 ? "partial" : "complete", candidates: candidates.slice(0, 4), rejected };
}
