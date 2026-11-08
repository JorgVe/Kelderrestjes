/* De eigen pagina van een cocktail of mocktail: recept.html?soort=cocktail&naam=amaretto-sour (js/data-loader.js: recipeUrl). Een adres dat je kunt
   delen: de naam, de soort, de ingrediënten, de bereiding en de beoordelingen, en voor iedereen een formulier om er zelf een achter te laten.

   Wie doet wat:
     deze pagina    zoekt het recept in R (cocktails) of Z (mocktails) op soort en naam (slug), toont het en leest de beoordelingen
     Supabase       bewaart de beoordelingen (tabel reviews, migratie 0030): iedereen mag ze lezen (behalve de kolom visitor); schrijven kan alleen via de
                    Edge Function cocktail-ai (actie review), die de beoordeling controleert en binnen een limiet bewaart. Een beheerder mag er een verwijderen.

   Indeling: bovenaan staat de naam van het recept met zijn stijl ernaast, over de hele breedte, met rechts in dezelfde rij de knoppen (Recept online, terug naar de lijst). Daaronder, op een breed scherm, staat het recept links (het blijft in beeld als je door de beoordelingen scrolt) en staan de beoordelingen rechts,
   eerst de bestaande beoordelingen en daaronder het formulier voor een nieuwe; op een smal scherm staan ze onder elkaar.

   De grote titel bovenaan blijft de soort (Cocktail of Mocktail, zoals op de lijstpagina's); de naam van het recept staat eronder als kop, over beide kolommen.

   Een beoordeling: 1 t/m 5 sterren (verplicht), een tekst (hoogstens 500 tekens) en een naam (hoogstens 40 tekens), allebei niet verplicht; er hoeft
   niemand in te loggen. Een bezoeker kan een recept één keer per dag beoordelen; links in de tekst worden geweigerd. Een verborgen veld in het formulier
   vangt robots (wie het invult krijgt een vriendelijk antwoord en er wordt niets bewaard).
   Instelling reviews_enabled (admin.html) uit: de beoordelingen en het formulier zijn weg. Ontbreekt de tabel (migratie 0030 nog niet gedraaid), dan
   blijft het recept gewoon staan en ontbreken alleen de beoordelingen.

   kelderRecipePage.init() tekent de pagina (nogmaals aanroepen mag); js/drinks-dev.js kan op localhost kelderReviewsStub zetten om zonder database te proberen. */
