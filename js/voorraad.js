/* Beheer op voorraad.html: zoeken en filteren, de voorraad aanpassen (per item, per categorie, alles tegelijk),
   dranken en ingrediënten toevoegen, wijzigen en verwijderen (het venster uit js/item-dialog.js, hetzelfde als op het
   menu) en een fles scannen. Cocktails en mocktails beheer je hier niet.

   Wordt geladen door kelderBoot() nadat de gegevens en js/stock.js klaar zijn, dus G, R, Z, outSet en isOut bestaan al.
   Schrijven gaat via js/admin.js; wie mag schrijven bepaalt de database, niet deze pagina.

   Een wijziging van de voorraad werkt de pagina meteen bij (alleen nadat Supabase het heeft opgeslagen). Toevoegen,
   wijzigen en verwijderen laadt de pagina daarna opnieuw, zodat alles zeker klopt. De login blijft behouden; de
   melding komt na het herladen. */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();   // zoeken zonder accenten

  const { categories, items } = window.kelderRows;
  const catById = new Map(categories.map(c => [c.id, c]));
  const itemById = id => items.find(i => i.id === Number(id));
  const FLASH = 'kelderrestjes-flash';

  const view = { q: '', status: 'all', cat: 'all' };
  /* items zonder categorie staan onder "Andere" (geen rij in de tabel categories; ook een verwijzing naar een categorie die niet meer bestaat telt zo) */
  const NONE = 'none', OTHER = 'Andere';
  const catOf = it => (it.category_id == null ? undefined : catById.get(it.category_id));

  /* het bewerkvenster is gedeeld met het menu; na opslaan laden we de pagina opnieuw met een melding */
  const dialog = window.kelderItemDialog;
  const canBeZeroProof = dialog.canBeZeroProof;

  /* ------------------------------------------------------------------ meldingen en inloggen */
  const priv = $('private'), msg = $('stockmsg');
  function say(text, bad){ msg.textContent = text || ''; msg.className = bad ? 'bad' : ''; }
  /* on = ingelogd: het overzicht. Anders is er geen formulier op deze pagina: het inlogvenster van het blokje rechtsboven opent
     (met een melding als je sessie verlopen is); na het inloggen laadt deze pagina opnieuw. */
  function show(on, message){
    document.documentElement.classList.remove('maybe-admin');     // nu weten we het: overzicht of inloggen
    if(window.kelderSessionBadge) kelderSessionBadge.refresh();    // "ingelogd als …" rechtsboven
    priv.hidden = !on; say('');
    if(!on){ if(window.kelderSessionBadge && kelderSessionBadge.openLogin) kelderSessionBadge.openLogin(message); return; }
    render();
    let flash = '';
    try{ flash = sessionStorage.getItem(FLASH) || ''; sessionStorage.removeItem(FLASH); }catch(e){}
    if(flash) say(flash);
  }
  /* sessie verlopen: terug naar het inlogscherm met de melding */
  function toLogin(message){ closeScan(); dialog.close(); show(false, message); }
  /* mislukte schrijfactie: bij een verlopen sessie terug naar het inlogscherm, anders de melding tonen */
  function failed(res, btn){
    if(btn) btn.disabled = false;
    if(res.relogin){ toLogin(res.message); return; }
    say(res.message, true);
  }
  function flashReload(text){
    try{ sessionStorage.setItem(FLASH, text); }catch(e){}
    location.reload();
  }

  dialog.init({
    categories, items,
    defaultCategory: () => view.cat === NONE ? '' : view.cat !== 'all' ? Number(view.cat) : null,   // toevoegen in de categorie waar je naar filtert ('' = Andere)
    onDone: flashReload,
    onRelogin: toLogin
  });

  kelderAdmin.current().then(show, () => show(false));


  /* ------------------------------------------------------------------ voorraad bijhouden */
  /* items[].in_stock is de bron voor deze pagina; outSet (stock.js) houdt de beschikbaarheid van recepten bij */
  /* patch = wat js/admin.js heeft opgeslagen: { in_stock, quantity? } (voorraad en aantal horen bij elkaar, zie kelderAdmin.stockPatch) */
  function applyStock(it, patch){
    Object.assign(it, patch);
    if(it.in_stock) outSet.delete(it.name); else outSet.add(it.name);
  }

  /* ------------------------------------------------------------------ tonen */
  function matches(it){
    if(view.status === 'in' && !it.in_stock) return false;
    if(view.status === 'out' && it.in_stock) return false;
    if(view.cat === NONE){ if(catOf(it)) return false; }
    else if(view.cat !== 'all' && String(it.category_id) !== view.cat) return false;
    if(view.q){
      const hay = fold([it.name, it.keyword, ...(it.aliases || []), it.note, it.barcode].join(' '));
      if(!view.q.split(/\s+/).every(w => hay.includes(w))) return false;
    }
    return true;
  }

  /* één rij per item; elke cel heeft een data-label voor de kaartweergave op een smal scherm */
  const NA = '<span class="na">—</span>';
  function row(it){
    const out = !it.in_stock;
    const tags = [
      it.zero_proof && canBeZeroProof(it.category_id) ? '<span class="tag ready">0%</span>' : '',
      it.optional ? '<span class="tag">optioneel</span>' : ''
    ].join('');
    const keys = [it.keyword, ...(it.aliases || [])].filter(Boolean);
    return `<tr class="drink${out ? ' is-out' : ''}">
      <td class="c-status" data-label="Voorraad"><button type="button" class="status" role="switch" aria-checked="${!out}" data-act="toggle" data-id="${it.id}" aria-label="${esc(it.name)}">${out ? 'Op' : 'Op voorraad'}</button></td>
      <td class="c-name" data-label="Naam"><span class="d-name">${esc(it.name)}</span>${tags ? `<span class="tags">${tags}</span>` : ''}</td>
      <td class="c-qty" data-label="Aantal"><input type="number" class="qty" min="0" max="99999" step="1" inputmode="numeric" placeholder="–" value="${it.quantity == null ? '' : it.quantity}" data-act="qty" data-id="${it.id}" aria-label="Aantal op voorraad: ${esc(it.name)}"></td>
      <td class="c-kind" data-label="In menu"><input type="checkbox" class="menu-check" data-act="menu" data-id="${it.id}"${it.serving !== 'ingredient' ? ' checked' : ''} aria-label="Zichtbaar in het menu: ${esc(it.name)}"></td>
      <td class="c-keys${keys.length ? '' : ' na-cell'}" data-label="Herkend als">${keys.length ? keys.map((k, i) => `<span class="key${i ? ' alias' : ''}">${esc(k)}</span>`).join('') : NA}</td>
      <td class="c-act"><button type="button" class="chip" data-act="edit" data-id="${it.id}" aria-label="Bewerken: ${esc(it.name)}">Bewerken</button></td>
    </tr>`;
  }

  /* de groepen: elke categorie, en onderaan "Andere" voor items zonder categorie (alleen als die er zijn) */
  function groups(){
    const g = categories.map(c => ({ key: String(c.id), label: c.label, all: items.filter(i => i.category_id === c.id) }));
    const rest = items.filter(i => !catOf(i));
    if(rest.length) g.push({ key: NONE, label: OTHER, all: rest });
    return g;
  }

  function renderLists(){
    const body = groups().map(g => {
      const all = g.all, vis = all.filter(matches);
      if(!vis.length) return '';
      const out = all.filter(i => !i.in_stock).length;
      return `<tr class="cat-row"><th colspan="6" scope="colgroup"><div class="cat-head"><span class="cat-name">${esc(g.label)}</span><span class="cnt">${all.length - out} van ${all.length} op voorraad</span>${out ? `<button type="button" class="chip restock-cat" data-act="restock-cat" data-cat="${g.key}">Alles op voorraad</button>` : ''}</div></th></tr>${vis.map(row).join('')}`;
    }).join('');
    $('lists').innerHTML = body
      ? `<table class="stocktable"><thead><tr><th class="c-status" scope="col">Voorraad</th><th scope="col">Naam</th><th class="c-qty" scope="col">Aantal</th><th class="c-kind" scope="col">In menu</th><th class="c-keys" scope="col">Herkend als</th><th class="c-act" scope="col"><span class="sr">Acties</span></th></tr></thead><tbody>${body}</tbody></table>`
      : '<p class="empty">Niets gevonden. Pas het zoekwoord of de filters aan.</p>';
  }

  function renderSummary(){
    const out = items.filter(i => !i.in_stock);

    const label = { all: 'Alles', in: 'Op voorraad', out: 'Op' };
    document.querySelectorAll('[data-status]').forEach(b => {
      const s = b.dataset.status;
      const n = s === 'all' ? items.length : s === 'in' ? items.length - out.length : out.length;
      b.textContent = `${label[s]} (${n})`;
      b.setAttribute('aria-pressed', String(view.status === s));
    });

    $('restock').hidden = !out.length;
  }

  /* hoogte van de zwevende werkbalk en de tabelkop, voor de CSS (het staande label en de plakkende kop eronder) */
  function measure(){
    const root = document.documentElement.style;
    const tools = document.querySelector('.tools'), head = document.querySelector('#lists thead');
    if(tools) root.setProperty('--toolsH', tools.offsetHeight + 'px');
    if(head) root.setProperty('--theadH', head.offsetHeight + 'px');
  }
  addEventListener('resize', measure);

  function render(){ renderSummary(); renderLists(); measure(); }
  function focusButton(act, id){
    const b = [...document.querySelectorAll('#lists button')].find(x => x.dataset.act === act && x.dataset.id === String(id));
    if(b) b.focus();
  }

  /* ------------------------------------------------------------------ zoeken en filteren */
  /* het filter biedt alleen categorieën met items aan; lege categorieën (bijv. na verhuizen) zijn er niet meer om te filteren */
  $('catfilter').innerHTML = '<option value="all">Alle categorieën</option>' +
    categories.filter(c => items.some(i => i.category_id === c.id)).map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('') +
    (items.some(i => !catOf(i)) ? `<option value="${NONE}">${OTHER}</option>` : '');
  $('q').addEventListener('input', e => { view.q = fold(e.target.value).trim(); renderLists(); });
  $('catfilter').onchange = e => { view.cat = e.target.value; renderLists(); };
  document.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', () => {
    view.status = b.dataset.status; renderSummary(); renderLists();
  }));

  /* ------------------------------------------------------------------ voorraad aanpassen */
  async function toggle(btn){
    const it = itemById(btn.dataset.id);
    if(!it) return;
    const next = !it.in_stock;
    btn.disabled = true;
    say('Opslaan…');
    const res = await kelderAdmin.setStock([it], { inStock: next });      // "op" zet het aantal op 0
    if(!res.ok) return failed(res, btn);
    applyStock(it, res.patches.get(it.id));
    render();
    say(`${it.name} staat nu ${next ? 'weer op voorraad' : 'als op'}.`);
    focusButton('toggle', it.id);
  }

  async function restock(list, where){
    const gone = list.filter(i => !i.in_stock);
    if(!gone.length) return;
    say('Opslaan…');
    const res = await kelderAdmin.setStock(gone, { inStock: true });      // een aantal van 0 wordt 1
    if(!res.ok) return failed(res);
    gone.forEach(i => applyStock(i, res.patches.get(i.id)));
    render();
    say(`${gone.length} ${gone.length === 1 ? 'item staat' : 'items staan'} weer op voorraad${where ? ` (${where})` : ''}.`);
  }

  $('restock').onclick = () => {
    const n = items.filter(i => !i.in_stock).length;
    if(n && confirm(`Alle ${n} items die op zijn weer op voorraad zetten?`)) restock(items, '');
  };


  $('lists').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if(!btn) return;
    if(btn.dataset.act === 'toggle') toggle(btn);
    else if(btn.dataset.act === 'edit') dialog.open(itemById(btn.dataset.id));
    else if(btn.dataset.act === 'restock-cat'){
      const g = groups().find(x => x.key === btn.dataset.cat);
      if(g) restock(g.all, g.label);
    }
  });

  /* het vinkje "In menu": meteen opslaan (serving 'both' = op het menu, 'ingredient' = niet) */
  $('lists').addEventListener('change', async e => {
    const cb = e.target.closest('input[data-act="menu"]');
    if(!cb) return;
    const it = itemById(cb.dataset.id);
    if(!it) return;
    const next = cb.checked ? 'both' : 'ingredient';
    cb.disabled = true;
    say('Opslaan…');
    const res = await kelderAdmin.saveItem(it.id, { serving: next });
    if(!res.ok){ cb.checked = !cb.checked; cb.disabled = false; return failed(res); }
    it.serving = next;
    render();
    say(`${it.name} staat nu ${cb.checked ? 'op' : 'niet meer op'} het menu.`);
    const again = [...document.querySelectorAll('#lists input[data-act="menu"]')].find(x => x.dataset.id === String(it.id));
    if(again) again.focus();
  });

  /* het aantal: opgeslagen zodra je het veld verlaat of op Enter drukt. 0 zet het item op "op", 1 of meer op "op voorraad",
     leeg betekent onbekend (de schakelaar blijft zoals hij was). De lijst wordt daarna opnieuw opgebouwd; het element dat op
     dat moment focus heeft (bijv. het aantal van het volgende item, na Tab) krijgt daarna weer focus. */
  function renderKeepFocus(){
    const a = document.activeElement;
    const key = a && a.dataset && a.dataset.act ? [a.dataset.act, a.dataset.id] : null;
    render();
    if(!key) return;
    const again = [...document.querySelectorAll('#lists [data-act]')].find(x => x.dataset.act === key[0] && x.dataset.id === key[1]);
    if(again) again.focus();
  }
  $('lists').addEventListener('change', async e => {
    const input = e.target.closest('input[data-act="qty"]');
    if(!input) return;
    const it = itemById(input.dataset.id);
    if(!it) return;
    const before = it.quantity == null ? '' : String(it.quantity);
    const raw = input.value.trim();
    if(raw === before) return;
    if(raw !== '' && !/^\d{1,5}$/.test(raw)){ input.value = before; say('Het aantal is een geheel getal van 0 of meer.', true); return; }
    const quantity = raw === '' ? null : Number(raw);
    input.disabled = true;
    say('Opslaan…');
    const res = await kelderAdmin.setStock([it], { quantity });
    if(!res.ok){ input.value = before; input.disabled = false; return failed(res); }
    applyStock(it, res.patches.get(it.id));
    renderKeepFocus();
    say(quantity === null ? `Het aantal van ${it.name} is gewist.` : `${it.name}: ${quantity} op voorraad${quantity === 0 ? ', dus op' : ''}.`);
  });

  $('additem').onclick = () => dialog.open(null);

  /* ------------------------------------------------------------------ een fles scannen
     De camera en de herkenning zitten in js/scanner.js. Een barcode die bij een drank hoort, opent die drank (voorraad
     wisselen, of het hele bewerkvenster). Een onbekende barcode koppel je één keer aan een drank; daarna werkt hij altijd.
     Kan de camera niet (geen toestemming, geen https), dan kun je de barcode intypen. */
  const sdlg = $('scandlg'), key = dialog.barcodeKey;
  let scan = null, scanned = null, scannedCode = '';
  const setStatus = (t, bad) => { $('sc-status').textContent = t || ''; $('sc-status').className = bad ? 'bad' : ''; };
  const foundMsg = (t, bad) => { $('sc-msg').textContent = t || ''; $('sc-msg').className = bad ? 'bad' : ''; };
  const unknownMsg = (t, bad) => { $('sc-unknown-msg').textContent = t || ''; $('sc-unknown-msg').className = bad ? 'bad' : ''; };
  function showState(s){ $('sc-live').hidden = s !== 'live'; $('sc-found').hidden = s !== 'found'; $('sc-unknown').hidden = s !== 'unknown'; }
  function stopCamera(){ if(scan){ scan.stop(); scan = null; } }
  function closeScan(){ stopCamera(); if(sdlg.open) sdlg.close(); }
  sdlg.addEventListener('close', stopCamera);                  // ook bij Escape: de camera gaat altijd uit

  async function startScanning(){
    stopCamera();
    showState('live');
    $('sc-view').hidden = false;
    $('sc-code').value = '';
    setStatus('Camera starten…');
    if(!window.kelderScanner){ $('sc-view').hidden = true; setStatus('Scannen is niet beschikbaar. Je kunt de barcode intypen.', true); return; }
    try{
      const s = await kelderScanner.start($('sc-video'), code => { scan = null; handleCode(code); });
      if(!sdlg.open){ s.stop(); return; }                      // het venster is intussen dicht
      scan = s;
      setStatus('Richt de camera op de barcode van de fles.');
    }catch(e){
      $('sc-view').hidden = true;                              // geen beeld: alleen nog intypen
      setStatus((e && e.message ? e.message : 'De camera werkt niet.') + ' Je kunt de barcode ook intypen.', true);
    }
  }

  function handleCode(raw){
    const code = String(raw || '').trim();
    stopCamera();
    if(!dialog.barcodeOk(code)){ showState('live'); setStatus('Dat is geen geldige barcode. Gebruik cijfers, zonder spaties.', true); return; }
    try{ if(navigator.vibrate) navigator.vibrate(60); }catch(e){}
    const it = items.find(i => i.barcode && key(i.barcode) === key(code));
    if(it) showFound(it, code, ''); else showUnknown(code);
  }

  function paintToggle(){
    const out = !scanned.in_stock, b = $('sc-toggle');
    b.textContent = out ? 'Op' : 'Op voorraad';
    b.setAttribute('aria-checked', String(!out));
    b.setAttribute('aria-label', scanned.name);
  }
  function showFound(it, code, note){
    scanned = it; scannedCode = code;
    showState('found');
    $('sc-found-code').textContent = code;
    $('sc-found-name').textContent = it.name;
    const cat = catOf(it);
    $('sc-found-meta').textContent = [cat ? cat.label : OTHER, it.serving !== 'ingredient' ? 'Staat op het menu' : 'Niet op het menu'].filter(Boolean).join(' · ');
    paintToggle();
    foundMsg(note);
  }

  $('sc-toggle').onclick = async () => {
    const it = scanned;
    if(!it) return;
    const next = !it.in_stock, b = $('sc-toggle');
    b.disabled = true;
    foundMsg('Opslaan…');
    const res = await kelderAdmin.setStock([it], { inStock: next });
    b.disabled = false;
    if(!res.ok){ if(res.relogin) return toLogin(res.message); foundMsg(res.message, true); return; }
    applyStock(it, res.patches.get(it.id));
    render();                                                  // de lijst achter het venster volgt meteen
    paintToggle();
    foundMsg(`${it.name} staat nu ${next ? 'weer op voorraad' : 'als op'}.`);
  };
  $('sc-edit').onclick = () => { const it = scanned; closeScan(); if(it) dialog.open(it); };
  $('sc-next').onclick = startScanning;

  /* onbekende barcode: kies de drank waar hij bij hoort, of voeg een nieuwe drank toe */
  function showUnknown(code){
    scannedCode = code;
    showState('unknown');
    $('sc-unknown-code').textContent = code;
    $('sc-q').value = '';
    unknownMsg('');
    renderPick();
  }
  function renderPick(){
    const q = fold($('sc-q').value).trim();
    const cats = i => (catOf(i) || { label: OTHER }).label;
    const list = items
      .filter(i => !q || q.split(/\s+/).every(w => fold(i.name + ' ' + cats(i)).includes(w)))
      .sort((a, b) => (!!a.barcode - !!b.barcode) || a.name.localeCompare(b.name, 'nl'))     // eerst wat nog geen barcode heeft
      .slice(0, 40);
    $('sc-list').innerHTML = list.length
      ? list.map(i => `<li><button type="button" data-link="${i.id}"><span>${esc(i.name)}</span><span class="meta">${esc(cats(i))}${i.barcode ? ' · heeft al een barcode' : ''}</span></button></li>`).join('')
      : '<li class="none">Geen drank gevonden.</li>';
  }
  $('sc-q').addEventListener('input', renderPick);
  $('sc-list').addEventListener('click', async e => {
    const b = e.target.closest('button[data-link]');
    const it = b && itemById(b.dataset.link);
    if(!it) return;
    const replacing = it.barcode && key(it.barcode) !== key(scannedCode);
    if(!confirm(`Barcode ${scannedCode} koppelen aan "${it.name}"?` + (replacing ? `\n\nDeze drank heeft al barcode ${it.barcode}; die wordt vervangen.` : ''))) return;
    unknownMsg('Opslaan…');
    const res = await kelderAdmin.saveItem(it.id, { barcode: scannedCode });
    if(!res.ok){ if(res.relogin) return toLogin(res.message); unknownMsg(res.message, true); return; }
    it.barcode = scannedCode;
    render();
    showFound(it, scannedCode, `Gekoppeld: ${scannedCode} hoort nu bij ${it.name}.`);
  });
  $('sc-new').onclick = () => { const code = scannedCode; closeScan(); dialog.open(null, { barcode: code }); };
  $('sc-retry').onclick = startScanning;

  $('sc-manual').onsubmit = e => {
    e.preventDefault();
    const v = $('sc-code').value.trim();
    if(!v){ setStatus('Typ eerst een barcode.', true); return; }
    handleCode(v);
  };
  $('sc-close').onclick = closeScan;
  $('scan').onclick = () => { sdlg.showModal(); startScanning(); };
})();
