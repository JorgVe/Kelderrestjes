/* Help me kiezen (menu, cocktails.html en mocktails.html, voor iedereen): een bezoeker vertelt waar hij zin in heeft ("iets fris, niet te zoet,
   met gin") en krijgt één tot drie cocktails of mocktails die nu gemaakt kunnen worden, elk met een korte uitleg waarom. Met de keuze
   "Iets nieuws" verzint Claude in plaats daarvan één nieuw recept voor hem, van wat er nu in huis is. Dat staat eerst niet op de kaart;
   met de knop "Zet op het menu" zet de bezoeker het erop (actie add van cocktail-ai, zie hieronder). Een ingelogde beheerder krijgt daarbij
   ook de knop om het in het receptvenster te controleren en toe te voegen.
   Bij "Iets nieuws" kiest de bezoeker de soort: maakt niet uit, cocktail of mocktail. De pagina zet die vooraf (init({ kind })): op de
   mocktailpagina staat "Mocktail" al klaar, en dan is het recept zonder alcohol, wat de bezoeker ook intypt.

   Wie doet wat:
     deze pagina    laat de wens intypen (of aantikken) en toont de suggesties
     Supabase       draait de Edge Function cocktail-ai (actie suggest): ze kijkt zelf welke recepten nu kunnen (ze vertrouwt de pagina niet),
                    telt de vraag mee voor de limiet (per bezoeker en per dag; elke vraag kost geld) en controleert het antwoord van Claude.
                    Elk nieuw recept krijgt een ondertekend `token` mee. Met actie add zet de functie dat recept op het menu: ze controleert
                    de handtekening (een bezoeker kan niets toevoegen wat Claude niet schreef, en geen veld aanpassen) en de voorraad opnieuw
     Claude         kiest de recepten die het best bij de wens passen, uit die lijst (of verzint er een, uit de voorraad), en zegt eerlijk als
                    niets echt past. Wie zonder alcohol vraagt, krijgt alleen mocktails; dat bewaakt de functie zelf.

   Zo min mogelijk gedoe: één knop, één veld (met een paar woorden om aan te tikken), Enter zoekt meteen, en een drankje in de uitslag is
   een link naar zijn kaart. Zoeken bewaart of verandert niets; alleen "Zet op het menu" schrijft iets, en dat doet de Edge Function.
   De beheerder kan dit uitzetten op admin.html (instelling suggest_enabled): dan verdwijnt de knop.
   Eén woordje om aan te tikken is een grapje: staat "zacht en vettig" in de wens, dan start er geen zoekopdracht (dus geen AI en geen
   punt van de limiet), maar komt er een foto met een onderschrift (PICTURE hieronder, de foto staat in img/).

   Gebruik:  kelderSuggest.init({ host: element waar de knop achteraan in komt, kind?: 'cocktail' | 'mocktail' })   mag vaker (een knop per plek, één venster)
   Verwacht de data-loader (R, Z, setting, slug), js/stock.js (canMix) en de bezoekersclient (kelderSb); js/dialog-outside.js is optioneel.
   kelderSuggest.ask(wens, modus, soort?) doet de vraag (modus 'existing' of 'new'; soort alleen bij 'new') en kelderSuggest.add(token) zet een nieuw
   recept op het menu; js/drinks-dev.js vervangt beide op je eigen computer door een bewaard antwoord. */
