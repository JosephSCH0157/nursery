/** @jest-environment jsdom */

import { CanonicalAsrAuthority, restoreCanonicalAsrAuthority } from '../../src/features/asr/canonical-asr-authority';

describe('canonical ASR authority snapshot', () => {
  beforeEach(() => sessionStorage.clear());

  test('preserves cursor, coverage, unresolved skips, recovery, terminal and postroll across restart', () => {
    const authority = new CanonicalAsrAuthority();
    authority.commitCursor(1, 'ordinary-adjacent', 4);
    authority.proposeRecovery(3, 'watchdog-proposal');
    authority.commitCursor(3, 'jump-evidence', 4);
    expect(authority.getSnapshot()).toEqual(expect.objectContaining({
      cursor: 3, terminalCompleted: false, postrollEligible: false,
      unresolvedSkippedLines: [2], pendingRecoveryProposal: expect.any(Object),
    }));
    const restored = restoreCanonicalAsrAuthority().getSnapshot();
    expect(restored).toEqual(authority.getSnapshot());
  });

  test('permits terminal completion and postroll only with complete coverage', () => {
    const authority = new CanonicalAsrAuthority();
    authority.commitCursor(1, 'ordinary-adjacent', 3);
    const complete = authority.commitCursor(2, 'ordinary-adjacent', 3);
    expect(complete).toEqual(expect.objectContaining({ terminalCompleted: true, postrollEligible: true, unresolvedSkippedLines: [] }));
  });
});
