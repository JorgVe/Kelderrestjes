/* Het bewerkvenster voor een cocktail of mocktail: toevoegen, wijzigen en verwijderen, met de ingrediëntregels.
   Alleen voor een ingelogde beheerder; de cocktail- en mocktailpagina (js/cards.js) zetten het aan. Het venster en zijn stijl komen
   pas bij init() in de pagina, dus bezoekers merken niets.

   Elke ingrediëntregel heeft een hoeveelheid, een tekst (zoals het op de kaart staat) en de items waaraan hij gekoppeld is
   (recipe_line_items, zie 0019). Meer dan één item bij een regel zijn alternatieven ("Havana Club of Bacardí"): het recept kan zolang
   er één van is. Een regel zonder items (bijv. ijs) wordt niet bijgehouden. Aan de koppelingen ziet de site welke recepten niet kunnen
   als iets op is. Bij een nieuwe regel stelt het venster items voor die in de tekst voorkomen; kiezen doe je zelf.
   Alles wordt in één keer en in één transactie opgeslagen door de database-functie save_recipe (kelderAdmin.saveRecipe).

     kelderRecipeDialog.init({ items, recipes, onDone(tekst), onRelogin(tekst)? })   items = kelderRows.items, recipes = [...R, ...Z]
     kelderRecipeDialog.open(recept)                    een recept bewerken (een element van R of Z)
     kelderRecipeDialog.open(null, { kind })            een nieuwe cocktail ('cocktail') of mocktail ('mocktail')
     kelderRecipeDialog.open(null, { kind, draft })     idem, maar al ingevuld met een voorstel van Claude (js/invent.js):
                                                        draft = { name, style, blurb, method, why, lines: [{ amount, ingredient, items: [{ id }] }] }.
                                                        Er wordt niets opgeslagen voordat de beheerder zelf op Opslaan drukt. */
