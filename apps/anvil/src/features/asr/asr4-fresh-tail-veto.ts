import {
  ASR4_FRESH_TAIL_VETO,
  type Asr4FreshTailVetoInput,
  type Asr4FreshTailVetoResult,
} from './asr4-authority.types';

export function evaluateAsr4FreshTailVeto(input: Asr4FreshTailVetoInput): Asr4FreshTailVetoResult {
  const rollingContextMatchesScript = input.rollingContextMatchesScript === true;
  const vetoActive = !input.tailMatchesNearbyScript;

  return {
    tag: ASR4_FRESH_TAIL_VETO,
    lane: 'fresh_tail_veto',
    status: vetoActive ? 'freeze' : 'hold',
    vetoActive,
    movementAllowed: !vetoActive,
    freshTailText: input.freshTailText,
    nearbyScriptText: input.nearbyScriptText,
    rollingContextMatchesScript,
    reason: vetoActive
      ? (rollingContextMatchesScript ? 'fresh_tail_offscript_overrides_old_context' : 'fresh_tail_offscript')
      : 'fresh_tail_matches_nearby_script',
  };
}

export function buildAsr4FreshTailVetoDiagnostic(result: Asr4FreshTailVetoResult): string {
  return `[${result.tag}] status=${result.status} vetoActive=${result.vetoActive ? 1 : 0} movementAllowed=${result.movementAllowed ? 1 : 0} rollingContextMatchesScript=${result.rollingContextMatchesScript ? 1 : 0} reason=${result.reason}`;
}

