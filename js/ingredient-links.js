/* Beheerder: de ingrediëntenlijst van een cocktail of mocktail (kaarten op cocktails.html en mocktails.html, en recept.html) laat per regel zien
   welke items uit de voorraad erbij horen, of ze op voorraad zijn, en opent bij een klik het bewerkvenster van het item (js/item-dialog.js).
   Bezoekers zien niets hiervan: de pagina's roepen dit alleen aan voor een ingelogde beheerder.

   Wat er per regel staat (onder de tekst van de regel, kleine knoppen):
     ✓ Eristoff                       het item is op voorraad en mag in cocktails
     ✕ Absolut Vanilia · op           het item is op (items.in_stock): het telt niet mee, de regel kan alleen met een ander item
     ⊘ Soplica · niet in cocktails    het item is niet gebruikt in cocktails (items.in_cocktails = false)
     ✕ Gin (geen in huis)             de regel vraagt om een soort drank waarvan niets in huis is (geen item om te openen)
     geen item gekoppeld              de regel is aan geen enkel item gekoppeld (bijv. ijs of water): er wordt niets van bijgehouden
   Staan er meer items bij één regel, dan zijn het alternatieven ("of"): de regel kan zolang één ervan kan. Vraagt de regel om een soort
   drank (migratie 0031), dan staat ervoor "soort Gin".

   Wat "op" of "niet in cocktails" is, bepaalt js/stock.js (isOut en noMix), dus dezelfde uitkomst als waarmee de site bepaalt of een recept kan.

     kelderIngredientLinks.mark(ul, recept)   zet de knoppen in de lijst (ul.spec) van dit recept; geeft true als dat gelukt is.
                                              Start het bewerkvenster zelf (één keer per pagina); na opslaan laadt de pagina opnieuw.
     kelderIngredientLinks.legend()           een regel die de tekens uitlegt, om bij de lijst te zetten
     kelderIngredientLinks.describe(regel, ctx)   de gegevens per regel, zonder DOM (voor de test)

   Verwacht js/item-dialog.js, js/stock.js en js/data-loader.js (kelderRows). */