(function(){
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  const $ = id => document.getElementById(id);
  const NOUN = { cocktail: 'Cocktail', mocktail: 'Mocktail' };

  const CSS = `
  dialog#recipeedit{margin:auto;border:0;border-top:6px solid var(--brass);padding:0;width:min(820px,calc(100vw - 32px));max-height:calc(100vh - 32px);background:var(--paper);color:var(--ink);box-shadow:0 20px 60px rgba(0,0,0,.35)}
  dialog#recipeedit::backdrop{background:rgba(30,39,33,.55)}
  #reform{padding:22px 24px 20px;display:grid;gap:14px}
  #reform h2{font-size:26px}
  #reform .field{display:grid;gap:4px;align-content:start;min-width:0}
  #reform .lab{display:flex;align-items:center;gap:6px;min-height:20px}
  #reform .lab label{display:block;font-size:14px;font-weight:700}
  #reform .help{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none;width:18px;height:18px;border-radius:50%;border:1px solid rgba(30,39,33,.5);background:#fff;font:700 11px/1 'Karla',system-ui,sans-serif;color:rgba(30,39,33,.7);cursor:help}
  #reform .help:hover,#reform .help:focus-visible{background:var(--ink);border-color:var(--ink);color:var(--paper);outline:none}
  #reform .help::after{content:attr(data-tip);position:absolute;left:-6px;top:calc(100% + 8px);z-index:20;width:max-content;max-width:min(260px,60vw);padding:8px 10px;border-radius:8px;background:var(--ink);color:var(--paper);font:400 13px/1.35 'Karla',system-ui,sans-serif;text-align:left;box-shadow:0 6px 18px rgba(0,0,0,.3);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .12s}
  #reform .help:hover::after,#reform .help:focus-visible::after{opacity:1;visibility:visible}
  #reform input[type=text],#reform textarea{font:inherit;font-size:15px;font-weight:400;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);width:100%;min-width:0}
  #reform input[type=text]{height:40px}
  #reform textarea{padding:8px 12px;resize:vertical}
  #reform input:focus-visible,#reform textarea:focus-visible,#reform button:focus-visible{outline:3px solid var(--brass);outline-offset:2px}
  #reform .row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
  #reform .glabel{font-family:'Space Mono',monospace;font-size:10px;font-weight:400;letter-spacing:.18em;text-transform:uppercase;color:rgba(30,39,33,.7)}
  #reform .check{display:flex;flex-direction:row;align-items:center;gap:8px;font-size:14px;font-weight:400}
  #reform .check input{width:auto;height:auto;accent-color:var(--ink)}
  /* de ingrediëntregels */
  #re-lines{list-style:none;display:grid;gap:10px;margin:8px 0 10px}
  .rl{display:grid;gap:6px;padding:10px 12px;background:var(--paper-2);border-left:3px solid var(--brass)}
  .rl-row{display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:8px;align-items:center}
  .rl-link{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .rl-lbl{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(30,39,33,.7);margin-right:2px}
  .rl-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 4px 2px 10px;border-radius:999px;background:var(--ink);color:var(--paper);font-size:13px}
  .rl-chip button{border:0;background:none;color:inherit;font-size:16px;line-height:1;padding:2px 6px;cursor:pointer;border-radius:999px}
  .rl-chip button:hover{background:rgba(255,255,255,.2)}
  .rl-none{font-size:13px;color:rgba(30,39,33,.7)}
  #reform .rl-find{width:200px;height:32px;font-size:14px}
  .rl-pick,.rl-sug{list-style:none;display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px}
  .rl-pick[hidden],.rl-sug[hidden]{display:none}
  .rl-pick button,.rl-sug button{font:inherit;font-size:13px;padding:3px 10px;border-radius:999px;border:1px solid rgba(30,39,33,.35);background:#fff;color:var(--ink);cursor:pointer}
  .rl-pick button:hover,.rl-sug button:hover{border-color:var(--shelf-deep);background:var(--paper)}
  .rl-pick span{color:rgba(30,39,33,.7)}
  .rl-btns{display:inline-flex;gap:4px}
  .rl-btns button{width:30px;height:30px;border-radius:8px;border:1px solid rgba(30,39,33,.3);background:#fff;color:var(--ink);cursor:pointer;font-size:14px}
  .rl-btns button:hover{background:var(--ink);color:var(--paper)}
  .rl-btns button:disabled{opacity:.35;cursor:default}
  #reform .dlgbtns{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:4px}
  #reform .dlgbtns .danger{margin-left:auto}
  #reform .chip:disabled{opacity:.5;cursor:progress}
  #reform .chip.primary{background:var(--ink);color:var(--paper);border-color:var(--ink)}
  #reform .chip.primary:hover{background:var(--shelf-deep);border-color:var(--shelf-deep)}
  #reform .chip.danger{border-color:var(--amber);color:var(--amber)}
  #re-err{color:var(--amber);font-size:14px;font-weight:700;min-height:1.4em}
  #re-draft{font-size:14px;background:#fff;border-left:3px solid var(--brass);padding:8px 12px}
  #re-draft[hidden]{display:none}
  @media (max-width:640px){
    #reform .row2{grid-template-columns:1fr}
    .rl-row{grid-template-columns:84px minmax(0,1fr)}
    .rl-btns{grid-column:1 / -1}
  }`;

  const field = (id, label, control, tip) => `
      <div class="field">
        <div class="lab"><label for="${id}">${label}</label>${tip ? `<span class="help" tabindex="0" role="img" aria-label="Uitleg: ${tip}" data-tip="${tip}">?</span>` : ''}</div>
        ${control}
      </div>`;

  const HTML = `
  <dialog id="recipeedit" aria-labelledby="re-title">
    <form id="reform" novalidate>
      <h2 id="re-title">Cocktail toevoegen</h2>
      <p id="re-draft" hidden></p>
      <div class="row2">
        ${field('re-name', 'Naam', '<input type="text" id="re-name" maxlength="80" autocomplete="off">')}
        ${field('re-style', 'Soort', '<input type="text" id="re-style" list="re-styles" maxlength="40" autocomplete="off"><datalist id="re-styles"></datalist>', 'Bijvoorbeeld Klassieker, Sour of Lang &amp; licht. Kies een bestaande soort of typ een nieuwe.')}
      </div>
      ${field('re-blurb', 'Omschrijving', '<textarea id="re-blurb" rows="2" maxlength="300"></textarea>', 'Een korte zin onder de naam op de kaart.')}
      ${field('re-method', 'Bereiding', '<textarea id="re-method" rows="3" maxlength="800"></textarea>')}
      ${field('re-url', 'Link naar het recept', '<input type="text" id="re-url" inputmode="url" maxlength="300" autocomplete="off" placeholder="https://">', 'Optioneel. Een adres dat met http:// of https:// begint.')}
      <div>
        <p class="glabel">Ingrediënten</p>
        <ol id="re-lines"></ol>
        <button type="button" class="chip" id="re-addline">+ Regel toevoegen</button>
      </div>
      <label class="check"><input type="checkbox" id="re-menu"> Op het menu</label>
      <p id="re-err" role="alert"></p>
      <div class="dlgbtns">
        <button type="submit" class="chip primary" id="re-save">Opslaan</button>
        <button type="button" class="chip" id="re-cancel">Annuleren</button>
        <button type="button" class="chip danger" id="re-delete" hidden>Verwijderen</button>
      </div>
    </form>
  </dialog>`;

  let ctx = null, built = false, editing = null, kind = 'cocktail', lines = [];
  let itemById = new Map(), catById = new Map();

  const nameOf = id => (itemById.get(id) || { name: '?' }).name;
  const catLabel = id => { const it = itemById.get(id); const c = it && catById.get(it.category_id); return c ? c.label : ''; };

  /* items die in de tekst van een regel voorkomen: de naam van het item staat in de tekst, of een woord uit de tekst staat in de naam */
  function suggest(text, linked){
    const t = fold(text).trim();
    if(!t) return [];
    const byName = ctx.items.map(i => ({ i, term: fold(i.name) })).filter(x => x.term.length >= 3).sort((a, b) => b.term.length - a.term.length);
    let rest = t;
    const found = [];
    for(const { i, term } of byName) if(rest.includes(term)){ found.push(i); rest = rest.split(term).join(' '); }
    const words = rest.split(/[^a-z0-9&]+/).filter(w => w.length >= 4);
    for(const w of words) for(const { i, term } of byName) if(term.includes(w) && !found.includes(i)) found.push(i);
    return found.filter(i => !linked.includes(i.id)).slice(0, 6);
  }

  function lineHtml(l, i){
    const chips = l.ids.length
      ? l.ids.map(id => `<span class="rl-chip">${esc(nameOf(id))}<button type="button" data-act="unlink" data-id="${id}" aria-label="Ontkoppel ${esc(nameOf(id))}">×</button></span>`).join('')
      : '<span class="rl-none">Niet gekoppeld: deze regel wordt niet bijgehouden.</span>';
    return `<li class="rl" data-i="${i}">
      <div class="rl-row">
        <input type="text" class="rl-amount" aria-label="Hoeveelheid, regel ${i + 1}" placeholder="60 ml" maxlength="40" value="${esc(l.amount)}" autocomplete="off">
        <input type="text" class="rl-text" aria-label="Ingrediënt, regel ${i + 1}" placeholder="Bijv. Havana Club of Bacardí" maxlength="120" value="${esc(l.text)}" autocomplete="off">
        <span class="rl-btns">
          <button type="button" data-act="up" aria-label="Regel ${i + 1} omhoog"${i === 0 ? ' disabled' : ''}>↑</button>
          <button type="button" data-act="down" aria-label="Regel ${i + 1} omlaag"${i === lines.length - 1 ? ' disabled' : ''}>↓</button>
          <button type="button" data-act="del" aria-label="Regel ${i + 1} verwijderen">✕</button>
        </span>
      </div>
      <div class="rl-link"><span class="rl-lbl">Items</span>${chips}
        <input type="text" class="rl-find" aria-label="Zoek een item om te koppelen, regel ${i + 1}" placeholder="+ item koppelen…" autocomplete="off">
      </div>
      <div class="rl-pick" hidden></div>
      <div class="rl-sug" hidden></div>
    </li>`;
  }

  function renderLines(focus){
    $('re-lines').innerHTML = lines.map(lineHtml).join('');
    lines.forEach((l, i) => paintSuggestions(i));
    if(focus){
      const row = $('re-lines').children[focus.i];
      const el = row && row.querySelector(focus.sel);
      if(el) el.focus();
    }
  }

  /* voorstellen onder een regel zonder koppeling */
  function paintSuggestions(i){
    const row = $('re-lines').children[i];
    if(!row) return;
    const l = lines[i], box = row.querySelector('.rl-sug');
    const list = l.ids.length ? [] : suggest(l.text, l.ids);
    box.hidden = !list.length;
    box.innerHTML = list.length
      ? '<span class="rl-lbl">Voorstel</span>' + list.map(it => `<button type="button" data-act="link" data-id="${it.id}">${esc(it.name)}</button>`).join('')
      : '';
  }

  /* zoekresultaten bij het veld "+ item koppelen" */
  function paintPick(i, query){
    const row = $('re-lines').children[i];
    const box = row.querySelector('.rl-pick');
    const q = fold(query).trim();
    if(!q){ box.hidden = true; box.innerHTML = ''; return; }
    const list = ctx.items.filter(it => !lines[i].ids.includes(it.id) && fold(it.name).includes(q)).slice(0, 8);
    box.hidden = false;
    box.innerHTML = list.length
      ? list.map(it => `<button type="button" data-act="link" data-id="${it.id}">${esc(it.name)} <span>${esc(catLabel(it.id))}</span></button>`).join('')
      : '<span class="rl-none">Geen item gevonden.</span>';
  }

  function build(){
    if(built) return;
    built = true;
    const style = document.createElement('style');
    style.id = 'recipeedit-css';
    style.textContent = CSS;
    document.head.appendChild(style);
    document.body.insertAdjacentHTML('beforeend', HTML);

    $('re-cancel').onclick = close;
    $('reform').onsubmit = save;
    $('re-delete').onclick = remove;
    $('re-addline').onclick = () => { lines.push({ amount: '', text: '', ids: [] }); renderLines({ i: lines.length - 1, sel: '.rl-amount' }); };

    const list = $('re-lines');
    list.addEventListener('input', e => {
      const row = e.target.closest('.rl'); if(!row) return;
      const i = Number(row.dataset.i);
      if(e.target.classList.contains('rl-amount')) lines[i].amount = e.target.value;
      else if(e.target.classList.contains('rl-text')){ lines[i].text = e.target.value; paintSuggestions(i); }
      else if(e.target.classList.contains('rl-find')) paintPick(i, e.target.value);
    });
    list.addEventListener('click', e => {
      const b = e.target.closest('button[data-act]'); if(!b) return;
      const row = b.closest('.rl'); const i = Number(row.dataset.i);
      const act = b.dataset.act, id = Number(b.dataset.id);
      if(act === 'link'){ if(!lines[i].ids.includes(id)) lines[i].ids.push(id); renderLines({ i, sel: '.rl-find' }); }
      else if(act === 'unlink'){ lines[i].ids = lines[i].ids.filter(x => x !== id); renderLines({ i, sel: '.rl-find' }); }
      else if(act === 'del'){ lines.splice(i, 1); renderLines(lines.length ? { i: Math.min(i, lines.length - 1), sel: '.rl-amount' } : null); }
      else if(act === 'up' && i > 0){ [lines[i - 1], lines[i]] = [lines[i], lines[i - 1]]; renderLines({ i: i - 1, sel: '[data-act="up"]' }); }
      else if(act === 'down' && i < lines.length - 1){ [lines[i + 1], lines[i]] = [lines[i], lines[i + 1]]; renderLines({ i: i + 1, sel: '[data-act="down"]' }); }
    });
  }

  function init(options){
    ctx = options;
    itemById = new Map(ctx.items.map(i => [i.id, i]));
    catById = new Map((ctx.categories || []).map(c => [c.id, c]));
    build();
    const styles = [...new Set(ctx.recipes.map(r => r.t).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl'));
    $('re-styles').innerHTML = styles.map(s => `<option value="${esc(s)}"></option>`).join('');
  }

  function open(r, opts = {}){
    if(!ctx) throw new Error('kelderRecipeDialog.init() is nog niet aangeroepen');
    editing = r || null;
    kind = r ? r.kind : (opts.kind || 'cocktail');
    const draft = !r && opts.draft && typeof opts.draft === 'object' ? opts.draft : null;            // een voorstel van Claude: ingevuld, maar nog niet opgeslagen
    $('re-title').textContent = `${NOUN[kind] || 'Recept'} ${r ? 'bewerken' : 'toevoegen'}`;
    $('re-name').value = r ? r.n : draft ? draft.name || '' : '';
    $('re-style').value = r && r.t ? r.t : draft ? draft.style || '' : '';
    $('re-blurb').value = r && r.blurb ? r.blurb : draft ? draft.blurb || '' : '';
    $('re-method').value = r && r.m ? r.m : draft ? draft.method || '' : '';
    $('re-url').value = r && r.u ? r.u : '';
    $('re-menu').checked = r ? r.menu : true;
    lines = r ? r.lines.map(l => ({ amount: l.amount || '', text: l.text || '', ids: l.itemIds.slice() }))
      : draft && Array.isArray(draft.lines) && draft.lines.length
        ? draft.lines.map(l => ({ amount: l.amount || '', text: l.ingredient || '', ids: (l.items || []).map(i => i.id) }))
        : [{ amount: '', text: '', ids: [] }];
    $('re-draft').hidden = !draft;
    if(draft) $('re-draft').textContent = `Voorstel van Claude${draft.why ? ': ' + String(draft.why).replace(/[.!?\s]+$/, '') : ''}. Controleer alles en pas het aan voordat je opslaat; er is nog niets bewaard.`;
    renderLines();
    $('re-delete').hidden = !r;
    $('re-save').disabled = false;
    $('re-delete').disabled = false;
    $('re-err').textContent = '';
    $('recipeedit').showModal();
    $('re-name').focus();
  }
  function close(){ const d = $('recipeedit'); if(d && d.open) d.close(); }

  const done = text => { if(ctx.onDone) ctx.onDone(text); else location.reload(); };
  function failed(res){
    $('re-save').disabled = false;
    $('re-delete').disabled = false;
    if(res.relogin && ctx.onRelogin){ close(); ctx.onRelogin(res.message); return; }
    $('re-err').textContent = res.message;
  }

  async function save(e){
    e.preventDefault();
    const err = $('re-err');
    err.textContent = '';
    const name = $('re-name').value.trim(), style = $('re-style').value.trim(), url = $('re-url').value.trim();
    if(!name){ err.textContent = 'Vul een naam in.'; $('re-name').focus(); return; }
    if(ctx.recipes.some(r => r.kind === kind && fold(r.n) === fold(name) && (!editing || r.id !== editing.id))){
      err.textContent = `Er is al een ${NOUN[kind].toLowerCase()} met deze naam.`; $('re-name').focus(); return;
    }
    if(!style){ err.textContent = 'Kies of typ de soort, bijvoorbeeld Klassieker of Sour.'; $('re-style').focus(); return; }
    if(url && !/^https?:\/\//i.test(url)){ err.textContent = 'De link moet met http:// of https:// beginnen.'; $('re-url').focus(); return; }

    const kept = lines.filter(l => l.amount.trim() || l.text.trim() || l.ids.length);        // helemaal lege regels vallen weg
    if(!kept.length){ err.textContent = 'Voeg minstens één ingrediënt toe.'; return; }
    const bad = kept.findIndex(l => !l.text.trim());
    if(bad >= 0){ err.textContent = `Regel ${bad + 1} heeft geen tekst: vul het ingrediënt in of haal de regel weg.`; return; }

    $('re-save').disabled = true;
    const payload = {
      id: editing ? editing.id : null, kind, name, style,
      blurb: $('re-blurb').value.trim(), method: $('re-method').value.trim(), url,
      on_menu: $('re-menu').checked,
      lines: kept.map(l => ({ amount: l.amount.trim(), ingredient: l.text.trim(), items: l.ids }))
    };
    const res = await kelderAdmin.saveRecipe(payload);
    if(!res.ok) return failed(res);
    done(`${name} is ${editing ? 'opgeslagen' : 'toegevoegd'}.`);
  }

  async function remove(){
    if(!editing) return;
    const name = editing.n;
    if(!confirm(`"${name}" definitief verwijderen?\n\nDit kan niet ongedaan worden gemaakt.`)) return;
    $('re-delete').disabled = true;
    const res = await kelderAdmin.deleteRecipe(editing.id);
    if(!res.ok) return failed(res);
    done(`${name} is verwijderd.`);
  }

  window.kelderRecipeDialog = { init, open, close };
})();
