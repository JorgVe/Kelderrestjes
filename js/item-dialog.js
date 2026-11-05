/* Het bewerkvenster voor een drank of ingrediënt (een rij in `items`): toevoegen, wijzigen en verwijderen.
   Gedeeld door voorraad.html en het menu (index.html, alleen voor een ingelogde beheerder), zodat het op beide plekken
   precies hetzelfde venster is. Het venster en zijn stijl komen pas bij init() in de pagina, dus bezoekers merken niets.

   Verwacht js/admin.js (kelderAdmin) en, voor "komt voor in … recepten", js/stock.js (R, Z, reqGroups).
   Schrijven gaat via kelderAdmin; wie mag schrijven bepaalt de database, niet dit venster.

     kelderItemDialog.init({ categories, items, onDone(tekst), onRelogin(tekst)?, defaultCategory()? })
     kelderItemDialog.open(item)                     een bestaand item bewerken
     kelderItemDialog.open(null, {barcode, category}) een nieuw item toevoegen (barcode en categorie vooraf ingevuld)

   Na opslaan of verwijderen wordt onDone(tekst) aangeroepen; de pagina laadt dan opnieuw (stock.js bouwt zijn zoektermen
   één keer op, en zo klopt alles zeker). Is de sessie verlopen, dan sluit het venster en wordt onRelogin(tekst) aangeroepen;
   zonder onRelogin blijft de melding in het venster staan. */
