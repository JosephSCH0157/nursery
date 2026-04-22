jest.mock('../../src/forge/tongs-user-auth', () => ({
  appendForgeUserAuthorization: async (headers?: Headers) => headers ?? new Headers(),
}));

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const WORKPIECE_ID = "22222222-2222-4222-8222-222222222222";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

describe('workpiece recording upload strategy', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('forge_workspace_id_v1', WORKSPACE_ID);
    localStorage.setItem('forge_active_workpiece_id_v1', WORKPIECE_ID);
    (window as any).ANVIL_LARGE_UPLOAD_WARN_MB = undefined;
    (window as any).ANVIL_CHUNK_UPLOAD_THRESHOLD_MB = undefined;
    (window as any).ANVIL_CHUNK_SIZE_MB = undefined;
    (window as any).__TP_LAST_APPLIED_HASH = "hash-test";
    (window as any).__tpAsrRunKey = "run-test";
  });

  it('emits large-upload warning visibility and still commits', async () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (window as any).ANVIL_LARGE_UPLOAD_WARN_MB = 0.0001;
    (window as any).ANVIL_CHUNK_UPLOAD_THRESHOLD_MB = 999;
    (window as any).ANVIL_CHUNK_SIZE_MB = 8;

    (global as any).fetch = jest.fn(async (url: string) => {
      if (url.includes('/commit-file')) {
        return jsonResponse(200, { ok: true, data: { ok: true } });
      }
      throw new Error(`unexpected fetch url: ${url}`);
    });

    const { commitRecordingBytesToTongs } = await import('../../src/forge/workpiece-commit');
    const result = await commitRecordingBytesToTongs({
      bytes: new Uint8Array(4096),
      originalName: 'Florida_Oranges.webm',
      contentType: 'video/webm',
    });

    expect(result.ok).toBe(true);
    expect(infoSpy).toHaveBeenCalledWith(
      '[recording/upload] blob-summary',
      expect.objectContaining({
        strategy: 'single',
      }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[recording/upload] large-upload-warning',
      expect.objectContaining({
        strategy: 'single',
      }),
    );
  });

  it('selects single vs chunked strategy by threshold', async () => {
    const { selectUploadStrategyForBytes } = await import('../../src/forge/workpiece-commit');
    expect(selectUploadStrategyForBytes(512, {
      largeUploadWarnMb: 100,
      chunkUploadThresholdMb: 1,
      chunkSizeMb: 1,
    })).toBe('single');
    expect(selectUploadStrategyForBytes(2 * 1024 * 1024, {
      largeUploadWarnMb: 100,
      chunkUploadThresholdMb: 1,
      chunkSizeMb: 1,
    })).toBe('chunked');
  });

  it('builds deterministic chunk boundaries that cover all bytes once', async () => {
    const { buildRecordingChunks } = await import('../../src/forge/workpiece-commit');
    const chunks = buildRecordingChunks(10, 4);
    expect(chunks).toEqual([
      { index: 0, startByte: 0, endByte: 4, size: 4, totalChunks: 3 },
      { index: 1, startByte: 4, endByte: 8, size: 4, totalChunks: 3 },
      { index: 2, startByte: 8, endByte: 10, size: 2, totalChunks: 3 },
    ]);
    const covered = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
    expect(covered).toBe(10);
  });

  it('captures chunk failure, skips finalize, and returns failed canonical commit', async () => {
    (window as any).ANVIL_CHUNK_UPLOAD_THRESHOLD_MB = 0.000001;
    (window as any).ANVIL_CHUNK_SIZE_MB = 0.000001;
    let finalizeCalls = 0;
    let chunkCalls = 0;

    (global as any).fetch = jest.fn(async (url: string) => {
      if (url.includes('/recording-upload/begin')) {
        return jsonResponse(200, {
          ok: true,
          data: {
            upload_id: 'upl_test_fail',
            total_chunks: 3,
            chunk_size_bytes: 1,
            uploaded_chunks: [],
          },
        });
      }
      if (url.includes('/recording-upload/') && url.endsWith('/chunk')) {
        chunkCalls += 1;
        return jsonResponse(500, { ok: false, error: { code: 'chunk_fail' } });
      }
      if (url.includes('/recording-upload/') && url.endsWith('/finalize')) {
        finalizeCalls += 1;
        return jsonResponse(200, { ok: true, data: { workpiece_id: WORKPIECE_ID, path: 'recordings/fail.webm' } });
      }
      throw new Error(`unexpected fetch url: ${url}`);
    });

    const { commitRecordingBytesToTongs } = await import('../../src/forge/workpiece-commit');
    const result = await commitRecordingBytesToTongs({
      bytes: new Uint8Array([1, 2, 3]),
      originalName: 'Florida_Oranges.webm',
      contentType: 'video/webm',
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('commit_failed');
    expect(chunkCalls).toBe(3);
    expect(finalizeCalls).toBe(0);
  });

  it('finalizes exactly once after all chunks succeed', async () => {
    (window as any).ANVIL_CHUNK_UPLOAD_THRESHOLD_MB = 0.000001;
    (window as any).ANVIL_CHUNK_SIZE_MB = 0.000001;
    let finalizeCalls = 0;
    let chunkCalls = 0;

    (global as any).fetch = jest.fn(async (url: string) => {
      if (url.includes('/recording-upload/begin')) {
        return jsonResponse(200, {
          ok: true,
          data: {
            upload_id: 'upl_test_ok',
            total_chunks: 3,
            chunk_size_bytes: 1,
            uploaded_chunks: [],
          },
        });
      }
      if (url.includes('/recording-upload/') && url.endsWith('/chunk')) {
        chunkCalls += 1;
        return jsonResponse(200, { ok: true, data: { index: chunkCalls - 1 } });
      }
      if (url.includes('/recording-upload/') && url.endsWith('/finalize')) {
        finalizeCalls += 1;
        return jsonResponse(200, { ok: true, data: { workpiece_id: WORKPIECE_ID, path: 'recordings/ok.webm' } });
      }
      throw new Error(`unexpected fetch url: ${url}`);
    });

    const { commitRecordingBytesToTongs } = await import('../../src/forge/workpiece-commit');
    const result = await commitRecordingBytesToTongs({
      bytes: new Uint8Array([4, 5, 6]),
      originalName: 'Florida_Oranges.webm',
      contentType: 'video/webm',
    });

    expect(result.ok).toBe(true);
    expect(chunkCalls).toBe(3);
    expect(finalizeCalls).toBe(1);
  });

  it('keeps original title metadata through chunked upload even if UI selection mutates mid-run', async () => {
    (window as any).ANVIL_CHUNK_UPLOAD_THRESHOLD_MB = 0.000001;
    (window as any).ANVIL_CHUNK_SIZE_MB = 0.000001;
    let beginPayload: Record<string, any> | null = null;

    (global as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/recording-upload/begin')) {
        beginPayload = JSON.parse(String(init?.body || '{}'));
        return jsonResponse(200, {
          ok: true,
          data: {
            upload_id: 'upl_identity',
            total_chunks: 3,
            chunk_size_bytes: 1,
            uploaded_chunks: [],
          },
        });
      }
      if (url.includes('/recording-upload/') && url.endsWith('/chunk')) {
        localStorage.setItem('tp_last_script_title', 'Wrong Episode Title');
        return jsonResponse(200, { ok: true, data: { index: 0 } });
      }
      if (url.includes('/recording-upload/') && url.endsWith('/finalize')) {
        return jsonResponse(200, { ok: true, data: { workpiece_id: WORKPIECE_ID, path: 'recordings/florida.webm' } });
      }
      throw new Error(`unexpected fetch url: ${url}`);
    });

    const { commitRecordingBytesToTongs } = await import('../../src/forge/workpiece-commit');
    const result = await commitRecordingBytesToTongs({
      bytes: new Uint8Array([9, 8, 7]),
      originalName: 'Florida_Oranges_Story.webm',
      contentType: 'video/webm',
    });

    expect(result.ok).toBe(true);
    expect(beginPayload).toEqual(expect.objectContaining({
      path: 'recordings/Florida_Oranges_Story.webm',
      event_payload: expect.objectContaining({
        original_name: 'Florida_Oranges_Story.webm',
      }),
    }));
  });
});
