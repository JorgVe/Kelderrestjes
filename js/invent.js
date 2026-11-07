/* Nieuwe cocktail of mocktail laten bedenken (cocktails.html en mocktails.html, alleen voor beheerders): Claude verzint uit wat er nu op
   voorraad is tot drie recepten die er nog niet zijn. Jij kiest er een en controleert het in het gewone receptvenster.

   Wie doet wat:
     deze pagina    laat een eventuele wens intypen, toont de voorstellen en opent het gekozen voorstel in het receptvenster
                    (js/recipe-dialog.js), waar je alles kunt aanpassen en zelf op Opslaan drukt
     Supabase       draait de Edge Function cocktail-ai (actie invent): ze controleert dat je beheerder bent (elke vraag kost geld), geeft
                    Claude de ingrediënten op voorraad en de recepten die er al zijn, en controleert elk voorstel: alleen items uit de
                    voorraad, een mocktail zonder alcohol, een cocktail mét, en geen naam die al bestaat
     Claude         verzint de recepten
   Er wordt niets opgeslagen voordat je dat zelf doet.

   Zo min mogelijk gedoe: één knop; de wens is optioneel (leeg laten = verras me); "Nog andere voorstellen" geeft nieuwe en laat de vorige
   niet terugkomen; de voorstellen blijven staan als je het receptvenster sluit zonder op te slaan, zodat je een ander voorstel kunt kiezen.

   Gebruik:  kelderInvent.init({ host: element waar de knop in komt, kind: 'cocktail' | 'mocktail' })
   Verwacht js/admin.js (kelderAdmin.inventRecipe), js/recipe-dialog.js (kelderRecipeDialog) en, optioneel, js/dialog-outside.js. */
