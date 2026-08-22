import { createHash } from 'crypto';
import {
  assertPreparedPresentationFresh,
  parseRequestedPresentation,
  prepareRequestedPresentation,
  PresentationBoundaryError,
  serializeActivePresentationEvidence,
  type ActivePresentation,
} from '../../src/script/performance-presentation-boundary';

jest.mock('../../src/forge/tongs-user-auth', () => ({
  appendForgeUserAuthorization: async (headers?: Headers) => headers ?? new Headers(),
}));

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: {
    subtle: {
      digest: async (_algorithm: string, data: ArrayBuffer) => {
        const hash = createHash('sha256').update(new Uint8Array(data)).digest();
        return Uint8Array.from(hash).buffer;
      },
    },
  },
});

const encoder = new TextEncoder();
const TEXT = '[s1]\nA short canonical sentence.\n[/s1]\n';
const BYTES = encoder.encode(TEXT);
const HASH = createHash('sha256').update(BYTES).digest('hex');
const SOURCE = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  workpieceId: '22222222-2222-4222-8222-222222222222',
  path: 'script/script.md',
  scriptRevision: 7,
  scriptHash: HASH,
  readyTransitionId: null,
};

async function prepared() {
  const value = await prepareRequestedPresentation({
    requestedPresentation: parseRequestedPresentation('?presentation=performance-projection-v1'),
    canonicalIdentity: SOURCE,
    canonicalText: TEXT,
    canonicalUtf8Bytes: BYTES,
  });
  if (!value) throw new Error('expected prepared presentation');
  return value;
}

