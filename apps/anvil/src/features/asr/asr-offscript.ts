import type { MatchResult } from '../../speech/matcher';

export function normalizeNoMatchEvidence(input: unknown): MatchResult | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const bestIdxRaw = raw.bestIdx ?? raw.idx;
  const bestSimRaw = raw.bestSim ?? raw.sim;
  const bestIdx = Number.isFinite(Number(bestIdxRaw)) ? Math.floor(Number(bestIdxRaw)) : -1;
  const explicitNoMatch = raw.noMatch === true;
  const noMatch = explicitNoMatch || bestIdx < 0;
  const bestSim = Number.isFinite(Number(bestSimRaw)) ? Number(bestSimRaw) : 0;
  const topScores = Array.isArray(raw.topScores)
    ? raw.topScores
    : (Array.isArray(raw.candidates) ? raw.candidates : []);
  const normalized: MatchResult & Record<string, unknown> = {
    ...(raw as MatchResult),
    bestIdx: noMatch ? -1 : bestIdx,
    bestSim: noMatch ? Number.NaN : bestSim,
    topScores: topScores as Array<{ idx: number; score: number }>,
  };
  normalized.noMatch = noMatch;
  return normalized;
}

export function isInvalidMatchResult(match: MatchResult | null | undefined): boolean {
  if (!match) return true;
  if ((match as any).noMatch === true) return true;
  const bestIdx = Number((match as any).bestIdx);
  return !Number.isFinite(bestIdx) || bestIdx < 0;
}

export function isExplicitNoMatch(args: {
  rawMatchId: unknown;
  noMatch: boolean;
  incomingMatch?: MatchResult | null;
}): boolean {
  return (
    (args.rawMatchId === null || args.rawMatchId === undefined) &&
    args.noMatch === true &&
    !args.incomingMatch
  );
}

export function hasBackwardOrLocalContradiction(args: {
  cursorLine: number;
  bestSim: number;
  currentLineDirectSim: number;
  topScores: Array<{ idx: number; score: number }> | null | undefined;
  minSimFloor: number;
  simSlack: number;
}): boolean {
  const safeCursor = Math.max(0, Math.floor(args.cursorLine));
  const contradictionNeed = Math.max(
    args.minSimFloor,
    args.bestSim - args.simSlack,
  );
  return (
    (Number.isFinite(args.currentLineDirectSim) && args.currentLineDirectSim >= contradictionNeed) ||
    (Array.isArray(args.topScores) && args.topScores.some((entry) => {
      const idx = Number(entry.idx);
      const score = Number(entry.score);
      if (!Number.isFinite(idx) || !Number.isFinite(score)) return false;
      if (Math.floor(idx) > safeCursor) return false;
      return score >= contradictionNeed;
    }))
  );
}

export function shouldAllowStalePrefixContradictionOverride(args: {
  contradictionActive: boolean;
  stalePrefixIgnored: boolean;
  backwardContradictionOverriddenByTail: boolean;
}): boolean {
  return (
    args.contradictionActive &&
    (args.stalePrefixIgnored || args.backwardContradictionOverriddenByTail)
  );
}
