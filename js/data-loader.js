/* Haalt de dranken uit Supabase en zet ze neer als een paar globals voor de paginascripts (stock.js, cards.js, de pagina's zelf):
   slug, WKINDS, G, M, ING, ORDER, OUT, ALIAS, SERVING (drink | ingredient | both), R, Z, P, W, itemsOf.
   Een item zonder categorie (category_id leeg) telt als ingrediënt: het werkt in recepten en voorraad, maar staat niet op het menu.
   De ruwe rijen (met id) staan er ook, in kelderRows, voor het beheer op voorraad.html en het menu. */

window.slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
window.WKINDS = {Bubbels:"Bubbels", Wit:"Witte wijn", "Rosé":"Rosé", Rood:"Rode wijn"};

window.kelderLoadData = async function(){
  const sb = window.kelderSb;
  if(!window.kelderConfigured) throw new Error('Supabase is nog niet ingesteld: vul js/supabase-config.js in.');
  if(!sb) throw new Error('supabase-js is niet geladen (geblokkeerd of offline?).');

  const [cats, items, recipes, wines] = await Promise.all([
    sb.from('categories').select('id,label,kind,alcoholic,sort_order').order('sort_order'),
    sb.from('items').select('id,category_id,name,keyword,aliases,note,optional,zero_proof,in_stock,quantity,serving,sort_order,barcode').order('sort_order'),
    sb.from('recipes').select('id,on_menu,kind,name,style,blurb,method,url,recipe_bottles(sort_order,items(name)),recipe_lines(sort_order,amount,ingredient,on_bar)').order('sort_order'),
    sb.from('wines').select('kind,grape,region,alcohol,note,to_confirm,items(name)').order('sort_order')
  ]);
  for(const r of [cats, items, recipes, wines]) if(r.error) throw new Error(r.error.message);

  /* dranken: flessen (G), overige dranken (M), ingrediënten (ING), uitverkocht (OUT) */
  const catById = new Map(cats.data.map(c => [c.id, c]));
  const G = {}, M = {}, ING = [], ALIAS = {}, OUT = [], SERVING = {};
  for(const c of cats.data){
    if(c.kind === 'bottle') G[c.label] = [];
    else if(c.kind === 'drink') M[c.label] = [];
  }
  for(const it of items.data){
    const c = catById.get(it.category_id);                     // undefined: geen categorie
    if(it.aliases && it.aliases.length) ALIAS[it.name] = it.aliases;
    if(!it.in_stock) OUT.push(it.name);
    SERVING[it.name] = it.serving;
    if(c && c.kind === 'bottle'){ G[c.label].push(it.name); continue; }
    const o = {n: it.name};
    if(it.keyword) o.k = it.keyword;
    if(it.optional) o.o = 1;
    /* "0%" alleen bij drank met alcohol (bier 0.0); frisdrank, koffie en melk zijn altijd alcoholvrij (categories.alcoholic
       is false), dus daar tonen we het nooit, ook niet als de vlag per ongeluk aanstaat */
    if(it.zero_proof && c && c.alcoholic) o.z = 1;
    if(it.note) o.note = it.note;
    (c && c.kind === 'drink' ? M[c.label] : ING).push(o);
  }
  const ORDER = cats.data.filter(c => c.kind !== 'ingredient').map(c => [c.label]);

  /* recepten: cocktails (R), mocktails (Z), puur (P) */
  const bySort = (a, b) => a.sort_order - b.sort_order;
  const R = [], Z = [], P = [];
  const listOf = {cocktail: R, mocktail: Z, solo: P};
  for(const r of recipes.data){
    const o = {
      id: r.id,
      menu: r.on_menu !== false,       // staat ook op het menu (alle recepten staan altijd op de cocktail- of mocktailpagina)
      n: r.name,
      b: r.recipe_bottles.slice().sort(bySort).map(x => x.items.name),
      t: r.style,
      blurb: r.blurb,
      s: r.recipe_lines.slice().sort(bySort).map(l => l.on_bar ? [l.amount, l.ingredient, 1] : [l.amount, l.ingredient]),
      m: r.method
    };
    if(r.url) o.u = r.url;
    listOf[r.kind].push(o);
  }

  const W = wines.data.map(w => {
    const o = {n: w.items.name, kind: w.kind, druif: w.grape, regio: w.region, alc: w.alcohol, note: w.note};
    if(w.to_confirm) o.c = 1;
    return o;
  });

  const itemsOf = label => G[label] ? G[label].map(n => ({n, bottle:1})) : (M[label] || []);
  Object.assign(window, {G, M, ING, ORDER, OUT, SERVING, ALIAS, R, Z, P, W, itemsOf});
  /* de ruwe rijen (met id), voor het beheer op voorraad.html; de publieke pagina's gebruiken ze niet */
  window.kelderRows = {categories: cats.data, items: items.data};
};
