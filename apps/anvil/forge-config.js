// forge-config.js
// Central config for all Forge tools (Anvil, Login, Account, etc.).
// Keep these aligned with Nursery's Supabase project/auth defaults.
window.__forgeSupabaseUrl = window.__forgeSupabaseUrl || 'https://wtvdjndyxegudufrompx.supabase.co';
window.__forgeSupabaseAnonKey = window.__forgeSupabaseAnonKey || 'sb_publishable_TSaCCNCFuMPB48oDxS-dhg_Wudqczj9';
// Optional overrides for production reset links:
window.__forgeAppOrigin = window.__forgeAppOrigin || 'https://podcastersforge.com';
window.__forgeResetRedirectUrl = window.__forgeResetRedirectUrl || 'https://podcastersforge.com/reset';
// Optional nav config for standalone Anvil menu:
window.FORGE_HUB_ORIGIN = window.FORGE_HUB_ORIGIN || window.__forgeAppOrigin || '';
window.FORGE_BUILD_ID = window.FORGE_BUILD_ID || window.APP_VERSION || '';
