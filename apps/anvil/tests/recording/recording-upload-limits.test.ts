import { webcrypto } from 'node:crypto';
import {
  assertRecordingSize, boundedUploadMb, RECORDING_CHUNK_MAX_BYTES,
  RECORDING_MAX_BYTES, RECORDING_REQUEST_MAX_BYTES, serializeRecordingRequest,
} from '../../src/forge/recording-upload-limits';

jest.mock('../../src/forge/tongs-user-auth', () => ({
  appendForgeUserAuthorization: async (headers?: Headers) => headers ?? new Headers(),
}));

const authority = {
  id: '55555555-5555-4555-8555-555555555555',
  captureSessionId: '66666666-6666-4666-8666-666666666666',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  workpieceId: '22222222-2222-4222-8222-222222222222',
  recordingSessionId: null, readyTransitionId: null, scriptBindingKind: 'none' as const,
  scriptPath: null, scriptRevision: null, scriptHash: null, scriptApprovalId: null,
  scriptApprovalRevision: null, scriptApprovalHash: null,
  operationKey: 'size-boundary-test', provenance: 'live_established' as const,
};
const reply = (status: number, body: unknown) => ({
  status, ok: status < 300, text: async () => JSON.stringify(body),
}) as Response;
const canonical = { ok: true, data: { workpiece_id: authority.workpieceId,
  path: 'recordings/test.webm', hash: 'a'.repeat(64), file_row: { revision: 1 } } };

const originalSubtle = Object.getOwnPropertyDescriptor(crypto, 'subtle');
beforeEach(() => {
  Object.defineProperty(crypto, 'subtle', { configurable: true, value: webcrypto.subtle });
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  for (const key of ['ANVIL_CHUNK_SIZE_MB', 'ANVIL_CHUNK_UPLOAD_THRESHOLD_MB']) {
    delete (window as unknown as Record<string, unknown>)[key];
  }
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  global.fetch = jest.fn();
});
afterEach(() => {
  jest.restoreAllMocks();
  if (originalSubtle) Object.defineProperty(crypto, 'subtle', originalSubtle);
  else Reflect.deleteProperty(crypto, 'subtle');
});

it.each(['single', 'chunk'])('%s counts full UTF-8 JSON at the exact request boundary', (kind) => {
  const payload = kind === 'single'
    ? { bytes_base64: 'AAAA', path: 'recordings/test.webm', metadata: '' }
    : { bytes_base64: 'AAAA', index: 0, total_chunks: 1, metadata: '' };
  const overhead = new TextEncoder().encode(JSON.stringify(payload)).length;
  // Multibyte metadata catches accidental character-count guards.
  payload.metadata = 'é' + 'x'.repeat(RECORDING_REQUEST_MAX_BYTES - overhead - 3);
  expect(new TextEncoder().encode(serializeRecordingRequest(payload)).length).toBe(RECORDING_REQUEST_MAX_BYTES - 1);
  payload.metadata += 'x';
  expect(new TextEncoder().encode(serializeRecordingRequest(payload)).length).toBe(RECORDING_REQUEST_MAX_BYTES);
  payload.metadata += 'x';
  expect(() => serializeRecordingRequest(payload)).toThrow(expect.objectContaining({ code: 'recording_request_too_large' }));
});

it('rejects large metadata even with a valid raw chunk', () => {
  const payload = { index: 0, total_chunks: 1,
    bytes_base64: 'A'.repeat(4 * Math.ceil(RECORDING_CHUNK_MAX_BYTES / 3)), metadata: 'é'.repeat(200_000) };
  expect(() => serializeRecordingRequest(payload)).toThrow('safe request size');
});

it.each([RECORDING_MAX_BYTES - 1, RECORDING_MAX_BYTES])('admits supported total size %i', size => {
  expect(() => assertRecordingSize(size)).not.toThrow();
});
it.each([RECORDING_MAX_BYTES + 1, NaN, Infinity, -1, 1.5])('rejects unsupported total size %s', size => {
  expect(() => assertRecordingSize(size)).toThrow(expect.objectContaining({ code: 'recording_size_unsupported' }));
});
it.each([999, Infinity, NaN, -1, 0])('bounds unsafe numerical override %s', value => {
  expect(boundedUploadMb(value)).toBe(3);
});