(function(){
  const NOUN = { cocktail: 'cocktail', mocktail: 'mocktail' };
  const MAX = 300;

  const style = document.createElement('style');
  style.textContent = `
    dialog#inventdlg{margin:auto;border:0;border-top:6px solid var(--brass);padding:0;width:min(640px,calc(100vw - 24px));max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow:auto;background:var(--paper);color:var(--ink);box-shadow:0 20px 60px rgba(0,0,0,.35)}
    dialog#inventdlg::backdrop{background:rgba(30,39,33,.6)}
    #inventdlg [hidden]{display:none!important}
    #inventdlg .iv-body{padding:20px 22px;display:grid;gap:12px}
    #inventdlg h2{font-size:26px}
    #inventdlg h3{font-family:'Bodoni Moda',serif;font-weight:700;font-size:22px;line-height:1.15}
    #inventdlg h3:focus{outline:none}
    #inventdlg form,#inventdlg #iv-busy,#inventdlg #iv-result{display:grid;gap:12px}
    #inventdlg label.iv-field{display:grid;gap:5px;font-size:14px;font-weight:700}
    #inventdlg textarea{font:inherit;font-size:16px;font-weight:400;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);width:100%;resize:vertical;min-height:84px}
    #inventdlg textarea:focus-visible{outline:3px solid var(--brass);outline-offset:2px}
    #inventdlg .iv-hint{font-size:13px;color:rgba(30,39,33,.75)}
    #inventdlg .iv-btns{display:flex;flex-wrap:wrap;gap:8px}
    #inventdlg .chip.primary{background:var(--ink);color:var(--paper);border-color:var(--ink)}
    #inventdlg .chip.primary:hover:not(:disabled){background:var(--shelf-deep);border-color:var(--shelf-deep)}
    #inventdlg .chip:disabled{opacity:.5;cursor:not-allowed}
    #iv-msg{min-height:1.4em;font-size:14px}
    #iv-msg.bad{color:var(--amber);font-weight:700}
    .iv-spin{width:34px;height:34px;border:4px solid var(--line);border-top-color:var(--ink);border-radius:50%;animation:iv-turn 1s linear infinite}
    @keyframes iv-turn{to{transform:rotate(360deg)}}
    @media (prefers-reduced-motion:reduce){.iv-spin{animation-duration:3s}}
    #iv-drafts{list-style:none;display:grid;gap:12px}
    .iv-draft{border:1px solid var(--line);border-radius:8px;background:#fff;padding:14px 16px;display:grid;gap:8px}
    .iv-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px}
    .iv-name{font-family:'Bodoni Moda',serif;font-weight:700;font-size:22px;line-height:1.15}
    .iv-tag{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;padding:3px 7px;border:1px solid var(--line);color:rgba(30,39,33,.7);white-space:nowrap}
    .iv-blurb{font-size:14px;font-style:italic;color:rgba(30,39,33,.75)}
    .iv-spec{list-style:none;font-family:'Space Mono',monospace;font-size:13px;line-height:1.8}
    .iv-spec li{display:flex;gap:10px;border-bottom:1px dotted var(--line)}
    .iv-spec .ml{min-width:56px;color:rgba(30,39,33,.7)}
    .iv-spec .loose{color:rgba(30,39,33,.55);font-size:11px;align-self:center}
    .iv-method{font-size:14px}
    .iv-why{font-size:13px;color:rgba(30,39,33,.75)}
    .iv-note{font-size:14px;border-left:3px solid var(--line);padding:2px 0 2px 12px}
    #inventdlg .iv-dev{background:#fff3cd;border:1px solid #e0c36a;border-radius:8px;padding:6px 10px;font-size:13px}`;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; };

  let built = null;

  function build(opts){
    document.head.appendChild(style);                                       // pas voor een beheerder: bezoekers krijgen dit venster en zijn opmaak niet
    const kind = opts.kind === 'mocktail' ? 'mocktail' : 'cocktail';
    const noun = NOUN[kind];
    const dlg = document.createElement('dialog');
    dlg.id = 'inventdlg';
    dlg.setAttribute('aria-labelledby', 'iv-title');
    dlg.innerHTML = `
      <div class="iv-body">
        <h2 id="iv-title">Nieuwe ${noun} laten bedenken</h2>
        <form id="iv-form" novalidate>
          <label class="iv-field">Waar heb je zin in? (mag leeg)
            <textarea id="iv-wish" rows="3" maxlength="${MAX}" placeholder="bijv. iets met de amaretto, fris, zonder eiwit"></textarea>
          </label>
          <p class="iv-hint">Claude gebruikt alleen wat nu op voorraad is en geeft tot drie voorstellen. Je controleert er één in het gewone receptvenster; er wordt niets opgeslagen voordat jij dat doet.</p>
          <p id="iv-msg" role="status" aria-live="polite"></p>
          <div class="iv-btns">
            <button type="submit" class="chip primary" id="iv-go">Bedenk recepten</button>
            <button type="button" class="chip" id="iv-cancel">Sluiten</button>
          </div>
        </form>
        <div id="iv-busy" hidden>
          <p role="status" aria-live="polite">Even bedenken wat er kan met wat er in de kelder staat… Dit duurt meestal 10 tot 30 seconden.</p>
          <div class="iv-spin" aria-hidden="true"></div>
          <div class="iv-btns"><button type="button" class="chip" id="iv-stop">Stoppen</button></div>
        </div>
        <div id="iv-result" hidden>
          <h3 id="iv-rtitle" tabindex="-1"></h3>
          <ul id="iv-drafts"></ul>
          <p id="iv-rnote" class="iv-note" hidden></p>
          <div class="iv-btns">
            <button type="button" class="chip" id="iv-more">Nog andere voorstellen</button>
            <button type="button" class="chip" id="iv-edit">Wens aanpassen</button>
            <button type="button" class="chip" id="iv-done">Sluiten</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    if(window.kelderInvent && kelderInvent.devNote) dlg.querySelector('.iv-body').prepend(el('p', 'iv-dev', kelderInvent.devNote));

    const $ = id => dlg.querySelector('#' + id);
    const form = $('iv-form'), busy = $('iv-busy'), result = $('iv-result'), ta = $('iv-wish');
    let token = 0;                                                          // een antwoord van een vraag die inmiddels is gestopt of gesloten, wordt genegeerd
    let last = null;                                                        // het laatste antwoord, zodat je na het receptvenster een ander voorstel kunt kiezen
    const seen = [];                                                        // namen van alle voorstellen die al getoond zijn

    const show = which => { form.hidden = which !== 'form'; busy.hidden = which !== 'busy'; result.hidden = which !== 'result'; };
    const say = (text, bad) => { const m = $('iv-msg'); m.textContent = text || ''; m.className = bad ? 'bad' : ''; };

    function draftEl(d){
      const li = el('li', 'iv-draft');
      const head = el('div', 'iv-head');
      head.appendChild(el('strong', 'iv-name', d.name));
      if(d.style) head.appendChild(el('span', 'iv-tag', d.style));
      li.appendChild(head);
      if(d.blurb) li.appendChild(el('p', 'iv-blurb', d.blurb));
      const spec = el('ul', 'iv-spec');
      for(const l of d.lines || []){
        const row = el('li');
        row.appendChild(el('span', 'ml', l.amount || ''));
        row.appendChild(el('span', null, l.ingredient));
        if(!(l.items || []).length) row.appendChild(el('span', 'loose', 'niet gekoppeld'));
        spec.appendChild(row);
      }
      li.appendChild(spec);
      if(d.method) li.appendChild(el('p', 'iv-method', d.method));
      if(d.why) li.appendChild(el('p', 'iv-why', d.why));
      const use = el('button', 'chip primary', 'Controleren en toevoegen');
      use.type = 'button';
      use.setAttribute('aria-label', `Controleren en toevoegen: ${d.name}`);
      use.addEventListener('click', () => {
        dlg.close();
        if(window.kelderRecipeDialog) kelderRecipeDialog.open(null, { kind, draft: d });
      });
      const row = el('div', 'iv-btns');
      row.appendChild(use);
      li.appendChild(row);
      return li;
    }

    function showResult(res){
      const drafts = Array.isArray(res.drafts) ? res.drafts : [];
      const list = $('iv-drafts'), note = $('iv-rnote');
      list.textContent = '';
      drafts.forEach(d => list.appendChild(draftEl(d)));
      note.textContent = res.note || '';
      note.hidden = !res.note;
      $('iv-rtitle').textContent = drafts.length ? (drafts.length === 1 ? 'Een voorstel' : `${drafts.length} voorstellen`) : 'Geen voorstel';
      show('result');
      $('iv-rtitle').focus();
    }

    async function run(){
      const mine = ++token;
      say('');
      show('busy');
      let res;
      try{ res = await kelderAdmin.inventRecipe({ kind, wish: ta.value.trim(), avoid: seen.slice(-9) }); }
      catch(e){ res = { ok: false, message: 'Bedenken mislukt: ' + ((e && e.message) || e) }; }
      if(mine !== token) return;
      if(!res.ok){
        show('form'); say(res.message, true);
        if(res.relogin && opts.onRelogin){ dlg.close(); opts.onRelogin(res.message); }
        return;
      }
      if(res.status === 'no_ingredients'){ show('form'); say('Er staat te weinig op voorraad om iets mee te bedenken.', true); return; }
      for(const d of res.drafts || []) seen.push(d.name);
      last = res;
      showResult(res);
    }

    form.addEventListener('submit', e => { e.preventDefault(); seen.length = 0; last = null; run(); });
    ta.addEventListener('keydown', e => {
      if((e.metaKey || e.ctrlKey) && e.key === 'Enter'){ e.preventDefault(); seen.length = 0; last = null; run(); }
    });
    $('iv-more').addEventListener('click', run);
    $('iv-stop').addEventListener('click', () => { token++; show(last ? 'result' : 'form'); say(last ? '' : 'Gestopt. Je kunt de wens aanpassen en opnieuw proberen.'); });
    $('iv-edit').addEventListener('click', () => { show('form'); say(''); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
    $('iv-cancel').addEventListener('click', () => dlg.close());
    $('iv-done').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => { token++; say(''); });
    if(window.kelderCloseOnOutside) kelderCloseOnOutside(dlg, () => busy.hidden);   // niet tijdens het bedenken: de vraag kost geld, en een klik ernaast zou haar kwijtmaken

    return {
      open(){
        say('');
        if(last){ showResult(last); } else { show('form'); }
        dlg.showModal();
        if(!last){ ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      }
    };
  }

  window.kelderInvent = Object.assign(window.kelderInvent || {}, {
    init(opts){
      opts = opts || {};
      if(built || !opts.host || !window.kelderAdmin || !kelderAdmin.inventRecipe || !window.kelderRecipeDialog) return;
      built = build(opts);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'chip'; button.id = 'inventrecipe';
      button.textContent = `Nieuwe ${opts.kind === 'mocktail' ? 'mocktail' : 'cocktail'} laten bedenken`;
      button.addEventListener('click', () => built.open());
      opts.host.appendChild(button);
    }
  });
})();
