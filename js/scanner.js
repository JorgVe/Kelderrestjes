/* Camera en barcodeherkenning voor het scannen van een fles (voorraadpagina). Alleen de techniek: wat er met een barcode
   gebeurt staat in js/voorraad.js.

     kelderScanner.start(videoElement, (code, formaat) => …)  →  belofte met { stop() }
   De belofte mislukt met een fout met .code ('insecure', 'nocamera', 'denied', 'busy' of 'unsupported') en een Nederlandse
   .message die je zo kunt tonen. Na de eerste betrouwbare herkenning stopt de scanner zelf en roept hij de callback aan.

   Herkenning: de ingebouwde BarcodeDetector van de browser (Chrome op Android), anders de bibliotheek barcode-detector
   (MIT, vastgezet op een versie, ruim 40 kB + een decoder van ongeveer 950 kB). Die wordt pas bij het eerste scannen van
   jsDelivr gehaald, dus alleen browsers zonder ingebouwde detector (zoals Safari op een iPhone) betalen daarvoor.
   De camera werkt alleen op een beveiligde (https) pagina, of op localhost. */
(function(){
  const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];     // wat er op flessen en verpakkingen staat
  /* de "ponyfill": een eigen BarcodeDetector-klasse, zonder iets in de pagina te veranderen (het hoofdbestand van het
     pakket zet zichzelf als polyfill op window) */
  const LIB = 'https://cdn.jsdelivr.net/npm/barcode-detector@3.2.3/ponyfill/+esm';
  const POLL_MS = 200;     // zo vaak kijken we naar een beeld van de camera
  const NEED = 2;          // zo vaak achter elkaar dezelfde code, tegen verkeerd gelezen cijfers

  const fail = (code, message) => Object.assign(new Error(message), { code });

  async function makeDetector(){
    if('BarcodeDetector' in window){
      try{
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const formats = FORMATS.filter(f => supported.includes(f));
        if(formats.length) return new window.BarcodeDetector({ formats });
      }catch(e){ /* de ingebouwde detector werkt niet: val terug op de bibliotheek */ }
    }
    try{
      const lib = await api.loadLibrary();
      return new lib.BarcodeDetector({ formats: FORMATS });
    }catch(e){
      throw fail('unsupported', 'Scannen wordt door deze browser niet ondersteund.');
    }
  }

  async function start(video, onCode){
    if(!window.isSecureContext) throw fail('insecure', 'De camera werkt alleen via een beveiligde (https) verbinding.');
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw fail('nocamera', 'Deze browser heeft geen toegang tot een camera.');

    let stream;
    try{
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }   // achtercamera als die er is
      });
    }catch(e){
      const n = e && e.name;
      if(n === 'NotAllowedError' || n === 'SecurityError') throw fail('denied', 'Geen toegang tot de camera. Sta de camera toe voor deze site en probeer het opnieuw.');
      if(n === 'NotReadableError' || n === 'AbortError') throw fail('busy', 'De camera is in gebruik door een andere app.');
      throw fail('nocamera', 'Er is geen camera gevonden.');
    }

    let stopped = false, timer = null;
    const stop = () => {
      if(stopped) return;                              // twee keer stoppen is onschadelijk
      stopped = true;
      clearTimeout(timer);
      stream.getTracks().forEach(t => t.stop());
      try{ video.pause(); }catch(e){}
      video.srcObject = null;
    };

    try{
      video.setAttribute('playsinline', '');          // nodig op iPhone, anders gaat het beeld naar volledig scherm
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      const detector = await makeDetector();
      if(stopped) return { stop };

      let last = null, count = 0;
      const look = async () => {
        if(stopped) return;
        try{
          if(video.readyState >= 2){
            const found = await detector.detect(video);
            const hit = found && found[0];
            if(hit && hit.rawValue){
              if(hit.rawValue === last) count++; else { last = hit.rawValue; count = 1; }
              if(count >= NEED){ stop(); onCode(hit.rawValue, hit.format); return; }
            }else{ last = null; count = 0; }
          }
        }catch(e){ /* een beeld dat niet lukt, slaan we over */ }
        if(!stopped) timer = setTimeout(look, POLL_MS);
      };
      timer = setTimeout(look, POLL_MS);
    }catch(e){
      stop();
      throw e && e.code ? e : fail('nocamera', 'De camera kon niet worden gestart.');
    }
    return { stop };
  }

  /* loadLibrary staat los zodat een test hem kan vervangen */
  const api = { start, loadLibrary: () => import(LIB), FORMATS };
  window.kelderScanner = api;
})();
