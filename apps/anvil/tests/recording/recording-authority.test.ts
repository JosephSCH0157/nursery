/** @jest-environment jsdom */

export {};

jest.mock('../../src/forge/tongs-user-auth', () => ({
  appendForgeUserAuthorization: async (headers?: Headers) => headers ?? new Headers(),
}));

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKPIECE_ID = '22222222-2222-4222-8222-222222222222';
const CAPTURE_ID = '33333333-3333-4333-8333-333333333333';
const TRANSITION_ID = '44444444-4444-4444-8444-444444444444';
const COMPLETION_ID = '55555555-5555-4555-8555-555555555555';

const commit = {
  ok: true as const, workpieceId: WORKPIECE_ID, path: 'recordings/take.webm', createdCradle: false,
  plannerRecordingSessionId: null, captureSessionId: CAPTURE_ID, mediaRevision: 3,
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
      scriptRevision: 7, scriptHash: 'b'.repeat(64), transitionId: TRANSITION_ID,
    };
    (window as any).__tpCanonicalAsrAuthority = {
      schema: 'anvil.asr-authority-snapshot.v1', cursor: 4, coveredLines: [0, 1, 2, 3, 4],
      unresolvedSkippedLines: [], terminalCompleted: true, postrollEligible: true,
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as any).__forgeCanonicalReadyScript;
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

  test('fails closed for unavailable authority and malformed terminal evidence', async () => {
    (window as any).__tpCanonicalAsrAuthority.terminalCompleted = false;
    const { transitionRecordingCompleted } = await import('../../src/forge/workpiece-commit');
    await expect(transitionRecordingCompleted({ commit })).resolves.toEqual(expect.objectContaining({ ok: false, outcome: 'malformed' }));
    (window as any).__tpCanonicalAsrAuthority.terminalCompleted = true;
    (global as any).fetch = jest.fn(async () => response(503, { error: { code: 'anvil_recording_authority_migration_required' } }));
    await expect(transitionRecordingCompleted({ commit })).resolves.toEqual(expect.objectContaining({ ok: false, outcome: 'unavailable' }));
  });

  test('keeps only the exact accepted completion and reconciles a duplicate retry', async () => {
    (global as any).fetch = jest.fn(async () => response(200, { ok: true, data: { outcome: 'duplicate', keep: { id: TRANSITION_ID } } }));
    const { transitionRecordingKept } = await import('../../src/forge/workpiece-commit');
    await expect(transitionRecordingKept({ commit, completionId: COMPLETION_ID })).resolves.toEqual(expect.objectContaining({ ok: true, outcome: 'duplicate', keepId: TRANSITION_ID }));
  });
});
