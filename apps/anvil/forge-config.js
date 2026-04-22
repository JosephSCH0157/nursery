// Optional runtime config shim for local/static environments.
// Production can overwrite these globals before app boot.
(function initForgeConfig(globalScope) {
  if (!globalScope || typeof globalScope !== 'object') return;
  if (typeof globalScope.__forgeSupabaseUrl !== 'string') {
    globalScope.__forgeSupabaseUrl = '';
  }
  if (typeof globalScope.__forgeSupabaseAnonKey !== 'string') {
    globalScope.__forgeSupabaseAnonKey = '';
  }
})(typeof window !== 'undefined' ? window : globalThis);
