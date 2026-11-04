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
  dialog#itemdlg::backdrop{background:rgba(30,39,33,.55)}
  #itemform{padding:22px 24px 20px;display:grid;gap:14px}
  #itemform h2{font-size:26px}
  #itemform label{display:grid;gap:4px;font-size:14px;font-weight:700}
  #itemform label small{font-weight:400;color:rgba(30,39,33,.65)}
  #itemform input[type=text],#itemform select{font:inherit;font-size:15px;font-weight:400;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);width:100%;min-width:0}
  #itemform input:focus-visible,#itemform select:focus-visible{outline:3px solid var(--brass);outline-offset:2px}
  #itemform .row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  #itemform fieldset{border:0;display:flex;flex-wrap:wrap;gap:8px 20px}
  #itemform legend{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:rgba(30,39,33,.5);margin-bottom:6px}
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
  #winenote,#dlguse{font-size:13px;background:var(--paper-2);padding:8px 12px;border-left:3px solid var(--brass)}
  #dlguse{border-left-color:var(--shelf)}
  @media (max-width:560px){ #itemform .row2{grid-template-columns:1fr} }`;

  const HTML = `
  <dialog id="itemdlg" aria-labelledby="dlgtitle">
    <form id="itemform" novalidate>
      <h2 id="dlgtitle">Item toevoegen</h2>
      <label>Naam
        <small>Receptregels herkennen dit item aan de naam of het trefwoord.</small>
        <input type="text" id="f-name" maxlength="80" autocomplete="off">
      </label>
      <label>Categorie
        <select id="f-cat"></select>
      </label>
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
      <p id="dlguse" class="dlghint" hidden></p>
      <fieldset>
        <legend>Eigenschappen</legend>
        <label class="check"><input type="checkbox" id="f-menu"> Zichtbaar in het menu</label>
        <label class="check"><input type="checkbox" id="f-stock"> Op voorraad</label>
        <label class="check" id="f-zero-wrap"><input type="checkbox" id="f-zero"> Alcoholvrij (0%)</label>
        <label class="check"><input type="checkbox" id="f-optional"> Optioneel</label>
        <label class="check"><input type="checkbox" id="f-confirm"> Te bevestigen</label>
      </fieldset>
      <p id="dlgerr" role="alert"></p>
      <div class="dlgbtns">
        <button type="submit" class="chip primary" id="dlgsave">Opslaan</button>
        <button type="button" class="chip" id="dlgcancel">Annuleren</button>
        <button type="button" class="chip danger" id="dlgdelete" hidden>Verwijderen</button>
      </div>
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
    usedIn = new Map(ctx.items.map(i => [i.name, new Set()]));
    if(typeof reqGroups !== 'function' || typeof R === 'undefined' || typeof Z === 'undefined') return;
    for(const r of [...R, ...Z]){
      const found = new Set([...(r.b || []), ...reqGroups(r).flat().map(i => i.n)]);
      for(const n of found){ const s = usedIn.get(n); if(s) s.add(r.n); }
    }
  }
  const recipesOf = it => [...(usedIn.get(it.name) || [])];

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
    $('f-zero').checked = it ? it.zero_proof : false;
    $('f-optional').checked = it ? it.optional : false;
    $('f-confirm').checked = it ? it.to_confirm : false;
    $('dlgdelete').hidden = !it;
    const used = it ? recipesOf(it) : [];
    $('dlguse').hidden = !it;
    $('dlguse').textContent = !it ? '' : used.length
      ? `Komt voor in ${used.length} ${used.length === 1 ? 'recept' : 'recepten'}: ${used.join(', ')}.`
      : 'Komt in geen enkel recept voor.';
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

    const fields = {
      name,
      category_id: catId,
      serving: catId !== null && $('f-menu').checked ? 'both' : 'ingredient',      // zonder categorie nooit op het menu
      keyword: $('f-keyword').value.trim().toLowerCase() || null,      // receptregels worden in kleine letters vergeleken
      aliases: $('f-aliases').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
      note: $('f-note').value.trim() || null,
      barcode: code || null,
      in_stock: $('f-stock').checked,
      zero_proof: canBeZeroProof(catId) && $('f-zero').checked,        // nooit opslaan bij drank die altijd alcoholvrij is
      optional: $('f-optional').checked,
      to_confirm: $('f-confirm').checked
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
