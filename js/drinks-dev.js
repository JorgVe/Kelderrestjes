/* Help me kiezen (ook "Iets nieuws" en "Zet op het menu") en de beoordelingen testen zonder elke keer een vraag naar Claude te sturen. Alleen op je eigen computer
   (localhost of 127.0.0.1); op de echte site doet dit bestand niets.

   Open cocktails.html of mocktails.html met een parameter achter het adres:
     ?suggest-fixture=fresh      speelt een bewaard antwoord af (fixtures/drinks/suggest-fresh.json) als je op "Help me kiezen" zoekt:
                                 geen Claude, geen limiet. Meegeleverd: fresh (drie suggesties), zero (alleen mocktails), nomatch (niets past),
                                 limit (limiet bereikt), error (een foutmelding) en disabled (uitgezet).
     ?suggest-new-fixture=one    hetzelfde voor de keuze "Iets nieuws" in Help me kiezen (fixtures/drinks/suggest-new-one.json): één nieuw
                                 recept. Meegeleverd: one (een cocktail), mock (een mocktail) en none (niets nieuws). Zonder deze parameter
                                 geeft "Iets nieuws" een melding; zonder ?suggest-fixture geldt dat voor "Van de kaart".
     ?dev-admin=1                de pagina doet alsof je beheerder bent (inloggen is niet nodig): de beheerdersknoppen zijn zichtbaar, ook "Controleren
                                 en toevoegen" bij een nieuw voorstel van "Iets nieuws". Mag samen met de andere parameters, bijvoorbeeld
                                 ?suggest-new-fixture=one&dev-admin=1.
     ?add-fixture=ok             wat "Zet op het menu" (een nieuw recept van "Iets nieuws" op het menu zetten) antwoordt, zolang je een van de
                                 suggest-fixtures gebruikt: er wordt dan nooit echt iets toegevoegd. ok (staat op het menu; de standaard), exists,
                                 stale (er is iets van op), disabled, limit, expired en error. De concepten in suggest-new-*.json hebben daarvoor
                                 een nep-token ("fixture|soort|naam").
     ?review-fixture=ok          op recept.html: de beoordelingen komen uit een voorbeeldlijst en een beoordeling plaatsen schrijft niets. ok (de
                                 beoordeling wordt alleen op de pagina getoond), empty (nog geen beoordelingen), already, limit, links en error.
   Het bestand is het antwoord van de Edge Function cocktail-ai, of { "ok": false, "message": "…" } voor een fout. Receptnummers en itemnummers
   in zo'n bestand horen bij je eigen gegevens; een drankje dat niet (meer) op de pagina staat, is gewone tekst in plaats van een link.

   Let op: bij ?dev-admin=1 zijn ook de knoppen Bewerken en + Cocktail toevoegen zichtbaar, en het receptvenster schrijft alleen als je echt
   bent ingelogd. Zonder parameter verandert er niets. */
(function(){
  const h = location.hostname;
  if(!(h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost'))) return;
  const params = new URLSearchParams(location.search);
  const clean = key => (params.get(key) || '').replace(/[^A-Za-z0-9_-]/g, '');
  const suggestName = clean('suggest-fixture'), newName = clean('suggest-new-fixture'), devAdmin = params.get('dev-admin') === '1';
  const addName = clean('add-fixture'), reviewName = clean('review-fixture');
  const sleep = ms => new Promise(r => setTimeout(r, ms));

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

  if((suggestName || newName) && window.kelderSuggest){
    window.kelderSuggest.ask = async (wish, mode) => {
      if(String(wish || '').trim().length < 3) return { ok: false, message: 'Vertel kort waar je zin in hebt.' };
      if(mode === 'new') return newName ? fixture('suggest-new', newName) : { ok: false, message: 'Testmodus: voeg ?suggest-new-fixture=one toe voor "Iets nieuws".' };
      return suggestName ? fixture('suggest', suggestName) : { ok: false, message: 'Testmodus: voeg ?suggest-fixture=fresh toe voor "Van de kaart".' };
    };
    /* "Zet op het menu": nooit echt toevoegen zolang er een fixture actief is */
    window.kelderSuggest.add = async token => {
      await sleep(700);
      const [, kind, name] = String(token || '').split('|');
      switch(addName || 'ok'){
        case 'exists': return { ok: true, status: 'exists' };
        case 'stale': return { ok: true, status: 'stale' };
        case 'disabled': return { ok: true, status: 'disabled' };
        case 'limit': return { ok: false, message: 'Je hebt net al een paar recepten op het menu gezet. Probeer het over een uurtje nog eens.' };
        case 'expired': return { ok: false, message: 'Dit voorstel is verlopen. Vraag een nieuw recept.' };
        case 'error': return { ok: false, message: 'Toevoegen is mislukt. Probeer het zo nog eens.' };
        default: return { ok: true, status: 'ok', id: -1, kind: kind || 'cocktail', name: name || 'Nieuw recept' };
      }
    };
    window.kelderSuggest.devNote = `Testmodus: het antwoord komt uit fixtures/drinks/ (${[suggestName && 'suggest-' + suggestName, newName && 'suggest-new-' + newName].filter(Boolean).join(', ')}), er gaat niets naar Claude.`;
  }
  /* recept.html: beoordelingen uit een voorbeeldlijst, en plaatsen schrijft niets */
  if(reviewName){
    const day = 86400e3;
    const sample = () => [
      { id: 3, rating: 5, name: 'Sanne', body: 'Precies goed: fris en niet te zoet.', created_at: new Date(Date.now() - day).toISOString() },
      { id: 2, rating: 4, name: null, body: null, created_at: new Date(Date.now() - 3 * day).toISOString() },
      { id: 1, rating: 3, name: 'Bram <b>', body: 'Mag wat meer limoen. Verder prima.', created_at: new Date(Date.now() - 9 * day).toISOString() }
    ];
    window.kelderReviewsStub = {
      list: async () => { await sleep(300); return { ok: true, reviews: reviewName === 'empty' ? [] : sample() }; },
      submit: async input => {
        await sleep(700);
        switch(reviewName){
          case 'already': return { ok: false, message: 'Je hebt dit recept vandaag al beoordeeld. Morgen mag je opnieuw.' };
          case 'limit': return { ok: false, message: 'Je hebt net al een paar beoordelingen geplaatst. Probeer het over een uurtje nog eens.' };
          case 'links': return { ok: false, message: 'Links zijn niet toegestaan in een beoordeling.' };
          case 'error': return { ok: false, message: 'Het opslaan is mislukt. Probeer het zo nog eens.' };
          default: return { ok: true, review: { id: Date.now(), rating: input.rating, name: String(input.name || '').trim() || null, body: String(input.text || '').trim() || null, created_at: new Date().toISOString() } };
        }
      }
    };
  }
  if(devAdmin && window.kelderAdmin) window.kelderDevAdmin = true;          // cards.js toont dan de beheerdersknoppen
})();