it.each(['query', 'global', 'storage'])('clamps excessive %s overrides in actual chunk requests', async location => {
  for (const key of ['ANVIL_CHUNK_SIZE_MB', 'ANVIL_CHUNK_UPLOAD_THRESHOLD_MB']) {
    if (location === 'query') {
      const url = new URL(window.location.href); url.searchParams.set(key, '999');
      window.history.replaceState({}, '', url);
    } else if (location === 'global') {
      (window as unknown as Record<string, unknown>)[key] = 999;
    } else localStorage.setItem(key, '999');
  }
  const chunks: number[] = [];
  const operations: string[] = [];
  global.fetch = jest.fn(async (url, init) => {
    const path = String(url); const raw = String(init?.body);
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(RECORDING_REQUEST_MAX_BYTES);
    const body = JSON.parse(raw);
    if (path.endsWith('/begin')) {
      operations.push('begin');
      expect(body.chunk_size_bytes).toBe(RECORDING_CHUNK_MAX_BYTES);
      expect(body.capture_authority_id).toBe(authority.id);
      return reply(200, { ok: true, data: { upload_id: 'test', uploaded_chunks: [] } });
    }
    if (path.endsWith('/chunk')) {
      operations.push(`chunk:${body.index}`);
      chunks.push(atob(body.bytes_base64).length);
      return reply(200, { ok: true });
    }
    operations.push('finalize');
    expect(path).toMatch(/\/finalize$/);
    return reply(200, canonical);
  });
  const { commitRecordingBytesToTongs } = await import('../../src/forge/workpiece-commit');
  const result = await commitRecordingBytesToTongs({ captureAuthority: authority,
    originalName: 'test.webm', bytes: new Uint8Array(RECORDING_CHUNK_MAX_BYTES + 1) });
  expect(result.ok).toBe(true);
  expect(chunks).toEqual([RECORDING_CHUNK_MAX_BYTES, 1]);
  expect(operations).toEqual(['begin', 'chunk:0', 'chunk:1', 'finalize']);
});

it.each([false, true])('rejects oversized metadata before any upload (chunked=%s)', async chunked => {
  if (chunked) localStorage.setItem('ANVIL_CHUNK_UPLOAD_THRESHOLD_MB', '0.000001');
  const { commitRecordingBytesToTongs } = await import('../../src/forge/workpiece-commit');
  const result = await commitRecordingBytesToTongs({ captureAuthority: authority,
    originalName: 'test.webm', bytes: new Uint8Array(2), transcriptPath: 'é'.repeat(2_250_000) });
  expect(result).toMatchObject({ ok: false, status: 413, errorCode: 'recording_request_too_large' });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([RECORDING_MAX_BYTES - 1, RECORDING_MAX_BYTES, RECORDING_MAX_BYTES + 1])(
  'checks total %i before reading media or creating an upload', async size => {
    const slice = jest.fn(() => { throw new Error('must not read media'); });
    global.fetch = jest.fn(async () => reply(403, { error: { code: 'admission_denied' } }));
    const { commitRecordingFileToTongs } = await import('../../src/forge/workpiece-commit');
    const result = await commitRecordingFileToTongs({ captureAuthority: authority,
      file: { name: 'test.webm', type: 'video/webm', size, lastModified: 1, slice } as unknown as File });
    expect(slice).not.toHaveBeenCalled();
    if (size > RECORDING_MAX_BYTES) {
      expect(result).toMatchObject({ ok: false, status: 413, errorCode: 'recording_size_unsupported' });
      expect(fetch).not.toHaveBeenCalled();
    } else {
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(String(jest.mocked(fetch).mock.calls[0][0])).toMatch(/\/begin$/);
      expect(result).toMatchObject({ ok: false, errorCode: 'admission_denied' });
    }
  },
);


it.each([-1, 0, 1])('enforces the complete single-upload body at ceiling %+i', async offset => {
  jest.resetModules();
  let baseline = '';
  global.fetch = jest.fn(async (_url, init) => {
    baseline = String(init?.body);
    return reply(200, canonical);
  });
  const input = { captureAuthority: authority, originalName: 'test.webm',
    bytes: new Uint8Array([1, 2, 3]), transcriptPath: '' };
  const first = await import('../../src/forge/workpiece-commit');
  await first.commitRecordingBytesToTongs(input);
  const padding = RECORDING_REQUEST_MAX_BYTES - new TextEncoder().encode(baseline).length + offset;
  // Reset the correlation sequence, keeping the same capture session, so the
  // only body-size difference is the deliberately varied metadata field.
  jest.resetModules();
  jest.mocked(fetch).mockClear();
  const second = await import('../../src/forge/workpiece-commit');
  const result = await second.commitRecordingBytesToTongs({ ...input, transcriptPath: 'x'.repeat(padding) });
  if (offset > 0) {
    expect(result).toMatchObject({ ok: false, errorCode: 'recording_request_too_large' });
    expect(fetch).not.toHaveBeenCalled();
  } else {
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new TextEncoder().encode(baseline).length).toBe(RECORDING_REQUEST_MAX_BYTES + offset);
  }
});
