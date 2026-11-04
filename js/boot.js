/* Laadt eerst de gegevens uit Supabase en voert daarna de stappen in volgorde uit.
   Een stap is een scriptpad (wordt geladen) of een functie (wordt uitgevoerd):

     kelderBoot(['js/stock.js', () => { window.PAGE = {...}; }, 'js/cards.js']);

   Lukt het laden niet, dan staat er bovenaan een melding in plaats van een lege pagina. */
window.kelderBoot = async function(steps){
  try{
    await window.kelderLoadData();
    for(const step of steps){
      if(typeof step === 'function') await step();
      else await new Promise((ok, fail) => {
        const s = document.createElement('script');
        s.src = step; s.onload = ok; s.onerror = () => fail(new Error('Kon ' + step + ' niet laden.'));
        document.body.appendChild(s);
      });
    }
  }catch(e){
    console.error(e);
    const box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'background:#B4622B;color:#fff;padding:14px 24px;font:500 15px/1.4 Karla,system-ui,sans-serif;position:relative;z-index:10';
    box.textContent = 'De gegevens uit Supabase konden niet worden geladen: ' + (e && e.message || e);
    document.body.prepend(box);
  }
};
