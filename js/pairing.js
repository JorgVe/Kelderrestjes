/* Wijn bij het menu (wijnen.html, alleen voor beheerders): vul in wat er vandaag op het menu staat en krijg per gerecht de wijn uit je
   voorraad die er het best bij past, met een korte uitleg.

   Wie doet wat:
     deze pagina    laat het menu intypen (of dicteren) en toont de suggesties; je beslist zelf
     Supabase       draait de Edge Function pair-wine: ze controleert dat je beheerder bent (elke vraag kost geld), kijkt welke wijnen op
                    voorraad zijn en controleert het antwoord van Claude (een wijn die niet op voorraad is kan nooit voorgesteld worden)
     Claude         kiest per gerecht de wijn die het best past uit die lijst, en zegt eerlijk als niets echt past

   Zo min mogelijk gedoe: één knop op de wijnlijst, één veld, één knop. Het menu van vandaag wordt onthouden in deze browser (alleen
   vandaag), Ctrl+Enter (of ⌘+Enter) zoekt meteen, en een wijn in de suggesties is een link naar zijn kaart op de pagina.
   Er verandert niets in de voorraad of de database.

   Gebruik:  kelderPairing.init({ host: element waar de knop in komt, hasStock: () => staat er wijn op voorraad? })
   Verwacht js/admin.js (kelderAdmin.suggestPairing) en, optioneel, js/dialog-outside.js. */
