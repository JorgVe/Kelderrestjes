/* kaartenpagina, gedeeld door cocktails.html en mocktails.html
   verwacht PAGE = {list, noun:[enkelvoud, meervoud]}; gebruikt drinks.js en stock.js */
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const grid = document.getElementById('grid');
const chipbar = document.getElementById('chips');
const counter = document.getElementById('count');
const empty = document.getElementById('empty');
const picked = new Set();
let onlyAvailable = false;
const R_ = PAGE.list;

/* flessen/dranken die in minstens één recept zitten, van alcoholvrij naar sterk */
const used = new Set(R_.flatMap(r=>r.b));
const groups = ORDER
  .map(([label]) => [label, itemsOf(label).map(i=>i.n).filter(n=>used.has(n))])
  .filter(([,list]) => list.length);
const total = groups.reduce((a,[,l])=>a+l.length,0);
const nb = document.getElementById('nbottles');
if(nb) nb.textContent = total;
const pattern = [58,70,46,64,52,72,44,60,68,50,62,56,74,48,66,54,70,42];
const bar = document.getElementById('bar');
for(let i=0;i<total;i++){ const b=document.createElement('i'); b.style.height=pattern[i%pattern.length]+'px'; bar.appendChild(b); }

/* kaarten */
R_.forEach((r,i)=>{
  const c = document.createElement('article');
  c.className='card'; c.dataset.i=i; c.id=slug(r.n);
  const ready = !r.s.some(x=>x[2]);
  c.innerHTML = `
    <div class="card-top">
      <h3>${esc(r.n)}</h3>
      <div class="tags">
        <span class="tag">${esc(r.t)}</span>
        ${ready?'<span class="tag ready">kan nu</span>':''}
        <span class="tag gone" hidden>niet beschikbaar</span>
      </div>
    </div>
    <p class="blurb">${esc(r.blurb)}</p>
    <ul class="spec">
      ${r.s.map(x=>`<li class="${x[2]?'bar':''}"><span class="ml">${esc(x[0])}</span><span>${esc(x[1])}</span></li>`).join('')}
    </ul>
    <p class="method">${esc(r.m)}</p>
    <p class="miss" hidden></p>
    <a class="rec" href="${esc(r.u)}" target="_blank" rel="noopener">Recept online ↗</a>`;
  grid.appendChild(c);
});

/* chips per soort */
groups.forEach(([label,list])=>{
  const g=document.createElement('div'); g.className='group';
  g.innerHTML=`<span class="glabel">${esc(label)}</span>`;
  const row=document.createElement('div'); row.className='chips';
  list.forEach(b=>{
    const btn=document.createElement('button');
    btn.className='chip'; btn.type='button'; btn.textContent=b;
    btn.setAttribute('aria-pressed','false');
    btn.onclick=()=>{
      picked.has(b)?picked.delete(b):picked.add(b);
      btn.setAttribute('aria-pressed', picked.has(b));
      render();
    };
    row.appendChild(btn);
  });
  g.appendChild(row); chipbar.appendChild(g);
});
const resetRow=document.createElement('div'); resetRow.className='chips';
const reset=document.createElement('button');
reset.className='chip reset'; reset.type='button'; reset.textContent='Alles tonen';
reset.onclick=()=>{picked.clear();chipbar.querySelectorAll('.chip:not(.avail)').forEach(c=>c.setAttribute('aria-pressed','false'));render();};
const avail=document.createElement('button');
avail.className='chip reset avail'; avail.type='button'; avail.textContent='Alleen beschikbare';
avail.setAttribute('aria-pressed','false');
avail.onclick=()=>{onlyAvailable=!onlyAvailable;avail.setAttribute('aria-pressed',onlyAvailable);render();};
resetRow.appendChild(reset); resetRow.appendChild(avail); chipbar.appendChild(resetRow);

function render(){
  let shown=0, free=0;
  [...grid.children].forEach(c=>{
    const r=R_[c.dataset.i];
    const miss=missingFor(r);
    const gone=miss.length>0;
    c.classList.toggle('out',gone);
    c.querySelector('.gone').hidden=!gone;
    const m=c.querySelector('.miss');
    m.hidden=!gone;
    m.textContent=gone?`Op: ${miss.join(', ')}`:'';
    const match = picked.size===0 || r.b.some(x=>picked.has(x));
    const ok = match && !(onlyAvailable && gone);
    c.hidden=!ok;
    if(ok){ shown++; if(!gone) free++; }
  });
  const [one,many]=PAGE.noun;
  const nGone=shown-free;
  counter.textContent = (picked.size===0
    ? `${R_.length} ${many}`
    : `${shown} ${shown===1?one:many} met je selectie`)
    + (nGone ? ` · ${free} beschikbaar` : '');
  empty.hidden = shown>0;
}

/* ?fles=Naam selecteert die fles vooraf (links vanaf het menu) */
const wanted = new URLSearchParams(location.search).getAll('fles');
chipbar.querySelectorAll('.chip:not(.reset)').forEach(btn=>{
  if(wanted.includes(btn.textContent)){ picked.add(btn.textContent); btn.setAttribute('aria-pressed','true'); }
});
render();
