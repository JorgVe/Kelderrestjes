/* de voet van elke pagina, op één plek: merknaam, de pagina's, "naar boven" en de copyright
   Elke pagina heeft alleen <footer class="site-footer"></footer>; dit bestand vult hem en voegt zijn eigen stijl toe.
   De knoppen Voorraad en Beheer staan er voor een beheerder bij (data-admin): js/session-badge.js toont ze zodra er een sessie is,
   js/boot.js verbergt Cocktails of Mocktails als die lijst voor bezoekers uit staat.
   Laad dit bestand vóór js/session-badge.js. */
(function(){
  const host = document.querySelector('footer.site-footer');
  if(!host) return;

  const PAGES = [
    ['index.html',     'Menu'],
    ['wijnen.html',    'Wijnen'],
    ['mocktails.html', 'Mocktails'],
    ['cocktails.html', 'Cocktails'],
    ['voorraad.html',  'Voorraad', true],
    ['admin.html',     'Beheer',   true]
  ];
  const here = location.pathname.split('/').pop() || 'index.html';

  const style = document.createElement('style');
  style.textContent = `
    .site-footer{background:var(--ink);color:var(--paper);padding:48px 0 26px;margin-top:20px}
    .site-footer .foot{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr) auto;gap:32px 48px;align-items:start}
    .site-footer .foot-logo{font-family:'Bodoni Moda',serif;font-weight:700;font-size:30px;line-height:1;letter-spacing:-.01em;color:#fff;text-decoration:none}
    .site-footer .foot-logo em{font-style:italic;font-weight:400;color:var(--brass)}
    .site-footer .foot-line{margin-top:12px;font-size:15px;color:rgba(237,239,231,.75);max-width:34ch}
    .site-footer .foot-h{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:rgba(237,239,231,.7);margin-bottom:12px}
    .site-footer ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
    .site-footer li[hidden]{display:none}
    .site-footer a{color:var(--paper);text-underline-offset:4px}
    .site-footer a:hover{color:var(--brass)}
    .site-footer a[aria-current="page"]{color:var(--brass);text-decoration:none;font-weight:700}
    .site-footer a:focus-visible{outline:3px solid var(--brass);outline-offset:3px}
    .site-footer .foot-top{justify-self:start;font-family:'Space Mono',monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;border:1px solid rgba(237,239,231,.35);border-radius:999px;padding:9px 16px;display:inline-block}
    .site-footer .foot-top:hover{border-color:var(--brass)}
    .site-footer .foot-legal{margin-top:38px;padding-top:18px;border-top:1px solid rgba(237,239,231,.18);display:flex;justify-content:space-between;gap:6px 24px;flex-wrap:wrap;font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.08em;color:rgba(237,239,231,.7)}
    @media (max-width:700px){
      .site-footer{padding-top:40px}
      .site-footer .foot{grid-template-columns:1fr}
    }`;
  document.head.appendChild(style);

  host.innerHTML = `
    <div class="wrap foot">
      <div>
        <a class="foot-logo" href="index.html">Kelder<em>restjes</em></a>
        <p class="foot-line">Open tot de laatste fles leeg is.</p>
      </div>
      <nav aria-label="Pagina's onderaan">
        <p class="foot-h">Pagina's</p>
        <ul>${PAGES.map(([href, label, admin]) =>
          `<li${admin ? ' data-admin hidden' : ''}><a href="${href}"${href === here ? ' aria-current="page"' : ''}>${label}</a></li>`).join('')}</ul>
      </nav>
      <a class="foot-top" href="#top">Naar boven ↑</a>
    </div>
    <div class="wrap foot-legal">
      <span>© ${new Date().getFullYear()} Kelderrestjes</span>
      <span>Gemaakt in de kelder.</span>
    </div>`;
})();
