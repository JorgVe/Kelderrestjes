/* Haalt de dranken uit Supabase en zet ze neer als een paar globals voor de paginascripts (stock.js, cards.js, de pagina's zelf):
   slug, WKINDS, G, M, ING, ORDER, OUT, NO_MIX, ABV, SERVING (drink | ingredient | both), R, Z, P, W, itemsOf, SETTINGS, setting,
   recipeUrl (het adres van de pagina van een recept), wineLabelUrl (het adres van een etiketfoto uit wines.label_path). Elke wijn in W heeft ook label: dat adres, of '' zonder foto.
   Een item zonder categorie (category_id leeg) telt als ingrediënt: het werkt in recepten en voorraad, maar staat niet op het menu.
   Elke receptregel is gekoppeld aan items (recipe_line_items, zie 0019): r.lines = [{ id, amount, text, itemIds, items }];
   daar rekent js/stock.js mee. r.s blijft de weergave van de regels: [hoeveelheid, tekst].
   De ruwe rijen (met id) staan er ook, in kelderRows, voor het beheer (voorraad, menu, wijnen).
   Loopt de database achter op de code, dan werkt de loader met de oude kolommen (kelderOldSchema = true); zie hieronder. */

window.slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
window.WKINDS = {Bubbels:"Bubbels", Wit:"Witte wijn", "Rosé":"Rosé", Rood:"Rode wijn"};
/* de eigen pagina van een cocktail of mocktail: recept.html?soort=cocktail&naam=amaretto-sour (zie js/recipe-page.js) */
window.recipeUrl = (kind, name) => 'recept.html?soort=' + (kind === 'mocktail' ? 'mocktail' : 'cocktail') + '&naam=' + window.slug(name);

/* instellingen van de site (tabel settings, zie 0021; de beheerder zet ze op admin.html). Zonder tabel of rij gelden deze standaardwaarden. */
window.SETTING_DEFAULTS = {
  hide_unavailable_recipes: true,     // cocktails en mocktails waarvan een ingrediënt op is, verdwijnen
  show_out_of_stock: false,           // bezoekers zien wat op is niet (aan = wel, doorgestreept)
  show_register_button: true,         // de knop "Registreer als beheerder" voor bezoekers
  menu_show_cocktails: true,          // de cocktails: pagina, lijst op het menu en alle verwijzingen ernaar (uit = weg voor bezoekers)
  menu_show_mocktails: true,          // idem voor de mocktails
  suggest_enabled: true,              // de knop "Help me kiezen" voor bezoekers op de cocktail- en mocktailpagina (migratie 0028)
  guest_add_enabled: true,            // een bezoeker mag een nieuw verzonnen recept op het menu zetten (migratie 0030)
  reviews_enabled: true,              // bezoekers mogen een beoordeling achterlaten (migratie 0030)
  notice_enabled: false,              // een mededeling bovenaan elke pagina
  notice_text: ''
};

