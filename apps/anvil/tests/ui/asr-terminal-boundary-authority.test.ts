import {
  classifyTerminalContradiction,
  evaluateTerminalProposal,
  TerminalBoundaryAuthority,
  type TerminalProposalEvidence,
} from '../../src/features/asr/terminal-boundary-authority';

type Provenance = { matchId: string };

const proposal = (overrides: Partial<TerminalProposalEvidence<Provenance>> = {}): TerminalProposalEvidence<Provenance> => ({
  currentLine: 133,
  targetLine: 134,
  lastSpeakableLine: 134,
  runKey: 'live-run',
  runGeneration: 1,
  proofOwned: true,
  responseAuthorityCurrent: true,
  responseFresh: true,
  audioFresh: true,
  genuineContradiction: false,
  competingContradiction: false,
  provenance: { matchId: 'proof-owned-final' },
  ...overrides,
});

const current = (overrides: Partial<Parameters<typeof evaluateTerminalProposal<Provenance>>[1]> = {}) => ({
  line: 133,
  runKey: 'live-run',
  runGeneration: 1,
  responseAuthorityCurrent: true,
  competingContradictionActive: false,
  ...overrides,
});

describe('ASR terminal boundary authority', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  test('first-reading final adjacent proof is eligible to commit', () => {
    expect(classifyTerminalContradiction({
      backwardRankedScoreContradiction: true,
      tailProgressionOverride: true,
      competingGuardContradiction: true,
    })).toEqual({ blocked: false, genuine: false, competing: false });
    expect(evaluateTerminalProposal(proposal(), current())).toEqual({ outcome: 'commit' });
  });

  test('second-reading competing contradiction initially remains blocked', () => {
    expect(evaluateTerminalProposal(
      proposal({ competingContradiction: true }),
      current({ competingContradictionActive: true }),
    )).toEqual({ outcome: 'blocked', reason: 'competing_contradiction' });
  });

  test('silence reevaluation can accept the same proof after competing state clears', () => {
    const pending = proposal({ competingContradiction: true });
    expect(evaluateTerminalProposal(pending, current({ competingContradictionActive: true })).outcome).toBe('blocked');
    expect(evaluateTerminalProposal(pending, current({ competingContradictionActive: false }))).toEqual({ outcome: 'commit' });
  });

  test('restart retains a pending final proposal and schedules reevaluation', () => {
    const reevaluate = jest.fn();
    const authority = new TerminalBoundaryAuthority<Provenance>(reevaluate, 500);
    authority.preserve(proposal());
    authority.noteRestart();
    jest.advanceTimersByTime(500);
    expect(reevaluate).toHaveBeenCalledTimes(1);
    expect(authority.getPending()?.provenance.matchId).toBe('proof-owned-final');
  });

  test('genuine contradiction cannot be cleared by silence', () => {
    const pending = proposal({ genuineContradiction: true });
    expect(evaluateTerminalProposal(pending, current())).toEqual({ outcome: 'blocked', reason: 'genuine_contradiction' });
    expect(evaluateTerminalProposal(pending, current({ competingContradictionActive: false }))).toEqual({ outcome: 'blocked', reason: 'genuine_contradiction' });
  });

  test('resolved proof is delivered exactly once when cleared after commit', () => {
    const reevaluate = jest.fn();
    const authority = new TerminalBoundaryAuthority<Provenance>((pending) => {
      reevaluate(pending);
      authority.clear();
    }, 500);
    authority.preserve(proposal());
    jest.advanceTimersByTime(2000);
    expect(reevaluate).toHaveBeenCalledTimes(1);
  });

  test('stale run identity cannot commit preserved terminal evidence', () => {
    expect(evaluateTerminalProposal(proposal(), current({ runGeneration: 2 }))).toEqual({ outcome: 'stale', reason: 'run_identity_changed' });
  });

  test('session stop disposes all outstanding terminal work', () => {
    const reevaluate = jest.fn();
    const authority = new TerminalBoundaryAuthority(reevaluate, 500);
    authority.preserve(proposal());
    authority.dispose();
    jest.advanceTimersByTime(2000);
    expect(reevaluate).not.toHaveBeenCalled();
    expect(authority.getPending()).toBeNull();
  });
});
