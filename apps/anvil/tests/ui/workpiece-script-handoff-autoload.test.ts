/** @jest-environment node */

import {
  classifyProductionScriptHttpFailure,
  parseProductionScriptPayload,
  shouldAutoloadWorkpieceScript,
} from '../../src/forge/workpiece-script-handoff-policy';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKPIECE_ID = '22222222-2222-4222-8222-222222222222';
const READY_TRANSITION_ID = '33333333-3333-4333-8333-333333333333';
const SCRIPT_APPROVAL_ID = '44444444-4444-4444-8444-444444444444';
const SCRIPT_HASH = 'a'.repeat(64);
const SCRIPT_TEXT = '[s1]\nApproved production words.\n[/s1]\n';

describe('Anvil explicit workpiece production-script autoload policy', () => {
  test.each([
    ['workpiece-only Nursery/Bar Stock handoff', `?workspace_id=${WORKSPACE_ID}&workpiece_id=${WORKPIECE_ID}`],
    ['full Hearth handoff', `?workspace_id=${WORKSPACE_ID}&workpiece_id=${WORKPIECE_ID}&open=script&script_path=script%2Fscript.md`],
  ])('%s requests production-script autoload', (_label, search) => {
    expect(shouldAutoloadWorkpieceScript(search)).toBe(true);
  });

  test('standalone Anvil does not autoload without an explicit workpiece query', () => {
    const cachedState = {
      forge_active_workpiece_id_v1: WORKPIECE_ID,
      forge_workpiece_id_v1: WORKPIECE_ID,
      tp_workpiece_id: WORKPIECE_ID,
    };

    expect(cachedState.forge_active_workpiece_id_v1).toBe(WORKPIECE_ID);
    expect(shouldAutoloadWorkpieceScript(`?workspace_id=${WORKSPACE_ID}`)).toBe(false);
    expect(shouldAutoloadWorkpieceScript('')).toBe(false);
  });

  test('invalid explicit workpiece identity does not trigger autoload', () => {
    expect(shouldAutoloadWorkpieceScript('?workpiece_id=not-a-uuid')).toBe(false);
  });

  test.each([
    ['missing', 404, false, 'not_found'],
    ['stale/conflict', 409, false, 'request_failed'],
    ['unauthorized', 401, false, 'unauthorized'],
    ['forbidden', 403, false, 'unauthorized'],
  ])('%s production response fails closed', (_label, status, ok, reason) => {
    expect(classifyProductionScriptHttpFailure(status, ok)).toBe(reason);
  });

  test('a complete approved production payload supplies canonical identity', () => {
    expect(parseProductionScriptPayload({
      ok: true,
      data: {
        source_file_revision: 7,
        script_content_hash: SCRIPT_HASH,
        script_text: SCRIPT_TEXT,
        ready_transition_id: READY_TRANSITION_ID,
        script_approval_id: SCRIPT_APPROVAL_ID,
        script_approval_revision: 3,
      },
    })).toEqual({
      text: SCRIPT_TEXT,
      revision: 7,
      hash: SCRIPT_HASH,
      readyTransitionId: READY_TRANSITION_ID,
      scriptApprovalId: SCRIPT_APPROVAL_ID,
      scriptApprovalRevision: 3,
    });
  });

  test.each([
    ['missing metadata', { ok: true, data: { script_text: SCRIPT_TEXT } }],
    ['empty text', { ok: true, data: {
      source_file_revision: 7,
      script_content_hash: SCRIPT_HASH,
      script_text: '',
      ready_transition_id: READY_TRANSITION_ID,
      script_approval_id: SCRIPT_APPROVAL_ID,
      script_approval_revision: 3,
    } }],
    ['malformed hash', { ok: true, data: {
      source_file_revision: 7,
      script_content_hash: 'bad',
      script_text: SCRIPT_TEXT,
      ready_transition_id: READY_TRANSITION_ID,
      script_approval_id: SCRIPT_APPROVAL_ID,
      script_approval_revision: 3,
    } }],
  ])('%s payload is rejected', (_label, payload) => {
    expect(parseProductionScriptPayload(payload)).toBeNull();
  });
});
