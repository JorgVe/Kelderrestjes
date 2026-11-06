/* Het bewerkvenster voor een drank of ingrediënt (een rij in `items`): toevoegen, wijzigen en verwijderen.
   Gedeeld door voorraad.html, wijnen.html en het menu (index.html, alleen voor een ingelogde beheerder), zodat het overal
   precies hetzelfde venster is. Het venster en zijn stijl komen pas bij init() in de pagina, dus bezoekers merken niets.

   Indeling: links de gegevens van het item, rechts de recepten waarin het voorkomt (bij een bestaand item) en onderaan rechts
   de eigenschappen (vinkjes). Bij een item in de categorie Wijn komt er een blok Wijn bij (soort, druif, regio, volgorde); bij
   een categorie met alcohol (items.show_alcohol: bier en sterkere drank) het veld Alcoholpercentage.

   Verwacht js/admin.js (kelderAdmin) en, voor "komt voor in … recepten", js/stock.js (R, Z, reqGroups).
   Schrijven gaat via kelderAdmin; wie mag schrijven bepaalt de database, niet dit venster.

     kelderItemDialog.init({ categories, items, wines?, onDone(tekst), onRelogin(tekst)?, defaultCategory()? })
     kelderItemDialog.open(item)                     een bestaand item bewerken
     kelderItemDialog.open(null, {barcode, category}) een nieuw item toevoegen (barcode en categorie vooraf ingevuld)
     kelderItemDialog.checkNew(fields) / createItem(fields)   een item toevoegen zonder het venster (voor "Scan foto", zie onderaan)

   Na opslaan of verwijderen wordt onDone(tekst) aangeroepen; de pagina laadt dan opnieuw (zo klopt alles zeker). Is de sessie
   verlopen, dan sluit het venster en wordt onRelogin(tekst) aangeroepen; zonder onRelogin blijft de melding in het venster staan. */
