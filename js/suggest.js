/* Help me kiezen (cocktails.html en mocktails.html, voor iedereen): een bezoeker vertelt waar hij zin in heeft ("iets fris, niet te zoet,
   met gin") en krijgt één tot drie cocktails of mocktails die nu gemaakt kunnen worden, elk met een korte uitleg waarom.

   Wie doet wat:
     deze pagina    laat de wens intypen (of aantikken) en toont de suggesties
     Supabase       draait de Edge Function cocktail-ai (actie suggest): ze kijkt zelf welke recepten nu kunnen (ze vertrouwt de pagina niet),
                    telt de vraag mee voor de limiet (per bezoeker en per dag; elke vraag kost geld) en controleert het antwoord van Claude
     Claude         kiest de recepten die het best bij de wens passen, uit die lijst, en zegt eerlijk als niets echt past

   Zo min mogelijk gedoe: één knop, één veld (met een paar woorden om aan te tikken), Enter zoekt meteen, en een drankje in de uitslag is
   een link naar zijn kaart. Er wordt niets bewaard of veranderd.
   De beheerder kan dit uitzetten op admin.html (instelling suggest_enabled): dan verdwijnt de knop.

   Gebruik:  kelderSuggest.init({ host: element waar de knop in komt })
   Verwacht de data-loader (R, Z, setting, slug), js/stock.js (canMix) en de bezoekersclient (kelderSb); js/dialog-outside.js is optioneel.
   kelderSuggest.ask(wens) doet de vraag; js/drinks-dev.js vervangt die op je eigen computer door een bewaard antwoord. */
