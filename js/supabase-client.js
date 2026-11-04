/* maakt de Supabase-client (window.kelderSb) uit supabase-config.js; verwacht supabase-js al geladen.
   Deze client is voor bezoekers: alleen lezen, anoniem, er wordt geen sessie bewaard.
   De beheerder logt in via js/admin.js (aparte client) om de voorraad aan te passen. */
(function(){
  const cfg = window.KELDER_SUPABASE || {};
  const filled = v => typeof v === 'string' && v && !v.includes('YOUR-');
  window.kelderConfigured = filled(cfg.url) && filled(cfg.publishableKey);
  window.kelderSb = window.kelderConfigured && window.supabase
    ? window.supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
})();
