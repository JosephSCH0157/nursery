export {};

const fetchAuthenticatedTongs = jest.fn();

jest.mock('../../src/forge/tongs-user-auth', () => {
  class ForgeUserAuthorizationError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { fetchAuthenticatedTongs, ForgeUserAuthorizationError };
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('authenticated canonical script entry points', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/anvil/teleprompter_pro.html');
  });

  it('routes the direct Hearth handoff read through the authenticated Tongs boundary', async () => {
    fetchAuthenticatedTongs.mockResolvedValue(jsonResponse({
      ok: true,
      data: 'Canonical words.',
      file_row: { revision: 7, hash_value: 'a'.repeat(64) },
    }));
    const { readCanonicalScriptFile } = await import('../../src/forge/canonical-script-read');

    await expect(readCanonicalScriptFile(
      '11111111-1111-4111-8111-111111111111',
      'script/script.md',
    )).resolves.toEqual({ ok: true, text: 'Canonical words.', revision: 7, hash: 'a'.repeat(64) });

    expect(fetchAuthenticatedTongs).toHaveBeenCalledWith(
      '/tongs/workpieces/11111111-1111-4111-8111-111111111111/read-file?path=script%2Fscript.md',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('fails the direct handoff visibly as unauthorized when session authority is unavailable', async () => {
    const { ForgeUserAuthorizationError } = await import('../../src/forge/tongs-user-auth');
    fetchAuthenticatedTongs.mockRejectedValue(new ForgeUserAuthorizationError(
      'AUTHENTICATED_SESSION_REQUIRED',
      'Sign in required.',
    ));
    const { readCanonicalScriptFile } = await import('../../src/forge/canonical-script-read');

    await expect(readCanonicalScriptFile(
      '11111111-1111-4111-8111-111111111111',
      'script/script.md',
    )).resolves.toEqual({ ok: false, reason: 'unauthorized', status: 401 });
  });

  it('routes ready-script content through the same authenticated Tongs boundary', async () => {
    fetchAuthenticatedTongs.mockResolvedValue(jsonResponse({ ok: true, data: {
      workpiece_id: '11111111-1111-4111-8111-111111111111',
      source_file_path: 'script/script.md',
      script_text: 'Ready canonical words.',
      script_approval_id: '22222222-2222-4222-8222-222222222222',
    } }));
    const { readReadyScriptText } = await import('../../src/forge/ready-scripts');

    await expect(readReadyScriptText(
      '11111111-1111-4111-8111-111111111111',
      'script/script.md',
    )).resolves.toBe('Ready canonical words.');
    expect(fetchAuthenticatedTongs).toHaveBeenCalledWith(
      '/tongs/workpieces/11111111-1111-4111-8111-111111111111/production-script',
      expect.objectContaining({ method: 'GET', headers: expect.any(Headers) }),
    );
  });
});
