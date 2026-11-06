/* Beheerder: inloggen met Supabase Auth en de voorraad beheren (de tabel `items`: dranken en ingrediënten).
   Alleen voorraad.html laadt dit bestand.

   Veiligheid zit in de database, niet in deze code: schrijven mag alleen een ingelogde gebruiker die in de tabel
   `admins` staat (Row Level Security, zie supabase/migrations/0001_init.sql). Deze code toont alleen de knoppen;
   wie ze omzeilt, krijgt van Supabase gewoon "geen rechten".

   - Er is een aparte client voor de beheerder, met een eigen opslagsleutel. De client voor bezoekers
     (supabase-client.js) blijft anoniem en bewaart geen sessie.
   - De sessie staat in sessionStorage: ze verdwijnt als je het tabblad sluit.
   - Hier staat alleen de publishable key. De secret/service_role key hoort nooit in de site.
   - Recepten en receptregels beheer je hier bewust niet; dat doe je in Supabase zelf. */
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
  const UPLOAD_MS = 60 * 1000, SCAN_MS = 155 * 1000;           // hoe lang de site op de upload van een foto en op de scanfunctie wacht
  /* wacht hoogstens ms op een belofte; duurt het langer, dan komt er { timedOut: true } (de aanvraag zelf wordt niet afgebroken) */
  const within = (promise, ms) => {
    let timer;
    const late = new Promise(ok => { timer = setTimeout(() => ok({ timedOut: true }), ms); });
    return Promise.race([promise, late]).finally(() => clearTimeout(timer));
  };
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
      return { ok: false, message: 'Dit item wordt in een recept gebruikt en kan niet worden verwijderd. Haal het eerst uit dat recept.' };
    if(code === '42501' || code === 'PGRST301' || /jwt/i.test(text) || (error && (error.status === 401 || error.status === 403)))
      return NO_ROWS;
    return { ok: false, message: 'Opslaan mislukt: ' + text };
  }

  /* alleen deze kolommen gaan naar de database; alles wat de pagina nog meer meegeeft, wordt genegeerd */
  const FIELDS = ['name', 'category_id', 'serving', 'note', 'zero_proof', 'in_stock', 'quantity', 'in_cocktails', 'abv', 'sort_order', 'barcode'];
  const pick = o => Object.fromEntries(FIELDS.filter(k => k in o).map(k => [k, o[k]]));
  /* de kolommen van `wines` (één rij per item) die de site beheert: soort, druif, regio en volgorde (de notitie is die van het item) */
  const WINE_FIELDS = ['kind', 'grape', 'region', 'sort_order'];
  const pickWine = o => Object.fromEntries(WINE_FIELDS.filter(k => k in o).map(k => [k, o[k]]));

  /* Voorraad en aantal (items.in_stock en items.quantity) horen bij elkaar:
       de schakelaar op "op"           → aantal 0
       de schakelaar op "op voorraad"  → aantal 1 als het 0 was; anders blijft het aantal zoals het is
       een aantal van 0                → op; 1 of meer → op voorraad
       een leeg aantal (null) is onbekend en verandert niets aan de schakelaar
     change = { inStock: boolean } of { quantity: geheel getal of null }; geeft terug wat er in de database moet komen. */
  function stockPatch(item, change){
    if('inStock' in change){
      if(!change.inStock) return { in_stock: false, quantity: 0 };
      return item.quantity === 0 ? { in_stock: true, quantity: 1 } : { in_stock: true };
    }
    const q = change.quantity;
    return q === null ? { quantity: null } : { quantity: q, in_stock: q > 0 };
  }

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

    /* De voorraad van één of meer items wijzigen: op voorraad of op zetten, of een aantal invullen (zie stockPatch). Items die
       hetzelfde krijgen gaan in één verzoek. Bij succes: { ok: true, patches: Map(id → wat is opgeslagen) }. */
    stockPatch,
    async setStock(items, change){
      if(!sb) return NO_SB;
      if(!items.length) return { ok: true, patches: new Map() };
      const groups = new Map();
      for(const it of items){
        const patch = stockPatch(it, change), key = JSON.stringify(patch);
        if(!groups.has(key)) groups.set(key, { patch, ids: [] });
        groups.get(key).ids.push(it.id);
      }
      const patches = new Map();
      let saved = 0;
      for(const { patch, ids } of groups.values()){
        const { data, error } = await sb.from('items').update(patch).in('id', ids).select('id');
        if(error) return problem(error, 'update');
        if(!data || !data.length) return NO_ROWS;
        saved += data.length;
        ids.forEach(id => patches.set(id, patch));
      }
      if(saved !== items.length) return { ok: false, message: `Maar ${saved} van de ${items.length} items zijn opgeslagen. Laad de pagina opnieuw en probeer het nog eens.` };
      return { ok: true, patches };
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

    /* de wijngegevens van een item (de rij in `wines`, één per item) toevoegen of wijzigen */
    async saveWine(itemId, fields){
      if(!sb) return NO_SB;
      const { data, error } = await sb.from('wines').upsert({ item_id: itemId, ...pickWine(fields) }, { onConflict: 'item_id' }).select();
      if(error) return problem(error, 'save');
      return data && data.length === 1 ? { ok: true, row: data[0] } : NO_ROWS;
    },

    /* de wijngegevens van een item verwijderen (het item zelf blijft staan) */
    async deleteWine(itemId){
      if(!sb) return NO_SB;
      const { data, error } = await sb.from('wines').delete().eq('item_id', itemId).select('id');
      if(error) return problem(error, 'delete');
      return data && data.length === 1 ? { ok: true } : NO_ROWS;
    },

    /* een cocktail of mocktail opslaan (nieuw of wijzigen), samen met zijn receptregels en de koppelingen met items, in één transactie
       (de database-functie save_recipe, zie 0019). payload = { id?, kind, name, style, blurb, method, url, on_menu, lines: [{ amount,
       ingredient, items: [item_id] }] }. Bij succes: { ok: true, id }. */
    async saveRecipe(payload){
      if(!sb) return NO_SB;
      const { data, error } = await sb.rpc('save_recipe', { p: payload });
      if(error){
        if(error.code === '23505') return { ok: false, message: 'Er bestaat al een recept met deze naam.' };
        return problem(error, 'save');
      }
      return { ok: true, id: data };
    },

    /* een recept verwijderen; zijn regels en koppelingen gaan mee (on delete cascade) */
    async deleteRecipe(id){
      if(!sb) return NO_SB;
      const { data, error } = await sb.from('recipes').delete().eq('id', id).select('id');
      if(error) return problem(error, 'delete');
      return data && data.length === 1 ? { ok: true } : NO_ROWS;
    },

    /* een instelling van de site (tabel `settings`, zie 0021): sleutel en waarde (json) */
    async saveSetting(key, value){
      if(!sb) return NO_SB;
      const { data, error } = await sb.from('settings').upsert({ key, value }, { onConflict: 'key' }).select();
      if(error) return problem(error, 'save');
      return data && data.length === 1 ? { ok: true } : NO_ROWS;
    },

    /* tellingen en grootte van de database, alleen voor een beheerder (de database-functie admin_stats, zie 0021) */
    async adminStats(){
      if(!sb) return NO_SB;
      const { data, error } = await sb.rpc('admin_stats');
      if(error) return { ok: false, missing: error.code === 'PGRST202', message: error.message };
      return { ok: true, stats: data };
    },

    /* welke databasemigraties zijn toegepast? Per migratie een lichte vraag; mislukt die, dan mist de kolom of tabel nog (voor admin.html) */
    async schemaStatus(){
      if(!sb) return NO_SB;
      const probes = [
        ['0016', 'Aantal op voorraad per item', sb.from('items').select('quantity').limit(1)],
        ['0018', 'Gebruiken in cocktails', sb.from('items').select('in_cocktails').limit(1)],
        ['0019', 'Receptregels gekoppeld aan items', sb.from('recipe_line_items').select('line_id').limit(1)],
        ['0021', 'Instellingen en tellingen', sb.from('settings').select('key').limit(1)],
        ['0022', 'Alcoholpercentage', sb.from('items').select('abv').limit(1)]
      ];
      const res = await Promise.all(probes.map(p => p[2]));
      return { ok: true, rows: probes.map((p, i) => ({ migration: p[0], label: p[1], present: !res[i].error })) };
    },

    /* wie is ingelogd en tot wanneer geldt de sessie (voor admin.html); null zonder sessie */
    async sessionInfo(){
      if(!sb) return null;
      const { data } = await sb.auth.getSession();
      const s = data.session;
      return s ? { email: (s.user && s.user.email) || null, expiresAt: s.expires_at ? new Date(s.expires_at * 1000) : null } : null;
    },

    /* de instellingen uit de tabel settings (zie 0021); { ok: false, missing: true } als de tabel er nog niet is */
    async settings(){
      if(!sb) return NO_SB;
      const { data, error } = await sb.from('settings').select('key,value');
      if(error) return { ok: false, missing: true, message: error.message };
      return { ok: true, rows: data };
    },

    /* de verbindingsgegevens van de site (publiek: dezelfde als in js/supabase-config.js) */
    connection(){
      const url = cfg.url || '';
      let ref = '';
      try{ ref = new URL(url).hostname.split('.')[0]; }catch(e){}
      return { url, ref, key: cfg.publishableKey || '' };
    },

    /* een item verwijderen samen met zijn koppelingen en de recepten die niet zonder kunnen (de database-functie remove_item, zie 0025).
       execute = false: alleen het plan (welke recepten verdwijnen, welke blijven zonder het item); true: echt verwijderen.
       Bij succes: { ok: true, plan: { item, executed, recipes_removed: [{ id, name, kind }], recipes_changed: [...] } }.
       Is de functie er nog niet (migratie 0025), dan { ok: false, missing: true }. */
    async removeItem(id, execute){
      if(!sb) return NO_SB;
      const { data, error } = await sb.rpc('remove_item', { p_id: id, p_execute: !!execute });
      if(error){
        if(error.code === 'PGRST202') return { ok: false, missing: true, message: error.message };
        return problem(error, 'delete');
      }
      return { ok: true, plan: data };
    },

    /* Een foto van flessen laten scannen door de Supabase Edge Function scan-bottles. De foto gaat eerst naar de privébucket
       bottle-scans (alleen beheerders mogen erin schrijven en lezen); daarna krijgt de functie het pad en de stand:
         mode 'add' = het aantal flessen op de foto komt bij de voorraad, 'set' = het aantal op de foto wordt het aantal.
       blob: de foto (image/jpeg, png of webp, hoogstens 10 MB). opts: { mode, info (uitleg voor de herkenning, optioneel),
       path (het pad van een eerdere upload van dezelfde foto: dan wordt er niet opnieuw geüpload) }.
       De functie past nooit een deel van een scan toe: bij twijfel verandert er niets en komen er vragen terug.
       Geeft terug:
         { ok: true, status: 'updated', path, results: [{ item_id, item_name, quantity }] }
         { ok: true, status: 'needs_information', path, question?, unresolved?: [{ detected: { brand, name, barcode, count }, candidates: [{ id, name, barcode }] }] }
         { ok: false, message, relogin?, path? }  (path: de foto staat al in de bucket) */
    async scanBottles(blob, opts = {}){
      if(!sb) return NO_SB;
      const mode = opts.mode === 'set' ? 'set' : 'add';
      let path = opts.path || '';
      if(!path){
        if(!blob) return { ok: false, message: 'Er is geen foto gekozen.' };
        const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
        path = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
        const up = await within(sb.storage.from('bottle-scans').upload(path, blob, { contentType: blob.type, upsert: false }), UPLOAD_MS);
        if(up.timedOut) return { ok: false, message: 'De foto uploaden duurde te lang. Controleer je verbinding en probeer het opnieuw.' };
        if(up.error){
          const text = up.error.message || '', status = Number(up.error.statusCode || up.error.status);
          if(status === 401 || status === 403 || /row-level security|unauthorized|jwt/i.test(text))
            return { ok: false, relogin: true, message: 'Uploaden mislukt: geen rechten of de sessie is verlopen. Log opnieuw in.' };
          if(status === 413 || /too large|exceeded|size/i.test(text))
            return { ok: false, message: 'De foto is te groot (hoogstens 10 MB).' };
          if(/mime|type/i.test(text))
            return { ok: false, message: 'Dit bestandstype kan niet worden gescand. Gebruik een JPEG-, PNG- of WebP-foto.' };
          return { ok: false, message: 'De foto uploaden is mislukt: ' + text };
        }
      }
      const body = { image_path: path, stock_mode: mode };
      if(opts.info && opts.info.trim()) body.additional_info = opts.info.trim().slice(0, 1000);
      const reply = await within(sb.functions.invoke('scan-bottles', { body }), SCAN_MS);
      /* Zo lang wacht de site: langer dan de functie zelf kan draaien (150 s in Supabase), zodat een scan die na het wachten
         nog zou slagen niet bestaat. De voorraad kan dan wel al zijn aangepast: daarom zegt de melding die te controleren. */
      if(reply.timedOut) return { ok: false, path, message: 'De scan duurde te lang. Controleer eerst de voorraad: misschien is de scan toch gelukt. Zo niet, probeer het dan opnieuw.' };
      const { data, error } = reply;
      if(error){
        let status = error.context && error.context.status, detail = '';
        try{ const b = await error.context.json(); detail = (b && (b.error || b.message)) || ''; }catch(e){}
        if(error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError')
          return { ok: false, path, message: 'Geen verbinding met de scanfunctie. Probeer het zo nog eens.' };
        if(status === 401) return { ok: false, path, relogin: true, message: 'Je sessie is verlopen. Log opnieuw in.' };
        if(status === 403) return { ok: false, path, message: 'De scan is geweigerd: je hebt hier geen rechten voor, of de foto kon niet worden gelezen.' };
        if(status === 404) return { ok: false, path, message: 'De scanfunctie bestaat niet in dit Supabase-project (scan-bottles).' };
        if(status === 502) return { ok: false, path, message: 'De beeldherkenning is mislukt. Probeer het zo nog eens.' };
        if(status === 503) return { ok: false, path, message: 'De scanfunctie is nog niet klaar: de geheime sleutel ANTHROPIC_API_KEY ontbreekt in Supabase (Edge Functions, Secrets).' };
        return { ok: false, path, message: `Scannen mislukt${status ? ' (' + status + ')' : ''}${detail ? ': ' + detail : '.'}` };
      }
      if(data && data.status === 'updated' && Array.isArray(data.results)) return { ok: true, status: 'updated', path, mode, results: data.results };
      if(data && data.status === 'needs_information')
        return { ok: true, status: 'needs_information', path, mode, question: data.question, unresolved: Array.isArray(data.unresolved) ? data.unresolved : [] };
      return { ok: false, path, message: 'De scanfunctie gaf een antwoord dat de site niet begrijpt.' };
    },

    /* een item verwijderen; lukt niet als het in een recept wordt gebruikt (de database bewaakt dat; zonder remove_item) */
    async deleteItem(id){
      if(!sb) return NO_SB;
      const { data, error } = await sb.from('items').delete().eq('id', id).select('id');
      if(error) return problem(error, 'delete');
      return data && data.length === 1 ? { ok: true } : NO_ROWS;
    }
  };
})();