describe('HA-3B performance presentation boundary', () => {
  test('unknown explicit values fail visibly while a missing selection preserves current behavior', () => {
    expect(() => parseRequestedPresentation('?presentation=future-mode')).toThrow(PresentationBoundaryError);
    expect(() => parseRequestedPresentation('?presentation=future-mode')).toThrow(expect.objectContaining({
      diagnostic: expect.objectContaining({ code: 'UNKNOWN_PRESENTATION', requestedValue: 'future-mode' }),
    }));
    expect(() => parseRequestedPresentation('?presentation=')).toThrow(expect.objectContaining({
      diagnostic: expect.objectContaining({ code: 'UNKNOWN_PRESENTATION' }),
    }));
    expect(() => parseRequestedPresentation(
      '?presentation=performance-projection-v1&presentation=performance-projection-v1',
    )).toThrow(expect.objectContaining({ diagnostic: expect.objectContaining({ code: 'UNKNOWN_PRESENTATION' }) }));
    expect(parseRequestedPresentation('?workspace_id=abc')).toEqual({
      status: 'current', mode: 'legacy', explicit: false,
    });
  });

  test('preparation requires authenticated canonical revision and hash', async () => {
    const requested = parseRequestedPresentation('?presentation=performance-projection-v1');
    await expect(prepareRequestedPresentation({
      requestedPresentation: requested, canonicalIdentity: null, canonicalText: TEXT, canonicalUtf8Bytes: BYTES,
    })).rejects.toMatchObject({ diagnostic: { code: 'MISSING_CANONICAL_IDENTITY' } });
    await expect(prepareRequestedPresentation({
      requestedPresentation: requested,
      canonicalIdentity: { ...SOURCE, scriptRevision: 0 }, canonicalText: TEXT, canonicalUtf8Bytes: BYTES,
    })).rejects.toMatchObject({ diagnostic: { code: 'INVALID_CANONICAL_REVISION' } });
    await expect(prepareRequestedPresentation({
      requestedPresentation: requested,
      canonicalIdentity: { ...SOURCE, scriptHash: 'not-a-hash' }, canonicalText: TEXT, canonicalUtf8Bytes: BYTES,
    })).rejects.toMatchObject({ diagnostic: { code: 'INVALID_CANONICAL_HASH' } });
  });

  test('canonical identity changes invalidate prepared state', async () => {
    const value = await prepared();
    expect(() => assertPreparedPresentationFresh(value, SOURCE)).not.toThrow();
    expect(() => assertPreparedPresentationFresh(value, { ...SOURCE, scriptRevision: 8 })).toThrow(expect.objectContaining({
      diagnostic: expect.objectContaining({ code: 'PREPARED_SOURCE_STALE' }),
    }));
    expect(() => assertPreparedPresentationFresh(value, { ...SOURCE, scriptHash: 'a'.repeat(64) })).toThrow(expect.objectContaining({
      diagnostic: expect.objectContaining({ code: 'PREPARED_SOURCE_STALE' }),
    }));
  });

  test('preparation failure exposes no partial or active projection state', async () => {
    let state: Awaited<ReturnType<typeof prepareRequestedPresentation>> = null;
    try {
      state = await prepareRequestedPresentation({
        requestedPresentation: parseRequestedPresentation('?presentation=performance-projection-v1'),
        canonicalIdentity: SOURCE,
        canonicalText: `${TEXT}changed`,
        canonicalUtf8Bytes: BYTES,
      });
    } catch (error) {
      expect(error).toMatchObject({ diagnostic: { code: 'PREPARATION_FAILED', causeCode: 'CANONICAL_BYTES_TEXT_MISMATCH' } });
    }
    expect(state).toBeNull();
  });

  test('prepared state cannot alter real capture identity or submitted completion evidence', async () => {
    const value = await prepared();
    (window as any).__forgeCanonicalScriptIdentity = SOURCE;
    (window as any).__forgePreparedPresentation = value;
    (window as any).__tpCanonicalAsrAuthority = { coveredLines: [0], unresolvedSkippedLines: [], terminalCompleted: false };
    const { beginRecordingCaptureSession, transitionRecordingCompleted } = await import('../../src/forge/workpiece-commit');
    const captureId = beginRecordingCaptureSession();
    expect((window as any).__forgeRecordingScriptIdentityByCapture[captureId]).toEqual(SOURCE);
    expect((window as any).__forgeRecordingScriptIdentityByCapture[captureId]).not.toHaveProperty('presentation');

    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: true,
        data: { outcome: 'saved', completion: { id: '55555555-5555-4555-8555-555555555555' } },
      }),
    } as Response));
    await transitionRecordingCompleted({
      commit: {
        ok: true, workpieceId: SOURCE.workpieceId, path: 'recordings/take.webm', createdCradle: false,
        plannerRecordingSessionId: null, captureSessionId: captureId, mediaRevision: 3,
        mediaHash: 'a'.repeat(64), mediaBytes: 4096, mediaContentType: 'video/webm', status: 200,
      },
    });
    const request = JSON.parse((global as any).fetch.mock.calls[0][1].body);
    expect(value.status).toBe('prepared');
    expect('activePresentation' in value).toBe(false);
    expect(() => serializeActivePresentationEvidence(value)).toThrow(expect.objectContaining({
      diagnostic: expect.objectContaining({ code: 'PRESENTATION_NOT_ACTIVE' }),
    }));
    expect(request.completion_evidence).not.toHaveProperty('presentation');
    expect(request.completion_evidence).not.toHaveProperty('performance_projection');
    delete (window as any).__forgeCanonicalScriptIdentity;
    delete (window as any).__forgePreparedPresentation;
    delete (window as any).__forgeRecordingScriptIdentityByCapture;
    delete (window as any).__tpCanonicalAsrAuthority;
  });

  test('dormant serializer rejects requested state and accepts only a validated future active state', async () => {
    expect(() => serializeActivePresentationEvidence(
      parseRequestedPresentation('?presentation=performance-projection-v1'),
    )).toThrow(expect.objectContaining({ diagnostic: expect.objectContaining({ code: 'PRESENTATION_NOT_ACTIVE' }) }));

    const value = await prepared();
    const invalidActive: ActivePresentation = {
      ...value,
      status: 'active',
      activation: { renderer: 'performance-projection-v1', installedProjectionId: 'wrong' },
    };
    expect(() => serializeActivePresentationEvidence(invalidActive)).toThrow(expect.objectContaining({
      diagnostic: expect.objectContaining({ code: 'ACTIVE_PRESENTATION_INVALID' }),
    }));

    const futureActive: ActivePresentation = {
      ...value,
      status: 'active',
      activation: { renderer: 'performance-projection-v1', installedProjectionId: value.projection.projectionId },
    };
    expect(serializeActivePresentationEvidence(futureActive)).toEqual(expect.objectContaining({
      mode: 'performance-projection-v1',
      projection_id: value.projection.projectionId,
      source_script_hash: HASH,
      source_script_revision: 7,
    }));
  });
});
