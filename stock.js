/* voorraad: wat op is, en welke cocktails/mocktails daardoor niet kunnen.
   OUT (drinks.js) is de gepubliceerde lijst; localStorage overschrijft die in deze browser. */
const STOCK_KEY = 'kelderrestjes-out';
const ALIAS = {"Lillet Rosé":["rosé"], "J&B Rare":["j&b"]};

function loadOut(){
  try{ const v = JSON.parse(localStorage.getItem(STOCK_KEY)); if(Array.isArray(v)) return new Set(v); }catch(e){}
  return new Set(OUT);
}
let outSet = loadOut();
const isOut = n => outSet.has(n);
function hasLocalStock(){ try{ return localStorage.getItem(STOCK_KEY)!==null; }catch(e){ return false; } }
function setOut(name, flag){
  flag ? outSet.add(name) : outSet.delete(name);
  try{ localStorage.setItem(STOCK_KEY, JSON.stringify([...outSet])); }catch(e){}
}
function resetOut(){
  try{ localStorage.removeItem(STOCK_KEY); }catch(e){}
  outSet = new Set(OUT);
}

/* alle bijhoudbare items, en de woorden waaraan we ze in een receptregel herkennen */
const ALL_ITEMS = [...Object.values(G).flat().map(n=>({n})), ...Object.values(M).flat(), ...ING];
const TERMS = (() => {
  const m = new Map();
  for(const it of ALL_ITEMS){
    for(const t of [it.n.toLowerCase(), it.k, ...(ALIAS[it.n]||[])]){
      if(!t) continue;
      if(!m.has(t)) m.set(t, []);
      m.get(t).push(it);
    }
  }
  return [...m.entries()].sort((a,b)=>b[0].length-a[0].length);   // langste woord eerst
})();

/* per receptregel de items die erin passen ("A of B" = alternatieven) */
function reqGroups(r){
  return r.s.map(line => {
    let text = line[1].toLowerCase();
    const found = [];
    for(const [t,items] of TERMS){
      if(text.includes(t)){
        items.forEach(i => { if(!found.includes(i)) found.push(i); });
        text = text.split(t).join(' ');
      }
    }
    return found;
  }).filter(g => g.length);
}
/* regels waarvan alle opties op zijn, bijv. ["Eristoff of Absolut Vanilia"] */
const missingFor = r => reqGroups(r).filter(g => g.every(i => isOut(i.n))).map(g => g.map(i=>i.n).join(' of '));
const isAvailable = r => missingFor(r).length === 0;