(function(){
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();   // vergelijken zonder accenten
  const $ = id => document.getElementById(id);

  const WINE_CATEGORY = 'Wijn & bubbels';                                  // zoals op de menupagina
  /* Alles is een ingrediënt. De enige vraag is of het ook op het menu staat: items.serving is dan 'both', anders 'ingredient'.
     Een drank of fles staat standaard op het menu, een los ingrediënt niet. */
  const menuByDefault = kind => kind !== 'ingredient';

  /* barcodes vergelijken we zonder spaties, in kleine letters en zonder voorloopnullen (UPC-A is een EAN-13 met een 0 ervoor) */
  const barcodeKey = s => { const t = String(s || '').trim().toLowerCase(); return /^\d+$/.test(t) ? t.replace(/^0+/, '') : t; };
  const BARCODE_OK = /^[0-9A-Za-z._-]{4,64}$/;

  const CSS = `
  /* margin:auto zet het venster in het midden; de reset van de pagina (margin:0) haalt dat anders weg en dan staat het linksboven */
  dialog#itemdlg{margin:auto;border:0;border-top:6px solid var(--brass);padding:0;width:min(580px,calc(100vw - 32px));max-height:calc(100vh - 32px);background:var(--paper);color:var(--ink);box-shadow:0 20px 60px rgba(0,0,0,.35)}
  dialog#itemdlg.has-side{width:min(880px,calc(100vw - 32px))}
  dialog#itemdlg::backdrop{background:rgba(30,39,33,.55)}
  #itemform{padding:22px 24px 20px;display:grid;gap:24px}
  #itemdlg.has-side #itemform{grid-template-columns:minmax(0,1fr) 250px}
  .dlgmain{display:grid;gap:14px;min-width:0;align-content:start}
  #itemform h2{font-size:26px}
  #itemform label{display:grid;gap:4px;font-size:14px;font-weight:700}
  #itemform label small{font-weight:400;color:rgba(30,39,33,.65)}
  #itemform input[type=text],#itemform input[type=number],#itemform select{font:inherit;font-size:15px;font-weight:400;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);width:100%;min-width:0}
  #itemform input:focus-visible,#itemform select:focus-visible{outline:3px solid var(--brass);outline-offset:2px}
  #itemform .row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  #itemform fieldset{border:0;display:flex;flex-wrap:wrap;gap:8px 20px}
  #itemform legend{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:rgba(30,39,33,.7);margin-bottom:6px}
  #itemform .check{display:flex;flex-direction:row;align-items:center;gap:8px;font-weight:400}
  #itemform .check input{width:auto;accent-color:var(--ink)}
  #itemform .check[hidden]{display:none}
  #itemform .dlgbtns{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:4px}
  #itemform .dlgbtns .danger{margin-left:auto}
  #itemform .chip:disabled{opacity:.5;cursor:progress}
  #itemform .chip.primary{background:var(--ink);color:var(--paper);border-color:var(--ink)}
  #itemform .chip.primary:hover{background:var(--shelf-deep);border-color:var(--shelf-deep)}
  #itemform .chip.danger{border-color:var(--amber);color:var(--amber)}
  #dlgerr{color:var(--amber);font-size:14px;font-weight:700;min-height:1.4em}
  #winenote{font-size:13px;background:var(--paper-2);padding:8px 12px;border-left:3px solid var(--brass)}
  /* de recepten waarin het item voorkomt: een lijst naast het formulier (alleen bij een bestaand item) */
  #dlguse{border-left:1px solid var(--line);padding-left:22px;display:grid;align-content:start;gap:8px;max-height:calc(100vh - 110px);overflow:auto}
  #dlguse[hidden]{display:none}
  #dlguse h3{font-family:'Space Mono',monospace;font-size:10px;font-weight:400;letter-spacing:.18em;text-transform:uppercase;color:rgba(30,39,33,.7)}
  #dlguse h4{display:flex;justify-content:space-between;gap:8px;font-size:15px;margin-top:6px}
  #dlguse h4 span{font-family:'Space Mono',monospace;font-size:12px;font-weight:400;color:rgba(30,39,33,.7)}
  #dlguse ul{list-style:none;display:grid}
  #dlguse li{font-size:14px;padding:5px 0;border-bottom:1px dotted var(--line)}
  #dlguse .none{font-size:14px;color:rgba(30,39,33,.7)}
  @media (max-width:560px){ #itemform .row2{grid-template-columns:1fr} }
  @media (max-width:760px){ #itemdlg.has-side #itemform{grid-template-columns:1fr} #dlguse{border-left:0;border-top:1px solid var(--line);padding:16px 0 0;max-height:none} }`;

  const HTML = `
  <dialog id="itemdlg" aria-labelledby="dlgtitle">
    <form id="itemform" novalidate>
      <div class="dlgmain">
      <h2 id="dlgtitle">Item toevoegen</h2>
      <label>Naam
        <small>Receptregels herkennen dit item aan de naam of het trefwoord.</small>
        <input type="text" id="f-name" maxlength="80" autocomplete="off">
      </label>
      <div class="row2">
        <label>Categorie
          <select id="f-cat"></select>
        </label>
        <label>Aantal op voorraad
          <small>Leeg is onbekend. 0 betekent op.</small>
          <input type="number" id="f-qty" min="0" max="99999" step="1" inputmode="numeric">
        </label>
      </div>
      <p id="winenote" hidden>Wijndetails (druif, regio) beheer je in Supabase, in de tabel <b>wines</b>. Een nieuwe wijn staat pas op het menu en de wijnpagina als daar een rij bij staat.</p>
      <div class="row2">
        <label>Trefwoord
          <small>Kleine letters. Niet nodig voor flessen.</small>
          <input type="text" id="f-keyword" maxlength="60" autocomplete="off">
        </label>
        <label>Andere namen
          <small>Gescheiden door komma's, bijv. j&amp;b, jb.</small>
          <input type="text" id="f-aliases" maxlength="120" autocomplete="off">
        </label>
      </div>
      <div class="row2">
        <label>Notitie
          <small>Korte toelichting onder de naam.</small>
          <input type="text" id="f-note" maxlength="200" autocomplete="off">
        </label>
        <label>Barcode
          <small>Voor het scannen van de fles. Cijfers, zonder spaties.</small>
          <input type="text" id="f-barcode" maxlength="64" inputmode="numeric" autocomplete="off">
        </label>
      </div>
      <fieldset>
        <legend>Eigenschappen</legend>
        <label class="check"><input type="checkbox" id="f-menu"> Zichtbaar in het menu</label>
        <label class="check"><input type="checkbox" id="f-stock"> Op voorraad</label>
        <label class="check" id="f-zero-wrap"><input type="checkbox" id="f-zero"> Alcoholvrij (0%)</label>
        <label class="check"><input type="checkbox" id="f-optional"> Optioneel</label>
      </fieldset>
      <p id="dlgerr" role="alert"></p>
      <div class="dlgbtns">
        <button type="submit" class="chip primary" id="dlgsave">Opslaan</button>
        <button type="button" class="chip" id="dlgcancel">Annuleren</button>
        <button type="button" class="chip danger" id="dlgdelete" hidden>Verwijderen</button>
      </div>
      </div>
      <aside id="dlguse" aria-labelledby="dlguse-title" hidden>
        <h3 id="dlguse-title">Komt voor in recepten</h3>
        <div id="dlguse-body"></div>
      </aside>
    </form>
  </dialog>`;

  let ctx = null, built = false, editing = null, servingTouched = false, menuWas = false;
  let catById = new Map(), usedIn = new Map();

  /* "Alcoholvrij (0%)" heeft alleen zin bij drank met alcohol (bier 0.0). Frisdrank, koffie en melk zijn altijd alcoholvrij:
     die categorieën hebben alcoholic = false en krijgen nooit een 0%-markering. Ingrediënten ook niet. */
  const canBeZeroProof = catId => { const c = catById.get(Number(catId)); return !!c && c.kind !== 'ingredient' && !!c.alcoholic; };

  /* in welke recepten een item voorkomt: dezelfde herkenning als stock.js gebruikt voor de beschikbaarheid
     (receptregels via naam, trefwoord en andere namen), plus de flessen die bij het recept horen */
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

  /* de lijst naast het formulier; bij een nieuw item is er niets om te tonen en blijft het venster smal */
  function renderUse(it){
    $('dlguse').hidden = !it;
    $('itemdlg').classList.toggle('has-side', !!it);
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
    $('f-menu').onchange = () => { servingTouched = true; };
    $('f-cat').onchange = () => {
      sync();
      const c = catById.get(Number($('f-cat').value));
      if(!editing && !servingTouched && c) $('f-menu').checked = menuByDefault(c.kind);    // een nieuw item volgt zijn categorie, tot je het vinkje zelf aanraakt
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
    const has = $('f-cat').value !== '';
    const c = catById.get(Number($('f-cat').value));
    $('winenote').hidden = !(c && c.label === WINE_CATEGORY);
    $('f-zero-wrap').hidden = !canBeZeroProof($('f-cat').value);     // geen 0%-optie bij frisdrank, koffie, melk en ingrediënten
    /* zonder categorie kan een item niet op het menu staan: het vinkje gaat uit en is niet te kiezen (de keuze komt terug als je weer een categorie kiest) */
    const m = $('f-menu');
    if(!has && !m.disabled){ menuWas = m.checked; m.checked = false; m.disabled = true; }
    else if(has && m.disabled){ m.disabled = false; m.checked = menuWas; }
    m.parentElement.title = has ? '' : 'Een item zonder categorie staat niet op het menu.';
  }

  function init(options){
    ctx = options;
    catById = new Map(ctx.categories.map(c => [c.id, c]));
    computeUsage();
    build();
  }

  function open(it, opts = {}){
    if(!ctx) throw new Error('kelderItemDialog.init() is nog niet aangeroepen');
    editing = it || null;
    servingTouched = !!it;
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
    $('f-keyword').value = it && it.keyword ? it.keyword : '';
    $('f-aliases').value = it && it.aliases ? it.aliases.join(', ') : '';
    $('f-note').value = it && it.note ? it.note : '';
    $('f-barcode').value = it && it.barcode ? it.barcode : (opts.barcode || '');
    $('f-stock').checked = it ? it.in_stock : true;
    $('f-qty').value = it && it.quantity != null ? String(it.quantity) : '';
    $('f-zero').checked = it ? it.zero_proof : false;
    $('f-optional').checked = it ? it.optional : false;
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

    const fields = {
      name,
      category_id: catId,
      serving: catId !== null && $('f-menu').checked ? 'both' : 'ingredient',      // zonder categorie nooit op het menu
      keyword: $('f-keyword').value.trim().toLowerCase() || null,      // receptregels worden in kleine letters vergeleken
      aliases: $('f-aliases').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
      note: $('f-note').value.trim() || null,
      barcode: code || null,
      in_stock: quantity === null ? $('f-stock').checked : quantity > 0,   // een aantal beslist; zonder aantal het vinkje
      quantity,
      zero_proof: canBeZeroProof(catId) && $('f-zero').checked,        // nooit opslaan bij drank die altijd alcoholvrij is
      optional: $('f-optional').checked
    };
    /* een nieuw item, of een item in een andere categorie, komt onderaan die categorie */
    if(!editing || editing.category_id !== catId)
      fields.sort_order = 1 + Math.max(0, ...ctx.items.filter(i => i.category_id === catId).map(i => i.sort_order));

    $('dlgsave').disabled = true;
    const res = await kelderAdmin.saveItem(editing ? editing.id : null, fields);
    if(!res.ok) return failed(res);
    done(`${name} is ${editing ? 'opgeslagen' : 'toegevoegd'}.`);
  }

  async function remove(){
    if(!editing) return;
    const name = editing.name;
    if(!confirm(`"${name}" definitief verwijderen?\n\nDit kan niet ongedaan worden gemaakt. Recepten die het noemen houden hun tekst, maar de beschikbaarheid ervan wordt niet meer bijgehouden.`)) return;
    $('dlgdelete').disabled = true;
    const res = await kelderAdmin.deleteItem(editing.id);
    if(!res.ok) return failed(res);
    done(`${name} is verwijderd.`);
  }

  window.kelderItemDialog = { init, open, close, recipesOf, canBeZeroProof, barcodeKey, barcodeOk: s => BARCODE_OK.test(String(s || '')) };
})();
