/** @jest-environment jsdom */

export {};

jest.mock('../../src/forge/tongs-user-auth', () => ({
  appendForgeUserAuthorization: async (headers?: Headers) => headers ?? new Headers(),
}));

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKPIECE_ID = '22222222-2222-4222-8222-222222222222';
const CAPTURE_ID = '33333333-3333-4333-8333-333333333333';
const CAPTURE_AUTHORITY_ID = '77777777-7777-4777-8777-777777777777';
const COMPLETION_ID = '55555555-5555-4555-8555-555555555555';

const commit = {
  ok: true as const, workpieceId: WORKPIECE_ID, path: 'recordings/take.webm', createdCradle: false,
  plannerRecordingSessionId: null, captureSessionId: CAPTURE_ID, captureAuthorityId: CAPTURE_AUTHORITY_ID, mediaRevision: 3,
  mediaHash: 'a'.repeat(64), mediaBytes: 4096, mediaContentType: 'video/webm', status: 200,
};

function response(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as Response;
}

describe('Anvil canonical recording authority', () => {
  beforeEach(() => {
    jest.resetModules();
    (window as any).__forgeCanonicalReadyScript = {
      workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID, path: 'script/script.md',
      scriptRevision: 7, scriptHash: 'b'.repeat(64), transitionId: '44444444-4444-4444-8444-444444444444',
    };
    (window as any).__tpCanonicalAsrAuthority = {
      schema: 'anvil.asr-authority-snapshot.v1', cursor: 4, coveredLines: [0, 1, 2, 3, 4],
      unresolvedSkippedLines: [], terminalCompleted: true, postrollEligible: true,
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as any).__forgeCanonicalReadyScript;
    delete (window as any).__forgeCanonicalScriptIdentity;
    delete (window as any).__forgeRecordingScriptIdentityByCapture;
    delete (window as any).__tpCanonicalAsrAuthority;
  });

  test.each(['saved', 'duplicate'] as const)('accepts %s only with a canonical completion id', async (outcome) => {
    (global as any).fetch = jest.fn(async () => response(200, { ok: true, data: { outcome, completion: { id: COMPLETION_ID } } }));
    const { transitionRecordingCompleted } = await import('../../src/forge/workpiece-commit');
    await expect(transitionRecordingCompleted({ commit })).resolves.toEqual(expect.objectContaining({ ok: true, outcome, completionId: COMPLETION_ID }));
  });

  test.each(['stale', 'conflict', 'denied', 'not_found'] as const)('keeps %s completion incomplete', async (outcome) => {
    (global as any).fetch = jest.fn(async () => response(200, { ok: true, data: { outcome, completion: null } }));
    const { transitionRecordingCompleted } = await import('../../src/forge/workpiece-commit');
    await expect(transitionRecordingCompleted({ commit })).resolves.toEqual(expect.objectContaining({ ok: false, outcome }));
  });

  test('ASR terminal state does not gate completion and unavailable authority fails closed', async () => {
    (window as any).__tpCanonicalAsrAuthority.terminalCompleted = false;
    (window as any).__tpCanonicalAsrAuthority.unresolvedSkippedLines = [2, 3];
    (global as any).fetch = jest.fn(async () => response(200, { ok: true, data: { outcome: 'saved', completion: { id: COMPLETION_ID } } }));
    const { transitionRecordingCompleted } = await import('../../src/forge/workpiece-commit');
    await expect(transitionRecordingCompleted({ commit })).resolves.toEqual(expect.objectContaining({ ok: true, outcome: 'saved' }));
    expect((global as any).fetch).toHaveBeenCalledWith(expect.stringContaining('/recording-completion-v3'), expect.any(Object));
    (global as any).fetch = jest.fn(async () => response(503, { error: { code: 'anvil_recording_authority_migration_required' } }));
    await expect(transitionRecordingCompleted({ commit })).resolves.toEqual(expect.objectContaining({ ok: false, outcome: 'unavailable' }));
  });

  test('capture establishment requires explicit route identity and returns the server binding', async () => {
    window.history.replaceState({}, '', `/?workspace_id=${WORKSPACE_ID}&workpiece_id=${WORKPIECE_ID}`);
    (window as any).__forgeCanonicalScriptIdentity = { workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID, path: 'script/script.md', scriptRevision: 7,
      scriptHash: 'b'.repeat(64), scriptApprovalId: '99999999-9999-4999-8999-999999999999', scriptApprovalRevision: 1, scriptApprovalHash: 'b'.repeat(64) };
    (global as any).fetch = jest.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      return response(200, { ok: true, data: { outcome: 'established', capture_authority: {
        id: CAPTURE_AUTHORITY_ID, workspace_id: WORKSPACE_ID, workpiece_id: WORKPIECE_ID, venue: 'anvil', script_binding_kind: 'approved_canonical_script',
        recording_session_id: null, ready_transition_id: '44444444-4444-4444-8444-444444444444', script_path: 'script/script.md',
        script_revision: 7, script_hash: 'b'.repeat(64), script_approval_id: '99999999-9999-4999-8999-999999999999',
        script_approval_revision: 1, script_approval_hash: 'b'.repeat(64), operation_key: request.operation_key, provenance: 'live_established',
      }, venue_execution: { execution_id: request.capture_session_id } } });
    });
    const authority = await import('../../src/forge/workpiece-commit');
    authority.beginRecordingCaptureSession();
    const result = await authority.ensureRecordingCaptureTarget();
    expect(result).toEqual(expect.objectContaining({ ok: true, workpieceId: WORKPIECE_ID }));
    if (result.ok) expect(result.captureAuthority.id).toBe(CAPTURE_AUTHORITY_ID);
    expect((global as any).fetch).toHaveBeenCalledWith(expect.stringContaining('/recording-capture-authority'), expect.any(Object));
  });

  test('project or cached browser context cannot substitute for an explicit episode route', async () => {
    window.history.replaceState({}, '', `/?workspace_id=${WORKSPACE_ID}`);
    localStorage.setItem('forge_active_workpiece_id_v1', WORKPIECE_ID);
    (global as any).fetch = jest.fn();
    const authority = await import('../../src/forge/workpiece-commit');
    authority.beginRecordingCaptureSession();
    await expect(authority.ensureRecordingCaptureTarget()).resolves.toEqual(expect.objectContaining({ ok: false, reason: 'explicit_episode_context_required' }));
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  test('establishes an authoritative unscripted capture when no approved script exists', async () => {
    window.history.replaceState({}, '', `/?workspace_id=${WORKSPACE_ID}&workpiece_id=${WORKPIECE_ID}`);
    delete (window as any).__forgeCanonicalScriptIdentity;
    (global as any).fetch = jest.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      return response(200, { ok: true, data: { outcome: 'established', capture_authority: {
        id: CAPTURE_AUTHORITY_ID, workspace_id: WORKSPACE_ID, workpiece_id: WORKPIECE_ID, venue: 'anvil', script_binding_kind: 'none',
        recording_session_id: null, ready_transition_id: null, script_path: null, script_revision: null, script_hash: null,
        script_approval_id: null, script_approval_revision: null, script_approval_hash: null, operation_key: request.operation_key, provenance: 'live_established',
      }, venue_execution: { execution_id: request.capture_session_id } } });
    });
    const authority = await import('../../src/forge/workpiece-commit');
    authority.beginRecordingCaptureSession();
    await expect(authority.ensureRecordingCaptureTarget()).resolves.toEqual(expect.objectContaining({
      ok: true, captureAuthority: expect.objectContaining({ scriptBindingKind: 'none', scriptPath: null }),
    }));
  });

  test('completion uses capture authority without re-reading browser script identity', async () => {
    delete (window as any).__forgeCanonicalReadyScript;
    (window as any).__forgeCanonicalScriptIdentity = {
      workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID, path: 'script/script.md',
      scriptRevision: 7, scriptHash: 'b'.repeat(64),
    };
    (global as any).fetch = jest.fn(async () => response(200, { ok: true, data: { outcome: 'saved', completion: { id: COMPLETION_ID } } }));
    const { transitionRecordingCompleted } = await import('../../src/forge/workpiece-commit');
    await expect(transitionRecordingCompleted({ commit })).resolves.toEqual(expect.objectContaining({ ok: true, completionId: COMPLETION_ID }));
    const request = JSON.parse((global as any).fetch.mock.calls[0][1].body);
    expect(request).toEqual(expect.objectContaining({ capture_authority_id: CAPTURE_AUTHORITY_ID }));
    expect(request).not.toHaveProperty('expected_script_revision');
  });

  test('later navigation state cannot alter the completion request', async () => {
    (window as any).__forgeRecordingScriptIdentityByCapture = {
      [CAPTURE_ID]: { workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID, path: 'script/original.md', scriptRevision: 4, scriptHash: 'c'.repeat(64) },
    };
    (window as any).__forgeCanonicalScriptIdentity = { workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID, path: 'script/later.md', scriptRevision: 5, scriptHash: 'd'.repeat(64) };
    (global as any).fetch = jest.fn(async () => response(200, { ok: true, data: { outcome: 'saved', completion: { id: COMPLETION_ID } } }));
    const { transitionRecordingCompleted } = await import('../../src/forge/workpiece-commit');
    await transitionRecordingCompleted({ commit });
    const request = JSON.parse((global as any).fetch.mock.calls[0][1].body);
    expect(request.capture_authority_id).toBe(CAPTURE_AUTHORITY_ID);
    expect(request).not.toHaveProperty('script_path');
  });

  test.each([
    ['keep', 'transitionRecordingKept', '/recording-decision-v2', 'keep'],
    ['discard', 'transitionRecordingDiscarded', '/recording-decision-v2', 'discard'],
  ] as const)('%s uses capture-bound workspace identity without legacy Ready state', async (_decision, exportName, endpoint, receiptKey) => {
    delete (window as any).__forgeCanonicalReadyScript;
    (window as any).__forgeRecordingScriptIdentityByCapture = {
      [CAPTURE_ID]: { workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID, path: 'script/script.md', scriptRevision: 7, scriptHash: 'b'.repeat(64) },
    };
    (global as any).fetch = jest.fn(async () => response(200, {
      ok: true,
      data: { outcome: 'saved', [receiptKey]: { id: '66666666-6666-4666-8666-666666666666' } },
    }));
    const authority = await import('../../src/forge/workpiece-commit');
    const result = await authority[exportName]({ commit, completionId: COMPLETION_ID });
    expect(result).toEqual(expect.objectContaining({ ok: true, outcome: 'saved' }));
    expect((global as any).fetch).toHaveBeenCalledWith(expect.stringContaining(endpoint), expect.any(Object));
    const request = JSON.parse((global as any).fetch.mock.calls[0][1].body);
    expect(request.capture_authority_id).toBe(CAPTURE_AUTHORITY_ID);
    expect(request.decision).toBe(_decision);
  });

  test('transient completion retry reuses the same logical idempotency identity', async () => {
    (window as any).__forgeCanonicalScriptIdentity = { workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID, path: 'script/script.md', scriptRevision: 7, scriptHash: 'b'.repeat(64),
      scriptApprovalId: '99999999-9999-4999-8999-999999999999', scriptApprovalRevision: 1, scriptApprovalHash: 'b'.repeat(64) };
    (global as any).fetch = jest.fn()
      .mockResolvedValueOnce(response(503, { error: { code: 'temporary' } }))
      .mockResolvedValueOnce(response(200, { ok: true, data: { outcome: 'saved', completion: { id: COMPLETION_ID } } }));
    const { transitionRecordingCompleted } = await import('../../src/forge/workpiece-commit');
    await expect(transitionRecordingCompleted({ commit })).resolves.toEqual(expect.objectContaining({ ok: true }));
    const first = JSON.parse((global as any).fetch.mock.calls[0][1].body);
    const second = JSON.parse((global as any).fetch.mock.calls[1][1].body);
    expect(first.idempotency_key).toBe(second.idempotency_key);
    expect(first.capture_authority_id).toBe(second.capture_authority_id);
    expect(first.media_path).toBe(second.media_path);
  });

  test('refresh recovers an unscripted pending decision from route and canonical authority evidence', async () => {
    delete (window as any).__forgeCanonicalReadyScript;
    window.history.replaceState({}, '', `/?workspace_id=${WORKSPACE_ID}&workpiece_id=${WORKPIECE_ID}`);
    (global as any).fetch = jest.fn(async () => response(200, { ok: true, data: { outcome: 'ok', pending: [{
      completion_id: COMPLETION_ID, workpiece_id: WORKPIECE_ID, capture_session_id: CAPTURE_ID,
      recording_capture_authority_id: CAPTURE_AUTHORITY_ID, media_verification_receipt_id: '88888888-8888-4888-8888-888888888888',
      media_path: 'recordings/take.webm',
    }] } }));
    const { readPendingRecordingDecisions } = await import('../../src/forge/workpiece-commit');
    await expect(readPendingRecordingDecisions()).resolves.toEqual([{
      completionId: COMPLETION_ID, workpieceId: WORKPIECE_ID, captureSessionId: CAPTURE_ID,
      captureAuthorityId: CAPTURE_AUTHORITY_ID, mediaPath: 'recordings/take.webm',
    }]);
    expect((global as any).fetch).toHaveBeenCalledWith(expect.stringContaining(`workspace_id=${WORKSPACE_ID}`), expect.any(Object));
  });
});
