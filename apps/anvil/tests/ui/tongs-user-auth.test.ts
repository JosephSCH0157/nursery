jest.mock('../../src/forge/supabaseClient', () => ({
  hasSupabaseConfig: true,
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: 'supabase-session-token' } },
        error: null,
      })),
    },
  },
}));

describe('forge user auth header helper', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('attaches the forge user authorization header from the Supabase session fallback', async () => {
    const { appendForgeUserAuthorization } = await import('../../src/forge/tongs-user-auth');

    const headers = await appendForgeUserAuthorization();

    expect(headers.get('x-forge-user-authorization')).toBe('Bearer supabase-session-token');
  });
});
