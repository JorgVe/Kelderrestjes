/* maakt de Supabase-client (window.kelderSb) uit supabase-config.js; verwacht supabase-js al geladen.
   De site leest alleen, als anonieme bezoeker: er wordt geen sessie bewaard. */
(function(){
  const cfg = window.KELDER_SUPABASE || {};
  const filled = v => typeof v === 'string' && v && !v.includes('YOUR-');
  window.kelderConfigured = filled(cfg.url) && filled(cfg.publishableKey);
  window.kelderSb = window.kelderConfigured && window.supabase
    ? window.supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
})();