(function(){
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const NL = n => String(n).replace('.', ',');
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
  const NOUN = { cocktail: ['cocktail', 'Cocktails', 'cocktails.html'], mocktail: ['mocktail', 'Mocktails', 'mocktails.html'] };
  /* de regel onder de grote titel: dezelfde als op de lijstpagina's (cocktails.html en mocktails.html) */
  const LEDE = { cocktail: 'Eén kan geen kwaad. Over de derde praten we later.', mocktail: 'Morgenochtend zul je ons dankbaar zijn.' };
  const REVIEW_MS = 30 * 1000;
  const MAX_NAME = 40, MAX_TEXT = 500;

  const CSS = `
    /* de naam van het recept met zijn soort (de stijl) ernaast, over de hele breedte: boven het recept én boven de beoordelingen */
    .rp-top{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px 24px;margin-bottom:28px}
    .rp-who{display:flex;align-items:center;flex-wrap:wrap;gap:10px 18px;min-width:0}
    .rp-heading{font-family:'Bodoni Moda',serif;font-weight:700;font-size:clamp(30px,4.4vw,48px);line-height:1.05;letter-spacing:-.015em;overflow-wrap:anywhere;min-width:0}
    .rp-card > :first-child{margin-top:0}
    .rp{padding:40px 0 24px}
    /* twee kolommen: het recept links, de beoordelingen rechts (zonder beoordelingen staat het recept alleen, op leesbare breedte) */
    .rp-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:40px clamp(32px,5vw,72px);align-items:start}
    .rp-grid.rp-solo{grid-template-columns:minmax(0,760px)}
    @media (min-width:901px){ .rp-card{position:sticky;top:calc(var(--bar,10px) + 24px)} }
    @media (max-width:900px){ .rp-grid{grid-template-columns:minmax(0,1fr)} }
    .rp-meta{display:flex;gap:6px;flex-wrap:wrap}
    .rp-meta:empty{display:none}
    .rp-card .blurb{font-size:17px;margin:6px 0 20px}
    .rp-card ul.spec{font-size:14px}
    .rp-card .method{font-size:16px}
    .rp-card .miss{font-size:12px}
    .rp-actions{display:flex;flex-wrap:wrap;gap:8px;flex:none}
    .rp-actions .chip,.rp-actions a.chip{font-size:14px}
    .rp-card .rp-actions{margin-top:24px}                          /* in de melding "dit recept bestaat niet" staan de knoppen onder de tekst */
    .rp-msg{font-size:14px;min-height:1.4em}
    .rp-msg.bad{color:var(--amber);font-weight:700}
    .rp-rev{min-width:0;padding:0}                                  /* de pagina geeft elke <section> 56px ruimte boven en onder: hier niet */
    .rp-rev h2{font-size:24px;line-height:1.15;margin-bottom:6px}
    .rp-sum{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:6px 0 20px;font-size:15px}
    .rp-stars{color:var(--brass);font-size:22px;letter-spacing:.08em;line-height:1}
    .rp-avg{font-weight:700;font-size:18px}
    .rp-list{list-style:none;display:grid;gap:12px;margin:0 0 28px;padding:0}
    .rp-list:empty{display:none}
    .rp-item{background:#fff;border:1px solid var(--line);border-radius:8px;padding:12px 16px}
    .rp-head{display:flex;gap:6px 12px;align-items:baseline;flex-wrap:wrap}
    .rp-name{font-weight:700}
    .rp-date{font-size:13px;color:rgba(30,39,33,.7)}
    .rp-body{margin-top:6px;overflow-wrap:anywhere}
    .rp-del{margin-left:auto;font-size:12px;padding:3px 10px}
    .rp-none{font-size:15px;color:rgba(30,39,33,.7);margin-bottom:18px}
    .rp-form{display:grid;gap:14px;padding:18px 20px 20px;background:var(--paper-2);border-left:3px solid var(--brass)}
    .rp-form h3{font-family:'Bodoni Moda',serif;font-weight:700;font-size:22px;line-height:1.15}
    .rp-form label.rp-field{display:grid;gap:5px;font-size:14px;font-weight:700}
    .rp-form input[type=text],.rp-form textarea{font:inherit;font-size:16px;font-weight:400;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);width:100%}
    .rp-form textarea{resize:vertical;min-height:90px}
    .rp-form input:focus-visible,.rp-form textarea:focus-visible{outline:3px solid var(--brass);outline-offset:2px}
    .rp-form .rp-opt{font-weight:400;color:rgba(30,39,33,.7)}
    .rp-rate{border:0;padding:0;margin:0;min-width:0}
    .rp-rate legend{font-size:14px;font-weight:700;padding:0;margin-bottom:4px}
    .rp-pick{display:inline-flex;flex-direction:row-reverse;justify-content:flex-end;gap:2px}
    .rp-pick input{position:absolute;opacity:0;width:1px;height:1px}
    .rp-pick label{font-size:38px;line-height:1;color:rgba(30,39,33,.28);cursor:pointer;padding:0 3px}
    .rp-pick input:checked ~ label,.rp-pick label:hover,.rp-pick label:hover ~ label{color:var(--brass)}
    .rp-pick input:focus-visible + label{outline:3px solid var(--brass);outline-offset:2px;border-radius:6px}
    .rp-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
    .rp-hp{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden}
    .rp-form .chip.primary{background:var(--ink);color:var(--paper);border-color:var(--ink);justify-self:start}
    .rp-form .chip.primary:hover:not(:disabled){background:var(--shelf-deep);border-color:var(--shelf-deep)}
    .rp-form .chip:disabled{opacity:.5;cursor:progress}
    .rp-hint{font-size:13px;color:rgba(30,39,33,.75)}`;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const $ = id => document.getElementById(id);
  const main = $('recipe');

  /* ------------------------------------------------------------------ beoordelingen lezen en schrijven (te vervangen door js/drinks-dev.js) */
  async function listReviews(recipeId){
    const stub = window.kelderReviewsStub;
    if(stub && stub.list) return stub.list(recipeId);
    const sb = window.kelderSb;
    if(!sb) return { ok: false };
    const { data, error } = await sb.from('reviews').select('id,rating,name,body,created_at').eq('recipe_id', recipeId).order('created_at', { ascending: false }).limit(50);
    return error ? { ok: false } : { ok: true, reviews: data || [] };
  }
  const within = (promise, ms) => {
    let timer;
    const late = new Promise(ok => { timer = setTimeout(() => ok({ timedOut: true }), ms); });
    return Promise.race([promise, late]).finally(() => clearTimeout(timer));
  };
  /* input: { recipe_id, rating, name, text, website }. Geeft { ok: true, review } | { ok: true, status: 'disabled' } | { ok: false, message } */
  async function submitReview(input){
    const stub = window.kelderReviewsStub;
    if(stub && stub.submit) return stub.submit(input);
    const sb = window.kelderSb;
    if(!sb) return { ok: false, message: 'Supabase is niet beschikbaar (geblokkeerd of offline?).' };
    const reply = await within(sb.functions.invoke('cocktail-ai', { body: { action: 'review', ...input } }), REVIEW_MS);
    if(reply.timedOut) return { ok: false, message: 'Het opslaan duurde te lang. Controleer de beoordelingen en probeer het eventueel nog eens.' };
    const { data, error } = reply;
    if(error){
      const status = error.context && error.context.status;
      let code = '';
      try{ const b = await error.context.json(); code = (b && b.code) || ''; }catch(e){}
      if(error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') return { ok: false, message: 'Geen verbinding. Probeer het zo nog eens.' };
      if(code === 'rating') return { ok: false, message: 'Kies eerst 1 tot en met 5 sterren.' };
      if(code === 'links') return { ok: false, message: 'Links zijn niet toegestaan in een beoordeling.' };
      if(code === 'already') return { ok: false, message: 'Je hebt dit recept vandaag al beoordeeld. Morgen mag je opnieuw.' };
      if(code === 'day_limit') return { ok: false, message: 'Er zijn vandaag genoeg beoordelingen geplaatst. Probeer het morgen nog eens.' };
      if(status === 429) return { ok: false, message: 'Je hebt net al een paar beoordelingen geplaatst. Probeer het over een uurtje nog eens.' };
      if(status === 404 || status === 503) return { ok: false, message: 'Beoordelen kan nu niet.' };
      return { ok: false, message: 'Het opslaan is mislukt. Probeer het zo nog eens.' };
    }
    if(data && data.status === 'ok') return { ok: true, review: data.review || null };
    if(data && data.status === 'disabled') return { ok: true, status: 'disabled' };
    return { ok: false, message: 'Het opslaan gaf een antwoord dat de site niet begrijpt.' };
  }

  /* ------------------------------------------------------------------ de pagina */
  const dateText = iso => { try{ return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }); }catch(e){ return ''; } };

  function reviewItem(rv, admin){
    const li = document.createElement('li');
    li.className = 'rp-item'; li.dataset.id = rv.id;
    li.innerHTML = `<div class="rp-head"><span class="rp-stars" role="img" aria-label="${rv.rating} van 5 sterren">${stars(rv.rating)}</span>
      <span class="rp-name">${esc(rv.name || 'Anoniem')}</span><span class="rp-date">${esc(dateText(rv.created_at))}</span>
      ${admin ? `<button type="button" class="chip rp-del" data-id="${esc(rv.id)}">Verwijderen</button>` : ''}</div>
      ${rv.body ? `<p class="rp-body">${esc(rv.body)}</p>` : ''}`;
    return li;
  }

  async function init(){
    const q = new URLSearchParams(location.search);
    const kind = q.get('soort') === 'mocktail' ? 'mocktail' : 'cocktail';
    const [one, many, listPage] = NOUN[kind];
    const wanted = window.slug(q.get('naam') || '');
    const r = (kind === 'mocktail' ? Z : R).find(x => window.slug(x.n) === wanted);
    document.querySelectorAll('.nav a[aria-current]').forEach(a => a.removeAttribute('aria-current'));
    $('nav-' + kind).setAttribute('aria-current', 'page');
    $('rp-eyebrow').textContent = `Kelderrestjes · ${one}`;
    $('rp-lede').textContent = LEDE[kind];
    $('rp-title').textContent = many.replace(/s$/, '');                    // de grote titel blijft de soort (Cocktail of Mocktail); de naam van het recept staat in de kaart

    let admin = false;
    try{
      if(window.kelderDevAdmin) admin = true;
      else if(sessionStorage.getItem('kelderrestjes-admin-auth') && window.kelderAdmin && kelderAdmin.available) admin = await kelderAdmin.current();
    }catch(e){}

    const wrap = main.querySelector('.wrap') || main.appendChild(Object.assign(document.createElement('div'), { className: 'wrap' }));
    wrap.textContent = '';
    const back = `<a class="chip" href="${listPage}">Alle ${many.toLowerCase()}</a>`;

    /* een lijst die uit staat voor bezoekers, of een recept dat niet bestaat (meer) */
    const listOn = setting(kind === 'mocktail' ? 'menu_show_mocktails' : 'menu_show_cocktails') !== false;
    if(!r || (!listOn && !admin)){
      document.title = 'Recept niet gevonden — Kelderrestjes';
      wrap.innerHTML = `<div class="rp-card"><h2 class="rp-heading">${!r ? 'Dit recept bestaat niet' : `De ${many.toLowerCase()} zijn niet beschikbaar`}</h2><p class="empty" style="padding-top:0">${!r ? 'Dit recept staat niet (meer) op de kaart. Misschien is de naam veranderd of is het verwijderd.' : 'Deze lijst is op dit moment niet beschikbaar.'}</p>
        <div class="rp-actions"><a class="chip" href="cocktails.html">Alle cocktails</a><a class="chip" href="mocktails.html">Alle mocktails</a><a class="chip" href="index.html">Naar het menu</a></div></div>`;
      return;
    }

    document.title = `${r.n} — Kelderrestjes`;
    const meta = document.querySelector('meta[name="description"]');
    if(meta) meta.content = r.blurb || `${r.n}: een ${one} uit de huisbar, met ingrediënten en bereiding.`;

    const can = canMix(r);
    /* de naam met zijn stijl ernaast staat over beide kolommen heen (ook over de beoordelingen), zodat de twee kolommen op dezelfde hoogte beginnen;
       de knoppen staan rechts in diezelfde rij */
    const top = document.createElement('div');
    top.className = 'rp-top';
    top.innerHTML = `<div class="rp-who"><h2 class="rp-heading">${esc(r.n)}</h2>
        <div class="rp-meta">${r.t ? `<span class="tag">${esc(r.t)}</span>` : ''}${can ? '' : '<span class="tag gone">Nu niet beschikbaar</span>'}</div></div>
      <div class="rp-actions">
        ${/^https?:\/\//i.test(r.u || '') ? `<a class="chip" href="${esc(r.u)}" target="_blank" rel="noopener">Recept online ↗</a>` : ''}
        ${back}
      </div>`;
    wrap.appendChild(top);
    const grid = document.createElement('div');
    grid.className = 'rp-grid rp-solo';
    wrap.appendChild(grid);
    const card = document.createElement('article');
    card.className = 'rp-card';
    card.innerHTML = `
      ${r.blurb ? `<p class="blurb">${esc(r.blurb)}</p>` : ''}
      <ul class="spec">${r.s.map(x => `<li><span class="ml">${esc(x[0])}</span><span>${esc(x[1])}</span></li>`).join('')}</ul>
      ${r.m ? `<p class="method">${esc(r.m)}</p>` : ''}
      ${can ? '' : `<p class="miss">Kan nu niet: ${esc(blockedBy(r).join(', '))}</p>`}`;
    grid.appendChild(card);

    /* beoordelingen: alleen als de beheerder ze niet heeft uitgezet en de tabel er is */
    if(setting('reviews_enabled') === false) return;
    const got = await listReviews(r.id);
    if(!got.ok) return;
    let reviews = got.reviews.slice();

    const sec = document.createElement('section');
    sec.className = 'rp-rev';
    sec.setAttribute('aria-labelledby', 'rp-rev-title');
    sec.innerHTML = `
      <h2 id="rp-rev-title">Beoordelingen</h2>
      <p class="rp-sum" id="rp-sum"></p>
      <ul class="rp-list" id="rp-list"></ul>
      <p class="rp-none" id="rp-none" hidden>Er zijn nog geen beoordelingen. Wees de eerste.</p>
      <form class="rp-form" id="rp-form" novalidate>
        <h3>Laat een beoordeling achter</h3>
        <fieldset class="rp-rate">
          <legend>Hoeveel sterren geef je?</legend>
          <div class="rp-pick" id="rp-pick">
            ${[5, 4, 3, 2, 1].map(n => `<input type="radio" name="rating" id="rp-s${n}" value="${n}"><label for="rp-s${n}" title="${n} ${n === 1 ? 'ster' : 'sterren'}">★<span class="rp-vh">${n} ${n === 1 ? 'ster' : 'sterren'}</span></label>`).join('')}
          </div>
        </fieldset>
        <label class="rp-field"><span>Je naam <span class="rp-opt">(mag leeg blijven)</span></span>
          <input type="text" id="rp-name" maxlength="${MAX_NAME}" autocomplete="off" placeholder="bijv. Jorg">
        </label>
        <label class="rp-field"><span>Je beoordeling <span class="rp-opt">(mag leeg blijven)</span></span>
          <textarea id="rp-text" maxlength="${MAX_TEXT}" rows="3" placeholder="Wat vond je ervan?"></textarea>
        </label>
        <div class="rp-hp" aria-hidden="true"><label>Laat dit leeg <input type="text" id="rp-web" name="website" tabindex="-1" autocomplete="off"></label></div>
        <p class="rp-hint">Je hoeft niet in te loggen. Iedereen kan je beoordeling en naam zien; links zijn niet toegestaan.</p>
        <p class="rp-msg" id="rp-msg" role="status" aria-live="polite"></p>
        <button type="submit" class="chip primary" id="rp-go">Plaats beoordeling</button>
      </form>`;
    grid.appendChild(sec);
    grid.classList.remove('rp-solo');

    const paint = () => {
      const n = reviews.length;
      const avg = n ? reviews.reduce((a, x) => a + x.rating, 0) / n : 0;
      const rounded = Math.round(avg * 10) / 10;
      $('rp-sum').innerHTML = n
        ? `<span class="rp-stars" role="img" aria-label="Gemiddeld ${NL(rounded)} van 5 sterren">${stars(Math.round(avg))}</span><span class="rp-avg">${NL(rounded)}</span><span>${n} ${n === 1 ? 'beoordeling' : 'beoordelingen'}</span>`
        : '';
      $('rp-none').hidden = n > 0;
      const ul = $('rp-list');
      ul.textContent = '';
      reviews.forEach(rv => ul.appendChild(reviewItem(rv, admin)));
    };
    paint();

    $('rp-list').addEventListener('click', async e => {
      const b = e.target.closest('button.rp-del');
      if(!b) return;
      if(!window.confirm('Deze beoordeling verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
      b.disabled = true;
      const res = await kelderAdmin.deleteReview(Number(b.dataset.id));
      if(!res.ok){ b.disabled = false; $('rp-msg').textContent = res.message; $('rp-msg').className = 'rp-msg bad'; return; }
      reviews = reviews.filter(x => String(x.id) !== b.dataset.id);
      paint();
    });

    const form = $('rp-form'), msg = $('rp-msg'), go = $('rp-go');
    const say = (t, bad) => { msg.textContent = t || ''; msg.className = 'rp-msg' + (bad ? ' bad' : ''); };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const picked = form.querySelector('input[name="rating"]:checked');
      if(!picked){ say('Kies eerst 1 tot en met 5 sterren.', true); return; }
      go.disabled = true; say('Even opslaan…');
      let res;
      try{
        res = await submitReview({ recipe_id: r.id, rating: Number(picked.value), name: $('rp-name').value, text: $('rp-text').value, website: $('rp-web').value });
      }catch(err){ res = { ok: false, message: 'Het opslaan is mislukt. Probeer het zo nog eens.' }; }
      if(!res.ok){ go.disabled = false; say(res.message, true); return; }
      if(res.status === 'disabled'){ say('Beoordelingen zijn op dit moment uitgezet.', true); return; }
      if(res.review) reviews.unshift(res.review);
      paint();
      form.reset();
      go.disabled = false;
      say('Bedankt voor je beoordeling!');
    });
  }

  window.kelderRecipePage = { init };
  init();
})();
