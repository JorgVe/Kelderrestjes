/* Scan foto (voorraad.html): een foto van flessen maken (of kiezen), laten lezen, het resultaat controleren en aanvullen, en dan de voorraad
   bijwerken. Voegt zelf de knop "Scan foto" toe naast "Scan fles" (de barcodescanner) en een eigen venster, dat net zo werkt als dat van
   de barcodescanner: de camera staat meteen aan in het venster en met "Foto maken" neem je de foto. Werkt de camera niet (geen https,
   geen toestemming), dan kies je een foto uit je toestel. Met "Eerdere foto opnieuw scannen" kies je een foto die al in de bucket staat
   (kelderAdmin.recentPhotos) en laat je hem opnieuw lezen, zonder opnieuw te uploaden.
   Verwacht js/scanner.js (kelderScanner.openCamera), js/admin.js (kelderAdmin.analyzePhoto en applyScan) en js/item-dialog.js
   (kelderItemDialog.createItem, voor flessen die nog niet in de lijst staan), en de knop #scan in de werkbalk van voorraad.html.

   Wie doet wat:
     deze pagina    maakt en verkleint de foto, laat het concept zien, laat jou aanvullen wat de foto niet kon vertellen en bevestigen
     Supabase       bewaart de foto (privé), laat Claude de foto lezen (Edge Function analyze-bottles) en past de voorraad aan
                    (database-functie apply_bottle_scan_stock) zodra jij bevestigt
     Claude         leest alleen de foto: welke flessen, hoeveel, wat er op het etiket staat

   De foto wordt eerst in de browser verkleind (hoogstens 2048 px, JPEG): dat is sneller te uploaden en blijft ruim onder de 10 MB van
   de bucket. De herkenning schrijft niets. Elke fles is een regel. Is de fles bekend, dan kies je per regel erbij tellen (het aantal van
   de foto komt bij de voorraad, de standaard) of vervangen. Staat de fles niet in je lijst, dan kies je "Nieuwe fles" en vul je de naam
   en de rest zelf in (die fles wordt dan aangemaakt). Wat de foto niet kon vertellen blijft leeg; regels kun je ook verwijderen of zelf
   toevoegen. Pas als elke regel klaar is, en je bevestigt, verandert er iets. Daarna kun je meteen een nieuwe foto maken; de pagina
   laadt opnieuw als je het venster sluit, zodat de lijst klopt. */