(function(){
  /* De gegevens voor één receptregel (regel = r.lines[i] uit de data-loader). ctx: { rowOf(naam) → itemrij of null, isOut(naam), noMix(naam) }.
     Een naam zonder itemrij is geen echt item: de regel vroeg om een soort waarvan niets in huis is ("Gin (geen in huis)"). */
  function describe(line, ctx){
    const names = (line && line.items) || [];
    return {
      tracked: names.length > 0,
      sort: (line && line.sort) || '',
      options: names.map(n => {
        const row = ctx.rowOf(n) || null;
        return { name: n, row, out: !!ctx.isOut(n), noMix: !!ctx.noMix(n) };
      })
    };
  }
  /* wat er op de knop staat en wat een schermlezer erbij hoort */
  function labelOf(o){
    const why = [o.out && 'op', o.noMix && 'niet in cocktails'].filter(Boolean);
    return {
      mark: o.out ? '✕' : o.noMix ? '⊘' : '✓',
      text: o.name + (why.length && o.row ? ' · ' + why.join(', ') : ''),
      state: o.out ? 'out' : o.noMix ? 'nomix' : 'ok',
      spoken: o.name + ': ' + (why.length ? why.join(' en ') : 'op voorraad')
    };
  }

  const CSS = `
    .ix{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;margin:2px 0 6px;font-family:'Karla',system-ui,sans-serif;font-size:12px;line-height:1.3}
    .ix .ixb,.ix .ixn{display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink);font:inherit;font-weight:500}
    .ix .ixb{position:relative;z-index:1;cursor:pointer}                   /* boven de uitgerekte link van een kaart (zie js/cards.js) */
    .ix .ixb:hover{border-color:var(--ink)}
    .ix .ixb:focus-visible{outline:3px solid var(--brass);outline-offset:2px}
    .ix .ixm{font-weight:700}
    .ix .ixb.ok .ixm{color:var(--shelf-deep)}
    .ix .ixb.out,.ix .ixn.out{border-color:var(--amber)}
    .ix .out .ixm,.ix .out .ixw{color:var(--amber)}
    .ix .nomix .ixm{color:rgba(30,39,33,.7)}
    .ix .ixn.none{border-style:dashed;background:transparent;color:rgba(30,39,33,.7)}
    .ix .ixor,.ix .ixsort{color:rgba(30,39,33,.7)}
    .ix-legend{font-size:13px;color:rgba(30,39,33,.75);margin:8px 0 0;line-height:1.5}
    .ix-legend b{font-weight:700;color:var(--ink)}`;

  let ready = false, byName = new Map();
  /* de gegevens en het bewerkvenster klaarzetten (één keer); false als de pagina dat niet kan */
  function ensure(){
    if(ready) return true;
    if(!window.kelderItemDialog || !window.kelderRows || typeof isOut !== 'function' || typeof noMix !== 'function') return false;
    byName = new Map(kelderRows.items.map(i => [i.name, i]));
    kelderItemDialog.init({ categories: kelderRows.categories, items: kelderRows.items, wines: kelderRows.wines, onDone: () => location.reload() });
    const style = document.createElement('style');
    style.id = 'ix-css';
    style.textContent = CSS;
    document.head.appendChild(style);
    ready = true;
    return true;
  }

  const el = (tag, cls, text) => { const e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; };

  function pills(line){
    const info = describe(line, { rowOf: n => byName.get(n), isOut, noMix });
    const box = el('span', 'ix');
    if(!info.tracked){
      const n = el('span', 'ixn none', 'geen item gekoppeld');
      n.title = 'Deze regel hoort bij geen enkel item uit de voorraad: er wordt niets van bijgehouden (bijv. ijs of water).';
      box.appendChild(n);
      return box;
    }
    if(info.sort) box.appendChild(el('span', 'ixsort', 'soort ' + info.sort + ':'));
    info.options.forEach((o, i) => {
      if(i) box.appendChild(el('span', 'ixor', 'of'));
      const l = labelOf(o);
      if(!o.row){                                              // geen echt item: er is niets te openen
        const n = el('span', 'ixn out');
        n.append(el('span', 'ixm', l.mark), el('span', 'ixw', o.name));
        n.title = 'Er is geen item van deze soort in huis.';
        box.appendChild(n);
        return;
      }
      const b = el('button', 'ixb ' + l.state);
      b.type = 'button';
      b.append(el('span', 'ixm', l.mark), el('span', l.state === 'out' ? 'ixw' : '', l.text));
      b.title = l.spoken + '. Klik om het item te bewerken.';
      b.setAttribute('aria-label', 'Item bewerken: ' + l.spoken);
      b.addEventListener('click', () => kelderItemDialog.open(o.row));
      box.appendChild(b);
    });
    return box;
  }

  /* zet bij elke regel van de lijst de knoppen; de lijst (ul.spec) heeft per regel een <li> met de hoeveelheid en de tekst, in dezelfde volgorde als r.lines */
  function mark(ul, r){
    if(!ul || !r || !Array.isArray(r.lines) || !ensure()) return false;
    const rows = [...ul.children];
    if(rows.length !== r.lines.length) return false;
    rows.forEach((li, i) => {
      if(li.querySelector('.ix')) return;
      (li.lastElementChild || li).appendChild(pills(r.lines[i]));
    });
    return true;
  }

  function legend(){
    const p = el('p', 'ix-legend');
    p.innerHTML = '<b>Voorraad per regel</b> (alleen voor jou): ✓ op voorraad · ✕ op · ⊘ niet in cocktails · gestippeld = niet gekoppeld aan een item, dus niet bijgehouden (zoals ijs). Klik een item om het te bewerken.';
    return p;
  }

  window.kelderIngredientLinks = { mark, legend, describe };
})();
