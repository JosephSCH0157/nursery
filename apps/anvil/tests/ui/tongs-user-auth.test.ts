const getSession = jest.fn();

jest.mock('../../src/forge/supabaseClient', () => ({
  hasSupabaseConfig: true,
  supabase: { auth: { getSession } },
}));

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

describe('forge user auth request boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/anvil/teleprompter_pro.html');
  });

  it('attaches a valid session token only to a same-origin Tongs request', async () => {
    const token = jwt({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 });
    getSession.mockResolvedValue({ data: { session: { access_token: token } }, error: null });
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 200 } as Response));
    const { fetchAuthenticatedTongs } = await import('../../src/forge/tongs-user-auth');

    await fetchAuthenticatedTongs('/tongs/workpieces/one/read-file?path=script%2Fscript.md', {
      method: 'GET',
      headers: { authorization: 'Bearer api-token' },
    }, fetchImpl as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost/tongs/workpieces/one/read-file?path=script%2Fscript.md');
    expect((init.headers as Headers).get('authorization')).toBe('Bearer api-token');
    expect((init.headers as Headers).get('x-forge-user-authorization')).toBe(`Bearer ${token}`);
    expect(init).toMatchObject({ credentials: 'same-origin', redirect: 'error' });
  });

  it.each([
    ['missing', null],
    ['malformed', 'not-a-jwt'],
    ['expired', jwt({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) - 1 })],
    ['missing subject', jwt({ exp: Math.floor(Date.now() / 1000) + 3600 })],
  ])('rejects a %s session before fetch', async (_label, token) => {
    getSession.mockResolvedValue({ data: { session: token ? { access_token: token } : null }, error: null });
    const fetchImpl = jest.fn();
    const { fetchAuthenticatedTongs } = await import('../../src/forge/tongs-user-auth');

    await expect(fetchAuthenticatedTongs('/tongs/workpieces/one/read-file', {}, fetchImpl as typeof fetch))
      .rejects.toMatchObject({ code: 'AUTHENTICATED_SESSION_REQUIRED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    'https://example.com/tongs/workpieces/one/read-file',
    '//example.com/tongs/workpieces/one/read-file',
    '/outside-tongs/read-file',
  ])('rejects cross-origin or non-Tongs target %s before resolving a token', async (target) => {
    const fetchImpl = jest.fn();
    const { fetchAuthenticatedTongs } = await import('../../src/forge/tongs-user-auth');

    await expect(fetchAuthenticatedTongs(target, {}, fetchImpl as typeof fetch))
      .rejects.toMatchObject({ code: 'INVALID_TONGS_REQUEST_TARGET' });
    expect(getSession).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('forces redirect error mode so authorization cannot follow a redirect', async () => {
    const token = jwt({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 });
    getSession.mockResolvedValue({ data: { session: { access_token: token } }, error: null });
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.redirect).toBe('error');
      throw new TypeError('redirect blocked');
    });
    const { fetchAuthenticatedTongs } = await import('../../src/forge/tongs-user-auth');

    await expect(fetchAuthenticatedTongs('/tongs/workpieces/one/read-file', {}, fetchImpl as typeof fetch))
      .rejects.toThrow('redirect blocked');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
