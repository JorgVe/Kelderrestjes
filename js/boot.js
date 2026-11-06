/* Laadt eerst de gegevens uit Supabase en voert daarna de stappen in volgorde uit.
   Een stap is een scriptpad (wordt geladen) of een functie (wordt uitgevoerd):

     kelderBoot(['js/stock.js', () => { window.PAGE = {...}; }, 'js/cards.js']);

   Lukt het laden niet, dan staat er bovenaan een melding in plaats van een lege pagina. */
/* De versie uit de scripttag van dit bestand ("?v=1a2b3c4d", gezet door scripts/cache-bust.py): ook de scripts die kelderBoot zelf laadt
   krijgen hem achter hun adres, zodat een browser nooit een oud js/stock.js bij een nieuwe pagina gebruikt. Moet nu, tijdens het eerste
   uitvoeren van dit script, want daarna bestaat document.currentScript niet meer. */
const kelderBuild = (() => { try{ return new URL(document.currentScript.src).search; }catch(e){ return ''; } })();

/* De flessen in de kop van elke pagina (.bottles): bij elke keer laden een ander rijtje van 9 tot en met 15 flessen, elk met een eigen
   hoogte en breedte. Op de wijnpagina (.bottles.wine) zijn het wijnflessen: smaller, met een langere hals en een eigen tint. Puur sfeer;
   het aantal heeft niets met de voorraad te maken. */
function paintBottles(){
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const TINTS = ['k-bub', 'k-wit', 'k-ros', 'k-rood'];
  document.querySelectorAll('.bottles').forEach(row => {
    const wine = row.classList.contains('wine');
    row.textContent = '';
    for(let i = rnd(9, 15); i > 0; i--){
      const b = document.createElement('i');
      b.style.height = (wine ? rnd(31, 55) : rnd(42, 74)) + 'px';
      b.style.width = (wine ? rnd(10, 14) : rnd(12, 18)) + 'px';
      b.style.flex = 'none';
      b.style.maxWidth = 'none';
      if(wine) b.className = TINTS[rnd(0, TINTS.length - 1)];
      row.appendChild(b);
    }
  });
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintBottles); else paintBottles();

/* Instellingen die op elke pagina gelden (de beheerder zet ze op admin.html): de knop "Registreer als beheerder" voor bezoekers en een
   mededeling bovenaan de pagina. Ontbreekt de tabel settings, dan gelden de standaardwaarden uit data-loader.js. */
function applyGlobalSettings(){
  if(typeof setting !== 'function') return;
  document.documentElement.classList.toggle('no-register', setting('show_register_button') === false);
  /* menu_show_cocktails en menu_show_mocktails: staat een lijst uit, dan verdwijnen voor bezoekers de pagina en alle verwijzingen ernaar:
     de knop in de navigatie, de knoppen en links op het menu en in de voetteksten, en de link in het receptvenster (ook als die pas
     later in de pagina komen: het is een CSS-regel op de link naar die pagina). Een ingelogde beheerder (er is een sessie in dit tabblad)
     houdt ze, om de recepten te kunnen beheren. */
  let admin = false;
  try{ admin = !!sessionStorage.getItem('kelderrestjes-admin-auth'); }catch(e){}
  if(!admin){
    document.documentElement.classList.toggle('no-cocktails', setting('menu_show_cocktails') === false);
    document.documentElement.classList.toggle('no-mocktails', setting('menu_show_mocktails') === false);
    const hide = document.createElement('style');
    hide.textContent = 'html.no-cocktails a[href^="cocktails.html"],html.no-mocktails a[href^="mocktails.html"],html.no-cocktails li:has(>a[href^="cocktails.html"]),html.no-mocktails li:has(>a[href^="mocktails.html"]){display:none!important}';
    document.head.appendChild(hide);
  }
  const text = String(setting('notice_text') || '').trim();
  if(setting('notice_enabled') === true && text){
    const style = document.createElement('style');
    style.textContent = ".site-notice{position:sticky;top:10px;z-index:35;background:var(--ink,#1E2721);color:var(--paper,#EDEFE7);padding:12px 24px;text-align:center;font:500 15px/1.4 'Karla',system-ui,sans-serif;border-bottom:3px solid var(--brass,#C69A3E)}";
    document.head.appendChild(style);
    const n = document.createElement('div');
    n.className = 'site-notice'; n.setAttribute('role', 'status'); n.textContent = text;
    const bar = document.querySelector('.brassbar');
    if(bar) bar.after(n); else document.body.prepend(n);
    /* de mededeling blijft bovenaan staan bij het scrollen, onder de gele rand; --bar is de hoogte van die hele strook, zodat de andere
       plakkende balken (menu, voorraadwerkbalk) en de ankers eronder beginnen. Een lange tekst loopt over meer regels: meten we opnieuw. */
    const measure = () => document.documentElement.style.setProperty('--bar', (10 + n.offsetHeight) + 'px');
    measure();
    addEventListener('resize', measure);
  }
}

window.kelderBoot = async function(steps){
  try{
    await window.kelderLoadData();
    applyGlobalSettings();
    for(const step of steps){
      if(typeof step === 'function') await step();
      else await new Promise((ok, fail) => {
        const s = document.createElement('script');
        s.src = step + kelderBuild; s.onload = ok; s.onerror = () => fail(new Error('Kon ' + step + ' niet laden.'));
        document.body.appendChild(s);
      });
    }
    if(window.kelderPageReady) await window.kelderPageReady;          // een pagina die zijn inhoud zelf nog opbouwt (cards.js)
    /* de inhoud komt pas na het laden van de gegevens: spring daarna alsnog naar #anker */
    try{
      const id = decodeURIComponent(location.hash.slice(1));
      const target = id && document.getElementById(id);
      if(target) target.scrollIntoView({behavior:'instant'});
    }catch(e){}
  }catch(e){
    console.error(e);
    const box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'background:#B4622B;color:#fff;padding:14px 24px;font:500 15px/1.4 Karla,system-ui,sans-serif;position:relative;z-index:10';
    box.textContent = 'De gegevens uit Supabase konden niet worden geladen: ' + (e && e.message || e);
    document.body.prepend(box);
  }
};
