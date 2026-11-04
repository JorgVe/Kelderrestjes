/* Beheerder: inloggen met Supabase Auth en de voorraad beheren (de tabel `items`: dranken en ingrediënten).
   Alleen voorraad.html laadt dit bestand.

   Veiligheid zit in de database, niet in deze code: schrijven mag alleen een ingelogde gebruiker die in de tabel
   `admins` staat (Row Level Security, zie supabase/migrations/0001_init.sql). Deze code toont alleen de knoppen;
   wie ze omzeilt, krijgt van Supabase gewoon "geen rechten".

   - Er is een aparte client voor de beheerder, met een eigen opslagsleutel. De client voor bezoekers
     (supabase-client.js) blijft anoniem en bewaart geen sessie.
   - De sessie staat in sessionStorage: ze verdwijnt als je het tabblad sluit.
   - Hier staat alleen de publishable key. De secret/service_role key hoort nooit in de site.
   - Recepten, receptregels en wijndetails beheer je hier bewust niet; dat doe je in Supabase zelf. */
(function(){
  const cfg = window.KELDER_SUPABASE || {};

  let storage;
  try{ storage = window.sessionStorage; storage.getItem('kelderrestjes-test'); }catch(e){ storage = undefined; }

  const sb = window.kelderConfigured && window.supabase
    ? window.supabase.createClient(cfg.url, cfg.publishableKey, {
        auth: {
          persistSession: !!storage,
          storage,
          storageKey: 'kelderrestjes-admin-auth',
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      })
    : null;

  /* is de ingelogde gebruiker een beheerder? De database beantwoordt dat (is_admin() kijkt in `admins`). */
  async function isAdmin(){
    const { data, error } = await sb.rpc('is_admin');
    return !error && data === true;
  }

  const NO_SB = { ok: false, message: 'Supabase is niet beschikbaar (geblokkeerd of offline?).' };
  /* zonder rechten geeft Supabase bij update en delete geen fout maar 0 rijen terug; dat melden we hier */
  const NO_ROWS = { ok: false, relogin: true, message: 'Opslaan mislukt: geen rechten of de sessie is verlopen. Log opnieuw in.' };

  /* vertaalt een Supabase-fout naar een melding; relogin = terug naar het inlogscherm */
  function problem(error, action){
    const code = error && error.code, text = (error && error.message) || '';
    if(code === '23505'){
      /* twee unieke velden: de naam en de barcode; de melding van de database zegt welke */
      const what = `${text} ${(error && error.details) || ''}`;
      return { ok: false, message: /barcode/i.test(what) ? 'Deze barcode hoort al bij een andere drank.' : 'Er bestaat al een item met deze naam.' };
    }
    if(code === '23503' && action === 'delete')
      return { ok: false, message: 'Dit item hoort bij de flessen van een recept en kan niet worden verwijderd. Haal het eerst uit dat recept (in Supabase).' };
    if(code === '42501' || code === 'PGRST301' || /jwt/i.test(text) || (error && (error.status === 401 || error.status === 403)))
      return NO_ROWS;
    return { ok: false, message: 'Opslaan mislukt: ' + text };
  }

  /* alleen deze kolommen gaan naar de database; alles wat de pagina nog meer meegeeft, wordt genegeerd */
  const FIELDS = ['name', 'category_id', 'serving', 'keyword', 'aliases', 'note', 'optional', 'zero_proof', 'to_confirm', 'in_stock', 'sort_order', 'barcode'];
  const pick = o => Object.fromEntries(FIELDS.filter(k => k in o).map(k => [k, o[k]]));

  window.kelderAdmin = {
    available: !!sb,

    /* is er een geldige sessie van een beheerder? (bij het openen van de pagina) */
    async current(){
      if(!sb) return false;
      const { data } = await sb.auth.getSession();
      if(!data.session) return false;
      if(await isAdmin()) return true;
      await sb.auth.signOut();
      return false;
    },

    async signIn(email, password){
      if(!sb) return NO_SB;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if(error){
        if(error.status === 429) return { ok: false, message: 'Te veel pogingen. Probeer het over een paar minuten opnieuw.' };
        if(error.status === 400) return { ok: false, message: 'Onjuist e-mailadres of wachtwoord.' };
        return { ok: false, message: 'Inloggen mislukt: ' + error.message };
      }
      if(!(await isAdmin())){
        await sb.auth.signOut();
        return { ok: false, message: 'Dit account is geen beheerder.' };
      }
      return { ok: true };
    },

    async signOut(){
      if(sb) await sb.auth.signOut();
    },

    /* het e-mailadres van de ingelogde gebruiker, voor "ingelogd als …" (null als er geen sessie is) */
    async email(){
      if(!sb) return null;
      const { data } = await sb.auth.getSession();
      return data.session && data.session.user ? (data.session.user.email || null) : null;
    },

    /* één item op voorraad of op zetten */
    async setInStock(id, inStock){
      if(!sb) return NO_SB;
      const { data, error } = await sb.from('items').update({ in_stock: inStock }).eq('id', id).select('id');
      if(error) return problem(error, 'update');
      return data && data.length === 1 ? { ok: true } : NO_ROWS;
    },

    /* meerdere items tegelijk (bijv. alles weer op voorraad na het boodschappen doen) */
    async setManyInStock(ids, inStock){
      if(!sb) return NO_SB;
      if(!ids.length) return { ok: true };
      const { data, error } = await sb.from('items').update({ in_stock: inStock }).in('id', ids).select('id');
      if(error) return problem(error, 'update');
      if(!data || !data.length) return NO_ROWS;
      if(data.length !== ids.length) return { ok: false, message: `Maar ${data.length} van de ${ids.length} items zijn opgeslagen. Laad de pagina opnieuw en probeer het nog eens.` };
      return { ok: true };
    },

    /* een cocktail of mocktail wel of niet op het menu zetten (recipes.on_menu); de pagina's met alle recepten blijven ze tonen */
    async setRecipeOnMenu(id, onMenu){
      if(!sb) return NO_SB;
      const { data, error } = await sb.from('recipes').update({ on_menu: onMenu }).eq('id', id).select('id');
      if(error) return problem(error, 'update');
      return data && data.length === 1 ? { ok: true } : NO_ROWS;
    },

    /* een item toevoegen (id = null) of wijzigen */
    async saveItem(id, fields){
      if(!sb) return NO_SB;
      const q = id == null
        ? sb.from('items').insert(pick(fields))
        : sb.from('items').update(pick(fields)).eq('id', id);
      const { data, error } = await q.select();
      if(error) return problem(error, 'save');
      return data && data.length === 1 ? { ok: true, row: data[0] } : NO_ROWS;
    },

    /* een item verwijderen; lukt niet als het in een recept wordt gebruikt (de database bewaakt dat) */
    async deleteItem(id){
      if(!sb) return NO_SB;
      const { data, error } = await sb.from('items').delete().eq('id', id).select('id');
      if(error) return problem(error, 'delete');
      return data && data.length === 1 ? { ok: true } : NO_ROWS;
    }
  };
})();
