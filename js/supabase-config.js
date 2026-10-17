/* Verbinding met het Supabase-project.
   Beide waarden staan in het dashboard onder Project Settings > API (of via de "Connect"-knop).
   De publishable (vroeger: anon) key is bedoeld om publiek in de browser te staan:
   wat iemand mag lezen of schrijven bepaalt Row Level Security in de database, niet deze key.
   Zet hier NOOIT de secret/service_role key neer. */
window.KELDER_SUPABASE = {
  url: 'https://aspjeliatfudrcjcfidi.supabase.co',
  publishableKey: 'sb_publishable_uGS__jOOIUf3-EQ9jQh3dw_17dVhRzw'
};