(function(){
  const MAX = 300, MIN = 3, ASK_MS = 60 * 1000, NEW_MS = 90 * 1000;
  const PHRASES = ['fris en licht', 'fruitig', 'zoet', 'niet te zoet', 'stevig', 'bitter', 'romig', 'zonder alcohol', 'zacht en vettig'];
  /* Staat deze zin in de wens (hoofdletters en dubbele spaties tellen niet), dan wordt er niet gezocht: de bezoeker krijgt deze foto te zien. */
  const PICTURE = { phrase: 'zacht en vettig', src: 'img/zacht-en-vettig.webp', alt: 'Een grijze kat slaapt opgekruld op een vloerkleed', caption: 'Ik denk dat je zoiets zoekt.' };
  const wantsPicture = wish => String(wish || '').toLowerCase().replace(/\s+/g, ' ').includes(PICTURE.phrase);
  const NOUN = { cocktail: 'Cocktail', mocktail: 'Mocktail' };
  /* de twee soorten vraag: uit de lijst kiezen, of iets nieuws laten verzinnen (dat is een zwaardere vraag en telt dubbel voor de limiet) */
  const MODES = {
    existing: { hint: 'Ik kies uit de cocktails en mocktails die nu gemaakt kunnen worden.', go: 'Zoek mijn drankje', placeholder: 'bijv. iets fris en niet te zoet, met gin', busy: 'Even kijken wat erbij past…' },
    new: { hint: 'Ik verzin een nieuw recept met wat er nu in huis is. Dat staat nog niet op de kaart.', go: 'Verzin iets voor mij', placeholder: 'bijv. iets romigs met amaretto, niet te zwaar', busy: 'Even iets nieuws bedenken… Dit duurt meestal 10 tot 20 seconden.' }
  };
  const PAGE = { cocktail: 'cocktails.html', mocktail: 'mocktails.html' };

  const style = document.createElement('style');
  style.textContent = `
    .suggest-btn{background:var(--ink);color:var(--paper);border-color:var(--ink)}
    .suggest-btn:hover{background:var(--shelf-deep);border-color:var(--shelf-deep)}
    .sec-head > .suggest-btn{margin-left:auto}                  /* op de cocktail- en mocktailpagina rechts in de kopregel */
    .allmore .suggest-btn{line-height:inherit}                  /* op het menu naast Alle cocktails en Alle mocktails (index.html maakt daar een rij van) */
    @media (max-width:600px){                                   /* smal scherm: de knop staat rechts naast de titel, de beheerdersknoppen netjes eronder */
      .sec-head{gap:10px 8px}
      .sec-head > h2{order:0}
      .sec-head > .suggest-btn{order:1}
      .sec-head > .chip:not(.suggest-btn){order:2}
    }
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
    #suggestdlg fieldset.sg-mode{border:0;padding:0;margin:0;display:grid;gap:6px;min-width:0}
    #suggestdlg .sg-mode legend{font-size:14px;font-weight:700;padding:0;margin-bottom:6px}
    #suggestdlg .sg-seg{display:inline-flex;border:1px solid var(--ink);border-radius:999px;overflow:hidden;width:max-content;max-width:100%}
    #suggestdlg .sg-seg label{position:relative;display:block;cursor:pointer}
    #suggestdlg .sg-seg label + label{border-left:1px solid var(--ink)}
    #suggestdlg .sg-seg input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
    #suggestdlg .sg-seg span{display:block;padding:8px 18px;font-size:14px;font-weight:500;color:var(--ink)}
    #suggestdlg .sg-seg input:checked + span{background:var(--ink);color:var(--paper)}
    #suggestdlg .sg-seg input:focus-visible + span{outline:3px solid var(--brass);outline-offset:-3px}
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
    .sg-tag.new{border-color:var(--brass);color:var(--ink);background:rgba(198,154,62,.18)}
    .sg-blurb{font-size:14px;font-style:italic;color:rgba(30,39,33,.75)}
    .sg-spec{list-style:none;font-family:'Space Mono',monospace;font-size:13px;line-height:1.8}
    .sg-spec li{display:flex;gap:10px;border-bottom:1px dotted var(--line)}
    .sg-spec .ml{min-width:56px;color:rgba(30,39,33,.7)}
    .sg-why{font-size:13px;color:rgba(30,39,33,.75)}
    #suggestdlg figure{margin:0;display:grid;gap:8px;justify-items:center}
    #suggestdlg figure:focus{outline:none}
    #suggestdlg figure img{display:block;width:auto;height:auto;max-width:100%;max-height:60vh;max-height:min(60dvh,560px);border-radius:8px;background:var(--line)}
    #suggestdlg figcaption{font-size:15px;font-style:italic;text-align:center}
    .card:target{outline:3px solid var(--brass);outline-offset:-3px}
    #suggestdlg .sg-added{font-size:15px;font-weight:700}
    #suggestdlg .sg-added a{color:var(--ink);text-underline-offset:4px}
    #suggestdlg .sg-addmsg{font-size:14px;min-height:1.4em}
    #suggestdlg .sg-addmsg.bad{color:var(--amber);font-weight:700}
    #suggestdlg .sg-dev{background:#fff3cd;border:1px solid #e0c36a;border-radius:8px;padding:6px 10px;font-size:13px}`;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; };
  /* wacht hoogstens ms op een belofte; duurt het langer, dan komt er { timedOut: true } */
  const within = (promise, ms) => {
    let timer;
    const late = new Promise(ok => { timer = setTimeout(() => ok({ timedOut: true }), ms); });
    return Promise.race([promise, late]).finally(() => clearTimeout(timer));
  };

  /* Een vraag aan de Edge Function cocktail-ai. mode: 'existing' (kies uit de lijst, standaard) of 'new' (verzin een nieuw recept). Geeft terug:
       { ok: true, status: 'ok', mode: 'existing', picks: [{ recipe_id, name, kind, style, reason }], note }
       { ok: true, status: 'ok', mode: 'new', drafts: [{ kind, name, style, blurb, method, why, lines: [{ amount, ingredient, items }], token? }], note }
       { ok: true, status: 'disabled' | 'no_recipes' | 'no_ingredients' }
       { ok: false, message }   (ook als de limiet bereikt is) */
  async function ask(wish, mode, kind){
    const sb = window.kelderSb;
    if(!sb) return { ok: false, message: 'Supabase is niet beschikbaar (geblokkeerd of offline?).' };
    const text = String(wish || '').replace(/\s+/g, ' ').trim().slice(0, MAX);
    if(text.length < MIN) return { ok: false, message: 'Vertel kort waar je zin in hebt.' };
    const m = mode === 'new' ? 'new' : 'existing';
    const body = { action: 'suggest', wish: text, mode: m };
    if(m === 'new' && (kind === 'cocktail' || kind === 'mocktail')) body.kind = kind;      // de soort die de bezoeker koos of die de pagina vooraf zette
    const reply = await within(sb.functions.invoke('cocktail-ai', { body }), m === 'new' ? NEW_MS : ASK_MS);
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
    if(data && (data.status === 'disabled' || data.status === 'no_recipes' || data.status === 'no_ingredients')) return { ok: true, status: data.status };
    if(m === 'new'){
      /* een oudere versie van de functie kent "nieuw" niet en geeft dan gewoon suggesties van de kaart terug */
      if(data && data.status === 'ok' && data.mode === 'new' && Array.isArray(data.drafts)) return { ok: true, ...data };
      return { ok: false, message: 'Iets nieuws laten verzinnen kan nog niet. Probeer het later nog eens, of kies uit de kaart.' };
    }
    if(data && data.status === 'ok' && Array.isArray(data.picks)) return { ok: true, ...data };
    return { ok: false, message: 'Het zoeken gaf een antwoord dat de site niet begrijpt.' };
  }

  /* Een nieuw recept op het menu zetten (actie add van cocktail-ai). token: het ondertekende token van het concept (draft.token). Geeft terug:
       { ok: true, status: 'ok', id, kind, name }                         staat nu op het menu
       { ok: true, status: 'exists' | 'stale' | 'disabled' | 'refused' }  de naam bestaat al | er is iets van op | toevoegen staat uit | de tekst bevat een link
       { ok: false, message }                                             (ook als de limiet bereikt is of het voorstel verlopen is) */
  async function add(token){
    const sb = window.kelderSb;
    if(!sb) return { ok: false, message: 'Supabase is niet beschikbaar (geblokkeerd of offline?).' };
    if(!token) return { ok: false, message: 'Dit voorstel kan niet worden toegevoegd.' };
    const reply = await within(sb.functions.invoke('cocktail-ai', { body: { action: 'add', token } }), ASK_MS);
    if(reply.timedOut) return { ok: false, message: 'Het toevoegen duurde te lang. Controleer het menu en probeer het eventueel nog eens.' };
    const { data, error } = reply;
    if(error){
      const status = error.context && error.context.status;
      let code = '';
      try{ const b = await error.context.json(); code = (b && b.code) || ''; }catch(e){}
      if(error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') return { ok: false, message: 'Geen verbinding. Probeer het zo nog eens.' };
      if(code === 'expired') return { ok: false, message: 'Dit voorstel is verlopen. Vraag een nieuw recept.' };
      if(status === 429 && code === 'day_limit') return { ok: false, message: 'Voor vandaag zijn er genoeg recepten toegevoegd. Probeer het morgen nog eens.' };
      if(status === 429) return { ok: false, message: 'Je hebt net al een paar recepten op het menu gezet. Probeer het over een uurtje nog eens.' };
      if(status === 404 || status === 503) return { ok: false, message: 'Toevoegen kan nu niet.' };
      return { ok: false, message: 'Toevoegen is mislukt. Probeer het zo nog eens.' };
    }
    if(data && data.status === 'ok' && data.name && data.kind) return { ok: true, status: 'ok', id: data.id, kind: data.kind, name: data.name };
    if(data && (data.status === 'exists' || data.status === 'stale' || data.status === 'disabled' || data.status === 'refused')) return { ok: true, status: data.status };
    return { ok: false, message: 'Het toevoegen gaf een antwoord dat de site niet begrijpt.' };
  }

  /* het adres van de pagina van een recept (js/data-loader.js: recipeUrl); zonder die functie de lijst met een anker */
  const pageOf = (kind, name) => typeof window.recipeUrl === 'function' ? window.recipeUrl(kind, name) : (PAGE[kind] || '') + '#' + (window.slug ? window.slug(name) : '');

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
          <fieldset class="sg-mode">
            <legend>Wat zoek je?</legend>
            <div class="sg-seg">
              <label><input type="radio" name="sg-mode" value="existing" checked><span>Van de kaart</span></label>
              <label><input type="radio" name="sg-mode" value="new"><span>Iets nieuws</span></label>
            </div>
          </fieldset>
          <fieldset class="sg-mode" id="sg-kindset" hidden>
            <legend>Soort</legend>
            <div class="sg-seg">
              <label><input type="radio" name="sg-kind" value="" checked><span>Maakt niet uit</span></label>
              <label><input type="radio" name="sg-kind" value="cocktail"><span>Cocktail</span></label>
              <label><input type="radio" name="sg-kind" value="mocktail"><span>Mocktail</span></label>
            </div>
            <p class="sg-hint" id="sg-kindhint"></p>
          </fieldset>
          <label class="sg-field">Waar heb je zin in?
            <textarea id="sg-wish" rows="3" maxlength="${MAX}" placeholder="bijv. iets fris en niet te zoet, met gin"></textarea>
          </label>
          <div class="sg-words" id="sg-words" role="group" aria-label="Woorden om aan te tikken"></div>
          <p class="sg-hint"><span id="sg-modehint"></span> Je tekst wordt door een AI gelezen: vul geen persoonlijke gegevens in.</p>
          <p id="sg-msg" role="status" aria-live="polite"></p>
          <div class="sg-btns">
            <button type="submit" class="chip primary" id="sg-go" disabled>Zoek mijn drankje</button>
            <button type="button" class="chip" id="sg-cancel">Sluiten</button>
          </div>
        </form>
        <div id="sg-busy" hidden>
          <p id="sg-busy-text" role="status" aria-live="polite"></p>
          <div class="sg-spin" aria-hidden="true"></div>
          <div class="sg-btns"><button type="button" class="chip" id="sg-stop">Stoppen</button></div>
        </div>
        <div id="sg-result" hidden>
          <h3 id="sg-rtitle" tabindex="-1"></h3>
          <ul id="sg-picks"></ul>
          <p id="sg-rnote" class="sg-note" hidden></p>
          <figure id="sg-fig" tabindex="-1" hidden>
            <img id="sg-fig-img" alt="" width="900" height="1200">
            <figcaption id="sg-fig-cap"></figcaption>
          </figure>
          <div class="sg-btns">
            <button type="button" class="chip primary" id="sg-done">Sluiten</button>
            <button type="button" class="chip" id="sg-again">Iets anders zoeken</button>
            <button type="button" class="chip" id="sg-switch"></button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    if(window.kelderSuggest && kelderSuggest.devNote) dlg.querySelector('.sg-body').prepend(el('p', 'sg-dev', kelderSuggest.devNote));

    const $ = id => dlg.querySelector('#' + id);
    const form = $('sg-form'), busy = $('sg-busy'), result = $('sg-result'), ta = $('sg-wish'), go = $('sg-go');
    let token = 0;                                                          // een antwoord van een vraag die inmiddels is gestopt of gesloten, wordt genegeerd
    let mode = 'existing';                                                  // 'existing' = van de kaart, 'new' = iets nieuws
    let kind = '';                                                          // bij iets nieuws: '' = maakt niet uit, 'cocktail' of 'mocktail' (de pagina zet dit vooraf)

    const show = which => { form.hidden = which !== 'form'; busy.hidden = which !== 'busy'; result.hidden = which !== 'result'; };
    const say = (text, bad) => { const m = $('sg-msg'); m.textContent = text || ''; m.className = bad ? 'bad' : ''; };
    const ready = () => { go.disabled = ta.value.trim().length < MIN; };

    function setMode(next){
      mode = next === 'new' ? 'new' : 'existing';
      const m = MODES[mode];
      form.querySelectorAll('input[name="sg-mode"]').forEach(r => { r.checked = r.value === mode; });
      $('sg-modehint').textContent = m.hint;
      $('sg-busy-text').textContent = m.busy;
      go.textContent = m.go;
      ta.placeholder = m.placeholder;
      $('sg-kindset').hidden = mode !== 'new';                              // de soort kies je alleen bij iets nieuws
    }
    const KIND_HINT = { mocktail: 'Zonder alcohol: dat staat al voor je ingesteld.', cocktail: 'Met alcohol (vraag je zelf om "zonder alcohol", dan wordt het toch een mocktail).', '': '' };
    function setKind(next){
      kind = next === 'cocktail' || next === 'mocktail' ? next : '';
      form.querySelectorAll('input[name="sg-kind"]').forEach(r => { r.checked = r.value === kind; });
      $('sg-kindhint').textContent = KIND_HINT[kind];
    }
    form.addEventListener('change', e => {
      if(e.target.name === 'sg-mode'){ setMode(e.target.value); say(''); }
      else if(e.target.name === 'sg-kind'){ setKind(e.target.value); say(''); }
    });
    setMode('existing');

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

    /* een nieuw recept, verzonnen voor deze bezoeker: staat niet op de kaart en wordt niet bewaard; een beheerder kan het toevoegen */
    function draftEl(d){
      const li = el('li', 'sg-pick');
      const head = el('div', 'sg-head');
      head.appendChild(el('strong', 'sg-name', d.name));
      head.appendChild(el('span', 'sg-tag', [NOUN[d.kind] || d.kind, d.style].filter(Boolean).join(' · ')));
      head.appendChild(el('span', 'sg-tag new', 'Nieuw'));
      li.appendChild(head);
      if(d.blurb) li.appendChild(el('p', 'sg-blurb', d.blurb));
      const spec = el('ul', 'sg-spec');
      for(const l of d.lines || []){
        const row = el('li');
        row.appendChild(el('span', 'ml', l.amount || ''));
        row.appendChild(el('span', null, l.ingredient));
        spec.appendChild(row);
      }
      li.appendChild(spec);
      if(d.method) li.appendChild(el('p', 'sg-reason', d.method));
      if(d.why) li.appendChild(el('p', 'sg-why', d.why));
      /* "Zet op het menu": voor iedereen, als de functie een token meegaf (ze geeft er geen als de beheerder dit heeft uitgezet) */
      if(d.token){
        const row = el('div', 'sg-btns'), msg = el('p', 'sg-addmsg');
        msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
        const put = el('button', 'chip primary', 'Zet op het menu');
        put.type = 'button';
        put.setAttribute('aria-label', `Zet op het menu: ${d.name}`);
        const linkTo = text => { const p = el('p', 'sg-added'); p.append(text, ' '); const a = el('a', null, d.name); a.href = pageOf(d.kind, d.name); p.appendChild(a); return p; };
        put.addEventListener('click', async () => {
          put.disabled = true; msg.textContent = 'Even toevoegen…'; msg.className = 'sg-addmsg';
          let res;
          try{ res = await kelderSuggest.add(d.token); }
          catch(e){ res = { ok: false, message: 'Toevoegen is mislukt. Probeer het zo nog eens.' }; }
          if(!res.ok){ put.disabled = false; msg.textContent = res.message; msg.className = 'sg-addmsg bad'; return; }
          if(res.status === 'ok' || res.status === 'exists'){
            row.remove(); msg.remove();
            li.appendChild(linkTo(res.status === 'ok' ? 'Staat nu op het menu:' : 'Dit recept staat al op het menu:'));
            $('sg-rnote').textContent = `Dit recept staat nu op het menu en op de pagina met alle ${d.kind === 'mocktail' ? 'mocktails' : 'cocktails'}.`;      // de tekst van eerder ("zet het op het menu") klopt niet meer
            return;
          }
          put.disabled = res.status === 'disabled' || res.status === 'refused';
          msg.textContent = res.status === 'stale' ? 'Dit recept kan nu niet meer: er is intussen iets van op. Vraag een nieuw recept.'
            : res.status === 'refused' ? 'Dit recept kan niet worden toegevoegd.' : 'Recepten toevoegen is nu uitgezet.';
          msg.className = 'sg-addmsg bad';
        });
        row.appendChild(put);
        li.append(row, msg);
      }
      /* alleen een ingelogde beheerder op een pagina met het receptvenster (js/recipe-dialog.js, gestart door cards.js) */
      if(window.kelderRecipeDialog && typeof kelderRecipeDialog.ready === 'function' && kelderRecipeDialog.ready()){
        const add = el('button', 'chip primary', 'Controleren en toevoegen');
        add.type = 'button';
        add.setAttribute('aria-label', `Controleren en toevoegen: ${d.name}`);
        add.addEventListener('click', () => { dlg.close(); kelderRecipeDialog.open(null, { kind: d.kind, draft: d }); });
        const row = el('div', 'sg-btns');
        row.appendChild(add);
        li.appendChild(row);
      }
      return li;
    }

    function showResult(res, asked){
      const isNew = Array.isArray(res.drafts);
      const items = isNew ? res.drafts : (Array.isArray(res.picks) ? res.picks : []);
      const list = $('sg-picks'), note = $('sg-rnote');
      $('sg-fig').hidden = true;                                           // de foto van een eerdere keer weg, de gewone onderdelen terug
      $('sg-rtitle').hidden = false; list.hidden = false; $('sg-switch').hidden = false;
      list.textContent = '';
      items.forEach(x => list.appendChild(isNew ? draftEl(x) : pickEl(x)));
      const putOn = isNew && items.some(x => x.token);
      const lines = [isNew && items.length ? (putOn ? 'Dit recept staat nog niet op de kaart: het is nu verzonnen met wat er in huis is. Klinkt het goed? Zet het dan op het menu.' : 'Dit recept staat nog niet op de kaart: het is nu verzonnen met wat er in huis is.') : '', res.note || ''].filter(Boolean);
      note.textContent = lines.join(' ');
      note.hidden = !lines.length;
      $('sg-rtitle').textContent = isNew ? (items.length ? 'Nieuw voor jou' : 'Niets nieuws gevonden') : (items.length ? 'Dit past bij jou' : 'Geen goede match');
      $('sg-switch').textContent = asked === 'new' ? 'Zoek op de kaart' : 'Verzin iets nieuws';
      $('sg-switch').dataset.mode = asked === 'new' ? 'existing' : 'new';
      show('result');
      $('sg-rtitle').focus();
    }

    /* "zacht en vettig": geen zoekopdracht, een foto met een onderschrift. De foto wordt pas nu opgehaald. */
    function showPicture(){
      const fig = $('sg-fig'), img = $('sg-fig-img');
      img.alt = PICTURE.alt;
      if(!img.getAttribute('src')) img.src = PICTURE.src;
      $('sg-fig-cap').textContent = PICTURE.caption;
      $('sg-rtitle').hidden = true; $('sg-picks').hidden = true; $('sg-rnote').hidden = true; $('sg-switch').hidden = true;     // een andere soort zoekopdracht zou hier weer de foto geven
      fig.hidden = false;
      show('result');
      fig.focus();
    }

    async function search(){
      const text = ta.value.trim();
      if(text.length < MIN) return;
      if(wantsPicture(text)){ token++; say(''); showPicture(); return; }       // vóór ask(): er gaat niets naar de Edge Function en er telt niets mee voor de limiet
      const mine = ++token;
      const asked = mode;
      say('');
      show('busy');
      let res;
      try{ res = await kelderSuggest.ask(text, asked, asked === 'new' ? kind : ''); }
      catch(e){ res = { ok: false, message: 'Het zoeken is mislukt. Probeer het zo nog eens.' }; }
      if(mine !== token) return;
      if(!res.ok){ show('form'); say(res.message, true); ta.focus(); return; }
      if(res.status === 'disabled'){ show('form'); say('Suggesties zijn nu uitgezet. Blader gerust zelf door de lijst.', true); return; }
      if(res.status === 'no_recipes'){ show('form'); say('Er is nu niets beschikbaar om uit te kiezen.', true); return; }
      if(res.status === 'no_ingredients'){ show('form'); say('Er is nu te weinig in huis om iets nieuws te verzinnen. Kies uit de kaart.', true); return; }
      showResult(res, asked);
    }

    form.addEventListener('submit', e => { e.preventDefault(); search(); });
    ta.addEventListener('input', () => { ready(); say(''); });
    ta.addEventListener('keydown', e => {                                    // Enter zoekt meteen (de wens is één regel); Shift+Enter niet nodig
      if(e.key === 'Enter' && !e.isComposing){ e.preventDefault(); if(!go.disabled) search(); }
    });
    $('sg-stop').addEventListener('click', () => { token++; show('form'); say('Gestopt. Je kunt je wens aanpassen en opnieuw zoeken.'); ta.focus(); });
    $('sg-switch').addEventListener('click', e => { setMode(e.currentTarget.dataset.mode); search(); });          // dezelfde wens, de andere soort vraag
    $('sg-again').addEventListener('click', () => { show('form'); say(''); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
    $('sg-cancel').addEventListener('click', () => dlg.close());
    $('sg-done').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => { token++; show('form'); say(''); });
    if(window.kelderCloseOnOutside) kelderCloseOnOutside(dlg);                // er wordt niets bewaard of veranderd: buiten klikken mag altijd

    return {
      open(opts){
        opts = opts || {};
        setKind(opts.kind);                                                // de pagina zet de soort vooraf (de mocktailpagina: mocktail, dus zonder alcohol)
        show('form'); say(''); ready();
        dlg.showModal();
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    };
  }

  window.kelderSuggest = Object.assign(window.kelderSuggest || {}, {
    ask,
    add,
    wantsPicture,
    init(opts){
      opts = opts || {};
      if(!opts.host) return;
      try{
        if(window.setting('suggest_enabled') === false || !hasDrinks()) return;     // uitgezet door de beheerder, of er is niets te kiezen
      }catch(e){ return; }
      if(!built) built = build();
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'chip suggest-btn'; button.textContent = 'Help me kiezen';
      if(!document.getElementById('suggestbtn')) button.id = 'suggestbtn';           // de eerste knop heeft een id (voor tests); er kunnen er meer zijn
      button.addEventListener('click', () => built.open({ kind: opts.kind }));
      opts.host.appendChild(button);
    }
  });
})();
