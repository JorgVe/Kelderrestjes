/* De etiketfoto van een wijn bekijken (wijnen.html, voor iedereen). Heeft een wijn een foto (wines.label_path, migratie 0029), dan staat er op
   zijn kaart een knop "Etiket"; die opent de foto in een venster, met een link om hem groter te bekijken (handig op een telefoon).
   De foto's staan in de publieke bucket wine-labels; het adres maakt js/data-loader.js (W[i].label, leeg zonder foto).

     kelderWineLabel.button(w)        de HTML van de knop voor een wijn uit W (leeg als er geen foto is)
     kelderWineLabel.open(adres, naam) het venster openen (ook los te gebruiken)

   Een klik op een knop met data-wine-label doet het zelf (één luisteraar op het document): de pagina hoeft er niets voor aan te sluiten.
   Het venster en zijn stijl komen pas bij de eerste klik in de pagina. js/dialog-outside.js is optioneel (buiten klikken sluit het). */
(function(){
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const SAFE = /^https?:\/\//i;                                              // alleen een webadres: nooit javascript: of data:

  const CSS = `
    dialog#labeldlg{margin:auto;border:0;border-top:6px solid var(--brass);padding:0;width:min(560px,calc(100vw - 24px));max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow:auto;background:var(--paper);color:var(--ink);box-shadow:0 20px 60px rgba(0,0,0,.35)}
    dialog#labeldlg::backdrop{background:rgba(30,39,33,.6)}
    #labeldlg .lbl-body{padding:18px 20px 20px;display:grid;gap:12px}
    #labeldlg h2{font-size:24px;line-height:1.15}
    #labeldlg figure{margin:0;display:grid;gap:8px;justify-items:center}
    #labeldlg img{display:block;max-width:100%;height:auto;max-height:min(68vh,640px);max-height:min(68dvh,640px);object-fit:contain;border-radius:6px;background:#fff}
    #labeldlg figcaption{font-size:13px;color:rgba(30,39,33,.75);text-align:center}
    #labeldlg .lbl-msg{font-size:14px;min-height:1.4em}
    #labeldlg .lbl-msg.bad{color:var(--amber);font-weight:700}
    #labeldlg .lbl-btns{display:flex;flex-wrap:wrap;gap:8px}
    #labeldlg .chip.primary{background:var(--ink);color:var(--paper);border-color:var(--ink)}
    #labeldlg .chip.primary:hover{background:var(--shelf-deep);border-color:var(--shelf-deep)}
    #labeldlg [hidden]{display:none!important}`;

  let dlg = null;
  function build(){
    if(dlg) return dlg;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    dlg = document.createElement('dialog');
    dlg.id = 'labeldlg';
    dlg.setAttribute('aria-labelledby', 'lbl-title');
    dlg.innerHTML = `
      <div class="lbl-body">
        <h2 id="lbl-title"></h2>
        <figure>
          <img id="lbl-img" alt="">
          <figcaption id="lbl-cap">Foto van het etiket</figcaption>
        </figure>
        <p class="lbl-msg" id="lbl-msg" role="status" aria-live="polite"></p>
        <div class="lbl-btns">
          <button type="button" class="chip primary" id="lbl-close" autofocus>Sluiten</button>
          <a class="chip" id="lbl-big" href="#" target="_blank" rel="noopener">Groter bekijken ↗</a>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    const img = dlg.querySelector('#lbl-img'), msg = dlg.querySelector('#lbl-msg');
    img.addEventListener('error', () => { msg.textContent = 'De foto kon niet worden geladen.'; msg.className = 'lbl-msg bad'; img.hidden = true; });
    img.addEventListener('load', () => { msg.textContent = ''; msg.className = 'lbl-msg'; });
    dlg.querySelector('#lbl-close').addEventListener('click', () => dlg.close());
    /* niet blijven vasthouden (en de volgende keer geen oude foto even zien); het close-event komt een tikje na het sluiten, dus niet als het venster alweer open is */
    dlg.addEventListener('close', () => { if(!dlg.open) img.removeAttribute('src'); });
    if(window.kelderCloseOnOutside) kelderCloseOnOutside(dlg);
    return dlg;
  }

  function open(url, name){
    if(!SAFE.test(String(url || ''))) return false;
    const d = build();
    const label = String(name || '').trim();
    d.querySelector('#lbl-title').textContent = label ? `Etiket van ${label}` : 'Etiket';
    const img = d.querySelector('#lbl-img');
    img.hidden = false;
    img.alt = label ? `Foto van het etiket van ${label}` : 'Foto van het etiket';
    const msg = d.querySelector('#lbl-msg');
    msg.textContent = 'Foto laden…'; msg.className = 'lbl-msg';
    img.src = url;
    d.querySelector('#lbl-big').href = url;
    if(!d.open) d.showModal();
    return true;
  }

  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button[data-wine-label]');
    if(b) open(b.dataset.wineLabel, b.dataset.wineName);
  });

  window.kelderWineLabel = {
    open,
    button: w => w && w.label && SAFE.test(w.label)
      ? `<button type="button" class="chip wine-label" data-wine-label="${esc(w.label)}" data-wine-name="${esc(w.n)}" aria-label="Etiket van ${esc(w.n)} bekijken">Etiket bekijken</button>`
      : ''
  };
})();