window.kelderLoadData = async function(){
  const sb = window.kelderSb;
  if(!window.kelderConfigured) throw new Error('Supabase is nog niet ingesteld: vul js/supabase-config.js in.');
  if(!sb) throw new Error('supabase-js is niet geladen (geblokkeerd of offline?).');

  /* De kolommen en tabellen die de site vraagt. Loopt de database achter op de code (de migraties in supabase/migrations zijn nog
     niet gedraaid), dan geeft de eerste vraag een foutmelding; dan vragen we de oude kolommen en koppelen we receptregels op
     tekst, zoals vroeger, zodat de site blijft werken. window.kelderOldSchema is dan true; de functies die de nieuwe kolommen of
     tabellen nodig hebben (recepten bewerken, instellingen, alcoholpercentage) werken pas na de migraties. */
  const SELECT = {
    cats:    'id,label,kind,alcoholic,show_alcohol,sort_order',
    items:   'id,category_id,name,note,zero_proof,in_stock,quantity,in_cocktails,abv,serving,sort_order,barcode',
    recipes: 'id,on_menu,kind,name,style,blurb,method,url,recipe_bottles(sort_order,items(name)),recipe_lines(id,sort_order,amount,ingredient,recipe_line_items(item_id,items(name)))'
  };
  const SELECT_OLD = {
    cats:    'id,label,kind,alcoholic,sort_order',
    items:   'id,category_id,name,keyword,aliases,note,zero_proof,in_stock,quantity,in_cocktails,serving,sort_order,barcode',
    recipes: 'id,on_menu,kind,name,style,blurb,method,url,recipe_bottles(sort_order,items(name)),recipe_lines(id,sort_order,amount,ingredient)'
  };
  const WINE_COLS = 'id,item_id,kind,grape,region,sort_order,items(name,note)';
  const ask = sel => Promise.all([
    sb.from('categories').select(sel.cats).order('sort_order'),
    sb.from('items').select(sel.items).order('sort_order'),
    sb.from('recipes').select(sel.recipes).order('sort_order'),
    sb.from('wines').select(WINE_COLS + ',label_path').order('sort_order'),
    sb.from('settings').select('key,value')
  ]);
  let [cats, items, recipes, wines, settings] = await ask(SELECT);
  let oldSchema = false;
  if([cats, items, recipes].some(r => r.error)){
    [cats, items, recipes, wines, settings] = await ask(SELECT_OLD);
    oldSchema = true;
    console.warn('De database mist de nieuwste kolommen of tabellen (zie supabase/migrations); de site werkt met de oude indeling.');
  }
  /* de kolom label_path (etiketfoto, migratie 0029) kan ontbreken: dan vragen we de wijnen zonder, en zijn de etiketfoto's er nog niet.
     Dat staat los van kelderOldSchema: de rest van de site werkt gewoon met de nieuwe kolommen. */
  let labelColumn = true;
  if(wines.error){
    wines = await sb.from('wines').select(WINE_COLS).order('sort_order');
    labelColumn = false;
  }
  for(const r of [cats, items, recipes, wines]) if(r.error) throw new Error(r.error.message);

  /* instellingen: ontbreekt de tabel of mislukt het lezen, dan werkt de site gewoon met de standaardwaarden */
  const SETTINGS = Object.assign({}, window.SETTING_DEFAULTS);
  if(!settings.error) for(const s of settings.data) if(s.key in SETTINGS) SETTINGS[s.key] = s.value;

  /* dranken: flessen (G), overige dranken (M), ingrediënten (ING), uitverkocht (OUT) */
  const catById = new Map(cats.data.map(c => [c.id, c]));
  const G = {}, M = {}, ING = [], OUT = [], NO_MIX = [], ABV = {}, SERVING = {};
  for(const c of cats.data){
    if(c.kind === 'bottle') G[c.label] = [];
    else if(c.kind === 'drink') M[c.label] = [];
  }
  for(const it of items.data){
    const c = catById.get(it.category_id);                     // undefined: geen categorie
    if(!it.in_stock) OUT.push(it.name);
    if(it.in_cocktails === false) NO_MIX.push(it.name);          // uitgeschakeld voor cocktails en mocktails
    if(it.abv != null && c && c.show_alcohol) ABV[it.name] = Number(it.abv);      // alcoholpercentage: bier en sterkere drank
    SERVING[it.name] = it.serving;
    if(c && c.kind === 'bottle'){ G[c.label].push(it.name); continue; }
    const o = {n: it.name};
    /* "0%" alleen bij drank met alcohol (bier 0.0); frisdrank, koffie en melk zijn altijd alcoholvrij (categories.alcoholic
       is false), dus daar tonen we het nooit, ook niet als de vlag per ongeluk aanstaat */
    if(it.zero_proof && c && c.alcoholic) o.z = 1;
    if(it.note) o.note = it.note;
    (c && c.kind === 'drink' ? M[c.label] : ING).push(o);
  }
  const ORDER = cats.data.filter(c => c.kind !== 'ingredient').map(c => [c.label]);

  /* oud schema: een receptregel koppelen aan items op de tekst (naam, trefwoord of andere naam; langste woord eerst, wat herkend is
     telt niet meer mee voor kortere woorden), zoals de site dat deed voordat de koppelingen in de database stonden */
  const itemIdByName = new Map(items.data.map(i => [i.name, i.id]));
  const oldLinker = (() => {
    if(!oldSchema) return null;
    const terms = new Map();
    for(const it of items.data) for(const t of [it.name, it.keyword, ...(it.aliases || [])]){
      const k = String(t || '').toLowerCase();
      if(!k) continue;
      if(!terms.has(k)) terms.set(k, new Set());
      terms.get(k).add(it.name);
    }
    const ranked = [...terms.entries()].sort((a, b) => b[0].length - a[0].length);
    return text => {
      let t = String(text || '').toLowerCase();
      const found = new Set();
      for(const [term, names] of ranked) if(t.includes(term)){ names.forEach(n => found.add(n)); t = t.split(term).join(' '); }
      return [...found];
    };
  })();

  /* recepten: cocktails (R), mocktails (Z), puur (P) */
  const bySort = (a, b) => a.sort_order - b.sort_order;
  const R = [], Z = [], P = [];
  const listOf = {cocktail: R, mocktail: Z, solo: P};
  for(const r of recipes.data){
    const lines = r.recipe_lines.slice().sort(bySort);
    const o = {
      id: r.id,
      kind: r.kind,
      menu: r.on_menu !== false,       // staat ook op het menu (alle recepten staan altijd op de cocktail- of mocktailpagina)
      n: r.name,
      b: r.recipe_bottles.slice().sort(bySort).map(x => x.items.name),
      t: r.style,
      blurb: r.blurb,
      s: lines.map(l => [l.amount, l.ingredient]),
      lines: lines.map(l => {
        const names = oldSchema ? oldLinker(l.ingredient) : l.recipe_line_items.map(x => x.items.name);
        return {
          id: l.id, amount: l.amount, text: l.ingredient,
          itemIds: oldSchema ? names.map(n => itemIdByName.get(n)) : l.recipe_line_items.map(x => x.item_id),
          items: names
        };
      }),
      m: r.method
    };
    if(r.url) o.u = r.url;
    listOf[r.kind].push(o);
  }

  /* het adres van een etiketfoto: de bucket wine-labels is publiek (migratie 0029), dus dit is een gewoon webadres */
  window.wineLabelUrl = path => {
    try{ return path ? sb.storage.from('wine-labels').getPublicUrl(path).data.publicUrl : ''; }catch(e){ return ''; }
  };
  /* wijn: soort, druif en regio uit `wines`; de notitie is die van het item (items.note), overal dezelfde; label: het adres van de etiketfoto, of '' */
  const W = wines.data.map(w => ({n: w.items.name, kind: w.kind, druif: w.grape, regio: w.region, note: w.items.note, label: window.wineLabelUrl(w.label_path)}));

  const itemsOf = label => G[label] ? G[label].map(n => ({n, bottle:1})) : (M[label] || []);
  Object.assign(window, {G, M, ING, ORDER, OUT, NO_MIX, ABV, SERVING, R, Z, P, W, itemsOf, SETTINGS});
  window.kelderOldSchema = oldSchema;
  window.kelderLabelColumn = labelColumn;                       // false: de database kent nog geen etiketfoto's (migratie 0029); het veld in het bewerkvenster blijft dan weg
  window.setting = key => SETTINGS[key];
  /* de ruwe rijen (met id), voor het beheer (voorraad.html, het menu, wijnen.html en de cocktail- en mocktailpagina) */
  window.kelderRows = {categories: cats.data, items: items.data, wines: wines.data};
};
