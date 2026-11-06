/* Klikken buiten een venster (op de donkere achtergrond) sluit het.

     kelderCloseOnOutside(dialog, canClose?)

   canClose (optioneel) is een functie die false geeft als het venster nu niet dicht mag door buiten te klikken (bijvoorbeeld tijdens een scan).
   Verder gaat het sluiten langs hetzelfde pad als Escape: het venster krijgt eerst een 'cancel'-gebeurtenis en kan het tegenhouden.
   Een klik die in het venster begint (tekst selecteren, een schuifbalk slepen) en er buiten eindigt, sluit niets. */
(function(){
  window.kelderCloseOnOutside = function(dlg, canClose){
    let downOutside = false;
    const outside = e => {
      const r = dlg.getBoundingClientRect();
      return e.target === dlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
    };
    dlg.addEventListener('pointerdown', e => { downOutside = outside(e); });
    dlg.addEventListener('click', e => {
      if(!downOutside || !outside(e)) return;
      downOutside = false;
      if(canClose && !canClose()) return;
      const ev = new Event('cancel', { cancelable: true });
      dlg.dispatchEvent(ev);
      if(!ev.defaultPrevented) dlg.close();
    });
  };
})();
