/* Scan foto testen zonder elke keer een foto naar Claude te sturen. Alleen op je eigen computer (localhost of 127.0.0.1); op de
   echte site doet dit bestand niets.

   Hoe je het gebruikt (de pagina opent met een parameter achter het adres):
     voorraad.html?scan-fixture=mixed             speelt een bewaarde scan af (fixtures/scan/mixed.json): geen upload, geen Claude.
                                                  In het fotovenster staat dan de knop "Voorbeeldscan" (geen foto nodig).
     voorraad.html?scan-fixture=mixed&scan-dry=1  hetzelfde, en er wordt ook niets naar de database geschreven: "Voorraad bijwerken" en
                                                  nieuwe flessen worden alleen nagebootst (de pagina laadt weer de echte stand zodra je hem herlaadt).
   Een echte scan bewaren als voorbeeld: na een echte scan op localhost staat in het controlevenster de knop "Bewaar deze scan als
   voorbeeld". Die downloadt een .json-bestand; zet het in fixtures/scan/ en open de pagina met ?scan-fixture=<naam zonder .json>.

   Zonder parameters verandert er niets, behalve die bewaarknop na een echte scan. */
(function(){
  const h = location.hostname;
  if(!(h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost'))) return;
  const admin = window.kelderAdmin, dlg = document.getElementById('photodlg');
  if(!admin || !admin.analyzePhoto || !dlg) return;

  const q = new URLSearchParams(location.search);
  const fixture = (q.get('scan-fixture') || '').replace(/[^A-Za-z0-9_-]/g, '');
  const dry = q.get('scan-dry') === '1';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rows = () => window.kelderRows || {};

  /* een melding bovenin het fotovenster, zodat je nooit vergeet dat dit een testmodus is */
  const notice = text => {
    const p = document.createElement('p');
    p.className = 'ps-hint';
    p.style.cssText = 'background:#fff3cd;border:1px solid #e0c36a;border-radius:8px;padding:6px 10px;margin:0';
    p.textContent = text;
    dlg.querySelector('.ps-body').prepend(p);
  };

  /* 1. een bewaarde scan afspelen in plaats van de echte herkenning */
  if(fixture){
    admin.analyzePhoto = async () => {
      await sleep(400);                                                    // even wachten, zoals een echte scan
      let data;
      try{
        const res = await fetch(`fixtures/scan/${fixture}.json`, { cache: 'no-store' });
        if(!res.ok) return { ok: false, message: `Testmodus: fixtures/scan/${fixture}.json bestaat niet.` };
        data = await res.json();
      }catch(e){ return { ok: false, message: `Testmodus: fixtures/scan/${fixture}.json kon niet worden gelezen.` }; }
      if(!data || data.status !== 'draft' || !Array.isArray(data.lines)) return { ok: false, message: `Testmodus: ${fixture}.json is geen bewaarde scan.` };
      return { ok: true, path: 'fixture/' + fixture, lines: data.lines };
    };

    /* de knop "Voorbeeldscan": een klein plaatje kiezen en meteen scannen */
    const go = dlg.querySelector('#ps-go');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.id = 'ps-dev-sample'; b.textContent = 'Voorbeeldscan';
    go.after(b);
    b.addEventListener('click', async () => {
      const c = document.createElement('canvas'); c.width = 96; c.height = 72;
      const g = c.getContext('2d'); g.fillStyle = '#556'; g.fillRect(0, 0, 96, 72); g.fillStyle = '#fff'; g.fillText('voorbeeld', 18, 40);
      const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.8));
      const dt = new DataTransfer(); dt.items.add(new File([blob], 'voorbeeld.jpg', { type: 'image/jpeg' }));
      const input = dlg.querySelector('#ps-file');
      input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      go.click();
    });
    notice(`Testmodus: de scan komt uit fixtures/scan/${fixture}.json, er gaat niets naar Claude.` + (dry ? ' Er wordt ook niets naar de database geschreven.' : ' Let op: bevestigen schrijft wel naar de echte database.'));
  }

  /* 2. niets schrijven: voorraad bijwerken en nieuwe flessen nabootsen */
  if(dry){
    let fakeId = 0;
    admin.applyScan = async updates => {
      await sleep(250);
      return { ok: true, results: updates.map(u => {
        const it = (rows().items || []).find(i => i.id === u.item_id), now = it && it.quantity != null ? it.quantity : 0;
        return { item_id: u.item_id, quantity: u.mode === 'set' ? u.count : now + u.count };
      }) };
    };
    const api = window.kelderItemDialog;
    if(api && api.createItem) api.createItem = async f => {
      const c = api.checkNew(f);                                           // dezelfde controles als echt
      if(!c.ok) return c;
      await sleep(250);
      const row = { id: --fakeId, name: c.name, category_id: c.catId, quantity: f.quantity, in_stock: f.quantity > 0, barcode: c.code || null, serving: 'both', sort_order: 0, aliases: [], note: null, in_cocktails: true };
      (rows().items || []).push(row);
      return { ok: true, row };
    };
    if(!fixture) notice('Testmodus: er wordt niets naar de database geschreven (scan-dry=1).');
  }

  /* 3. een echte scan bewaren als voorbeeld */
  if(!fixture){
    const real = admin.analyzePhoto;
    admin.analyzePhoto = async function(){
      const res = await real.apply(admin, arguments);
      if(res && res.ok) offerSave({ status: 'draft', lines: res.lines });
      return res;
    };
  }
  function offerSave(data){
    const box = dlg.querySelector('#ps-review');
    let b = box.querySelector('#ps-dev-save');
    if(!b){
      b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.id = 'ps-dev-save'; b.style.justifySelf = 'start';
      b.textContent = 'Bewaar deze scan als voorbeeld';
      box.appendChild(b);
    }
    b.onclick = () => {
      const t = new Date(), p = n => String(n).padStart(2, '0');
      const a = document.createElement('a');
      a.download = `scan-${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}.json`;
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
  }
})();
