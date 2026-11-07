/* Wijn bij het menu testen zonder elke keer een vraag naar Claude te sturen. Alleen op je eigen computer (localhost of 127.0.0.1); op de
   echte site doet dit bestand niets.

   Open wijnen.html met een parameter achter het adres:
     wijnen.html?pair-fixture=dinner     speelt een bewaard antwoord af (fixtures/pairing/dinner.json): geen Claude, geen inloggen nodig.
                                         De knop "Wijn bij het menu" staat er dan, en de pagina doet alsof je beheerder bent.
   Meegeleverd: dinner (drie gangen), single (één gerecht), nomatch (een gang waar niets bij past), notmenu (geen menu),
   nowines (geen wijn op voorraad) en error (een foutmelding).
   Het bestand is het antwoord van de Edge Function pair-wine, of { "ok": false, "message": "…" } voor een fout. De wijnen in zo'n bestand
   staan met hun naam uit je lijst; een wijn die niet (meer) op de pagina staat, is gewone tekst in plaats van een link.

   Let op: de knoppen Bewerken en + Wijn toevoegen zijn dan ook zichtbaar maar schrijven alleen als je echt bent ingelogd.
   Zonder parameter verandert er niets. */
(function(){
  const h = location.hostname;
  if(!(h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost'))) return;
  const name = (new URLSearchParams(location.search).get('pair-fixture') || '').replace(/[^A-Za-z0-9_-]/g, '');
  if(!name || !window.kelderAdmin) return;

  window.kelderDevAdmin = true;                                              // wijnen.html toont dan de beheerdersknoppen
  window.kelderAdmin.suggestPairing = async menu => {
    await new Promise(r => setTimeout(r, 900));                              // even wachten, zoals een echte vraag
    if(String(menu || '').trim().length < 3) return { ok: false, message: 'Vul in wat er op het menu staat.' };
    let data;
    try{
      const res = await fetch(`fixtures/pairing/${name}.json`, { cache: 'no-store' });
      if(!res.ok) return { ok: false, message: `Testmodus: fixtures/pairing/${name}.json bestaat niet.` };
      data = await res.json();
    }catch(e){ return { ok: false, message: `Testmodus: fixtures/pairing/${name}.json kon niet worden gelezen.` }; }
    if(!data || typeof data !== 'object') return { ok: false, message: `Testmodus: ${name}.json is geen bewaard antwoord.` };
    return data.ok === false ? data : { ok: true, ...data };
  };
  window.kelderPairing = Object.assign(window.kelderPairing || {}, {
    devNote: `Testmodus: het antwoord komt uit fixtures/pairing/${name}.json, er gaat niets naar Claude.`
  });
})();
