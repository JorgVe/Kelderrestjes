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
  const UPLOAD_MS = 60 * 1000, ANALYZE_MS = 120 * 1000, APPLY_MS = 30 * 1000, LIST_MS = 20 * 1000, PAIR_MS = 90 * 1000;   // hoe lang de site wacht op de upload van een foto, op de herkenning, op het bijwerken van de voorraad, op de lijst met eerdere foto's, op de wijnsuggesties en op nieuwe receptvoorstellen
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
  const FIELDS = ['name', 'category_id', 'serving', 'note', 'zero_proof', 'in_stock', 'quantity', 'in_cocktails', 'abv', 'sort_order', 'barcode', 'aliases'];
  const pick = o => Object.fromEntries(FIELDS.filter(k => k in o).map(k => [k, o[k]]));
  /* de kolommen van `wines` (één rij per item) die de site beheert: soort, druif, regio en volgorde (de notitie is die van het item) */
  const WINE_FIELDS = ['kind', 'grape', 'region', 'sort_order'];
  const pickWine = o => Object.fromEntries(WINE_FIELDS.filter(k => k in o).map(k => [k, o[k]]));

  /* ---- de etiketfoto van een wijn (wines.label_path en de publieke bucket wine-labels, zie migratie 0029) ----
     Alleen via saveWineLabel, saveWineLabelFromScan en clearWineLabel: saveWine raakt label_path niet aan (een wijn opslaan in het
     bewerkvenster laat de foto dus staan). Elke foto krijgt een nieuw pad, "<item-id>/<tijd in ms>-<code>.jpg"; de foto die ze vervangt
     wordt daarna uit de bucket gehaald (lukt dat niet, dan blijft er een ongebruikt bestand liggen en gaat er verder niets mis). */
  const LABELS = 'wine-labels', LABEL_SIDE = 1600, LABEL_MAX_BYTES = 5 * 1024 * 1024, IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const NEEDS_0029 = { ok: false, missing: true, message: 'De database kent nog geen etiketfoto\'s: draai eerst migratie 0029 (supabase/migrations).' };

  /* een fout van Supabase Storage → een melding; what = "Uploaden", "Ophalen" */
  function storageProblem(e, what){
    const text = (e && e.message) || '', status = Number(e && (e.statusCode || e.status));
    if(status === 401 || status === 403 || /row-level security|unauthorized|jwt/i.test(text))
      return { ok: false, relogin: true, message: `${what} mislukt: geen rechten of de sessie is verlopen. Log opnieuw in.` };
    if(/bucket not found/i.test(text)) return NEEDS_0029;
    if(status === 413 || /too large|exceeded|size/i.test(text)) return { ok: false, message: 'De foto is te groot (hoogstens 5 MB).' };
    if(/mime|type/i.test(text)) return { ok: false, message: 'Dit bestandstype kan niet worden bewaard. Gebruik een JPEG-, PNG- of WebP-foto.' };
    return { ok: false, message: `${what} mislukt: ${text}` };
  }

  /* een foto verkleinen tot hoogstens maxSide px aan de lange kant en opslaan als JPEG (de stand van de foto, EXIF, blijft kloppen).
     Lukt dat niet, dan gaat het origineel mee, als het een toegestaan type is en klein genoeg. Geeft { ok: true, blob } of { ok: false, message }. */
  async function shrinkImage(file, maxSide = LABEL_SIDE, quality = 0.85){
    try{
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);                        // een PNG met doorzichtige delen wordt anders zwart
      g.drawImage(bmp, 0, 0, w, h);
      if(bmp.close) bmp.close();
      const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', quality));
      if(blob) return { ok: true, blob };
    }catch(e){ /* val terug op het origineel */ }
    if(!file || !IMAGE_TYPES.includes(file.type)) return { ok: false, message: 'Deze foto kan niet worden gelezen. Gebruik een JPEG-, PNG- of WebP-foto.' };
    if(file.size > LABEL_MAX_BYTES) return { ok: false, message: 'De foto is te groot (hoogstens 5 MB).' };
    return { ok: true, blob: file };
  }

  /* het pad in `wines` zetten (null = geen foto) */
  async function setLabelPath(itemId, path){
    const { data, error } = await sb.from('wines').update({ label_path: path }).eq('item_id', itemId).select('id');
    if(error){
      if(error.code === '42703' || error.code === 'PGRST204' || /label_path/i.test(error.message || '')) return NEEDS_0029;
      return problem(error, 'save');
    }
    return data && data.length === 1 ? { ok: true } : NO_ROWS;
  }
  /* een bestand uit de bucket halen; mislukt dat, dan is dat niet erg (het blijft dan ongebruikt liggen) */
  async function dropLabelFile(path){
    if(!path) return false;
    try{ const r = await within(sb.storage.from(LABELS).remove([path]), LIST_MS); return !r.timedOut && !r.error; }
    catch(e){ return false; }
  }
  /* blob uploaden, het pad bij de wijn zetten en de vorige foto weghalen. Geeft { ok: true, path } of { ok: false, message, relogin?, missing? }. */
  async function saveLabel(itemId, blob, oldPath){
    if(!sb) return NO_SB;
    if(!Number.isInteger(itemId)) return { ok: false, message: 'Deze wijn is nog niet opgeslagen.' };
    if(!blob) return { ok: false, message: 'Er is geen foto gekozen.' };
    if(!IMAGE_TYPES.includes(blob.type)) return { ok: false, message: 'Dit bestandstype kan niet worden bewaard. Gebruik een JPEG-, PNG- of WebP-foto.' };
    if(blob.size > LABEL_MAX_BYTES) return { ok: false, message: 'De foto is te groot (hoogstens 5 MB).' };
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${itemId}/${Date.now()}-${Math.random().toString(36).slice(2, 10) || 'x'}.${ext}`;
    const up = await within(sb.storage.from(LABELS).upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: '31536000' }), UPLOAD_MS);
    if(up.timedOut) return { ok: false, message: 'De foto uploaden duurde te lang. Controleer je verbinding en probeer het opnieuw.' };
    if(up.error) return storageProblem(up.error, 'Uploaden');
    const set = await setLabelPath(itemId, path);
    if(!set.ok){ await dropLabelFile(path); return set; }                   // het pad kon niet worden gezet: de net geüploade foto weer weghalen
    if(oldPath && oldPath !== path) await dropLabelFile(oldPath);
    return { ok: true, path };
  }

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

    /* Na een scan onthouden hoe een fles op de foto stond, zodat hij de volgende keer vanzelf wordt herkend: andere namen (items.aliases)
       en/of een barcode toevoegen aan een bestaand item. add: { aliases?: [tekst], barcode?: tekst }.
       Leest eerst de huidige waarden (zodat een wijziging van elders niet verloren gaat). Een naam die er al staat wordt niet nog eens
       toegevoegd, en een barcode wordt alleen gezet als het item er nog geen heeft.
       Geeft terug: { ok: true, row (de nieuwe rij, of null als er niets te doen was), added: { aliases: [..], barcode: bool } }
       of { ok: false, message, relogin? }. */
    async learnItem(id, add){
      if(!sb) return NO_SB;
      const cur = await within(sb.from('items').select('aliases,barcode').eq('id', id).maybeSingle(), APPLY_MS);
      if(cur.timedOut) return { ok: false, message: 'Onthouden duurde te lang.' };
      if(cur.error) return problem(cur.error, 'update');
      if(!cur.data) return { ok: false, message: 'Dit item bestaat niet meer.' };
      const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const list = Array.isArray(cur.data.aliases) ? cur.data.aliases.slice() : [];
      const added = { aliases: [], barcode: false }, patch = {};
      for(const raw of (add && add.aliases) || []){
        const a = String(raw || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
        if(a && !list.some(x => norm(x) === norm(a))){ list.push(a); added.aliases.push(a); }
      }
      if(added.aliases.length) patch.aliases = list;
      if(add && add.barcode && !cur.data.barcode){ patch.barcode = String(add.barcode).trim(); added.barcode = true; }
      if(!Object.keys(patch).length) return { ok: true, row: null, added };
      const res = await within(sb.from('items').update(patch).eq('id', id).select(), APPLY_MS);
      if(res.timedOut) return { ok: false, message: 'Onthouden duurde te lang.' };
      if(res.error) return problem(res.error, 'save');
      return res.data && res.data.length === 1 ? { ok: true, row: res.data[0], added } : NO_ROWS;
    },

    /* de wijngegevens van een item (de rij in `wines`, één per item) toevoegen of wijzigen */
    async saveWine(itemId, fields){
      if(!sb) return NO_SB;
      const { data, error } = await sb.from('wines').upsert({ item_id: itemId, ...pickWine(fields) }, { onConflict: 'item_id' }).select();
      if(error) return problem(error, 'save');
      return data && data.length === 1 ? { ok: true, row: data[0] } : NO_ROWS;
    },

    /* De etiketfoto van een wijn bewaren (de wijn moet al in `wines` staan). file: de gekozen foto, of een Blob; hij wordt eerst verkleind
       (hoogstens 1600 px, JPEG). oldPath: het huidige label_path van de wijn, dat daarna uit de bucket verdwijnt.
       Geeft { ok: true, path } (het nieuwe label_path) of { ok: false, message, relogin?, missing? (migratie 0029 ontbreekt) }. */
    shrinkImage,
    async saveWineLabel(itemId, file, oldPath){
      if(!sb) return NO_SB;
      const small = await shrinkImage(file);
      if(!small.ok) return small;
      return saveLabel(itemId, small.blob, oldPath);
    },

    /* Dezelfde foto, maar uit Scan foto: de foto staat al in de privébucket bottle-scans (scanPath). Ze wordt opgehaald, verkleind en
       als etiketfoto in de publieke bucket gezet; het origineel blijft in bottle-scans staan. */
    async saveWineLabelFromScan(itemId, scanPath, oldPath){
      if(!sb) return NO_SB;
      if(!scanPath) return { ok: false, message: 'De foto van de scan is niet meer te vinden.' };
      const dl = await within(sb.storage.from('bottle-scans').download(scanPath), UPLOAD_MS);
      if(dl.timedOut) return { ok: false, message: 'De scanfoto ophalen duurde te lang. Probeer het opnieuw.' };
      if(dl.error || !dl.data) return storageProblem(dl.error, 'De scanfoto ophalen');
      const small = await shrinkImage(dl.data);
      if(!small.ok) return small;
      return saveLabel(itemId, small.blob, oldPath);
    },

    /* de etiketfoto van een wijn weghalen (uit de wijn en uit de bucket); oldPath = het huidige label_path */
    async clearWineLabel(itemId, oldPath){
      if(!sb) return NO_SB;
      const set = await setLabelPath(itemId, null);
      if(!set.ok) return set;
      await dropLabelFile(oldPath);
      return { ok: true };
    },

    /* alleen het bestand uit de bucket halen, voor een wijn die zelf verdwijnt (de rij is dan al weg); mislukt het, dan blijft het liggen */
    async removeLabelFile(path){
      if(!sb) return false;
      return dropLabelFile(path);
    },

    /* de wijngegevens van een item verwijderen (het item zelf blijft staan) */
    async deleteWine(itemId){
      if(!sb) return NO_SB;
      const { data, error } = await sb.from('wines').delete().eq('item_id', itemId).select('id');
      if(error) return problem(error, 'delete');
      return data && data.length === 1 ? { ok: true } : NO_ROWS;
    },

    /* een beoordeling verwijderen (tabel reviews, migratie 0030): alleen een beheerder mag dat, de database bewaakt het */
    async deleteReview(id){
      if(!sb) return NO_SB;
      const { data, error } = await sb.from('reviews').delete().eq('id', id).select('id');
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
        ['0022', 'Alcoholpercentage', sb.from('items').select('abv').limit(1)],
        ['0029', 'Etiketfoto bij wijn', sb.from('wines').select('label_path').limit(1)],
        ['0030', 'Beoordelingen en recepten van gasten', sb.from('reviews').select('id').limit(1)],
        /* de tabel van de limiet (suggestion_log) is niet leesbaar voor de site; de migratie zet ook de instelling suggest_enabled, die wel */
        ['0028', 'Limiet voor Help me kiezen', sb.from('settings').select('key').eq('key', 'suggest_enabled'), r => Array.isArray(r.data) && r.data.length > 0]
      ];
      const res = await Promise.all(probes.map(p => p[2]));
      return { ok: true, rows: probes.map((p, i) => ({ migration: p[0], label: p[1], present: !res[i].error && (!p[3] || p[3](res[i])) })) };
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

    /* De eerder geüploade foto's van Scan foto, de nieuwste eerst, om er een opnieuw te laten lezen (analyzePhoto met dat pad: de foto
       hoeft dan niet opnieuw te worden geüpload). De bucket bottle-scans bewaart ze als <datum>/<tijd in ms>-<code>.jpg; alleen beheerders
       mogen ze lezen. limit: hoeveel foto's (standaard 8).
       Geeft terug: { ok: true, photos: [{ path, takenAt (ms of null), bytes (of null), url (10 minuten geldig, om te tonen) }] }
       of { ok: false, message, relogin? }. */
    async recentPhotos(limit = 8){
      if(!sb) return NO_SB;
      const store = sb.storage.from('bottle-scans');
      const fail = e => {
        const text = (e && e.message) || '', status = Number(e && (e.statusCode || e.status));
        if(status === 401 || status === 403 || /row-level security|unauthorized|jwt/i.test(text))
          return { ok: false, relogin: true, message: 'Geen rechten of de sessie is verlopen. Log opnieuw in.' };
        return { ok: false, message: 'De eerdere foto\'s ophalen is mislukt: ' + text };
      };
      const BY_NAME_DESC = { limit: 100, sortBy: { column: 'name', order: 'desc' } };
      const top = await within(store.list('', BY_NAME_DESC), LIST_MS);
      if(top.timedOut) return { ok: false, message: 'De eerdere foto\'s ophalen duurde te lang. Probeer het opnieuw.' };
      if(top.error) return fail(top.error);
      const days = (top.data || []).filter(e => !e.id && /^\d{4}-\d{2}-\d{2}$/.test(e.name)).map(e => e.name).sort().reverse();   // mappen hebben geen id
      const found = [];
      for(const day of days){
        if(found.length >= limit) break;
        const res = await within(store.list(day, BY_NAME_DESC), LIST_MS);
        if(res.timedOut) return { ok: false, message: 'De eerdere foto\'s ophalen duurde te lang. Probeer het opnieuw.' };
        if(res.error) return fail(res.error);
        for(const f of res.data || []){
          if(!f.id || !/\.(jpe?g|png|webp)$/i.test(f.name)) continue;
          const ms = Number(f.name.split('-')[0]);
          found.push({ path: `${day}/${f.name}`, takenAt: ms > 1e12 ? ms : (Date.parse(f.created_at) || null), bytes: f.metadata && Number.isFinite(f.metadata.size) ? f.metadata.size : null });
        }
      }
      found.sort((a, b) => (a.path < b.path ? 1 : -1));                  // nieuwste eerst (de tijd in de naam sorteert binnen een dag)
      const pick = found.slice(0, limit);
      if(!pick.length) return { ok: true, photos: [] };
      const signed = await within(store.createSignedUrls(pick.map(p => p.path), 600), LIST_MS);
      if(signed.timedOut) return { ok: false, message: 'De eerdere foto\'s ophalen duurde te lang. Probeer het opnieuw.' };
      if(signed.error) return fail(signed.error);
      const urls = new Map((signed.data || []).filter(x => x && x.signedUrl && !x.error).map(x => [x.path, x.signedUrl]));
      return { ok: true, photos: pick.filter(p => urls.has(p.path)).map(p => ({ ...p, url: urls.get(p.path) })) };
    },

    /* Een foto van flessen laten lezen door de Supabase Edge Function analyze-bottles. De foto gaat eerst naar de privébucket
       bottle-scans (alleen beheerders mogen erin schrijven en lezen); daarna krijgt de functie het pad en eventueel uitleg.
       De functie schrijft niets: ze geeft een concept terug, een regel per fles, ook als een deel ontbreekt (geen aantal, geen
       passend item). De beheerder vult dat aan op de site en bevestigt; pas dan past applyScan de voorraad aan.
       blob: de foto (image/jpeg, png of webp, hoogstens 10 MB). opts: { info (uitleg voor de herkenning, optioneel),
       path (het pad van een eerdere upload van dezelfde foto: dan wordt er niet opnieuw geüpload) }.
       Geeft terug:
         { ok: true, path, lines: [{ detected: { brand, name, barcode, count, confidence }, item_id, match, candidates: [{ id, name, barcode }],
                                     issues: ['no_count' | 'low_confidence' | 'no_match'], wine }] }
         { ok: false, message, relogin?, path? }  (path: de foto staat al in de bucket) */
    async analyzePhoto(blob, opts = {}){
      if(!sb) return NO_SB;
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
      const body = { image_path: path };
      if(opts.info && opts.info.trim()) body.additional_info = opts.info.trim().slice(0, 1000);
      const reply = await within(sb.functions.invoke('analyze-bottles', { body }), ANALYZE_MS);
      /* de functie schrijft niets, dus na een time-out is er niets veranderd en kan de beheerder het gewoon opnieuw proberen */
      if(reply.timedOut) return { ok: false, path, message: 'De herkenning duurde te lang. Er is niets aangepast; probeer het opnieuw.' };
      const { data, error } = reply;
      if(error){
        let status = error.context && error.context.status, detail = '';
        try{ const b = await error.context.json(); detail = (b && (b.error || b.message)) || ''; }catch(e){}
        if(error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError')
          return { ok: false, path, message: 'Geen verbinding met de scanfunctie. Probeer het zo nog eens.' };
        if(status === 401) return { ok: false, path, relogin: true, message: 'Je sessie is verlopen. Log opnieuw in.' };
        if(status === 403) return { ok: false, path, message: 'De scan is geweigerd: je hebt hier geen rechten voor, of de foto kon niet worden gelezen.' };
        if(status === 404) return { ok: false, path, message: 'De scanfunctie bestaat niet in dit Supabase-project (analyze-bottles).' };
        if(status === 502) return { ok: false, path, message: 'De beeldherkenning is mislukt. Probeer het zo nog eens.' };
        if(status === 503) return { ok: false, path, message: 'De scanfunctie is nog niet klaar: de geheime sleutel ANTHROPIC_API_KEY ontbreekt in Supabase (Edge Functions, Secrets).' };
        return { ok: false, path, message: `Scannen mislukt${status ? ' (' + status + ')' : ''}${detail ? ': ' + detail : '.'}` };
      }
      if(data && data.status === 'draft' && Array.isArray(data.lines)) return { ok: true, path, lines: data.lines };
      return { ok: false, path, message: 'De scanfunctie gaf een antwoord dat de site niet begrijpt.' };
    },

    /* Welke wijn uit de voorraad past het best bij het menu van vandaag? De Supabase Edge Function pair-wine kijkt welke wijnen op voorraad
       zijn, laat Claude per gerecht kiezen en controleert dat antwoord. Ze schrijft niets en is alleen voor beheerders (elke vraag kost geld).
       menu: de tekst van de beheerder (hoogstens 1000 tekens).
       Geeft terug:
         { ok: true, status: 'ok', courses: [{ dish, picks: [{ item_id, name, kind, grape, region, quantity, reason }], note }],
           one_bottle: pick of null (alleen bij meer dan een gang), note: tekst of null }
         { ok: true, status: 'no_wines' }     er staat geen wijn op voorraad (Claude is dan niet gevraagd)
         { ok: false, message, relogin? } */
    async suggestPairing(menu){
      if(!sb) return NO_SB;
      const text = String(menu || '').trim();
      if(text.length < 3) return { ok: false, message: 'Vul in wat er op het menu staat.' };
      const reply = await within(sb.functions.invoke('pair-wine', { body: { menu: text.slice(0, 1000) } }), PAIR_MS);
      if(reply.timedOut) return { ok: false, message: 'Het zoeken duurde te lang. Er is niets aangepast; probeer het opnieuw.' };
      const { data, error } = reply;
      if(error){
        const status = error.context && error.context.status;
        if(error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError')
          return { ok: false, message: 'Geen verbinding met de wijnfunctie. Probeer het zo nog eens.' };
        if(status === 400) return { ok: false, message: 'Vul in wat er op het menu staat.' };
        if(status === 401) return { ok: false, relogin: true, message: 'Je sessie is verlopen. Log opnieuw in.' };
        if(status === 403) return { ok: false, message: 'Alleen beheerders kunnen wijn bij het menu laten zoeken.' };
        if(status === 404) return { ok: false, message: 'De wijnfunctie bestaat niet in dit Supabase-project (pair-wine).' };
        if(status === 502) return { ok: false, message: 'Het zoeken is mislukt. Probeer het zo nog eens.' };
        if(status === 503) return { ok: false, message: 'De wijnfunctie is nog niet klaar: de geheime sleutel ANTHROPIC_API_KEY ontbreekt in Supabase (Edge Functions, Secrets).' };
        return { ok: false, message: `Zoeken mislukt${status ? ' (' + status + ')' : ''}.` };
      }
      if(data && data.status === 'no_wines') return { ok: true, status: 'no_wines' };
      if(data && data.status === 'ok' && Array.isArray(data.courses)) return { ok: true, ...data };
      return { ok: false, message: 'De wijnfunctie gaf een antwoord dat de site niet begrijpt.' };
    },

    /* De voorraad aanpassen met wat de beheerder na een scan heeft bevestigd, in één keer en in één transactie (de database-functie
       apply_bottle_scan_stock, alleen voor beheerders; per regel een eigen stand sinds migratie 0027). Alleen voor items die al bestaan:
       een nieuwe fles maakt de pagina eerst aan (kelderItemDialog.createItem).
       updates: [{ item_id, count (1 t/m 999), mode ('add' = erbij, 'set' = wordt het aantal; standaard 'add'), wine_grape?, wine_region?,
       wine_alcohol?, wine_note? }], een item hoogstens één keer. Bij wijn worden alleen lege velden aangevuld.
       Geeft terug: { ok: true, results: [{ item_id, quantity }] } of { ok: false, message, relogin?, timedOut? }.
       Na timedOut kan de voorraad al zijn aangepast: dan niet zomaar opnieuw proberen. */
    async applyScan(updates){
      if(!sb) return NO_SB;
      const list = Array.isArray(updates) ? updates : [];
      const seen = new Set();
      const bad = list.some(u => !u || !Number.isInteger(u.item_id) || !Number.isInteger(u.count) || u.count < 1 || u.count > 999 || seen.has(u.item_id) || !seen.add(u.item_id));
      if(!list.length || bad) return { ok: false, message: 'Er is niets om bij te werken, of een aantal of fles klopt niet.' };
      const rows = list.map(u => ({
        item_id: u.item_id, count: u.count, mode: u.mode === 'set' ? 'set' : 'add',
        wine_grape: u.wine_grape || null, wine_region: u.wine_region || null, wine_alcohol: u.wine_alcohol || null, wine_note: u.wine_note || null
      }));
      const reply = await within(sb.rpc('apply_bottle_scan_stock', { p_updates: rows, p_mode: 'add' }), APPLY_MS);
      if(reply.timedOut) return { ok: false, timedOut: true, message: 'Het bijwerken duurde te lang. Controleer eerst de voorraad: misschien is het toch gelukt. Zo niet, scan dan opnieuw.' };
      if(reply.error) return problem(reply.error, 'scan');
      return { ok: true, results: Array.isArray(reply.data) ? reply.data : [] };
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