(function(){
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();   // vergelijken zonder accenten
  const $ = id => document.getElementById(id);

  const WINE_LABELS = ['Wijn', 'Wijn & bubbels'];                          // de categorie met wijn heet "Wijn" (eerder "Wijn & bubbels"); beide werken
  /* Alles is een ingrediënt. De enige vraag is of het ook op het menu staat: items.serving is dan 'both', anders 'ingredient'.
     Een drank of fles staat standaard op het menu, een los ingrediënt niet. */
  const menuByDefault = kind => kind !== 'ingredient';

  /* barcodes vergelijken we zonder spaties, in kleine letters en zonder voorloopnullen (UPC-A is een EAN-13 met een 0 ervoor) */
  const barcodeKey = s => { const t = String(s || '').trim().toLowerCase(); return /^\d+$/.test(t) ? t.replace(/^0+/, '') : t; };
  const BARCODE_OK = /^[0-9A-Za-z._-]{4,64}$/;

  /* alcoholpercentage: "8,5", "8.5" of "8,5%"; leeg is onbekend. Hoogstens één decimaal, tussen 0 en 100. */
  function parseAbv(raw){
    const t = String(raw || '').trim().replace('%', '').trim().replace(',', '.');
    if(t === '') return { ok: true, value: null };
    if(!/^\d{1,3}(\.\d)?$/.test(t) || Number(t) > 100) return { ok: false };
    return { ok: true, value: Number(t) };
  }
  const abvText = v => v == null ? '' : String(v).replace('.', ',');

  const CSS = `
  /* margin:auto zet het venster in het midden; de reset van de pagina (margin:0) haalt dat anders weg en dan staat het linksboven */
  dialog#itemdlg{margin:auto;border:0;border-top:6px solid var(--brass);padding:0;width:min(900px,calc(100vw - 32px));max-height:calc(100vh - 32px);background:var(--paper);color:var(--ink);box-shadow:0 20px 60px rgba(0,0,0,.35)}
  dialog#itemdlg::backdrop{background:rgba(30,39,33,.55)}
  #itemform{padding:22px 24px 20px;display:grid;grid-template-columns:minmax(0,1fr) 270px;grid-template-areas:"main side" "actions actions";gap:20px 28px}
  .dlgmain{grid-area:main;display:grid;gap:14px;min-width:0;align-content:start}
  .dlgside{grid-area:side;display:flex;flex-direction:column;gap:18px;min-width:0;border-left:1px solid var(--line);padding-left:22px}
  .dlgactions{grid-area:actions;display:grid;gap:2px}
  #itemform h2{font-size:26px}
  #itemform .field{display:grid;gap:4px;align-content:start;min-width:0}
  #itemform .field[hidden]{display:none}
  #itemform .lab{display:flex;align-items:center;gap:6px;min-height:20px}
  #itemform .lab label{display:block;font-size:14px;font-weight:700}
  /* uitleg bij een veld: een klein vraagteken naast het label; de tekst verschijnt bij hover of focus (toetsenbord) */
  #itemform .help{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none;width:18px;height:18px;border-radius:50%;border:1px solid rgba(30,39,33,.5);background:#fff;font:700 11px/1 'Karla',system-ui,sans-serif;color:rgba(30,39,33,.7);cursor:help}
  #itemform .help:hover,#itemform .help:focus-visible{background:var(--ink);border-color:var(--ink);color:var(--paper);outline:none}
  #itemform .help::after{content:attr(data-tip);position:absolute;left:-6px;top:calc(100% + 8px);z-index:20;width:max-content;max-width:min(240px,60vw);padding:8px 10px;border-radius:8px;background:var(--ink);color:var(--paper);font:400 13px/1.35 'Karla',system-ui,sans-serif;text-align:left;box-shadow:0 6px 18px rgba(0,0,0,.3);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .12s}
  #itemform .help:hover::after,#itemform .help:focus-visible::after{opacity:1;visibility:visible}
  #itemform input[type=text],#itemform input[type=number],#itemform select{font:inherit;font-size:15px;font-weight:400;height:40px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);width:100%;min-width:0}
  #itemform input:focus-visible,#itemform select:focus-visible{outline:3px solid var(--brass);outline-offset:2px}
  #itemform .row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
  #itemform .glabel{font-family:'Space Mono',monospace;font-size:10px;font-weight:400;letter-spacing:.18em;text-transform:uppercase;color:rgba(30,39,33,.7)}
  /* het blok Wijn: alleen bij een item in de categorie Wijn */
  #winefields{display:grid;gap:12px;padding:14px 16px 16px;background:var(--paper-2);border-left:3px solid var(--brass);min-width:0}
  #winefields[hidden]{display:none}
  /* rechts: de recepten (vult de ruimte) en onderaan de eigenschappen */
  #dlguse{display:grid;align-content:start;gap:8px;min-height:0;max-height:44vh;overflow:auto;flex:1 1 auto}
  #dlguse[hidden]{display:none}
  #dlguse h4{display:flex;justify-content:space-between;gap:8px;font-size:15px;margin-top:6px}
  #dlguse h4 span{font-family:'Space Mono',monospace;font-size:12px;font-weight:400;color:rgba(30,39,33,.7)}
  #dlguse ul{list-style:none;display:grid}
  #dlguse li{font-size:14px;padding:5px 0;border-bottom:1px dotted var(--line)}
  #dlguse .none{font-size:14px;color:rgba(30,39,33,.7)}
  .props{display:grid;gap:10px;margin-top:auto;padding-top:16px;border-top:1px solid var(--line)}
  #itemform .check{display:flex;flex-direction:row;align-items:center;gap:8px;font-size:14px;font-weight:400}
  #itemform .check input{width:auto;height:auto;accent-color:var(--ink)}
  #itemform .check[hidden]{display:none}
  #itemform .dlgbtns{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:4px}
  #itemform .dlgbtns .danger{margin-left:auto}
  #itemform .chip:disabled{opacity:.5;cursor:progress}
  #itemform .chip.primary{background:var(--ink);color:var(--paper);border-color:var(--ink)}
  #itemform .chip.primary:hover{background:var(--shelf-deep);border-color:var(--shelf-deep)}
  #itemform .chip.danger{border-color:var(--amber);color:var(--amber)}
  #dlgerr{color:var(--amber);font-size:14px;font-weight:700;min-height:1.4em}
  @media (max-width:560px){ #itemform .row2{grid-template-columns:1fr} }
  @media (max-width:780px){
    #itemform{grid-template-columns:minmax(0,1fr);grid-template-areas:"main" "side" "actions"}
    .dlgside{border-left:0;border-top:1px solid var(--line);padding:16px 0 0}
    #dlguse{max-height:none}
  }`;

  const HTML = `
  <dialog id="itemdlg" aria-labelledby="dlgtitle">
    <form id="itemform" novalidate>
      <div class="dlgmain">
        <h2 id="dlgtitle">Item toevoegen</h2>
        <div class="field">
            <div class="lab"><label for="f-name">Naam</label>
            <span class="help" tabindex="0" role="img" aria-label="Uitleg: Zoals het op het menu staat." data-tip="Zoals het op het menu staat.">?</span></div>
            <input type="text" id="f-name" maxlength="80" autocomplete="off">
          </div>
        <div class="row2">
          <div class="field">
            <div class="lab"><label for="f-cat">Categorie</label></div>
            <select id="f-cat"></select>
          </div>
          <div class="field">
            <div class="lab"><label for="f-qty">Aantal op voorraad</label>
            <span class="help" tabindex="0" role="img" aria-label="Uitleg: Leeg is onbekend. 0 betekent op." data-tip="Leeg is onbekend. 0 betekent op.">?</span></div>
            <input type="number" id="f-qty" min="0" max="99999" step="1" inputmode="numeric">
          </div>
        </div>
        <div id="winefields" role="group" aria-labelledby="wine-title" hidden>
          <p class="glabel" id="wine-title">Wijn</p>
          <div class="row2">
            <div class="field">
            <div class="lab"><label for="w-kind">Soort</label></div>
            <select id="w-kind"></select>
          </div>
            <div class="field">
            <div class="lab"><label for="w-sort">Volgorde</label>
            <span class="help" tabindex="0" role="img" aria-label="Uitleg: Lager staat eerder op de wijnpagina." data-tip="Lager staat eerder op de wijnpagina.">?</span></div>
            <input type="number" id="w-sort" min="0" max="9999" step="1" inputmode="numeric">
          </div>
          </div>
          <div class="row2">
            <div class="field">
            <div class="lab"><label for="w-grape">Druif</label></div>
            <input type="text" id="w-grape" maxlength="80" autocomplete="off">
          </div>
            <div class="field">
            <div class="lab"><label for="w-region">Regio</label></div>
            <input type="text" id="w-region" maxlength="80" autocomplete="off">
          </div>
          </div>
        </div>
        <div class="field">
            <div class="lab"><label for="f-note">Notitie</label>
            <span class="help" tabindex="0" role="img" aria-label="Uitleg: Korte toelichting onder de naam. Bij wijn is dit ook de notitie op de wijnpagina." data-tip="Korte toelichting onder de naam. Bij wijn is dit ook de notitie op de wijnpagina.">?</span></div>
            <input type="text" id="f-note" maxlength="200" autocomplete="off">
          </div>
        <div class="row2">
          <div class="field" id="f-abv-wrap">
            <div class="lab"><label for="f-abv">Alcoholpercentage</label>
            <span class="help" tabindex="0" role="img" aria-label="Uitleg: Bijvoorbeeld 8,5. Alleen bij bier en sterkere drank." data-tip="Bijvoorbeeld 8,5. Alleen bij bier en sterkere drank.">?</span></div>
            <input type="text" id="f-abv" inputmode="decimal" maxlength="5" autocomplete="off">
          </div>
          <div class="field">
            <div class="lab"><label for="f-barcode">Barcode</label>
            <span class="help" tabindex="0" role="img" aria-label="Uitleg: Voor het scannen van de fles." data-tip="Voor het scannen van de fles.">?</span></div>
            <input type="text" id="f-barcode" maxlength="64" inputmode="numeric" autocomplete="off">
          </div>
        </div>
      </div>
      <aside class="dlgside">
        <section id="dlguse" aria-labelledby="dlguse-title" hidden>
          <p class="glabel" id="dlguse-title">Komt voor in recepten</p>
          <div id="dlguse-body"></div>
        </section>
        <div class="props" role="group" aria-labelledby="props-title">
          <p class="glabel" id="props-title">Eigenschappen</p>
          <label class="check"><input type="checkbox" id="f-menu"> Zichtbaar in het menu</label>
          <label class="check"><input type="checkbox" id="f-stock"> Op voorraad</label>
          <label class="check" title="Uit: recepten waar dit item niet zonder kan, verdwijnen van het menu en de cocktail- en mocktailpagina. De drank zelf blijft op het menu."><input type="checkbox" id="f-mix"> Gebruiken in cocktails</label>
          <label class="check" id="f-zero-wrap"><input type="checkbox" id="f-zero"> Alcoholvrij (0%)</label>
        </div>
      </aside>
      <div class="dlgactions">
        <p id="dlgerr" role="alert"></p>
        <div class="dlgbtns">
          <button type="submit" class="chip primary" id="dlgsave">Opslaan</button>
          <button type="button" class="chip" id="dlgcancel">Annuleren</button>
          <button type="button" class="chip danger" id="dlgdelete" hidden>Verwijderen</button>
        </div>
      </div>
    </form>
  </dialog>`;

  let ctx = null, built = false, editing = null, servingTouched = false, mixTouched = false, menuWas = false;
  let catById = new Map(), usedIn = new Map(), wineByItem = new Map();

  /* "Alcoholvrij (0%)" heeft alleen zin bij drank met alcohol (bier 0.0). Frisdrank, koffie en melk zijn altijd alcoholvrij:
     die categorieën hebben alcoholic = false en krijgen nooit een 0%-markering. Ingrediënten ook niet. */
  const canBeZeroProof = catId => { const c = catById.get(Number(catId)); return !!c && c.kind !== 'ingredient' && !!c.alcoholic; };
  /* een item in de categorie Wijn heeft wijngegevens (een rij in `wines`: soort, druif, regio, volgorde) */
  const isWineCat = catId => { const c = catById.get(Number(catId)); return !!c && WINE_LABELS.includes(c.label); };
  /* het alcoholpercentage staat bij bier en sterkere drank (categories.show_alcohol), niet bij wijn en frisdrank */
  const showsAbv = catId => { const c = catById.get(Number(catId)); return !!c && !!c.show_alcohol; };
  const nextWineSort = () => 1 + Math.max(0, ...(ctx.wines || []).map(w => w.sort_order));

  /* in welke recepten een item voorkomt: de receptregels die aan het item gekoppeld zijn (js/stock.js, reqGroups), plus de
     flessen die bij het recept horen */
  function computeUsage(){
    usedIn = new Map(ctx.items.map(i => [i.name, new Map()]));
    if(typeof reqGroups !== 'function' || typeof R === 'undefined' || typeof Z === 'undefined') return;
    for(const [list, kind] of [[R, 'cocktail'], [Z, 'mocktail']]){
      for(const r of list){
        const found = new Set([...(r.b || []), ...reqGroups(r).flat().map(i => i.n)]);
        for(const n of found){ const m = usedIn.get(n); if(m) m.set(kind + ':' + r.n, { n: r.n, kind }); }
      }
    }
  }
  /* de recepten waarin een item voorkomt: [{ n: naam, kind: 'cocktail' | 'mocktail' }] */
  const recipesOf = it => [...(usedIn.get(it.name) || new Map()).values()];

  /* de lijst rechts; bij een nieuw item is er niets om te tonen */
  function renderUse(it){
    $('dlguse').hidden = !it;
    if(!it) return;
    const used = recipesOf(it);
    const part = (title, list) => list.length
      ? `<h4>${title} <span>${list.length}</span></h4><ul>${list.map(r => `<li>${esc(r.n)}</li>`).join('')}</ul>` : '';
    $('dlguse-body').innerHTML = used.length
      ? part('Cocktails', used.filter(r => r.kind === 'cocktail')) + part('Mocktails', used.filter(r => r.kind === 'mocktail'))
      : '<p class="none">Komt in geen enkel recept voor.</p>';
  }

  function build(){
    if(built) return;
    built = true;
    const style = document.createElement('style');
    style.id = 'itemdlg-css';
    style.textContent = CSS;
    document.head.appendChild(style);
    document.body.insertAdjacentHTML('beforeend', HTML);

    /* een item hoeft geen categorie te hebben: dan staat het op de voorraadpagina onder "Andere" en nooit op het menu */
    $('f-cat').innerHTML = ctx.categories.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('') + '<option value="">Andere (geen categorie)</option>';
    const kinds = window.WKINDS || { Bubbels: 'Bubbels', Wit: 'Witte wijn', 'Rosé': 'Rosé', Rood: 'Rode wijn' };      // dezelfde soorten als de database toestaat
    $('w-kind').innerHTML = '<option value="">Kies een soort…</option>' + Object.entries(kinds).map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('');
    $('f-menu').onchange = () => { servingTouched = true; };
    $('f-mix').onchange = () => { mixTouched = true; };
    $('f-cat').onchange = () => {
      sync();
      const catId = $('f-cat').value;
      const c = catById.get(Number(catId));
      if(!editing && !servingTouched && c) $('f-menu').checked = menuByDefault(c.kind);    // een nieuw item volgt zijn categorie, tot je het vinkje zelf aanraakt
      if(!editing && !mixTouched) $('f-mix').checked = !isWineCat(catId);                  // wijn gaat standaard niet in cocktails
    };
    $('dlgcancel').onclick = close;
    $('itemform').onsubmit = save;
    $('dlgdelete').onclick = remove;
    /* voorraad en aantal horen bij elkaar (zie kelderAdmin.stockPatch): "op voorraad" uit zet het aantal op 0, aan zet 0 op 1;
       een aantal van 0 zet "op voorraad" uit, 1 of meer zet het aan; een leeg aantal laat het vinkje zoals het is */
    $('f-stock').onchange = () => {
      const q = $('f-qty');
      if(!$('f-stock').checked) q.value = '0';
      else if(q.value.trim() === '0') q.value = '1';
    };
    $('f-qty').oninput = () => {
      const v = $('f-qty').value.trim();
      if(/^\d+$/.test(v)) $('f-stock').checked = Number(v) > 0;
    };
  }

  function sync(){
    const catId = $('f-cat').value;
    const has = catId !== '';
    $('winefields').hidden = !isWineCat(catId);                    // de wijngegevens horen bij de categorie Wijn
    $('f-abv-wrap').hidden = !showsAbv(catId);                     // het alcoholpercentage bij bier en sterkere drank
    $('f-zero-wrap').hidden = !canBeZeroProof(catId);              // geen 0%-optie bij frisdrank, koffie, melk en ingrediënten
    /* zonder categorie kan een item niet op het menu staan: het vinkje gaat uit en is niet te kiezen (de keuze komt terug als je weer een categorie kiest) */
    const m = $('f-menu');
    if(!has && !m.disabled){ menuWas = m.checked; m.checked = false; m.disabled = true; }
    else if(has && m.disabled){ m.disabled = false; m.checked = menuWas; }
    m.parentElement.title = has ? '' : 'Een item zonder categorie staat niet op het menu.';
  }

  function init(options){
    ctx = options;
    catById = new Map(ctx.categories.map(c => [c.id, c]));
    wineByItem = new Map((ctx.wines || []).map(w => [w.item_id, w]));
    computeUsage();
    build();
  }

  function open(it, opts = {}){
    if(!ctx) throw new Error('kelderItemDialog.init() is nog niet aangeroepen');
    editing = it || null;
    servingTouched = !!it;
    mixTouched = !!it;
    let cat;
    if(it) cat = it.category_id;                                   // leeg: een item zonder categorie
    else{
      cat = opts.category !== undefined ? opts.category : (ctx.defaultCategory ? ctx.defaultCategory() : null);
      if(cat == null) cat = ctx.categories[0].id;                  // geen voorkeur: de eerste categorie ('' is bewust "Andere")
    }
    const noCat = cat == null || cat === '';
    $('dlgtitle').textContent = it ? 'Item bewerken' : 'Item toevoegen';
    $('f-name').value = it ? it.name : '';
    $('f-cat').value = noCat ? '' : String(cat);
    $('f-menu').disabled = false;
    $('f-menu').checked = it ? it.serving !== 'ingredient' : (noCat ? false : menuByDefault(catById.get(cat).kind));
    $('f-note').value = it && it.note ? it.note : '';
    $('f-abv').value = it ? abvText(it.abv) : '';
    $('f-barcode').value = it && it.barcode ? it.barcode : (opts.barcode || '');
    $('f-stock').checked = it ? it.in_stock : true;
    $('f-qty').value = it && it.quantity != null ? String(it.quantity) : '';
    $('f-zero').checked = it ? it.zero_proof : false;
    $('f-mix').checked = it ? it.in_cocktails !== false : !isWineCat(cat);      // wijn gaat standaard niet in cocktails
    const w = it ? wineByItem.get(it.id) : null;
    $('w-kind').value = w ? w.kind : '';
    $('w-grape').value = w && w.grape ? w.grape : '';
    $('w-region').value = w && w.region ? w.region : '';
    $('w-sort').value = String(w ? w.sort_order : nextWineSort());
    $('dlgdelete').hidden = !it;
    renderUse(it);
    $('dlgsave').disabled = false;
    $('dlgdelete').disabled = false;
    $('dlgerr').textContent = '';
    sync();
    $('itemdlg').showModal();
    $('f-name').focus();
  }
  function close(){ const d = $('itemdlg'); if(d && d.open) d.close(); }

  const done = text => { if(ctx.onDone) ctx.onDone(text); else location.reload(); };
  function failed(res){
    $('dlgsave').disabled = false;
    $('dlgdelete').disabled = false;
    if(res.relogin && ctx.onRelogin){ close(); ctx.onRelogin(res.message); return; }
    $('dlgerr').textContent = res.message;
  }

  async function save(e){
    e.preventDefault();
    const derr = $('dlgerr');
    derr.textContent = '';
    const name = $('f-name').value.trim();
    const catId = $('f-cat').value === '' ? null : Number($('f-cat').value);          // null: geen categorie ("Andere")
    if(!name){ derr.textContent = 'Vul een naam in.'; $('f-name').focus(); return; }
    const clash = ctx.items.find(i => fold(i.name) === fold(name) && (!editing || i.id !== editing.id));
    if(clash){ derr.textContent = `Er is al een item met bijna dezelfde naam: ${clash.name}.`; $('f-name').focus(); return; }

    const code = $('f-barcode').value.trim();
    if(code && !BARCODE_OK.test(code)){ derr.textContent = 'Een barcode bestaat uit cijfers (of letters), zonder spaties, minstens 4 tekens.'; $('f-barcode').focus(); return; }
    const taken = code && ctx.items.find(i => i.barcode && barcodeKey(i.barcode) === barcodeKey(code) && (!editing || i.id !== editing.id));
    if(taken){ derr.textContent = `Deze barcode hoort al bij ${taken.name}.`; $('f-barcode').focus(); return; }

    const qRaw = $('f-qty').value.trim();
    if(qRaw !== '' && !/^\d{1,5}$/.test(qRaw)){ derr.textContent = 'Het aantal is een geheel getal van 0 of meer.'; $('f-qty').focus(); return; }
    const quantity = qRaw === '' ? null : Number(qRaw);

    const abv = parseAbv($('f-abv').value);
    if(showsAbv(catId) && !abv.ok){ derr.textContent = 'Het alcoholpercentage is een getal tussen 0 en 100, met hoogstens één decimaal (bijv. 8,5).'; $('f-abv').focus(); return; }

    const fields = {
      name,
      category_id: catId,
      serving: catId !== null && $('f-menu').checked ? 'both' : 'ingredient',      // zonder categorie nooit op het menu
      note: $('f-note').value.trim() || null,
      barcode: code || null,
      abv: showsAbv(catId) ? abv.value : null,                         // alleen bij bier en sterkere drank
      in_stock: quantity === null ? $('f-stock').checked : quantity > 0,   // een aantal beslist; zonder aantal het vinkje
      quantity,
      zero_proof: canBeZeroProof(catId) && $('f-zero').checked,        // nooit opslaan bij drank die altijd alcoholvrij is
      in_cocktails: $('f-mix').checked
    };
    /* een nieuw item, of een item in een andere categorie, komt onderaan die categorie */
    if(!editing || editing.category_id !== catId)
      fields.sort_order = 1 + Math.max(0, ...ctx.items.filter(i => i.category_id === catId).map(i => i.sort_order));

    /* wijn: bij een item in de categorie Wijn horen de wijngegevens; gaat een wijn naar een andere categorie, dan vervallen ze */
    const hadWine = !!(editing && wineByItem.has(editing.id));
    const leavingWine = hadWine && isWineCat(editing.category_id) && !isWineCat(catId);
    let wine = null;
    if(isWineCat(catId)){
      const kind = $('w-kind').value;
      if(!kind){ derr.textContent = 'Kies de soort wijn: bubbels, wit, rosé of rood.'; $('w-kind').focus(); return; }
      const sRaw = $('w-sort').value.trim();
      if(sRaw !== '' && !/^\d{1,4}$/.test(sRaw)){ derr.textContent = 'De volgorde is een geheel getal van 0 of meer.'; $('w-sort').focus(); return; }
      wine = {
        kind,
        grape: $('w-grape').value.trim() || null,
        region: $('w-region').value.trim() || null,
        sort_order: sRaw === '' ? nextWineSort() : Number(sRaw)
      };
    }else if(leavingWine && !confirm(`"${name}" staat niet meer in de categorie Wijn. De wijngegevens (soort, druif, regio) worden verwijderd en de wijn staat niet meer op de wijnpagina.\n\nDoorgaan?`)) return;

    $('dlgsave').disabled = true;
    const wasNew = !editing;
    const res = await kelderAdmin.saveItem(editing ? editing.id : null, fields);
    if(!res.ok) return failed(res);
    const itemId = wasNew ? res.row.id : editing.id;
    if(wasNew){            // gaat het hieronder mis, dan wijzigt opnieuw opslaan dit item in plaats van er een tweede toe te voegen
      editing = res.row;
      $('dlgtitle').textContent = 'Item bewerken';
      $('dlgdelete').hidden = false;
    }
    const wres = wine ? await kelderAdmin.saveWine(itemId, wine) : leavingWine ? await kelderAdmin.deleteWine(itemId) : { ok: true };
    if(!wres.ok) return failed({ ...wres, message: `${name} is opgeslagen, maar de wijngegevens niet: ${wres.message}` });
    done(`${name} is ${wasNew ? 'toegevoegd' : 'opgeslagen'}.`);
  }

  /* de namen van recepten voor in de bevestiging, per soort: "Cocktails: A, B · Mocktails: C" */
  function recipeList(list){
    const NOUN = { cocktail: 'Cocktails', mocktail: 'Mocktails', solo: 'Puur' };
    return ['cocktail', 'mocktail', 'solo']
      .map(k => [k, list.filter(r => r.kind === k)]).filter(([, l]) => l.length)
      .map(([k, l]) => `${NOUN[k]}: ${l.map(r => r.name).join(', ')}`).join('\n  ');
  }

  /* Verwijderen: de database laat eerst zien wat er allemaal bij verdwijnt (remove_item, alleen een plan), daarna bevestigt de beheerder.
     Een item dat in recepten wordt gebruikt, gaat weg met zijn koppelingen en met de recepten die niet zonder kunnen; recepten waar een
     alternatief bij staat blijven bestaan. Zonder die functie (migratie 0025) lukt verwijderen alleen als het item nergens in zit. */
  async function remove(){
    if(!editing) return;
    const name = editing.name, id = editing.id;
    $('dlgdelete').disabled = true;
    const plan = await kelderAdmin.removeItem(id, false);
    if(!plan.ok && !plan.missing){ $('dlgdelete').disabled = false; return failed(plan); }

    let text;
    if(plan.ok){
      const gone = plan.plan.recipes_removed, kept = plan.plan.recipes_changed;
      text = `"${name}" definitief verwijderen?\n`;
      if(gone.length) text += `\n${gone.length === 1 ? 'Dit recept wordt' : 'Deze ' + gone.length + ' recepten worden'} ook verwijderd, want zonder dit item kunnen ze niet:\n  ${recipeList(gone)}\n`;
      if(kept.length) text += `\n${kept.length === 1 ? 'Dit recept blijft' : 'Deze ' + kept.length + ' recepten blijven'} bestaan zonder dit item (er is een alternatief). Pas de tekst van de regel zelf aan als je wilt:\n  ${recipeList(kept)}\n`;
      text += `\nAlle koppelingen met dit item verdwijnen. Dit kan niet ongedaan worden gemaakt.`;
    }else{
      text = `"${name}" definitief verwijderen?\n\nDit kan niet ongedaan worden gemaakt. Een item dat in een recept wordt gebruikt, kan niet worden verwijderd: haal het eerst uit dat recept.`;
    }
    if(!confirm(text)){ $('dlgdelete').disabled = false; return; }

    const res = plan.ok ? await kelderAdmin.removeItem(id, true) : await kelderAdmin.deleteItem(id);
    if(!res.ok) return failed(res);
    const n = plan.ok ? plan.plan.recipes_removed.length : 0;
    done(`${name} is verwijderd${n ? `, met ${n} ${n === 1 ? 'recept' : 'recepten'}` : ''}.`);
  }

  /* ------------------------------------------------------------------ een item toevoegen zonder het venster
     Voor "Scan foto": een fles die nog niet in de lijst staat, wordt daar aangemaakt. Dezelfde regels en standaardwaarden als het venster
     hierboven (naam, barcode en wijnsoort controleren; op het menu als de categorie dat standaard heeft; wijn niet in cocktails).
       fields = { name, category (id, of null = Andere), barcode?, abv? (tekst), quantity (geheel getal), wine?: { kind, grape?, region? } }
       checkNew(fields)   → { ok: true } of { ok: false, message, clash? (het item dat al zo heet of die barcode heeft) }
       createItem(fields) → belofte met { ok: true, row, wineRow? } of { ok: false, message, relogin?, row? }
     Bij succes staat de nieuwe rij ook in de lijst van de pagina (ctx.items, en ctx.wines); de pagina zelf laadt niet opnieuw. */
  const WINE_KINDS = ['Bubbels', 'Wit', 'Rosé', 'Rood'];
  function checkNew(f){
    if(!ctx) return { ok: false, message: 'Het bewerkvenster is nog niet klaar.' };
    const name = String(f.name || '').trim();
    if(!name) return { ok: false, message: 'Vul een naam in.' };
    const clash = ctx.items.find(i => fold(i.name) === fold(name));
    if(clash) return { ok: false, message: `Er is al een item met bijna dezelfde naam: ${clash.name}.`, clash };
    const code = String(f.barcode || '').trim();
    if(code && !BARCODE_OK.test(code)) return { ok: false, message: 'Een barcode bestaat uit cijfers (of letters), zonder spaties, minstens 4 tekens.' };
    const taken = code && ctx.items.find(i => i.barcode && barcodeKey(i.barcode) === barcodeKey(code));
    if(taken) return { ok: false, message: `Deze barcode hoort al bij ${taken.name}.`, clash: taken };
    const catId = f.category == null || f.category === '' ? null : Number(f.category);
    if(catId !== null && !catById.has(catId)) return { ok: false, message: 'Kies een categorie.' };
    const abv = parseAbv(f.abv);
    if(showsAbv(catId) && !abv.ok) return { ok: false, message: 'Het alcoholpercentage is een getal tussen 0 en 100, met hoogstens één decimaal (bijv. 8,5).' };
    if(isWineCat(catId) && !WINE_KINDS.includes(f.wine && f.wine.kind)) return { ok: false, message: 'Kies de soort wijn: bubbels, wit, rosé of rood.' };
    if(!Number.isInteger(f.quantity) || f.quantity < 0) return { ok: false, message: 'Het aantal is een geheel getal van 0 of meer.' };
    return { ok: true, name, code, catId, abv: abv.value };
  }
  async function createItem(f){
    const c = checkNew(f);
    if(!c.ok) return c;
    const cat = c.catId === null ? null : catById.get(c.catId);
    const fields = {
      name: c.name,
      category_id: c.catId,
      serving: cat && menuByDefault(cat.kind) ? 'both' : 'ingredient',          // zonder categorie nooit op het menu
      note: null,
      barcode: c.code || null,
      abv: showsAbv(c.catId) ? c.abv : null,
      in_stock: f.quantity > 0,
      quantity: f.quantity,
      zero_proof: false,
      in_cocktails: !isWineCat(c.catId),                                          // wijn gaat standaard niet in cocktails
      sort_order: 1 + Math.max(0, ...ctx.items.filter(i => i.category_id === c.catId).map(i => i.sort_order))
    };
    const res = await kelderAdmin.saveItem(null, fields);
    if(!res.ok) return res;
    ctx.items.push(res.row);
    if(!isWineCat(c.catId)) return { ok: true, row: res.row };
    const w = f.wine || {};
    const wres = await kelderAdmin.saveWine(res.row.id, { kind: w.kind, grape: (w.grape || '').trim() || null, region: (w.region || '').trim() || null, sort_order: nextWineSort() });
    if(!wres.ok) return { ...wres, row: res.row, message: `${c.name} is aangemaakt, maar de wijngegevens niet: ${wres.message}` };
    if(ctx.wines) ctx.wines.push(wres.row);
    return { ok: true, row: res.row, wineRow: wres.row };
  }

  window.kelderItemDialog = { init, open, close, recipesOf, canBeZeroProof, isWineCat, showsAbv, abvText, checkNew, createItem, barcodeKey, barcodeOk: s => BARCODE_OK.test(String(s || '')) };
})();