(function(){
  const MAX = 300, MIN = 3, ASK_MS = 60 * 1000;
  const PHRASES = ['fris en licht', 'fruitig', 'zoet', 'niet te zoet', 'stevig', 'bitter', 'romig', 'zonder alcohol'];
  const NOUN = { cocktail: 'Cocktail', mocktail: 'Mocktail' };
  const PAGE = { cocktail: 'cocktails.html', mocktail: 'mocktails.html' };

  const style = document.createElement('style');
  style.textContent = `
    #suggestbtn{background:var(--ink);color:var(--paper);border-color:var(--ink)}
    #suggestbtn:hover{background:var(--shelf-deep);border-color:var(--shelf-deep)}
    dialog#suggestdlg{margin:auto;border:0;border-top:6px solid var(--brass);padding:0;width:min(560px,calc(100vw - 24px));max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow:auto;background:var(--paper);color:var(--ink);box-shadow:0 20px 60px rgba(0,0,0,.35)}
    dialog#suggestdlg::backdrop{background:rgba(30,39,33,.6)}
    #suggestdlg [hidden]{display:none!important}
    #suggestdlg .sg-body{padding:20px 22px;display:grid;gap:12px}
    #suggestdlg h2{font-size:26px}
    #suggestdlg h3{font-family:'Bodoni Moda',serif;font-weight:700;font-size:22px;line-height:1.15}
    #suggestdlg h3:focus{outline:none}
    #suggestdlg form,#suggestdlg #sg-busy,#suggestdlg #sg-result{display:grid;gap:12px}
    #suggestdlg label.sg-field{display:grid;gap:5px;font-size:14px;font-weight:700}
    #suggestdlg textarea{font:inherit;font-size:16px;font-weight:400;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);width:100%;resize:vertical;min-height:84px}
    #suggestdlg textarea:focus-visible{outline:3px solid var(--brass);outline-offset:2px}
    #suggestdlg .sg-hint{font-size:13px;color:rgba(30,39,33,.75)}
    #suggestdlg .sg-words{display:flex;flex-wrap:wrap;gap:8px}
    #suggestdlg .sg-btns{display:flex;flex-wrap:wrap;gap:8px}
    #suggestdlg .chip.primary{background:var(--ink);color:var(--paper);border-color:var(--ink)}
    #suggestdlg .chip.primary:hover:not(:disabled){background:var(--shelf-deep);border-color:var(--shelf-deep)}
    #suggestdlg .chip:disabled{opacity:.5;cursor:not-allowed}
    #sg-msg{min-height:1.4em;font-size:14px}
    #sg-msg.bad{color:var(--amber);font-weight:700}
    .sg-spin{width:34px;height:34px;border:4px solid var(--line);border-top-color:var(--ink);border-radius:50%;animation:sg-turn 1s linear infinite}
    @keyframes sg-turn{to{transform:rotate(360deg)}}
    @media (prefers-reduced-motion:reduce){.sg-spin{animation-duration:3s}}
    #sg-picks{list-style:none;display:grid;gap:10px}
    .sg-pick{border:1px solid var(--line);border-radius:8px;background:#fff;padding:12px 14px;display:grid;gap:6px}
    .sg-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px}
    .sg-name{font-family:'Bodoni Moda',serif;font-weight:700;font-size:21px;line-height:1.15;color:var(--ink)}
    a.sg-name{text-decoration:underline;text-decoration-color:rgba(30,39,33,.5);text-underline-offset:4px}
    a.sg-name:hover{color:var(--amber);text-decoration-color:var(--amber)}
    a.sg-name:focus-visible{outline:3px solid var(--brass);outline-offset:2px}
    .sg-tag{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;padding:3px 7px;border:1px solid var(--line);color:rgba(30,39,33,.7);white-space:nowrap}
    .sg-reason{font-size:15px}
    .sg-mix{font-family:'Space Mono',monospace;font-size:12px;line-height:1.6;color:rgba(30,39,33,.7)}
    .sg-note{font-size:14px;border-left:3px solid var(--line);padding:2px 0 2px 12px}
    .card:target{outline:3px solid var(--brass);outline-offset:-3px}
    #suggestdlg .sg-dev{background:#fff3cd;border:1px solid #e0c36a;border-radius:8px;padding:6px 10px;font-size:13px}`;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; };
  /* wacht hoogstens ms op een belofte; duurt het langer, dan komt er { timedOut: true } */
  const within = (promise, ms) => {
    let timer;
    const late = new Promise(ok => { timer = setTimeout(() => ok({ timedOut: true }), ms); });
    return Promise.race([promise, late]).finally(() => clearTimeout(timer));
  };

  /* Een vraag aan de Edge Function cocktail-ai. Geeft terug:
       { ok: true, status: 'ok', picks: [{ recipe_id, name, kind, style, reason }], note }
       { ok: true, status: 'disabled' | 'no_recipes' }
       { ok: false, message }   (ook als de limiet bereikt is) */
  async function ask(wish){
    const sb = window.kelderSb;
    if(!sb) return { ok: false, message: 'Supabase is niet beschikbaar (geblokkeerd of offline?).' };
    const text = String(wish || '').replace(/\s+/g, ' ').trim().slice(0, MAX);
    if(text.length < MIN) return { ok: false, message: 'Vertel kort waar je zin in hebt.' };
    const reply = await within(sb.functions.invoke('cocktail-ai', { body: { action: 'suggest', wish: text } }), ASK_MS);
    if(reply.timedOut) return { ok: false, message: 'Het zoeken duurde te lang. Probeer het nog eens.' };
    const { data, error } = reply;
    if(error){
      const status = error.context && error.context.status;
      let code = '';
      try{ const b = await error.context.json(); code = (b && b.code) || ''; }catch(e){}
      if(error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') return { ok: false, message: 'Geen verbinding. Probeer het zo nog eens.' };
      if(status === 429 && code === 'day_limit') return { ok: false, message: 'Voor vandaag zijn er genoeg suggesties gevraagd. Blader gerust zelf door de lijst.' };
      if(status === 429) return { ok: false, message: 'Je hebt veel gevraagd. Probeer het over een uurtje nog eens, of blader zelf door de lijst.' };
      if(status === 404 || status === 503) return { ok: false, message: 'Suggesties zijn nu niet beschikbaar. Blader gerust zelf door de lijst.' };
      if(status === 400) return { ok: false, message: 'Vertel kort waar je zin in hebt.' };
      return { ok: false, message: 'Het zoeken is mislukt. Probeer het zo nog eens.' };
    }
    if(data && (data.status === 'disabled' || data.status === 'no_recipes')) return { ok: true, status: data.status };
    if(data && data.status === 'ok' && Array.isArray(data.picks)) return { ok: true, ...data };
    return { ok: false, message: 'Het zoeken gaf een antwoord dat de site niet begrijpt.' };
  }

  const recipeOf = id => [].concat(window.R || [], window.Z || []).find(r => r.id === id);
  const visible = r => window.setting((r.kind === 'mocktail') ? 'menu_show_mocktails' : 'menu_show_cocktails') !== false;
  /* is er nu iets dat een bezoeker zou kunnen krijgen? */
  const hasDrinks = () => [].concat(window.R || [], window.Z || []).some(r => visible(r) && canMix(r));      // canMix komt uit js/stock.js (geen eigenschap van window)

  let built = null;

  function build(){
    document.head.appendChild(style);
    const dlg = document.createElement('dialog');
    dlg.id = 'suggestdlg';
    dlg.setAttribute('aria-labelledby', 'sg-title');
    dlg.innerHTML = `
      <div class="sg-body">
        <h2 id="sg-title">Help me kiezen</h2>
        <form id="sg-form" novalidate>
          <label class="sg-field">Waar heb je zin in?
            <textarea id="sg-wish" rows="3" maxlength="${MAX}" placeholder="bijv. iets fris en niet te zoet, met gin"></textarea>
          </label>
          <div class="sg-words" id="sg-words" role="group" aria-label="Woorden om aan te tikken"></div>
          <p class="sg-hint">Ik kies uit wat nu gemaakt kan worden. Je tekst wordt door een AI gelezen: vul geen persoonlijke gegevens in.</p>
          <p id="sg-msg" role="status" aria-live="polite"></p>
          <div class="sg-btns">
            <button type="submit" class="chip primary" id="sg-go" disabled>Zoek mijn drankje</button>
            <button type="button" class="chip" id="sg-cancel">Sluiten</button>
          </div>
        </form>
        <div id="sg-busy" hidden>
          <p role="status" aria-live="polite">Even kijken wat erbij past…</p>
          <div class="sg-spin" aria-hidden="true"></div>
          <div class="sg-btns"><button type="button" class="chip" id="sg-stop">Stoppen</button></div>
        </div>
        <div id="sg-result" hidden>
          <h3 id="sg-rtitle" tabindex="-1"></h3>
          <ul id="sg-picks"></ul>
          <p id="sg-rnote" class="sg-note" hidden></p>
          <div class="sg-btns">
            <button type="button" class="chip primary" id="sg-done">Sluiten</button>
            <button type="button" class="chip" id="sg-again">Iets anders zoeken</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    if(window.kelderSuggest && kelderSuggest.devNote) dlg.querySelector('.sg-body').prepend(el('p', 'sg-dev', kelderSuggest.devNote));

    const $ = id => dlg.querySelector('#' + id);
    const form = $('sg-form'), busy = $('sg-busy'), result = $('sg-result'), ta = $('sg-wish'), go = $('sg-go');
    let token = 0;                                                          // een antwoord van een vraag die inmiddels is gestopt of gesloten, wordt genegeerd

    const show = which => { form.hidden = which !== 'form'; busy.hidden = which !== 'busy'; result.hidden = which !== 'result'; };
    const say = (text, bad) => { const m = $('sg-msg'); m.textContent = text || ''; m.className = bad ? 'bad' : ''; };
    const ready = () => { go.disabled = ta.value.trim().length < MIN; };

    for(const p of PHRASES){
      const b = el('button', 'chip', p);
      b.type = 'button';
      b.addEventListener('click', () => {
        if(!ta.value.toLowerCase().includes(p)){
          const base = ta.value.trim().replace(/[,.\s]+$/, '');
          ta.value = (base ? base + ', ' : '') + p;
        }
        ready(); say(''); ta.focus();
      });
      $('sg-words').appendChild(b);
    }

    /* een drankje in de uitslag: een link naar zijn kaart (op deze pagina of op de pagina van de andere soort), of gewone tekst zonder kaart */
    function nameEl(p){
      const r = recipeOf(p.recipe_id);
      if(!r || typeof window.slug !== 'function') return el('strong', 'sg-name', p.name);
      const here = document.getElementById(window.slug(r.n));
      const wantPage = PAGE[r.kind] || '';
      const onWantedPage = location.pathname.split('/').pop() === wantPage;
      const a = el('a', 'sg-name', p.name);
      a.href = (here && onWantedPage ? '' : wantPage) + '#' + window.slug(r.n);
      a.addEventListener('click', () => {
        const search = document.getElementById('rs');                       // een zoekopdracht op de pagina zou de kaart verbergen
        if(search && search.value){ search.value = ''; search.dispatchEvent(new Event('input')); }
        dlg.close();
      });
      return a;
    }
    function pickEl(p){
      const li = el('li', 'sg-pick');
      const head = el('div', 'sg-head');
      head.appendChild(nameEl(p));
      head.appendChild(el('span', 'sg-tag', [NOUN[p.kind] || p.kind, p.style].filter(Boolean).join(' · ')));
      li.appendChild(head);
      if(p.reason) li.appendChild(el('p', 'sg-reason', p.reason));
      const r = recipeOf(p.recipe_id);
      if(r && Array.isArray(r.s) && r.s.length) li.appendChild(el('p', 'sg-mix', r.s.map(x => [x[0], x[1]].filter(Boolean).join(' ')).join(' · ')));
      return li;
    }

    function showResult(res){
      const picks = Array.isArray(res.picks) ? res.picks : [];
      const list = $('sg-picks'), note = $('sg-rnote');
      list.textContent = '';
      picks.forEach(p => list.appendChild(pickEl(p)));
      note.textContent = res.note || '';
      note.hidden = !res.note;
      $('sg-rtitle').textContent = picks.length ? 'Dit past bij jou' : 'Geen goede match';
      show('result');
      $('sg-rtitle').focus();
    }

    async function search(){
      const text = ta.value.trim();
      if(text.length < MIN) return;
      const mine = ++token;
      say('');
      show('busy');
      let res;
      try{ res = await kelderSuggest.ask(text); }
      catch(e){ res = { ok: false, message: 'Het zoeken is mislukt. Probeer het zo nog eens.' }; }
      if(mine !== token) return;
      if(!res.ok){ show('form'); say(res.message, true); ta.focus(); return; }
      if(res.status === 'disabled'){ show('form'); say('Suggesties zijn nu uitgezet. Blader gerust zelf door de lijst.', true); return; }
      if(res.status === 'no_recipes'){ show('form'); say('Er is nu niets beschikbaar om uit te kiezen.', true); return; }
      showResult(res);
    }

    form.addEventListener('submit', e => { e.preventDefault(); search(); });
    ta.addEventListener('input', () => { ready(); say(''); });
    ta.addEventListener('keydown', e => {                                    // Enter zoekt meteen (de wens is één regel); Shift+Enter niet nodig
      if(e.key === 'Enter' && !e.isComposing){ e.preventDefault(); if(!go.disabled) search(); }
    });
    $('sg-stop').addEventListener('click', () => { token++; show('form'); say('Gestopt. Je kunt je wens aanpassen en opnieuw zoeken.'); ta.focus(); });
    $('sg-again').addEventListener('click', () => { show('form'); say(''); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
    $('sg-cancel').addEventListener('click', () => dlg.close());
    $('sg-done').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => { token++; show('form'); say(''); });
    if(window.kelderCloseOnOutside) kelderCloseOnOutside(dlg);                // er wordt niets bewaard of veranderd: buiten klikken mag altijd

    return {
      open(){
        show('form'); say(''); ready();
        dlg.showModal();
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    };
  }

  window.kelderSuggest = Object.assign(window.kelderSuggest || {}, {
    ask,
    init(opts){
      opts = opts || {};
      if(built || !opts.host) return;
      try{
        if(window.setting('suggest_enabled') === false || !hasDrinks()) return;     // uitgezet door de beheerder, of er is niets te kiezen
      }catch(e){ return; }
      built = build();
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'chip'; button.id = 'suggestbtn'; button.textContent = 'Help me kiezen';
      button.addEventListener('click', () => built.open());
      const title = opts.host.querySelector('h2');
      if(title) title.after(button); else opts.host.prepend(button);
    }
  });
})();
