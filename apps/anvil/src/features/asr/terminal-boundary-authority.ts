export type TerminalProposalEvidence<T> = {
  currentLine: number;
  targetLine: number;
  lastSpeakableLine: number;
  runKey: string | null;
  runGeneration: number | null;
  proofOwned: boolean;
  responseAuthorityCurrent: boolean;
  responseFresh: boolean;
  audioFresh: boolean;
  genuineContradiction: boolean;
  competingContradiction: boolean;
  provenance: T;
};

export type TerminalProposalVerdict =
  | { outcome: 'commit' }
  | { outcome: 'blocked'; reason: 'genuine_contradiction' | 'competing_contradiction' }
  | { outcome: 'stale'; reason: string };

export const classifyTerminalContradiction = (input: {
  backwardRankedScoreContradiction: boolean;
  tailProgressionOverride: boolean;
  competingGuardContradiction: boolean;
}) => {
  const genuine = input.backwardRankedScoreContradiction && !input.tailProgressionOverride;
  const competing = input.competingGuardContradiction && !input.tailProgressionOverride && !genuine;
  return { blocked: genuine || competing, genuine, competing };
};

export const evaluateTerminalProposal = <T>(proposal: TerminalProposalEvidence<T>, current: {
  line: number;
  runKey: string | null;
  runGeneration: number | null;
  responseAuthorityCurrent: boolean;
  competingContradictionActive: boolean;
}): TerminalProposalVerdict => {
  if (proposal.targetLine !== proposal.currentLine + 1 || proposal.targetLine !== proposal.lastSpeakableLine) {
    return { outcome: 'stale', reason: 'not_final_adjacent' };
  }
  if (!proposal.proofOwned || !proposal.responseFresh || !proposal.audioFresh) {
    return { outcome: 'stale', reason: 'proof_or_freshness_missing' };
  }
  if (!proposal.responseAuthorityCurrent || !current.responseAuthorityCurrent) {
    return { outcome: 'stale', reason: 'response_authority_stale' };
  }
  if (current.line !== proposal.currentLine) return { outcome: 'stale', reason: 'cursor_changed' };
  if (current.runKey !== proposal.runKey || current.runGeneration !== proposal.runGeneration) {
    return { outcome: 'stale', reason: 'run_identity_changed' };
  }
  if (proposal.genuineContradiction) return { outcome: 'blocked', reason: 'genuine_contradiction' };
  if (proposal.competingContradiction && current.competingContradictionActive) {
    return { outcome: 'blocked', reason: 'competing_contradiction' };
  }
  return { outcome: 'commit' };
};

export class TerminalBoundaryAuthority<T> {
  private proposal: TerminalProposalEvidence<T> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly onReevaluate: (proposal: TerminalProposalEvidence<T>) => void, private readonly delayMs = 500) {}

  preserve(proposal: TerminalProposalEvidence<T>): boolean {
    if (this.disposed || proposal.targetLine !== proposal.currentLine + 1 ||
        proposal.targetLine !== proposal.lastSpeakableLine || !proposal.proofOwned ||
        !proposal.responseAuthorityCurrent || !proposal.responseFresh || !proposal.audioFresh) return false;
    this.proposal = proposal;
    this.schedule();
    return true;
  }

  schedule(): void {
    if (this.disposed || !this.proposal || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.disposed && this.proposal) this.onReevaluate(this.proposal);
    }, this.delayMs);
  }

  noteRestart(): void { this.schedule(); }

  clear(): void {
    this.proposal = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  getPending(): TerminalProposalEvidence<T> | null { return this.proposal; }

  dispose(): void { this.disposed = true; this.clear(); }
}
