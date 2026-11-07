/* Help me kiezen en Nieuwe cocktail laten bedenken testen zonder elke keer een vraag naar Claude te sturen. Alleen op je eigen computer
   (localhost of 127.0.0.1); op de echte site doet dit bestand niets.

   Open cocktails.html of mocktails.html met een parameter achter het adres:
     ?suggest-fixture=fresh      speelt een bewaard antwoord af (fixtures/drinks/suggest-fresh.json) als je op "Help me kiezen" zoekt:
                                 geen Claude, geen limiet. Meegeleverd: fresh (drie suggesties), zero (alleen mocktails), nomatch (niets past),
                                 limit (limiet bereikt), error (een foutmelding) en disabled (uitgezet).
     ?invent-fixture=three       idem voor "Nieuwe cocktail laten bedenken" (fixtures/drinks/invent-three.json): geen Claude, inloggen is niet nodig,
                                 de pagina doet alsof je beheerder bent. Meegeleverd: three (drie voorstellen), mock (een mocktail),
                                 none (geen voorstel), empty (te weinig op voorraad) en error (een foutmelding).
   Beide mogen samen: ?suggest-fixture=fresh&invent-fixture=three.
   Het bestand is het antwoord van de Edge Function cocktail-ai, of { "ok": false, "message": "…" } voor een fout. Receptnummers en itemnummers
   in zo'n bestand horen bij je eigen gegevens; een drankje dat niet (meer) op de pagina staat, is gewone tekst in plaats van een link.

   Let op: bij ?invent-fixture zijn ook de knoppen Bewerken en + Cocktail toevoegen zichtbaar, en het receptvenster schrijft alleen als je echt
   bent ingelogd. Zonder parameter verandert er niets. */
(function(){
  const h = location.hostname;
  if(!(h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost'))) return;
  const params = new URLSearchParams(location.search);
  const clean = key => (params.get(key) || '').replace(/[^A-Za-z0-9_-]/g, '');
  const suggestName = clean('suggest-fixture'), inventName = clean('invent-fixture');

  async function fixture(prefix, name){
    await new Promise(r => setTimeout(r, 900));                              // even wachten, zoals een echte vraag
    const file = `fixtures/drinks/${prefix}-${name}.json`;
    let data;
    try{
      const res = await fetch(file, { cache: 'no-store' });
      if(!res.ok) return { ok: false, message: `Testmodus: ${file} bestaat niet.` };
      data = await res.json();
    }catch(e){ return { ok: false, message: `Testmodus: ${file} kon niet worden gelezen.` }; }
    if(!data || typeof data !== 'object') return { ok: false, message: `Testmodus: ${file} is geen bewaard antwoord.` };
    return data.ok === false ? data : { ok: true, ...data };
  }

  if(suggestName && window.kelderSuggest){
    window.kelderSuggest.ask = async wish => String(wish || '').trim().length < 3
      ? { ok: false, message: 'Vertel kort waar je zin in hebt.' }
      : fixture('suggest', suggestName);
    window.kelderSuggest.devNote = `Testmodus: het antwoord komt uit fixtures/drinks/suggest-${suggestName}.json, er gaat niets naar Claude.`;
  }
  if(inventName && window.kelderAdmin){
    window.kelderDevAdmin = true;                                            // cards.js toont dan de beheerdersknoppen
    window.kelderAdmin.inventRecipe = () => fixture('invent', inventName);
    window.kelderInvent = Object.assign(window.kelderInvent || {}, {
      devNote: `Testmodus: het antwoord komt uit fixtures/drinks/invent-${inventName}.json, er gaat niets naar Claude.`
    });
  }
})();
