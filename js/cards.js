/* kaartenpagina, gedeeld door cocktails.html en mocktails.html
   verwacht PAGE = {list, noun:[enkelvoud, meervoud]}; gebruikt de data-loader en stock.js
   Wat volgens de database op is, wordt niet getoond: geen kaart. De pagina toont alle beschikbare kaarten, ook de recepten die
   niet op het menu staan; er is geen filter op fles of drank.

   Beheerder: wie ingelogd is (op voorraad.html, in dit tabblad) krijgt per kaart een vinkje "Op het menu" (recipes.on_menu).
   Het menu toont alleen de recepten met een vinkje; deze pagina toont ze allemaal. Het vinkje wordt meteen opgeslagen. */
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const grid = document.getElementById('grid');
const counter = document.getElementById('count');
const empty = document.getElementById('empty');
const R_ = PAGE.list.filter(isAvailable);

/* flessen/dranken die in minstens één beschikbaar recept zitten: voor de tekst en de silhouetten bovenaan */
const used = new Set(R_.flatMap(r=>r.b));
const total = ORDER.reduce((a,[label]) => a + itemsOf(label).filter(i => used.has(i.n) && !isOut(i.n)).length, 0);
const nb = document.getElementById('nbottles');
if(nb) nb.textContent = total;
const pattern = [58,70,46,64,52,72,44,60,68,50,62,56,74,48,66,54,70,42];
const bar = document.getElementById('bar');
for(let i=0;i<total;i++){ const b=document.createElement('i'); b.style.height=pattern[i%pattern.length]+'px'; bar.appendChild(b); }

/* kaarten */
R_.forEach(r=>{
  const c = document.createElement('article');
  c.className='card'; c.id=slug(r.n); c.dataset.rid = r.id;
  const ready = !r.s.some(x=>x[2]);
  c.innerHTML = `
    <div class="card-top">
      <h3>${esc(r.n)}</h3>
      <div class="tags">
        <span class="tag">${esc(r.t)}</span>
        ${ready?'<span class="tag ready">kan nu</span>':''}
      </div>
    </div>
    <p class="blurb">${esc(r.blurb)}</p>
    <ul class="spec">
      ${r.s.map(x=>`<li class="${x[2]?'bar':''}"><span class="ml">${esc(x[0])}</span><span>${esc(x[1])}</span></li>`).join('')}
    </ul>
    <p class="method">${esc(r.m)}</p>
    <a class="rec" href="${esc(r.u)}" target="_blank" rel="noopener">Recept online ↗</a>`;
  grid.appendChild(c);
});

const [one,many]=PAGE.noun;
let adminMode = false;
function paintCount(){
  const base = `${R_.length} ${R_.length===1?one:many}`;
  counter.textContent = adminMode ? `${base} · ${R_.filter(r => r.menu).length} op het menu` : base;
}
paintCount();
empty.hidden = R_.length>0;

/* beheerder: het vinkje "Op het menu" per kaart. Bezoekers krijgen dit niet, en er wordt voor hen niets opgevraagd. */
(async () => {
  let hint = false;
  try{ hint = !!sessionStorage.getItem('kelderrestjes-admin-auth'); }catch(e){}
  if(!hint || !window.kelderAdmin || !kelderAdmin.available || !R_.length) return;
  let ok = false;
  try{ ok = await kelderAdmin.current(); }catch(e){}
  if(!ok) return;
  adminMode = true;

  const style = document.createElement('style');
  style.textContent = `
    .onmenu{display:inline-flex;align-items:center;gap:8px;margin:2px 0 12px;font-size:13px;font-weight:700;cursor:pointer}
    .onmenu input{width:18px;height:18px;accent-color:var(--ink);cursor:pointer}
    .onmenu input:focus-visible{outline:3px solid var(--brass);outline-offset:2px}
    .onmenu input:disabled{opacity:.5;cursor:progress}
    .menumsg{font-size:14px;min-height:1.4em;margin:6px 0 0}
    .menumsg.bad{color:var(--amber);font-weight:700}`;
  document.head.appendChild(style);

  const msg = document.createElement('p');
  msg.className = 'menumsg'; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
  counter.after(msg);
  const say = (t, bad) => { msg.textContent = t || ''; msg.className = 'menumsg' + (bad ? ' bad' : ''); };

  for(const c of grid.children){
    const r = R_.find(x => String(x.id) === c.dataset.rid);
    if(!r) continue;
    const label = document.createElement('label');
    label.className = 'onmenu';
    label.innerHTML = `<input type="checkbox" class="menu-check"${r.menu ? ' checked' : ''} aria-label="Op het menu: ${esc(r.n)}"> Op het menu`;
    c.querySelector('.card-top').after(label);
  }
  paintCount();

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
})();