(function(){
  const anchor = document.getElementById('scan');
  if(!anchor || !window.kelderAdmin || !kelderAdmin.analyzePhoto || !kelderAdmin.applyScan) return;

  const MAX_SIDE = 2048, MAX_BYTES = 10 * 1024 * 1024, TYPES = ['image/jpeg', 'image/png', 'image/webp'], MAX_COUNT = 999;
  const NEW = 'new';                                                       // de keuze "Nieuwe fles" in de lijst van een regel
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const style = document.createElement('style');
  style.textContent = `
    dialog#photodlg{margin:auto;border:0;border-top:6px solid var(--brass);padding:0;width:min(560px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:var(--paper);color:var(--ink);box-shadow:0 20px 60px rgba(0,0,0,.35)}
    dialog#photodlg::backdrop{background:rgba(30,39,33,.6)}
    #photodlg .ps-body{padding:20px 22px;display:grid;gap:12px}
    #photodlg h2{font-size:26px}
    #photodlg h3{font-family:'Bodoni Moda',serif;font-weight:700;font-size:24px;line-height:1.1}
    #photodlg form,#photodlg #ps-result,#photodlg #ps-busy,#photodlg #ps-review,#photodlg #ps-recentview,#photodlg .ps-cam{display:grid;gap:12px}
    #photodlg [hidden]{display:none!important}
    #photodlg label.ps-field{display:grid;gap:5px;font-size:14px;font-weight:700}
    #photodlg input[type=file]{font:inherit;font-size:15px;font-weight:400;padding:8px;border:1px dashed var(--line);border-radius:8px;background:#fff;width:100%}
    #photodlg textarea{font:inherit;font-size:15px;font-weight:400;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);width:100%;resize:vertical}
    #photodlg input:focus-visible,#photodlg textarea:focus-visible,#photodlg select:focus-visible{outline:3px solid var(--brass);outline-offset:2px}
    .ps-view{position:relative;background:#111;border-radius:10px;overflow:hidden;aspect-ratio:4/3}
    .ps-view video{width:100%;height:100%;object-fit:cover;display:block}
    .ps-view img{width:100%;height:100%;object-fit:contain;display:block;background:#111}
    #photodlg .ps-hint{font-size:13px;color:rgba(30,39,33,.75)}
    #ps-status{font-size:14px;min-height:1.4em}
    #ps-status.bad,#ps-msg.bad,#ps-vmsg.bad{color:var(--amber);font-weight:700}
    #ps-msg,#ps-vmsg{min-height:1.4em;font-size:14px}
    #photodlg .ps-btns{display:flex;flex-wrap:wrap;gap:8px}
    #photodlg .chip:disabled{opacity:.5;cursor:not-allowed}
    #ps-busy-text{font-size:15px}
    .ps-spin{width:34px;height:34px;border:4px solid var(--line);border-top-color:var(--ink);border-radius:50%;animation:ps-turn 1s linear infinite}
    @keyframes ps-turn{to{transform:rotate(360deg)}}
    @media (prefers-reduced-motion:reduce){.ps-spin{animation-duration:3s}}
    #ps-rlist{list-style:none;display:grid;gap:6px;max-height:min(300px,40vh);overflow:auto}
    #ps-rlist li{border:1px solid var(--line);border-radius:8px;background:#fff;padding:9px 12px;font-size:15px;display:grid;gap:3px}
    #ps-rlist .meta{font-size:13px;color:rgba(30,39,33,.75)}
    #ps-rlist .qty{font-family:'Space Mono',monospace;font-size:13px}
    #ps-rnote{font-size:13px;color:rgba(30,39,33,.75)}
    #ps-photos{list-style:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    #ps-photos button{width:100%;font:inherit;font-size:13px;text-align:left;padding:6px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);cursor:pointer;display:grid;gap:4px}
    #ps-photos button:hover{border-color:var(--shelf-deep)}
    #ps-photos button:focus-visible{outline:3px solid var(--brass);outline-offset:2px}
    #ps-photos img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;background:#111;display:block}
    #ps-recent-msg{min-height:1.4em;font-size:14px}
    #ps-recent-msg.bad{color:var(--amber);font-weight:700}
    #ps-lines{list-style:none;display:grid;gap:8px}
    .ps-line{border:1px solid var(--line);border-radius:8px;background:#fff;padding:10px 12px;display:grid;gap:8px}
    .ps-seen{font-size:14px;font-weight:700}
    .ps-flag{font-size:13px;font-weight:700;color:var(--amber);margin-left:8px}
    .ps-row{display:grid;grid-template-columns:minmax(0,1fr) 92px;gap:8px}
    .ps-line label.ps-lab{display:grid;gap:4px;font-size:13px;font-weight:700;min-width:0}
    .ps-line select,.ps-line input[type=text],.ps-line input[type=number]{font:inherit;font-size:15px;font-weight:400;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);width:100%;min-width:0}
    .ps-mode{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:14px}
    .ps-mode label{display:flex;gap:6px;align-items:center;cursor:pointer}
    .ps-mode input{accent-color:var(--ink)}
    .ps-new{display:grid;gap:8px;border-top:1px dashed var(--line);padding-top:8px}
    .ps-new .ps-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    @media (max-width:420px){.ps-new .ps-two{grid-template-columns:minmax(0,1fr)}}
    .ps-learn{display:flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer}
    .ps-learn input{margin-top:2px;accent-color:var(--ink)}
    .ps-state{font-size:13px;color:rgba(30,39,33,.75)}
    .ps-state.todo{color:var(--amber);font-weight:700}
    .ps-line .ps-del{justify-self:start}`;
  document.head.appendChild(style);

  const dlg = document.createElement('dialog');
  dlg.id = 'photodlg';
  dlg.setAttribute('aria-labelledby', 'ps-title');
  dlg.innerHTML = `
    <div class="ps-body">
      <h2 id="ps-title">Foto scannen</h2>
      <form id="ps-form" novalidate>
        <div class="ps-cam">
          <div class="ps-view" id="ps-view" hidden>
            <video id="ps-video" playsinline muted hidden></video>
            <img id="ps-preview" alt="De gekozen foto" hidden>
          </div>
          <p id="ps-status" role="status" aria-live="polite"></p>
          <div class="ps-btns">
            <button type="button" class="chip primary" id="ps-snap" hidden>Foto maken</button>
            <button type="button" class="chip" id="ps-retake" hidden>Andere foto maken</button>
          </div>
          <p class="ps-hint" id="ps-tip">Tip: liever 3 tot 5 flessen per foto, met de labels naar voren. Zijn het er meer, maak dan meer foto's: na elke scan kun je met "Nog een foto" verder.</p>
        </div>
        <label class="ps-field">Of kies een foto uit je toestel
          <input type="file" id="ps-file" accept="image/jpeg,image/png,image/webp">
        </label>
        <div class="ps-btns"><button type="button" class="chip" id="ps-recent">Eerdere foto opnieuw scannen</button></div>
        <p class="ps-hint">Je controleert het resultaat eerst: er verandert niets voordat je bevestigt. Wat de foto niet kan vertellen, vul je dan zelf in. Staat een fles niet in je lijst, dan kun je hem daarna toevoegen.</p>
        <label class="ps-field">Extra uitleg (optioneel)
          <textarea id="ps-info" rows="2" maxlength="1000" placeholder="bijv. de twee flessen links zijn Havana Club"></textarea>
        </label>
        <p id="ps-msg" role="status" aria-live="polite"></p>
        <div class="ps-btns">
          <button type="submit" class="chip primary" id="ps-go" disabled>Scannen</button>
          <button type="button" class="chip" id="ps-cancel">Annuleren</button>
        </div>
      </form>
      <div id="ps-recentview" hidden>
        <h3>Eerdere foto's</h3>
        <p class="ps-hint">Kies een foto die je eerder hebt gescand. Hij wordt opnieuw gelezen met je lijst van nu, zonder opnieuw te uploaden.</p>
        <p id="ps-recent-msg" role="status" aria-live="polite"></p>
        <ul id="ps-photos"></ul>
        <div class="ps-btns"><button type="button" class="chip" id="ps-recent-back">Terug</button></div>
      </div>
      <div id="ps-busy" hidden>
        <p id="ps-busy-text" role="status" aria-live="polite"></p>
        <div class="ps-spin" aria-hidden="true"></div>
      </div>
      <div id="ps-review" hidden>
        <h3 id="ps-vtitle">Controleer de flessen</h3>
        <p id="ps-vintro"></p>
        <ul id="ps-lines"></ul>
        <div class="ps-btns"><button type="button" class="chip" id="ps-addline">+ Regel toevoegen</button></div>
        <p id="ps-vmsg" role="status" aria-live="polite"></p>
        <div class="ps-btns">
          <button type="button" class="chip primary" id="ps-apply" disabled>Voorraad bijwerken</button>
          <button type="button" class="chip" id="ps-back">Opnieuw scannen met uitleg</button>
          <button type="button" class="chip" id="ps-vcancel">Annuleren</button>
        </div>
      </div>
      <div id="ps-result" hidden>
        <h3 id="ps-rtitle"></h3>
        <p id="ps-rintro"></p>
        <ul id="ps-rlist"></ul>
        <p id="ps-rnote"></p>
        <div class="ps-btns">
          <button type="button" class="chip primary" id="ps-done">Sluiten</button>
          <button type="button" class="chip" id="ps-next" hidden>Nog een foto</button>
          <button type="button" class="chip" id="ps-again" hidden>Opnieuw proberen</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(dlg);

  const $ = id => dlg.querySelector('#' + id);
  const form = $('ps-form'), busy = $('ps-busy'), review = $('ps-review'), result = $('ps-result');
  let file = null, fileReady = false, previewUrl = '', working = false, reloadOnClose = false;
  let stored = null;                                                      // een eerder geüploade foto die opnieuw wordt gelezen: { path, label, url }
  let uploaded = null;                                                    // { file, path }: dezelfde foto hoeft niet opnieuw geüpload
  let lines = [];                                                         // de regels van het concept (zie toLine)
  let cam = null, camToken = 0, cameraFailed = false, lineSeq = 0;

  const rows = () => window.kelderRows || {};                             // de lijst wordt pas na dit script geladen
  const itemList = () => rows().items || [];
  const itemById = id => itemList().find(i => i.id === id) || null;
  const dialogApi = () => window.kelderItemDialog && kelderItemDialog.createItem ? kelderItemDialog : null;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if(cls) e.className = cls; if(text) e.textContent = text; return e; };

  const button = document.createElement('button');
  button.type = 'button'; button.className = 'chip primary'; button.id = 'photoscan'; button.textContent = 'Scan foto';
  anchor.after(button);

  const recentView = $('ps-recentview');
  const show = which => { form.hidden = which !== 'form'; busy.hidden = which !== 'busy'; review.hidden = which !== 'review'; result.hidden = which !== 'result'; recentView.hidden = which !== 'recent'; };
  const say = (text, bad) => { const m = $('ps-msg'); m.textContent = text || ''; m.className = bad ? 'bad' : ''; };
  const sayStatus = (text, bad) => { const m = $('ps-status'); m.textContent = text || ''; m.className = bad ? 'bad' : ''; };
  const sayReview = (text, bad) => { const m = $('ps-vmsg'); m.textContent = text || ''; m.className = bad ? 'bad' : ''; };

  /* ------------------------------------------------------------------ de foto: camera in het venster, of een bestand */

  const canCamera = () => !!(window.kelderScanner && kelderScanner.openCamera);

  function paintView(){
    const photo = !!file || !!stored;
    $('ps-preview').hidden = !photo;
    $('ps-video').hidden = photo || !cam;
    $('ps-view').hidden = !photo && !cam;
    $('ps-snap').hidden = photo || !cam;
    $('ps-retake').hidden = !photo || !canCamera() || cameraFailed;
  }

  function stopCamera(){
    camToken++;                                                           // een camera die nog start, wordt meteen weer uitgezet
    if(cam){ cam.stop(); cam = null; }
    paintView();
  }

  async function startCamera(){
    stopCamera();
    const token = camToken;
    if(!canCamera()){ cameraFailed = true; sayStatus('Kies een foto uit je toestel.'); paintView(); return; }
    sayStatus('Camera starten…');
    try{
      const c = await kelderScanner.openCamera($('ps-video'));
      if(token !== camToken || !dlg.open){ c.stop(); return; }           // het venster is intussen dicht, of er is al een foto gekozen
      cam = c; cameraFailed = false;
      sayStatus('Richt de camera op de flessen en druk op "Foto maken".');
    }catch(e){
      if(token !== camToken) return;
      cameraFailed = true;
      sayStatus((e && e.message ? e.message : 'De camera werkt niet.') + ' Je kunt ook een foto uit je toestel kiezen.', true);
    }
    paintView();
  }

  function setFile(f, ready){
    stored = null;
    file = f; fileReady = !!ready; uploaded = null;
    if(previewUrl){ URL.revokeObjectURL(previewUrl); previewUrl = ''; }
    const img = $('ps-preview');
    if(f){ previewUrl = URL.createObjectURL(f); img.src = previewUrl; } else img.removeAttribute('src');
    $('ps-go').disabled = !f;
    paintView();
  }

  /* het formulier leeg, klaar voor een nieuwe foto (reloadOnClose blijft zoals het is: is er al iets bijgewerkt, dan laadt de pagina straks opnieuw) */
  function resetForm(){
    stopCamera();
    lines = [];
    form.reset(); setFile(null); say(''); sayStatus(''); sayReview('');
    show('form');
  }

  function open(){ reloadOnClose = false; resetForm(); dlg.showModal(); startCamera(); }
  function close(){ if(!working) dlg.close(); }
  button.addEventListener('click', open);
  $('ps-cancel').addEventListener('click', close);
  $('ps-vcancel').addEventListener('click', close);
  $('ps-done').addEventListener('click', close);
  $('ps-next').addEventListener('click', () => { resetForm(); startCamera(); });
  dlg.addEventListener('cancel', e => { if(working) e.preventDefault(); });       // Escape terwijl er gescand wordt: wachten
  /* buiten het venster klikken sluit het, behalve tijdens een scan en in het controlescherm (zodat ingevulde regels niet per ongeluk verdwijnen) */
  if(window.kelderCloseOnOutside) kelderCloseOnOutside(dlg, () => !working && review.hidden);
  dlg.addEventListener('close', () => { stopCamera(); setFile(null); if(reloadOnClose) location.reload(); });

  $('ps-snap').addEventListener('click', async () => {
    if(!cam) return;
    const blob = await cam.snapshot(MAX_SIDE, 0.9);
    if(!blob){ sayStatus('Er is nog geen beeld. Wacht even en probeer het nog eens.', true); return; }
    stopCamera();
    setFile(new File([blob], 'foto.jpg', { type: 'image/jpeg' }), true);     // al verkleind: niet nog eens bewerken
    say(''); sayStatus('Foto klaar. Voeg eventueel uitleg toe en druk op Scannen.');
  });
  $('ps-retake').addEventListener('click', () => { setFile(null); $('ps-file').value = ''; say(''); startCamera(); });

  /* een eerder geüploade foto kiezen om opnieuw te laten lezen: de foto staat al in de bucket, dus er wordt niets geüpload */
  function setStored(p){
    stopCamera();
    file = null; fileReady = false; uploaded = null;
    if(previewUrl){ URL.revokeObjectURL(previewUrl); previewUrl = ''; }
    stored = p;
    $('ps-preview').src = p.url;
    $('ps-file').value = '';
    $('ps-go').disabled = false;
    paintView();
  }
  const photoLabel = p => {
    const when = p.takenAt ? new Date(p.takenAt).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'onbekende tijd';
    return p.bytes ? `${when} · ${Math.max(1, Math.round(p.bytes / 1024))} kB` : when;
  };
  async function openRecent(){
    stopCamera();
    show('recent');
    const msg = $('ps-recent-msg'), ul = $('ps-photos');
    ul.textContent = '';
    msg.className = ''; msg.textContent = 'Eerdere foto\'s ophalen…';
    let res;
    try{ res = await kelderAdmin.recentPhotos(8); }
    catch(err){ res = { ok: false, message: 'De eerdere foto\'s ophalen is mislukt.' }; }
    if(!res.ok){
      if(res.relogin){
        dlg.close();
        if(window.kelderSessionBadge && kelderSessionBadge.openLogin) kelderSessionBadge.openLogin(res.message);
        return;
      }
      msg.className = 'bad'; msg.textContent = res.message;
      return;
    }
    if(!res.photos.length){ msg.textContent = 'Er zijn nog geen eerdere foto\'s.'; return; }
    msg.textContent = '';
    for(const p of res.photos){
      const li = el('li'), b = el('button'), img = el('img'), label = photoLabel(p);
      b.type = 'button';
      img.src = p.url; img.alt = 'Foto van ' + label; img.loading = 'lazy'; img.decoding = 'async';
      b.append(img, el('span', '', label));
      b.addEventListener('click', () => {
        setStored({ path: p.path, label, url: p.url });
        show('form'); say('');
        sayStatus(`Eerdere foto van ${label} gekozen. Voeg eventueel uitleg toe en druk op Scannen.`);
        $('ps-info').focus();
      });
      li.appendChild(b); ul.appendChild(li);
    }
    ul.querySelector('button').focus();
  }
  $('ps-recent').hidden = !kelderAdmin.recentPhotos;
  $('ps-recent').addEventListener('click', openRecent);
  $('ps-recent-back').addEventListener('click', () => { show('form'); if(!file && !stored) startCamera(); else $('ps-recent').focus(); });

  $('ps-file').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0] || null;
    if(f && !/^image\//.test(f.type)){ e.target.value = ''; say('Kies een foto (JPEG, PNG of WebP).', true); return; }
    say('');
    if(f){ stopCamera(); setFile(f, false); sayStatus('Foto klaar. Voeg eventueel uitleg toe en druk op Scannen.'); }
  });

  /* verkleinen tot hoogstens 2048 px en opslaan als JPEG; lukt dat niet, dan gaat het origineel mee (als het een toegestaan type en klein genoeg is) */
  async function prepare(f){
    try{
      const bmp = await createImageBitmap(f);                              // houdt rekening met de stand van de foto (EXIF)
      const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);                        // een PNG met doorzichtige delen wordt anders zwart
      g.drawImage(bmp, 0, 0, w, h);
      if(bmp.close) bmp.close();
      const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.88));
      if(blob) return { blob };
    }catch(err){ /* val terug op het origineel */ }
    if(!TYPES.includes(f.type)) return { error: 'Deze foto kan niet worden gelezen. Gebruik een JPEG-, PNG- of WebP-foto.' };
    if(f.size > MAX_BYTES) return { error: 'De foto is te groot (hoogstens 10 MB).' };
    return { blob: f };
  }

  /* het resultaatvenster: een titel, een lijst en knoppen (ook voor fouten) */
  function fill(title, intro, items, note, doneLabel, again, next){
    $('ps-rtitle').textContent = title;
    $('ps-rintro').textContent = intro;
    $('ps-rnote').textContent = note || '';
    $('ps-done').textContent = doneLabel;
    $('ps-again').hidden = !again;
    $('ps-next').hidden = !next;
    const ul = $('ps-rlist');
    ul.textContent = '';
    ul.hidden = !items.length;
    for(const it of items){
      const li = document.createElement('li');
      const head = document.createElement('span');
      head.textContent = it.head;
      li.appendChild(head);
      if(it.qty){ const q = document.createElement('span'); q.className = 'qty'; q.textContent = it.qty; li.appendChild(q); }
      if(it.meta){ const m = document.createElement('span'); m.className = 'meta'; m.textContent = it.meta; li.appendChild(m); }
      ul.appendChild(li);
    }
    show('result');
    (next ? $('ps-next') : again ? $('ps-again') : $('ps-done')).focus();
  }

  /* ------------------------------------------------------------------ het concept controleren en aanvullen */

  /* een regel van de functie → een regel hier. Wat de foto niet kon geven (aantal, fles) blijft leeg. Is er geen bekende fles en ook geen
     mogelijke, dan gaan we uit van een nieuwe fles: die staat dan al gekozen, met wat de foto erover zegt vooraf ingevuld
     (naam, barcode, categorie, wijnsoort, druif, regio, alcoholpercentage). */
  function toLine(l){
    const d = (l && l.detected) || {}, w = (l && l.wine) || {}, sug = (l && l.suggested) || {};
    const seen = [d.brand, d.name].filter(Boolean).join(' ');
    const code = String(d.barcode || '').replace(/\s+/g, '');
    const api = dialogApi(), cats = rows().categories || [];
    const known = Number.isInteger(l.item_id) && itemById(l.item_id) ? l.item_id : null;
    const candidates = (Array.isArray(l.candidates) ? l.candidates : []).map(c => c && c.id).filter(id => Number.isInteger(id) && itemById(id));
    const isWine = l.is_wine === true || !!l.wine;                         // (een oudere functie gaf alleen de wijngegevens)
    let cat = Number.isInteger(sug.category_id) && cats.some(c => c.id === sug.category_id) ? String(sug.category_id) : '';
    if(isWine && api){ const wc = cats.find(c => api.isWineCat(c.id)); if(wc) cat = String(wc.id); }   // wijn hoort in de categorie Wijn
    const kinds = Object.keys(window.WKINDS || { Bubbels: 1, Wit: 1, 'Rosé': 1, Rood: 1 });
    const abv = typeof sug.abv === 'number' && isFinite(sug.abv) ? String(sug.abv).replace('.', ',') : '';
    return {
      seen: seen || 'Onbekende fles',
      flags: Array.isArray(l.issues) ? l.issues : [],
      itemId: known != null ? known : (api && !candidates.length ? NEW : null),
      proposed: known,                                                     // de fles die de scan zelf koos (null: de beheerder kiest)
      learn: { alias: d.name ? seen.slice(0, 80) : '', barcode: api && api.barcodeOk(code) ? code : '' },   // wat er te onthouden valt als de beheerder een fles kiest
      remember: true,                                                      // het vinkje "Onthoud"; standaard aan
      count: Number.isInteger(d.count) && d.count >= 1 && d.count <= MAX_COUNT ? d.count : null,
      candidates,
      wine: l.wine || null,
      mode: 'add',                                                         // bij een bekende fles: 'add' = erbij tellen, 'set' = vervangen
      fresh: { name: seen, cat, barcode: api && api.barcodeOk(code) ? code : '', kind: kinds.includes(w.kind) ? w.kind : '', grape: w.grape || '', region: w.region || '', abv },
      done: false,                                                         // true: de nieuwe fles is aangemaakt
      manual: false
    };
  }
  const manualLine = () => ({ seen: '', flags: [], itemId: null, proposed: null, learn: { alias: '', barcode: '' }, remember: false, count: null, candidates: [], wine: null, mode: 'add',
    fresh: { name: '', cat: '', barcode: '', kind: '', grape: '', region: '', abv: '' }, done: false, manual: true });

  const catChoice = f => f.cat === '' ? undefined : f.cat === 'none' ? null : Number(f.cat);   // undefined: nog niet gekozen; null: Andere
  const isWineCat = f => { const c = catChoice(f); return !!dialogApi() && c != null && kelderItemDialog.isWineCat(c); };
  const showsAbv = f => { const c = catChoice(f); return !!dialogApi() && c != null && kelderItemDialog.showsAbv(c); };
  const toFields = l => ({
    name: l.fresh.name, category: catChoice(l.fresh) === undefined ? null : catChoice(l.fresh), barcode: l.fresh.barcode,
    abv: showsAbv(l.fresh) ? l.fresh.abv : '', quantity: l.count,
    wine: isWineCat(l.fresh) ? { kind: l.fresh.kind, grape: l.fresh.grape, region: l.fresh.region } : null
  });

  /* Kiest de beheerder zelf een bestaande fles voor een regel die de scan niet (of anders) koppelde, dan kan de site onthouden hoe die fles
     op de foto stond: als andere naam (alleen als de foto een echte naam gaf, niet alleen een merk) en/of als barcode (alleen als het item er
     nog geen heeft). Niet als de naam al bij dit of een ander item hoort. Geeft { alias?, barcode? } of null. */
  function learnFor(l){
    if(l.manual || l.done || l.itemId == null || l.itemId === NEW || l.itemId === l.proposed) return null;
    const it = itemById(l.itemId), api = dialogApi();
    if(!it) return null;
    const out = {}, key = t => fold(t).trim();
    const a = l.learn.alias, k = key(a);
    if(a && k.length >= 3){
      const own = [it.name, it.keyword, ...(it.aliases || [])].some(x => key(x) === k);
      const other = itemList().some(o => o.id !== it.id && [o.name, ...(o.aliases || [])].some(x => key(x) === k));
      if(!own && !other) out.alias = a;
    }
    const b = l.learn.barcode;
    if(b && api && !it.barcode && !itemList().some(o => o.barcode && api.barcodeKey(o.barcode) === api.barcodeKey(b))) out.barcode = b;
    return out.alias || out.barcode ? out : null;
  }
  /* per item wat er onthouden moet worden (zoals het er nu in het venster uitziet) */
  function learnPlan(){
    const plan = new Map();
    for(const l of lines){
      const lf = l.remember ? learnFor(l) : null;
      if(!lf) continue;
      const p = plan.get(l.itemId) || { aliases: [], barcode: '' };
      if(lf.alias && !p.aliases.includes(lf.alias)) p.aliases.push(lf.alias);
      if(lf.barcode && !p.barcode) p.barcode = lf.barcode;
      plan.set(l.itemId, p);
    }
    return plan;
  }
  /* na het bijwerken van de voorraad: onthouden. Mislukt dat, dan blijft de voorraad zoals hij is en staat het in de melding. */
  async function learnAll(plan){
    const done = [], failed = [];
    for(const [id, p] of plan){
      const it = itemById(id), name = it ? it.name : `Item ${id}`;
      let r;
      try{ r = await kelderAdmin.learnItem(id, { aliases: p.aliases, barcode: p.barcode }); }
      catch(err){ r = { ok: false, message: 'onverwachte fout' }; }
      if(!r.ok){ failed.push(`${name} (${r.message})`); continue; }
      if(r.row && it){ it.aliases = r.row.aliases; it.barcode = r.row.barcode; }
      const bits = [...r.added.aliases.map(a => `„${a}”`), ...(r.added.barcode ? [`barcode ${p.barcode}`] : [])];
      if(bits.length) done.push(`${bits.join(' en ')} bij ${name}`);
    }
    const parts = [];
    if(done.length) parts.push('Onthouden: ' + done.join('; ') + '.');
    if(failed.length) parts.push('Niet onthouden: ' + failed.join('; ') + '.');
    return parts.join(' ');
  }

  function lab(text, input){ const l = el('label', 'ps-lab', text); l.appendChild(input); return l; }
  function textInput(value, label, onInput, extra){
    const i = el('input'); i.type = 'text'; i.value = value; i.autocomplete = 'off'; i.setAttribute('aria-label', label);
    if(extra) Object.assign(i, extra);
    i.addEventListener('input', () => { onInput(i.value); refresh(); });
    return i;
  }

  function lineCard(line, n){
    const els = line.els = {};
    const li = el('li', 'ps-line');
    const seen = el('div', 'ps-seen', line.manual ? 'Zelf toegevoegd' : 'Gezien: ' + line.seen);
    if(line.flags.includes('low_confidence')) seen.appendChild(el('span', 'ps-flag', 'Niet zeker'));
    if(line.flags.includes('no_match')) seen.appendChild(el('span', 'ps-flag', 'Niet in je lijst gevonden'));
    li.appendChild(seen);

    const sel = els.sel = el('select', 'ps-item');
    sel.setAttribute('aria-label', `Fles voor regel ${n}`);
    sel.add(new Option('— kies een fles —', ''));
    if(dialogApi()) sel.add(new Option('＋ Nieuwe fles', NEW));
    const cands = line.candidates.map(itemById).filter(Boolean);
    if(cands.length){
      const g = document.createElement('optgroup'); g.label = 'Mogelijk';
      for(const it of cands) g.appendChild(new Option(it.name, String(it.id)));
      sel.appendChild(g);
    }
    const rest = itemList().filter(it => !line.candidates.includes(it.id)).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    const g2 = document.createElement('optgroup'); g2.label = cands.length ? 'Alle andere flessen' : 'Alle flessen';
    for(const it of rest) g2.appendChild(new Option(it.name, String(it.id)));
    sel.appendChild(g2);
    sel.value = line.itemId == null ? '' : String(line.itemId);
    sel.addEventListener('change', () => { line.itemId = sel.value === NEW ? NEW : sel.value ? Number(sel.value) : null; refresh(); });

    const num = els.num = el('input', 'ps-count');
    num.type = 'number'; num.min = '1'; num.max = String(MAX_COUNT); num.step = '1'; num.inputMode = 'numeric';
    num.setAttribute('aria-label', `Aantal voor regel ${n}`);
    num.value = line.count == null ? '' : String(line.count);
    num.addEventListener('input', () => {
      const v = Number(num.value);
      line.count = num.value !== '' && Number.isInteger(v) && v >= 1 && v <= MAX_COUNT ? v : null;
      refresh();
    });

    const row = el('div', 'ps-row');
    row.append(lab('Fles', sel), lab('Aantal', num));
    li.appendChild(row);

    /* bekende fles: erbij tellen of vervangen */
    const seq = ++lineSeq;
    const modeBox = els.modeBox = el('div', 'ps-mode');
    modeBox.setAttribute('role', 'radiogroup'); modeBox.setAttribute('aria-label', `Wat gebeurt er met de voorraad (regel ${n})`);
    els.modeText = {};
    for(const [value, text] of [['add', 'Erbij tellen'], ['set', 'Vervangen']]){
      const l = el('label'), r = el('input'); r.type = 'radio'; r.name = 'ps-mode-' + seq; r.value = value; r.checked = line.mode === value;
      r.addEventListener('change', () => { if(r.checked){ line.mode = value; refresh(); } });
      const t = els.modeText[value] = el('span', '', text);
      l.append(r, t); modeBox.appendChild(l);
    }
    li.appendChild(modeBox);

    /* nieuwe fles: de gegevens zelf invullen (de naam ook) */
    const f = line.fresh, nb = els.newBox = el('div', 'ps-new');
    els.name = textInput(f.name, `Naam van de nieuwe fles (regel ${n})`, v => { f.name = v; }, { maxLength: 120, placeholder: 'bijv. Havana Club 7 Años' });
    const cat = els.cat = el('select');
    cat.setAttribute('aria-label', `Categorie (regel ${n})`);
    cat.add(new Option('Kies een categorie…', ''));
    for(const c of (rows().categories || []).slice().sort((a, b) => a.sort_order - b.sort_order)) cat.add(new Option(c.label, String(c.id)));
    cat.add(new Option('Andere (geen categorie)', 'none'));
    cat.value = f.cat;
    cat.addEventListener('change', () => { f.cat = cat.value; refresh(); });
    els.barcode = textInput(f.barcode, `Barcode (regel ${n})`, v => { f.barcode = v; }, { maxLength: 64, inputMode: 'numeric', placeholder: 'optioneel' });
    const two = el('div', 'ps-two');
    two.append(lab('Categorie', cat), lab('Barcode', els.barcode));
    nb.append(lab('Naam', els.name), two);
    /* alleen bij wijn: soort, druif en regio */
    const wb = els.wineBox = el('div', 'ps-new'); wb.style.borderTop = '0'; wb.style.paddingTop = '0';
    const kind = els.kind = el('select'); kind.setAttribute('aria-label', `Soort wijn (regel ${n})`);
    kind.add(new Option('Kies een soort…', ''));
    for(const [k, text] of Object.entries(window.WKINDS || { Bubbels: 'Bubbels', Wit: 'Witte wijn', 'Rosé': 'Rosé', Rood: 'Rode wijn' })) kind.add(new Option(text, k));
    kind.value = f.kind;
    kind.addEventListener('change', () => { f.kind = kind.value; refresh(); });
    const two2 = el('div', 'ps-two');
    two2.append(lab('Druif', textInput(f.grape, `Druif (regel ${n})`, v => { f.grape = v; }, { maxLength: 120, placeholder: 'optioneel' })),
                lab('Regio', textInput(f.region, `Regio (regel ${n})`, v => { f.region = v; }, { maxLength: 120, placeholder: 'optioneel' })));
    wb.append(lab('Soort wijn', kind), two2);
    nb.appendChild(wb);
    /* alleen bij bier en sterkere drank: het alcoholpercentage */
    els.abvLab = lab('Alcoholpercentage', textInput(f.abv, `Alcoholpercentage (regel ${n})`, v => { f.abv = v; }, { maxLength: 6, inputMode: 'decimal', placeholder: 'optioneel, bijv. 8,5' }));
    nb.appendChild(els.abvLab);
    li.appendChild(nb);

    line.stateEl = el('p', 'ps-state');
    li.appendChild(line.stateEl);

    /* "Onthoud": hoe deze fles op de foto stond, voor de volgende keer */
    const lb = els.learnBox = el('label', 'ps-learn'), lc = els.learnCb = el('input');
    lc.type = 'checkbox'; lc.checked = line.remember;
    lc.addEventListener('change', () => { line.remember = lc.checked; });
    els.learnText = el('span');
    lb.append(lc, els.learnText);
    li.appendChild(lb);

    const del = els.del = el('button', 'chip ps-del', 'Verwijder deze regel');
    del.type = 'button';
    del.setAttribute('aria-label', `Verwijder regel ${n}`);
    del.addEventListener('click', () => { lines.splice(lines.indexOf(line), 1); renderLines(); (lines.length ? $('ps-apply') : $('ps-addline')).focus(); });
    li.appendChild(del);
    return li;
  }

  function renderLines(){
    const ul = $('ps-lines');
    ul.textContent = '';
    lines.forEach((line, i) => ul.appendChild(lineCard(line, i + 1)));
    refresh();
  }

  /* wat er nog mist bij een regel van een nieuwe fles ('' = klaar) */
  function newProblem(l){
    const api = dialogApi(), f = l.fresh;
    if(!f.name.trim()) return 'Vul de naam van de nieuwe fles in.';
    if(catChoice(f) === undefined) return 'Kies een categorie (of "Andere").';
    const r = api.checkNew(toFields(l));
    if(!r.ok) return r.message + (r.clash ? ' Kies dat item dan in de lijst bij "Fles".' : '');
    const twin = lines.find(o => o !== l && !o.done && o.itemId === NEW && fold(o.fresh.name).trim() === fold(f.name).trim());
    if(twin) return 'Een andere nieuwe regel heeft dezelfde naam. Verwijder een van de twee.';
    return '';
  }

  /* per regel zeggen wat er nog mist (of wat er gaat gebeuren) en de knop "Voorraad bijwerken" pas aanzetten als alles klaar is */
  function refresh(){
    const groups = new Map();                                              // bekende fles → de regels waarop hij staat
    for(const l of lines) if(!l.done && l.itemId != null && l.itemId !== NEW){
      if(!groups.has(l.itemId)) groups.set(l.itemId, []);
      groups.get(l.itemId).push(l);
    }
    let open = 0;
    for(const l of lines){
      const els = l.els, isNew = l.itemId === NEW, known = l.itemId != null && !isNew && !l.done;
      els.newBox.hidden = !isNew || l.done;
      els.wineBox.hidden = !isNew || !isWineCat(l.fresh);
      els.abvLab.hidden = !isNew || !showsAbv(l.fresh);
      els.modeBox.hidden = !known;
      for(const c of [els.sel, els.num, els.del]) c.disabled = l.done;
      if(l.count){ els.modeText.add.textContent = `Erbij tellen (+${l.count})`; els.modeText.set.textContent = `Vervangen (wordt ${l.count})`; }
      else{ els.modeText.add.textContent = 'Erbij tellen'; els.modeText.set.textContent = 'Vervangen'; }

      let text = '', ok = false;
      if(l.done) { text = `Toegevoegd: ${l.doneName}, aantal ${l.count}.`; ok = true; }
      else if(l.itemId == null) text = 'Kies welke fles dit is.';
      else if(!l.count) text = `Vul het aantal in (1 t/m ${MAX_COUNT}).`;
      else if(isNew){
        text = newProblem(l);
        ok = !text;
        if(ok) text = `Nieuwe fles (niet in je lijst gevonden): wordt toegevoegd met aantal ${l.count}.`;
      }else{
        const it = itemById(l.itemId), group = groups.get(l.itemId), sum = group.reduce((a, o) => a + (o.count || 0), 0);
        const now = it && it.quantity != null ? it.quantity : 0;
        if(new Set(group.map(o => o.mode)).size > 1) text = 'Deze fles staat op meer regels met een verschillende keuze (erbij tellen of vervangen). Maak ze gelijk of verwijder een regel.';
        else if(sum > MAX_COUNT) text = `Het totaal voor deze fles is meer dan ${MAX_COUNT}.`;
        else{
          ok = true;
          text = l.mode === 'set' ? `Nu op voorraad: ${now}. Wordt: ${sum}.` : `Nu op voorraad: ${now}. Wordt: ${now + sum}.`;
          if(group.length > 1) text += ' Deze fles staat op meer regels; de aantallen worden opgeteld.';
        }
      }
      const lf = known ? learnFor(l) : null;
      els.learnBox.hidden = !lf;
      if(lf){
        const it2 = itemById(l.itemId), bits = [];
        if(lf.alias) bits.push(`„${lf.alias}” als andere naam`);
        if(lf.barcode) bits.push(`de barcode ${lf.barcode}`);
        els.learnText.textContent = `Onthoud ${bits.join(' en ')} van ${it2.name}, zodat deze fles de volgende keer vanzelf wordt herkend.`;
        els.learnCb.checked = l.remember;
      }
      if(!ok) open++;
      l.stateEl.textContent = text;
      l.stateEl.className = 'ps-state' + (ok ? '' : ' todo');
    }
    $('ps-apply').disabled = !lines.length || open > 0;
    if(!lines.length) sayReview('Er is geen fles herkend. Voeg zelf een regel toe, of ga terug en geef extra uitleg.');
    else if(open) sayReview(`${open} ${open === 1 ? 'regel mist' : 'regels missen'} nog iets. Vul ${open === 1 ? 'die' : 'ze'} aan of verwijder ${open === 1 ? 'de regel' : 'de regels'}.`);
    else sayReview('');
  }

  function showReview(){
    $('ps-vintro').textContent =
      'Kies bij een bekende fles of het aantal erbij komt (de standaard) of de voorraad vervangt. Is een fles niet in je lijst gevonden, dan is het een nieuwe fles: controleer de gegevens die de foto liet zien en vul aan wat mist. ' +
      'Kies je zelf een fles voor een regel, dan onthoudt de site (als je het vinkje laat staan) hoe die op de foto stond. Er verandert pas iets als je op "Voorraad bijwerken" drukt.';
    renderLines();
    show('review');
    const first = lines.findIndex(l => l.itemId == null || !l.count);
    if(first >= 0) lines[first].els[lines[first].itemId == null ? 'sel' : 'num'].focus();
    else (lines.length ? $('ps-apply') : $('ps-addline')).focus();
  }

  $('ps-addline').addEventListener('click', () => {
    lines.push(manualLine());
    renderLines();
    lines[lines.length - 1].els.sel.focus();
  });

  /* een nieuwe fles is aangemaakt: de regel hoort er nu bij als bekende fles en wordt niet nog eens aangemaakt */
  function markDone(l, row){
    l.done = true; l.itemId = row.id; l.doneName = row.name; reloadOnClose = true;
    l.els.sel.add(new Option(row.name, String(row.id))); l.els.sel.value = String(row.id);
  }

  /* eerst de nieuwe flessen aanmaken; stopt bij de eerste die niet lukt */
  async function createAll(){
    for(const l of lines){
      if(l.itemId !== NEW || l.done) continue;
      const r = await kelderItemDialog.createItem(toFields(l));
      if(r.row) markDone(l, r.row);                                        // het item staat er nu, ook als de wijngegevens mislukten
      if(!r.ok) return r;
    }
    return { ok: true };
  }

  /* wat er nu in het venster staat opslaan: eerst de nieuwe flessen, dan de voorraad van de bekende in één keer */
  async function apply(){
    if(working || $('ps-apply').disabled) return;
    const byItem = new Map();                                              // een fles op meer regels: de aantallen worden opgeteld
    for(const l of lines){
      if(l.done || l.itemId === NEW) continue;
      const u = byItem.get(l.itemId) || { item_id: l.itemId, count: 0, mode: l.mode };
      u.count += l.count;
      const w = l.wine || {};
      u.wine_grape = u.wine_grape || w.grape || null; u.wine_region = u.wine_region || w.region || null;
      u.wine_alcohol = u.wine_alcohol || w.alcohol || null; u.wine_note = u.wine_note || w.note || null;
      byItem.set(l.itemId, u);
    }
    const plan = learnPlan();                                              // wat er onthouden moet worden, zoals het er nu uitziet
    working = true;
    show('busy');
    $('ps-busy-text').textContent = 'Voorraad bijwerken…';
    let res;
    try{
      res = await createAll();
      if(res.ok) res = byItem.size ? await kelderAdmin.applyScan([...byItem.values()]) : { ok: true, results: [] };
    }catch(err){
      res = { ok: false, timedOut: true, message: 'Bijwerken is mislukt door een onverwachte fout. Controleer de voorraad voordat je het opnieuw probeert.' };
    }finally{
      working = false;
    }
    if(!res.ok){
      if(res.relogin){
        dlg.close();                                                       // (laadt opnieuw als er al iets is aangemaakt)
        if(window.kelderSessionBadge && kelderSessionBadge.openLogin) kelderSessionBadge.openLogin(res.message);
        return;
      }
      if(res.timedOut){                                                    // misschien is het wel gelukt: niet nog eens laten drukken
        reloadOnClose = true;
        fill('Controleer de voorraad', res.message, [], '', 'Sluiten', false, false);
        return;
      }
      show('review');
      refresh();
      sayReview(res.message, true);
      $('ps-apply').focus();
      return;
    }
    reloadOnClose = true;
    for(const r of res.results){                                           // de lijst op de pagina volgt, zodat een volgende foto van de nieuwe stand uitgaat
      const it = itemById(r.item_id);
      if(it){ it.quantity = r.quantity; it.in_stock = r.quantity > 0; }
    }
    let learnedNote = '';
    if(plan.size){                                                         // nog even bezig: het venster blijft dicht tot het onthouden klaar is
      working = true;
      show('busy'); $('ps-busy-text').textContent = 'Onthouden…';
      try{ learnedNote = await learnAll(plan); }finally{ working = false; }
    }
    const wines = new Set((rows().wines || []).map(w => w.item_id));
    const hasWine = res.results.some(r => wines.has(r.item_id));
    const made = lines.filter(l => l.done).map(l => ({ head: l.doneName, qty: `nieuw, aantal ${l.count}` }));
    fill(
      'Voorraad bijgewerkt',
      'Dit is er veranderd:',
      [...made, ...res.results.map(r => ({ head: (itemById(r.item_id) || {}).name || `Item ${r.item_id}`, qty: `nu ${r.quantity}` }))],
      [hasWine ? 'Bij wijn zijn alleen lege velden (druif, regio) aangevuld met wat op het etiket staat.' : '', learnedNote].filter(Boolean).join(' '),
      'Sluiten', false, true);
  }
  $('ps-apply').addEventListener('click', apply);

  /* ------------------------------------------------------------------ de foto lezen */

  async function run(e){
    e.preventDefault();
    if(!(file || stored) || working) return;
    stopCamera();
    working = true;
    show('busy');
    let res;
    try{
      let blob = null;
      const reuse = !!stored || (uploaded && uploaded.file === file);
      if(!reuse){
        $('ps-busy-text').textContent = 'Foto voorbereiden…';
        const p = fileReady && file.size <= MAX_BYTES ? { blob: file } : await prepare(file);
        if(p.error){ show('form'); say(p.error, true); return; }
        blob = p.blob;
      }
      $('ps-busy-text').textContent = (reuse ? 'Flessen herkennen…' : 'Foto uploaden en flessen herkennen…') + ' Dit duurt meestal ongeveer 10 seconden.';
      res = await kelderAdmin.analyzePhoto(blob, { info: $('ps-info').value, path: stored ? stored.path : reuse ? uploaded.path : '' });
    }catch(err){
      res = { ok: false, message: 'Scannen is mislukt door een onverwachte fout. Probeer het opnieuw.' };
    }finally{
      working = false;                                                      // altijd: anders blijft het venster op slot
    }
    if(res.path && !stored) uploaded = { file, path: res.path };

    if(!res.ok){
      if(res.relogin){
        dlg.close();
        if(window.kelderSessionBadge && kelderSessionBadge.openLogin) kelderSessionBadge.openLogin(res.message);
        return;
      }
      fill('Scannen mislukt', res.message, [], '', 'Sluiten', true, false);
      return;
    }
    lines = res.lines.map(toLine);
    showReview();
  }
  form.addEventListener('submit', run);

  const backToForm = () => { show('form'); say(''); $('ps-info').focus(); };
  $('ps-again').addEventListener('click', backToForm);
  $('ps-back').addEventListener('click', backToForm);
})();
