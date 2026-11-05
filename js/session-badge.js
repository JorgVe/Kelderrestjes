/* Rechtsboven op elke pagina: ben je ingelogd als beheerder, en als wie? Met een knop om uit te loggen.
   Ben je dat niet, dan staan er twee knoppen:
     "Inloggen"                 opent een venster voor e-mailadres en wachtwoord; daarna ga je naar de voorraadpagina
                                (staat je op een beheerpagina, dan blijf je daar en laadt die opnieuw)
     "Registreer als beheerder" doet (nog) niets echts: een venster met een foto en de melding dat je de beheerder om toegang
                                moet vragen (aanmelden voor nieuwe gebruikers staat uit)

   Dit blokje bepaalt ook of de knoppen voor de beheerpagina's (Voorraad en Beheer) in de navigatie zichtbaar zijn: die zijn er
   alleen voor een ingelogde beheerder. De beheerpagina's zelf hebben geen inlogformulier: is er geen sessie, dan opent dit
   inlogvenster (kelderSessionBadge.openLogin).

   Staat op elke pagina (na js/admin.js). Het blokje en zijn vensters komen zelf in de pagina (stijl en HTML); het blokje scrolt
   met de pagina mee, dus het schuurt nooit met wat bovenaan vastplakt. Zonder sessie in dit tabblad gaat er geen verzoek naar
   Supabase. Uitloggen laadt de pagina opnieuw. */
