// forge-config.js
// Canonical Forge runtime config for pages that resolve this script from /forge-config.js.
window.__forgeSupabaseUrl = 'https://wtvdjndyxegudufrompx.supabase.co';
window.__forgeSupabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0dmRqbmR5eGVndWR1ZnJvbXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTM1NTgsImV4cCI6MjA4MDk2OTU1OH0.J8QSPxk8pmJUTEyZU7vpQn7W6G_TBS7RPoCX9B42Vug';
window.__forgeStripePriceCatalog = window.__forgeStripePriceCatalog || {
  plans: {
    creator: {
      monthly: 'price_1T7MWa1OSG3CCNl8tAtHR2LY',
      quarterly: 'price_1T83sY1OSG3CCNl8f1hdNE9t',
    },
    studio: {
      monthly: 'price_1T83zY1OSG3CCNl8Jm4YkLHh',
    },
  },
  addons: {
    seat: {
      monthly: 'price_1T84071OSG3CCNl8n1X4wY8R',
    },
  },
  packs: {
    ai_credits: {
      ai_base: 'price_1T7MSt1OSG3CCNl8p7bTPKE8',
      ai_mid: 'price_1Sq1zI1OSG3CCNl8w823S5rR',
      ai_high: 'price_1T83vg1OSG3CCNl8MQMqUTR0',
    },
  },
};
window.__forgeCreatorMonthlyPriceId =
  window.__forgeCreatorMonthlyPriceId ||
  window.__forgeStripePriceCatalog.plans.creator.monthly;
window.__forgeCreatorQuarterlyPriceId =
  window.__forgeCreatorQuarterlyPriceId ||
  window.__forgeStripePriceCatalog.plans.creator.quarterly;
window.__forgeStudioMonthlyPriceId =
  window.__forgeStudioMonthlyPriceId ||
  window.__forgeStripePriceCatalog.plans.studio.monthly;
window.__forgeSeatMonthlyPriceId =
  window.__forgeSeatMonthlyPriceId ||
  window.__forgeStripePriceCatalog.addons.seat.monthly;
window.__forgeAnvilPriceId =
  window.__forgeAnvilPriceId ||
  window.__forgeCreatorMonthlyPriceId;
window.__forgeAiPriceId_base =
  window.__forgeAiPriceId_base ||
  window.__forgeStripePriceCatalog.packs.ai_credits.ai_base;
window.__forgeAiPriceId_mid =
  window.__forgeAiPriceId_mid ||
  window.__forgeStripePriceCatalog.packs.ai_credits.ai_mid;
window.__forgeAiPriceId_high =
  window.__forgeAiPriceId_high ||
  window.__forgeStripePriceCatalog.packs.ai_credits.ai_high;
window.__forgeAppOrigin = window.__forgeAppOrigin || 'https://podcastersforge.com';
window.__forgeResetRedirectUrl = window.__forgeResetRedirectUrl || 'https://podcastersforge.com/reset';
