/* kaartenpagina, gedeeld door cocktails.html en mocktails.html
   verwacht PAGE = {list, noun:[enkelvoud, meervoud], kind:'cocktail'|'mocktail'}; gebruikt de data-loader en stock.js
   Een recept waarvan een ingrediënt op is (of dat niet voor cocktails is ingeschakeld) wordt niet getoond: geen kaart. De pagina toont
   alle recepten die kunnen, ook die niet op het menu staan; er is geen filter op fles of drank.

   Beheerder: wie ingelogd is (via het blokje rechtsboven, in dit tabblad) ziet ook de recepten die niet kunnen (gedimd, met de reden),
   krijgt per kaart het vinkje "Op het menu" (recipes.on_menu) en de knop Bewerken, en kan een cocktail of mocktail toevoegen
   (js/recipe-dialog.js: ingrediëntregels koppelen aan items). Bezoekers krijgen dit niet, en er wordt voor hen niets opgevraagd.

   window.kelderPageReady is een belofte die klaar is zodra de kaarten staan; boot.js wacht erop voordat het naar een #anker springt. */
window.kelderPageReady = (async () => {
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();      // zoeken zonder accenten en hoofdletters
  const grid = document.getElementById('grid');
  const counter = document.getElementById('count');
  const empty = document.getElementById('empty');

  let admin = false;
  try{
    if(sessionStorage.getItem('kelderrestjes-admin-auth') && window.kelderAdmin && kelderAdmin.available) admin = await kelderAdmin.current();
  }catch(e){}
  /* recepten bewerken en toevoegen vraagt de koppelingen tussen receptregels en items (migraties 0019 en 0020) */
  const canEdit = admin && !!window.kelderRecipeDialog && !window.kelderOldSchema;

  /* staat deze lijst uit (admin.html), dan is de pagina voor bezoekers niet beschikbaar: een melding in plaats van de kaarten */
  const pageOn = setting(PAGE.kind === 'mocktail' ? 'menu_show_mocktails' : 'menu_show_cocktails') !== false;
  if(!pageOn && !admin){
    document.querySelector('.sec-head').hidden = true;
    counter.hidden = true;
    grid.hidden = true;
    empty.textContent = `De ${PAGE.noun[1]} zijn op dit moment niet beschikbaar.`;
    empty.hidden = false;
    return;
  }

  const makeable = PAGE.list.filter(canMix);
  const R_ = admin ? PAGE.list : makeable;

  /* wat een recept laat vinden (data-q): de naam, de tekst van de ingrediëntregels en de namen van de gekoppelde items */
  /* kaarten */
  R_.forEach(r=>{
    const c = document.createElement('article');
    const can = canMix(r);
    c.className = 'card' + (can ? '' : ' out'); c.id = slug(r.n); c.dataset.rid = r.id;
    c.dataset.q = fold([r.n, ...r.lines.map(l => l.text), ...r.lines.flatMap(l => l.items)].join(' '));
    c.innerHTML = `
      <div class="card-top">
        <h3>${esc(r.n)}</h3>
        <div class="tags">
          <span class="tag">${esc(r.t)}</span>
        </div>
      </div>
      <p class="blurb">${esc(r.blurb)}</p>
      <ul class="spec">
        ${r.s.map(x=>`<li><span class="ml">${esc(x[0])}</span><span>${esc(x[1])}</span></li>`).join('')}
      </ul>
      <p class="method">${esc(r.m)}</p>
      ${can ? '' : `<p class="miss">Kan nu niet: ${esc(blockedBy(r).join(', '))}</p>`}
      ${/^https?:\/\//i.test(r.u || '') ? `<a class="rec" href="${esc(r.u)}" target="_blank" rel="noopener">Recept online ↗</a>` : ''}`;
    grid.appendChild(c);
  });

  const [one,many] = PAGE.noun;
  let query = '';
  function paintCount(){
    if(query){
      const shown = [...grid.children].filter(c => !c.hidden).length;
      counter.textContent = `${shown} van ${grid.children.length} ${many} voor "${query}"`;
      return;
    }
    const base = `${makeable.length} ${makeable.length===1?one:many}`;
    counter.textContent = admin
      ? `${base} · ${PAGE.list.filter(r => r.menu).length} op het menu${PAGE.list.length > makeable.length ? ` · ${PAGE.list.length - makeable.length} kunnen nu niet` : ''}`
      : base;
  }
  empty.hidden = R_.length > 0;

  /* zoeken: op de naam van het recept en op ingrediënten (zie data-q hierboven); elk woord moet ergens in staan, in willekeurige volgorde */
  const searchStyle = document.createElement('style');
  searchStyle.textContent = `
    .rsearch{margin:6px 0 4px}
    .rsearch input{width:min(460px,100%);height:46px;padding:0 20px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink);font:inherit;font-size:16px}
    .rsearch input:focus-visible{outline:3px solid var(--brass);outline-offset:2px}`;
  document.head.appendChild(searchStyle);
  const box = document.createElement('div');
  box.className = 'rsearch';
  box.innerHTML = `<input type="search" id="rs" placeholder="Zoek een ${esc(one)} of ingrediënt…" aria-label="Zoek op de naam van een ${esc(one)} of op een ingrediënt" autocomplete="off">`;
  counter.before(box);
  const nomatch = document.createElement('p');
  nomatch.className = 'empty'; nomatch.hidden = true;
  grid.after(nomatch);
  function applySearch(){
    query = document.getElementById('rs').value.trim();
    const words = fold(query).split(/\s+/).filter(Boolean);
    let shown = 0;
    for(const c of grid.children){ c.hidden = !words.every(w => c.dataset.q.includes(w)); if(!c.hidden) shown++; }
    nomatch.hidden = shown > 0 || !words.length;
    nomatch.textContent = `Geen ${one} gevonden voor "${query}". Zoek op de naam of op een ingrediënt.`;
    paintCount();
  }
  document.getElementById('rs').addEventListener('input', applySearch);
  box.addEventListener('keydown', e => { if(e.key === 'Escape'){ document.getElementById('rs').value = ''; applySearch(); } });
  paintCount();

  if(!admin) return;

  const style = document.createElement('style');
  style.textContent = `
    .onmenu{display:inline-flex;align-items:center;gap:8px;margin:2px 0 12px;font-size:13px;font-weight:700;cursor:pointer}
    .onmenu input{width:18px;height:18px;accent-color:var(--ink);cursor:pointer}
    .onmenu input:focus-visible{outline:3px solid var(--brass);outline-offset:2px}
    .onmenu input:disabled{opacity:.5;cursor:progress}
    .menumsg{font-size:14px;min-height:1.4em;margin:6px 0 0}
    .menumsg.bad{color:var(--amber);font-weight:700}
    .card .recipe-edit{align-self:flex-start;margin-top:14px;font-size:12px;padding:4px 12px}
    .chip.primary{background:var(--ink);color:var(--paper);border-color:var(--ink)}
    .chip.primary:hover{background:var(--shelf-deep);border-color:var(--shelf-deep)}
    .adminnote{font-size:14px;color:rgba(30,39,33,.7);margin:6px 0 0}`;
  document.head.appendChild(style);

  const msg = document.createElement('p');
  msg.className = 'menumsg'; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
  counter.after(msg);
  const say = (t, bad) => { msg.textContent = t || ''; msg.className = 'menumsg' + (bad ? ' bad' : ''); };
  if(!pageOn){
    const off = document.createElement('p');
    off.className = 'adminnote';
    off.textContent = `Deze lijst staat uit voor bezoekers: de pagina en alle verwijzingen ernaar zijn voor hen verborgen. Alleen jij ziet hem nog.`;
    msg.after(off);
  }

  for(const c of grid.children){
    const r = R_.find(x => String(x.id) === c.dataset.rid);
    if(!r) continue;
    const label = document.createElement('label');
    label.className = 'onmenu';
    label.innerHTML = `<input type="checkbox" class="menu-check"${r.menu ? ' checked' : ''} aria-label="Op het menu: ${esc(r.n)}"> Op het menu`;
    c.querySelector('.card-top').after(label);
    if(canEdit){
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip recipe-edit'; b.dataset.rid = r.id; b.textContent = 'Bewerken';
      b.setAttribute('aria-label', `Bewerken: ${r.n}`);
      c.appendChild(b);
    }
  }

  grid.addEventListener('change', async e => {
    const cb = e.target.closest('input.menu-check');
    if(!cb) return;
    const r = R_.find(x => String(x.id) === cb.closest('article').dataset.rid);
    if(!r) return;
    const want = cb.checked;
    cb.disabled = true;
    say('Opslaan…');
    const res = await kelderAdmin.setRecipeOnMenu(r.id, want);
    cb.disabled = false;
    if(!res.ok){ cb.checked = !want; say(res.message, true); return; }
    r.menu = want;
    paintCount();
    say(`${r.n} staat nu ${want ? 'op' : 'niet meer op'} het menu.`);
    cb.focus();
  });

  if(canEdit){
    kelderRecipeDialog.init({
      items: kelderRows.items, categories: kelderRows.categories, recipes: [...R, ...Z],
      onDone: () => location.reload()
    });
    grid.addEventListener('click', e => {
      const b = e.target.closest('button.recipe-edit');
      const r = b && PAGE.list.find(x => String(x.id) === b.dataset.rid);
      if(r) kelderRecipeDialog.open(r);
    });
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'chip primary'; add.id = 'addrecipe';
    add.textContent = `+ ${PAGE.kind === 'mocktail' ? 'Mocktail' : 'Cocktail'} toevoegen`;
    add.onclick = () => kelderRecipeDialog.open(null, { kind: PAGE.kind });
    document.querySelector('.sec-head').appendChild(add);
  }else if(window.kelderOldSchema){
    const note = document.createElement('p');
    note.className = 'adminnote';
    note.textContent = 'Recepten bewerken en toevoegen werkt zodra de nieuwe databasemigraties zijn toegepast (0019 en 0020).';
    msg.after(note);
  }
})();