(function(){
  const KEY = 'kelderrestjes-admin-auth';             // dezelfde sleutel als js/admin.js
  const LOGIN_PAGE = 'voorraad.html';                 // waar je na het inloggen heen gaat (vanaf een gewone pagina)
  const ADMIN_PAGES = ['voorraad.html', 'admin.html']; // alleen voor een beheerder: hun knop in de navigatie, en je blijft er na het inloggen
  const FOTO = 'img/loewie.webp';
  const MELDING = 'Ask our admin Loewie for access.';

  const CSS = `
  .whoami{position:absolute;top:10px;right:12px;z-index:50;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 24px);padding:5px 6px 5px 12px;background:rgba(255,255,255,.95);border:1px solid rgba(30,39,33,.18);border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.12);font:500 12px/1.2 'Karla',system-ui,sans-serif;color:var(--ink,#1E2721)}
  .whoami[hidden]{display:none}
  .whoami .who-dot{width:8px;height:8px;border-radius:50%;background:var(--shelf-deep,#5D6E60);flex:none}
  .whoami .who-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .whoami button{flex:none;font:700 11px/1 'Karla',system-ui,sans-serif;padding:6px 10px;border-radius:999px;border:1px solid rgba(30,39,33,.25);background:transparent;color:inherit;cursor:pointer}
  .whoami button:hover{background:var(--ink,#1E2721);color:var(--paper,#EDEFE7);border-color:var(--ink,#1E2721)}
  .whoami button:disabled{opacity:.5;cursor:progress}
  .nav a[hidden]{display:none}                        /* de Voorraad-knop: alleen voor een beheerder */
  .whoami.guest{padding:3px;gap:3px}
  .whoami.guest button{border:0;padding:8px 14px;font-size:12px}
  .whoami.guest .who-login{background:var(--ink,#1E2721);color:var(--paper,#EDEFE7)}
  .whoami.guest .who-login:hover{background:var(--shelf-deep,#5D6E60)}
  html.no-register .who-register{display:none}          /* instelling show_register_button (admin.html) */
  .whoami button:focus-visible{outline:3px solid var(--brass,#C69A3E);outline-offset:2px}
  /* de vensters; margin:auto zet ze in het midden (de reset van de pagina haalt dat anders weg en dan staan ze linksboven) */
  dialog#loewiedlg,dialog#logindlg{margin:auto;border:0;padding:0;width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:var(--paper,#EDEFE7);color:var(--ink,#1E2721);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.4)}
  dialog#loewiedlg::backdrop,dialog#logindlg::backdrop{background:rgba(30,39,33,.6)}
  #loewiedlg img{display:block;width:100%;height:auto;aspect-ratio:2000/1126;object-fit:cover;background:#3a3329}
  #loewiedlg .loewie-text{padding:18px 22px 20px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
  #loewiedlg .loewie-text p{margin:0;font-family:'Bodoni Moda',serif;font-weight:700;font-size:24px;line-height:1.15}
  dialog#logindlg{width:min(420px,calc(100vw - 32px))}
  #loginform{padding:24px 24px 22px;display:grid;gap:14px}
  #loginform h2{margin:0;font-family:'Bodoni Moda',serif;font-weight:700;font-size:28px;line-height:1.1}
  #loginform .login-field{display:grid;gap:5px}
  #loginform label{font:700 14px/1.3 'Karla',system-ui,sans-serif}
  #loginform input{font:400 15px/1.3 'Karla',system-ui,sans-serif;padding:9px 12px;border:1px solid rgba(30,39,33,.25);border-radius:8px;background:#fff;color:inherit;width:100%;min-width:0;box-sizing:border-box}
  #loginform input:focus-visible{outline:3px solid var(--brass,#C69A3E);outline-offset:2px}
  #loginform .login-note{margin:0;font:500 14px/1.4 'Karla',system-ui,sans-serif;background:rgba(30,39,33,.06);padding:8px 12px;border-left:3px solid var(--brass,#C69A3E)}
  #loginform .login-note[hidden]{display:none}
  #loginform .login-err{margin:0;min-height:1.3em;color:var(--amber,#B4622B);font:700 14px/1.3 'Karla',system-ui,sans-serif}
  #loginform .login-btns{display:flex;gap:8px;flex-wrap:wrap}
  #loginform .login-btns button,#loewiedlg .loewie-close{font:700 12px/1 'Karla',system-ui,sans-serif;padding:10px 18px;border-radius:999px;border:1px solid rgba(30,39,33,.3);background:transparent;color:inherit;cursor:pointer}
  #loginform .login-btns button:hover,#loewiedlg .loewie-close:hover{background:var(--ink,#1E2721);color:var(--paper,#EDEFE7)}
  #loginform .login-btns .login-go{background:var(--ink,#1E2721);color:var(--paper,#EDEFE7);border-color:var(--ink,#1E2721)}
  #loginform .login-btns button:disabled{opacity:.5;cursor:progress}
  #loginform button:focus-visible,#loewiedlg .loewie-close:focus-visible{outline:3px solid var(--brass,#C69A3E);outline-offset:2px}`;

  let box = null, styled = false;
  function addStyle(){
    if(styled) return;
    styled = true;
    const style = document.createElement('style');
    style.id = 'whoami-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  function ensure(){
    if(box) return box;
    addStyle();
    box = document.createElement('div');
    box.className = 'whoami guest';
    box.hidden = true;
    document.body.appendChild(box);
    return box;
  }

  /* ---- het venster met de foto en de melding ("Registreer als beheerder") ---- */
  let loewie = null;
  function openRegister(){
    addStyle();
    if(!loewie){
      document.body.insertAdjacentHTML('beforeend',
        '<dialog id="loewiedlg" aria-labelledby="loewie-msg">' +
        '<img src="' + FOTO + '" alt="Een grijze kat op de bank die je aankijkt" width="2000" height="1126">' +
        '<div class="loewie-text"><p id="loewie-msg"></p><button type="button" class="loewie-close">Sluiten</button></div></dialog>');
      loewie = document.getElementById('loewiedlg');
      loewie.querySelector('#loewie-msg').textContent = MELDING;
      loewie.querySelector('img').onerror = e => e.currentTarget.remove();                  // geen foto? Dan blijft de melding
      loewie.querySelector('.loewie-close').onclick = () => loewie.close();
      loewie.addEventListener('click', e => { if(e.target === loewie) loewie.close(); });   // klik naast het venster sluit het
    }
    if(!loewie.open) loewie.showModal();
    loewie.querySelector('.loewie-close').focus();
  }

  /* ---- het inlogvenster; na het inloggen naar de voorraadpagina ---- */
  let login = null;
  /* Het formulier staat vanaf het laden van de pagina in de DOM (dicht, in een venster), niet pas na een klik: wachtwoordmanagers
     zoeken bij het laden naar inlogvelden. Een gewoon formulier met de standaardnamen en autocomplete-waarden (username en
     current-password), zodat de browser of de wachtwoordmanager het herkent en invult. */
  function buildLogin(){
    if(login) return login;
    addStyle();
    document.body.insertAdjacentHTML('beforeend',
      '<dialog id="logindlg" aria-labelledby="login-title"><form id="loginform" method="post" action="#" novalidate>' +
      '<h2 id="login-title">Inloggen als beheerder</h2>' +
      '<p class="login-note" id="login-note" hidden></p>' +
      '<div class="login-field"><label for="login-email">E-mailadres</label>' +
      '<input type="email" id="login-email" name="username" autocomplete="username" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false"></div>' +
      '<div class="login-field"><label for="login-pass">Wachtwoord</label>' +
      '<input type="password" id="login-pass" name="password" autocomplete="current-password"></div>' +
      '<p class="login-err" id="login-err" role="alert"></p>' +
      '<div class="login-btns"><button type="submit" class="login-go" id="login-go">Inloggen</button><button type="button" id="login-cancel">Annuleren</button></div>' +
      '</form></dialog>');
    login = document.getElementById('logindlg');
    login.querySelector('#login-cancel').onclick = () => login.close();
    login.addEventListener('click', e => { if(e.target === login) login.close(); });
    login.querySelector('#loginform').onsubmit = async e => {
      e.preventDefault();
      const err = login.querySelector('#login-err'), go = login.querySelector('#login-go');
      const email = login.querySelector('#login-email').value.trim(), pass = login.querySelector('#login-pass');
      err.textContent = '';
      if(!window.kelderAdmin || !kelderAdmin.available){ err.textContent = 'Inloggen is niet beschikbaar: Supabase is niet geladen (geblokkeerd of offline?).'; return; }
      if(!email || !pass.value){ err.textContent = 'Vul je e-mailadres en wachtwoord in.'; return; }
      go.disabled = true;
      const res = await kelderAdmin.signIn(email, pass.value);
      go.disabled = false;
      if(!res.ok){ pass.value = ''; err.textContent = res.message; pass.focus(); return; }
      /* ingelogd: naar de voorraad; staan we al op een beheerpagina, dan blijven we daar en laadt ze opnieuw. Het wachtwoord laten
         we staan tot de pagina wegnavigeert: wie het wist, zou de wachtwoordmanager niet laten merken dat het formulier is verstuurd. */
      if(ADMIN_PAGES.includes(location.pathname.split('/').pop())) location.reload(); else location.href = LOGIN_PAGE;
    };
    return login;
  }
  function openLogin(message){
    buildLogin();
    const note = login.querySelector('#login-note');
    note.textContent = message || '';
    note.hidden = !message;
    login.querySelector('#login-err').textContent = '';
    if(!login.open) login.showModal();
    const email = login.querySelector('#login-email');
    (email.value ? login.querySelector('#login-pass') : email).focus();   // is het e-mailadres al ingevuld (door de manager), dan meteen naar het wachtwoord
  }

  /* de knoppen voor de beheerpagina's in de navigatie (Voorraad en Beheer; staan in de pagina, standaard verborgen) */
  const showNav = on => {
    document.querySelectorAll(ADMIN_PAGES.map(p => '.nav a[href="' + p + '"]').join(',')).forEach(a => { a.hidden = !on; });
    document.querySelectorAll('.site-footer li[data-admin]').forEach(li => { li.hidden = !on; });      // dezelfde knoppen in de voet (js/footer.js)
  };

  /* email = null: niet ingelogd; anders ingelogd als dat adres */
  function render(email){
    const b = ensure();
    showNav(!!email);
    if(email){
      b.className = 'whoami';
      b.title = email;
      b.innerHTML = '<span class="who-dot" aria-hidden="true"></span><span class="who-name"></span><button type="button">Uitloggen</button>';
      b.querySelector('.who-name').textContent = 'Ingelogd als ' + email;
      b.querySelector('button').onclick = async e => {
        e.currentTarget.disabled = true;
        try{ await kelderAdmin.signOut(); }catch(err){}
        location.reload();
      };
    }else{
      b.className = 'whoami guest';
      b.title = '';
      b.innerHTML = '<button type="button" class="who-login">Inloggen</button><button type="button" class="who-register">Registreer als beheerder</button>';
      b.querySelector('.who-login').onclick = () => openLogin();
      b.querySelector('.who-register').onclick = openRegister;
      buildLogin();                                   // het (dichte) inlogformulier staat er alvast, zodat een wachtwoordmanager het kent
    }
    b.hidden = false;
  }

  /* kijkt echt of er een beheerderssessie is (verzoek naar Supabase) */
  async function refresh(){
    let email = null;
    if(window.kelderAdmin && kelderAdmin.available){
      try{ if(await kelderAdmin.current()) email = await kelderAdmin.email(); }catch(e){}
    }
    render(email);
  }

  window.kelderSessionBadge = { refresh, openLogin };

  let hint = false;
  try{ hint = !!sessionStorage.getItem(KEY); }catch(e){}
  if(hint){ showNav(true); refresh(); }               // er is een sessie: de knop meteen tonen (geen opduiken na het laden), refresh() corrigeert als hij niet meer geldt
  else render(null);                                  // zonder sessie in dit tabblad: geen verzoek, de knoppen staan er meteen
})();
