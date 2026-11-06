/* Scan foto (voorraad.html): een foto van flessen kiezen en laten scannen door de Supabase Edge Function scan-bottles, die de flessen
   herkent en de voorraad bijwerkt. Voegt zelf de knop "Scan foto" toe naast "Scan fles" (de barcodescanner) en een eigen venster.
   Verwacht js/admin.js (kelderAdmin.scanBottles) en de knop #scan in de werkbalk van voorraad.html.

   De foto wordt eerst in de browser verkleind (hoogstens 2048 px, JPEG): dat is sneller te uploaden, blijft ruim onder de 10 MB van
   de bucket en zet een foto die op zijn kant is genomen goed. De functie past nooit een deel van een scan toe: is er één fles
   onduidelijk, dan verandert er niets en laat dit venster zien welke, zodat je met uitleg opnieuw kunt scannen (de foto hoeft dan
   niet opnieuw te worden geüpload). Na een geslaagde scan laadt de pagina opnieuw, zodat de lijst klopt. */
(function(){
  const anchor = document.getElementById('scan');
  if(!anchor || !window.kelderAdmin || !kelderAdmin.scanBottles) return;

  const MAX_SIDE = 2048, MAX_BYTES = 10 * 1024 * 1024, TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  const style = document.createElement('style');
  style.textContent = `
    dialog#photodlg{margin:auto;border:0;border-top:6px solid var(--brass);padding:0;width:min(560px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:var(--paper);color:var(--ink);box-shadow:0 20px 60px rgba(0,0,0,.35)}
    dialog#photodlg::backdrop{background:rgba(30,39,33,.6)}
    #photodlg .ps-body{padding:20px 22px;display:grid;gap:12px}
    #photodlg h2{font-size:26px}
    #photodlg h3{font-family:'Bodoni Moda',serif;font-weight:700;font-size:24px;line-height:1.1}
    #photodlg form,#photodlg #ps-result,#photodlg #ps-busy{display:grid;gap:12px}
    #photodlg [hidden]{display:none!important}
    #photodlg label.ps-field{display:grid;gap:5px;font-size:14px;font-weight:700}
    #photodlg input[type=file]{font:inherit;font-size:15px;font-weight:400;padding:8px;border:1px dashed var(--line);border-radius:8px;background:#fff;width:100%}
    #photodlg textarea{font:inherit;font-size:15px;font-weight:400;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);width:100%;resize:vertical}
    #photodlg input:focus-visible,#photodlg textarea:focus-visible{outline:3px solid var(--brass);outline-offset:2px}
    #ps-preview{max-width:100%;max-height:240px;object-fit:contain;justify-self:start;border:1px solid var(--line);border-radius:8px;background:#fff}
    #photodlg fieldset{border:1px solid var(--line);border-radius:8px;padding:10px 12px;display:grid;gap:8px;min-width:0}
    #photodlg legend{font-size:14px;font-weight:700;padding:0 6px}
    #photodlg fieldset label{display:flex;gap:10px;align-items:flex-start;font-size:14px;cursor:pointer}
    #photodlg fieldset input{margin-top:3px;accent-color:var(--ink)}
    #photodlg fieldset b{display:block}
    #photodlg .ps-hint{font-size:13px;color:rgba(30,39,33,.75)}
    #ps-msg{min-height:1.4em;font-size:14px}
    #ps-msg.bad{color:var(--amber);font-weight:700}
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
    #ps-rnote{font-size:13px;color:rgba(30,39,33,.75)}`;
  document.head.appendChild(style);

  const dlg = document.createElement('dialog');
  dlg.id = 'photodlg';
  dlg.setAttribute('aria-labelledby', 'ps-title');
  dlg.innerHTML = `
    <div class="ps-body">
      <h2 id="ps-title">Foto scannen</h2>
      <form id="ps-form" novalidate>
        <label class="ps-field">Foto van de flessen
          <input type="file" id="ps-file" accept="image/jpeg,image/png,image/webp">
        </label>
        <img id="ps-preview" alt="Voorbeeld van de gekozen foto" hidden>
        <fieldset>
          <legend>Wat gebeurt er met de voorraad?</legend>
          <label><input type="radio" name="ps-mode" value="add" checked><span><b>Optellen</b>Het aantal flessen op de foto komt bij het aantal dat er al is.</span></label>
          <label><input type="radio" name="ps-mode" value="set"><span><b>Vervangen</b>Het aantal flessen op de foto wordt het nieuwe aantal.</span></label>
        </fieldset>
        <p class="ps-hint">Alleen de flessen die op de foto staan, worden aangepast. Een fles die niet in je lijst staat, wordt niet toegevoegd.</p>
        <label class="ps-field">Extra uitleg (optioneel)
          <textarea id="ps-info" rows="2" maxlength="1000" placeholder="bijv. de twee flessen links zijn Havana Club"></textarea>
        </label>
        <p id="ps-msg" role="status" aria-live="polite"></p>
        <div class="ps-btns">
          <button type="submit" class="chip primary" id="ps-go" disabled>Scannen</button>
          <button type="button" class="chip" id="ps-cancel">Annuleren</button>
        </div>
      </form>
      <div id="ps-busy" hidden>
        <p id="ps-busy-text" role="status" aria-live="polite"></p>
        <div class="ps-spin" aria-hidden="true"></div>
      </div>
      <div id="ps-result" hidden>
        <h3 id="ps-rtitle"></h3>
        <p id="ps-rintro"></p>
        <ul id="ps-rlist"></ul>
        <p id="ps-rnote"></p>
        <div class="ps-btns">
          <button type="button" class="chip primary" id="ps-done">Sluiten</button>
          <button type="button" class="chip" id="ps-again" hidden>Opnieuw proberen</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(dlg);

  const $ = id => dlg.querySelector('#' + id);
  const form = $('ps-form'), busy = $('ps-busy'), result = $('ps-result');
  let file = null, previewUrl = '', working = false, reloadOnClose = false;
  let uploaded = null;                                                    // { file, path }: dezelfde foto hoeft niet opnieuw geüpload

  const button = document.createElement('button');
  button.type = 'button'; button.className = 'chip primary'; button.id = 'photoscan'; button.textContent = 'Scan foto';
  anchor.after(button);

  const show = which => { form.hidden = which !== 'form'; busy.hidden = which !== 'busy'; result.hidden = which !== 'result'; };
  const say = (text, bad) => { const m = $('ps-msg'); m.textContent = text || ''; m.className = bad ? 'bad' : ''; };
  const setPreview = f => {
    if(previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = f ? URL.createObjectURL(f) : '';
    const img = $('ps-preview');
    img.hidden = !f; if(f) img.src = previewUrl; else img.removeAttribute('src');
  };

  function reset(){
    file = null; uploaded = null; reloadOnClose = false;
    form.reset(); setPreview(null); say(''); $('ps-go').disabled = true;
    show('form');
  }

  function open(){ reset(); dlg.showModal(); $('ps-file').focus(); }
  function close(){ if(!working) dlg.close(); }
  button.addEventListener('click', open);
  $('ps-cancel').addEventListener('click', close);
  $('ps-done').addEventListener('click', close);
  dlg.addEventListener('cancel', e => { if(working) e.preventDefault(); });       // Escape terwijl er gescand wordt: wachten
  dlg.addEventListener('close', () => { setPreview(null); if(reloadOnClose) location.reload(); });

  $('ps-file').addEventListener('change', e => {
    file = e.target.files && e.target.files[0] || null;
    uploaded = null;
    if(file && !/^image\//.test(file.type)){ say('Kies een foto (JPEG, PNG of WebP).', true); file = null; e.target.value = ''; }
    else say('');
    setPreview(file);
    $('ps-go').disabled = !file;
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

  const mode = () => (form.querySelector('input[name=ps-mode]:checked') || {}).value === 'set' ? 'set' : 'add';

  function fill(title, intro, items, note, doneLabel, again){
    $('ps-rtitle').textContent = title;
    $('ps-rintro').textContent = intro;
    $('ps-rnote').textContent = note || '';
    $('ps-done').textContent = doneLabel;
    $('ps-again').hidden = !again;
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
    (again ? $('ps-again') : $('ps-done')).focus();
  }

  function describe(u){
    const d = u.detected || {};
    const label = [d.brand, d.name].filter(Boolean).join(' ') || 'Onbekende fles';
    const count = d.count ? `${d.count} ${d.count === 1 ? 'fles' : 'flessen'}` : 'aantal onzeker';
    const cands = Array.isArray(u.candidates) ? u.candidates.map(c => c.name).filter(Boolean) : [];
    let why;
    if(!d.count) why = 'Het aantal flessen is niet te tellen op de foto.';
    else if(cands.length) why = `Niet zeker welk item dit is. Mogelijk: ${cands.join(', ')}.`;
    else why = 'Niet zeker genoeg herkend, of nog niet in je lijst.';
    return { head: label, qty: count, meta: why };
  }

  async function run(e){
    e.preventDefault();
    if(!file || working) return;
    working = true;
    show('busy');
    let res;
    try{
      let blob = null;
      const reuse = uploaded && uploaded.file === file;
      if(!reuse){
        $('ps-busy-text').textContent = 'Foto voorbereiden…';
        const p = await prepare(file);
        if(p.error){ show('form'); say(p.error, true); return; }
        blob = p.blob;
      }
      $('ps-busy-text').textContent = (reuse ? 'Flessen herkennen…' : 'Foto uploaden en flessen herkennen…') + ' dit kan tot een halve minuut duren.';
      res = await kelderAdmin.scanBottles(blob, { mode: mode(), info: $('ps-info').value, path: reuse ? uploaded.path : '' });
    }catch(err){
      res = { ok: false, message: 'Scannen is mislukt door een onverwachte fout. Controleer de voorraad en probeer het opnieuw.' };
    }finally{
      working = false;                                                      // altijd: anders blijft het venster op slot
    }
    if(res.path) uploaded = { file, path: res.path };

    if(!res.ok){
      if(res.relogin){
        reloadOnClose = false; dlg.close();
        if(window.kelderSessionBadge && kelderSessionBadge.openLogin) kelderSessionBadge.openLogin(res.message);
        return;
      }
      fill('Scannen mislukt', res.message, [], '', 'Sluiten', true);
      return;
    }
    if(res.status === 'updated'){
      const wines = new Set(((window.kelderRows && kelderRows.wines) || []).map(w => w.item_id));
      const hasWine = res.results.some(r => wines.has(r.item_id));
      reloadOnClose = true;
      fill(
        'Voorraad bijgewerkt',
        res.mode === 'set' ? 'Het aantal op de foto is het nieuwe aantal geworden:' : 'Het aantal op de foto is erbij gekomen:',
        res.results.map(r => ({ head: r.item_name || `Item ${r.item_id}`, qty: `nu ${r.quantity}` })),
        hasWine ? 'Bij wijn zijn alleen lege velden (druif, regio) aangevuld met wat op het etiket staat.' : '',
        'Klaar', false);
      return;
    }
    /* needs_information: er is niets aangepast */
    if(res.unresolved.length){
      fill(
        'Er is niets aangepast',
        'Een scan wordt alleen toegepast als elke fles zeker is. Deze flessen waren dat niet. Vul extra uitleg in (bijvoorbeeld naam en aantal) en probeer het opnieuw:',
        res.unresolved.map(describe), '', 'Sluiten', true);
    }else{
      fill('Geen fles herkend', 'Er was geen fles die duidelijk genoeg te lezen was. Probeer een scherpere foto of voeg uitleg toe.', [], '', 'Sluiten', true);
    }
  }
  form.addEventListener('submit', run);

  $('ps-again').addEventListener('click', () => { show('form'); say(''); $('ps-info').focus(); });
})();