(function(){
  const STORE = 'kelderrestjes-pair-menu', MAX = 1000, MIN = 3;

  const style = document.createElement('style');
  style.textContent = `
    dialog#pairdlg{margin:auto;border:0;border-top:6px solid var(--brass);padding:0;width:min(580px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:var(--paper);color:var(--ink);box-shadow:0 20px 60px rgba(0,0,0,.35)}
    dialog#pairdlg::backdrop{background:rgba(30,39,33,.6)}
    #pairdlg [hidden]{display:none!important}
    #pairdlg .pr-body{padding:20px 22px;display:grid;gap:12px}
    #pairdlg h2{font-size:26px}
    #pairdlg h3{font-family:'Bodoni Moda',serif;font-weight:700;font-size:22px;line-height:1.15}
    #pairdlg h3:focus{outline:none}
    #pairdlg form,#pairdlg #pr-busy,#pairdlg #pr-result{display:grid;gap:12px}
    #pairdlg label.pr-field{display:grid;gap:5px;font-size:14px;font-weight:700}
    #pairdlg textarea{font:inherit;font-size:16px;font-weight:400;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);width:100%;resize:vertical;min-height:112px}
    #pairdlg textarea:focus-visible{outline:3px solid var(--brass);outline-offset:2px}
    #pairdlg .pr-hint{font-size:13px;color:rgba(30,39,33,.75)}
    #pairdlg .pr-btns{display:flex;flex-wrap:wrap;gap:8px}
    #pairdlg .chip:disabled{opacity:.5;cursor:not-allowed}
    #pr-msg{min-height:1.4em;font-size:14px}
    #pr-msg.bad{color:var(--amber);font-weight:700}
    .pr-spin{width:34px;height:34px;border:4px solid var(--line);border-top-color:var(--ink);border-radius:50%;animation:pr-turn 1s linear infinite}
    @keyframes pr-turn{to{transform:rotate(360deg)}}
    @media (prefers-reduced-motion:reduce){.pr-spin{animation-duration:3s}}
    #pr-courses{list-style:none;display:grid;gap:10px}
    .pr-course{border:1px solid var(--line);border-radius:8px;background:#fff;padding:12px 14px;display:grid;gap:8px}
    .pr-dish{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(30,39,33,.7)}
    .pr-pick{display:grid;gap:2px}
    .pr-pick.alt{border-top:1px dotted var(--line);padding-top:8px}
    .pr-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px}
    .pr-wine{font-family:'Bodoni Moda',serif;font-weight:700;font-size:21px;line-height:1.15;color:var(--ink)}
    a.pr-wine{text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:4px}
    a.pr-wine:hover{color:var(--amber);text-decoration-color:var(--amber)}
    a.pr-wine:focus-visible{outline:3px solid var(--brass);outline-offset:2px}
    .pr-altlabel{font-size:13px;font-weight:700;color:rgba(30,39,33,.75)}
    .pr-meta{font-family:'Space Mono',monospace;font-size:12px;color:rgba(30,39,33,.7)}
    .pr-reason{font-size:15px}
    .pr-cnote{font-size:14px;font-style:italic;color:var(--amber)}
    .pr-one{border-left:3px solid var(--brass);background:#fff;padding:10px 14px;display:grid;gap:4px}
    .pr-onelabel{font-size:13px;font-weight:700}
    .pr-note{font-size:14px;border-left:3px solid var(--line);padding:2px 0 2px 12px}
    .card:target{outline:3px solid var(--brass);outline-offset:-3px}
    #pairdlg .pr-dev{background:#fff3cd;border:1px solid #e0c36a;border-radius:8px;padding:6px 10px;font-size:13px}`;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; };
  const today = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  /* het menu van vandaag, zoals je het de vorige keer intypte (een menu van gisteren komt niet terug) */
  const remembered = () => { try{ const o = JSON.parse(localStorage.getItem(STORE) || 'null'); return o && o.date === today() && typeof o.text === 'string' ? o.text : ''; }catch(e){ return ''; } };
  const remember = text => { try{ localStorage.setItem(STORE, JSON.stringify({ date: today(), text })); }catch(e){} };

  let built = null;

  function build(opts){
    document.head.appendChild(style);                                       // pas voor een beheerder: bezoekers krijgen dit venster en zijn opmaak niet
    const dlg = document.createElement('dialog');
    dlg.id = 'pairdlg';
    dlg.setAttribute('aria-labelledby', 'pr-title');
    dlg.innerHTML = `
      <div class="pr-body">
        <h2 id="pr-title">Wijn bij het menu</h2>
        <form id="pr-form" novalidate>
          <label class="pr-field">Wat staat er vandaag op het menu?
            <textarea id="pr-menu" rows="4" maxlength="${MAX}" placeholder="bijv. pompoensoep, ossenhaas met rode wijnsaus en tiramisu, voor 6 personen"></textarea>
          </label>
          <p class="pr-hint">Typ het zoals het uitkomt, of dicteer het. Ik zoek in wat er nu op voorraad is. Ctrl+Enter (⌘+Enter) zoekt meteen.</p>
          <p id="pr-msg" role="status" aria-live="polite"></p>
          <div class="pr-btns">
            <button type="submit" class="chip primary" id="pr-go" disabled>Zoek de beste wijn</button>
            <button type="button" class="chip" id="pr-cancel">Sluiten</button>
          </div>
        </form>
        <div id="pr-busy" hidden>
          <p id="pr-busy-text" role="status" aria-live="polite">Even kijken wat er in de kelder bij past… Dit duurt meestal 5 tot 15 seconden.</p>
          <div class="pr-spin" aria-hidden="true"></div>
          <div class="pr-btns"><button type="button" class="chip" id="pr-stop">Stoppen</button></div>
        </div>
        <div id="pr-result" hidden>
          <h3 id="pr-rtitle" tabindex="-1"></h3>
          <ul id="pr-courses"></ul>
          <div id="pr-one" class="pr-one" hidden></div>
          <p id="pr-rnote" class="pr-note" hidden></p>
          <div class="pr-btns">
            <button type="button" class="chip primary" id="pr-done">Sluiten</button>
            <button type="button" class="chip" id="pr-edit">Menu aanpassen</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    if(window.kelderPairing && kelderPairing.devNote){
      const n = el('p', 'pr-dev', kelderPairing.devNote);
      dlg.querySelector('.pr-body').prepend(n);
    }

    const $ = id => dlg.querySelector('#' + id);
    const form = $('pr-form'), busy = $('pr-busy'), result = $('pr-result'), ta = $('pr-menu'), go = $('pr-go');
    let token = 0;                                                          // een antwoord van een vraag die inmiddels is gestopt of gesloten, wordt genegeerd

    const show = which => { form.hidden = which !== 'form'; busy.hidden = which !== 'busy'; result.hidden = which !== 'result'; };
    const say = (text, bad) => { const m = $('pr-msg'); m.textContent = text || ''; m.className = bad ? 'bad' : ''; };
    const stocked = () => !opts.hasStock || opts.hasStock();
    const ready = () => { go.disabled = ta.value.trim().length < MIN || !stocked(); };

    /* een wijn in de suggesties: een link naar zijn kaart op de pagina (die sluit het venster), of gewone tekst als de kaart er niet is */
    function wineName(p){
      const id = typeof window.slug === 'function' ? window.slug(p.name) : '';
      if(id && document.getElementById(id)){
        const a = el('a', 'pr-wine', p.name);
        a.href = '#' + id;
        a.addEventListener('click', () => dlg.close());
        return a;
      }
      return el('strong', 'pr-wine', p.name);
    }
    function pickEl(p, alt){
      const box = el('div', 'pr-pick' + (alt ? ' alt' : ''));
      const head = el('div', 'pr-head');
      if(alt) head.appendChild(el('span', 'pr-altlabel', 'Ook goed:'));
      head.appendChild(wineName(p));
      const kind = (window.WKINDS && WKINDS[p.kind]) || p.kind || '';
      const left = p.quantity == null ? '' : p.quantity === 1 ? '1 fles' : p.quantity + ' flessen';
      const meta = [kind, left].filter(Boolean).join(' · ');
      if(meta) head.appendChild(el('span', 'pr-meta', meta));
      box.appendChild(head);
      const origin = [p.grape, p.region].filter(Boolean).join(' · ');
      if(origin) box.appendChild(el('span', 'pr-meta', origin));
      if(p.reason) box.appendChild(el('p', 'pr-reason', p.reason));
      return box;
    }

    function showResult(res){
      const courses = Array.isArray(res.courses) ? res.courses : [];
      const list = $('pr-courses'), one = $('pr-one'), note = $('pr-rnote');
      list.textContent = '';
      for(const c of courses){
        const li = el('li', 'pr-course');
        if(c.dish) li.appendChild(el('div', 'pr-dish', c.dish));
        (c.picks || []).forEach((p, i) => li.appendChild(pickEl(p, i > 0)));
        if(c.note) li.appendChild(el('p', 'pr-cnote', c.note));
        list.appendChild(li);
      }
      one.textContent = '';
      one.hidden = !res.one_bottle;
      if(res.one_bottle){
        one.appendChild(el('p', 'pr-onelabel', 'Maar één fles open? Neem deze:'));
        one.appendChild(pickEl(res.one_bottle, false));
      }
      note.textContent = res.note || '';
      note.hidden = !res.note;
      const anyPick = courses.some(c => (c.picks || []).length);
      $('pr-rtitle').textContent = !courses.length ? 'Geen menu herkend'
        : !anyPick ? 'Geen goede match in je voorraad'
        : courses.length > 1 ? 'Dit past bij je menu' : 'Dit past erbij';
      show('result');
      $('pr-rtitle').focus();
    }

    async function search(){
      const text = ta.value.trim();
      if(text.length < MIN || !stocked()) return;
      remember(text);
      const mine = ++token;
      say('');
      show('busy');
      let res;
      try{ res = await kelderAdmin.suggestPairing(text); }
      catch(e){ res = { ok: false, message: 'Zoeken mislukt: ' + ((e && e.message) || e) }; }
      if(mine !== token) return;
      if(!res.ok){ show('form'); say(res.message, true); ta.focus(); return; }
      if(res.status === 'no_wines'){ show('form'); say('Er staat nu geen wijn op voorraad, dus er valt niets te kiezen.', true); return; }
      showResult(res);
    }

    form.addEventListener('submit', e => { e.preventDefault(); search(); });
    ta.addEventListener('input', () => { ready(); say(''); if(ta.value.trim()) remember(ta.value.trim()); });
    ta.addEventListener('keydown', e => {
      if((e.metaKey || e.ctrlKey) && e.key === 'Enter'){ e.preventDefault(); if(!go.disabled) search(); }
    });
    $('pr-stop').addEventListener('click', () => { token++; show('form'); say('Gestopt. Je kunt het menu aanpassen en opnieuw zoeken.'); ta.focus(); });
    $('pr-edit').addEventListener('click', () => { show('form'); say(''); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
    $('pr-cancel').addEventListener('click', () => dlg.close());
    $('pr-done').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => { token++; show('form'); say(''); });
    if(window.kelderCloseOnOutside) kelderCloseOnOutside(dlg);                // er wordt niets bewaard of veranderd: buiten klikken mag altijd

    return {
      open(){
        if(!ta.value.trim()) ta.value = remembered();
        show('form');
        say(stocked() ? '' : 'Er staat nu geen wijn op voorraad, dus er valt niets te kiezen.', !stocked());
        ready();
        dlg.showModal();
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    };
  }

  window.kelderPairing = Object.assign(window.kelderPairing || {}, {
    init(opts){
      opts = opts || {};
      if(built || !opts.host || !window.kelderAdmin || !kelderAdmin.suggestPairing) return;
      built = build(opts);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'chip primary'; button.id = 'pairwine'; button.textContent = 'Wijn bij het menu';
      button.addEventListener('click', () => built.open());
      opts.host.appendChild(button);
    }
  });
})();
