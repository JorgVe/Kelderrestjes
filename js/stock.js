/* voorraad: wat op is, en welke cocktails/mocktails daardoor niet kunnen.
   OUT komt uit items.in_stock in Supabase (data-loader.js). Bezoekers lezen dit alleen en zien niet wat op is.
   De beheerder past het aan op de pagina Voorraad (js/voorraad.js), of direct in Supabase.

   Elke receptregel is gekoppeld aan één of meer items (recipe_line_items, zie 0019; in de loader r.lines[].items). Meerdere
   items bij één regel zijn alternatieven ("A of B"): de regel kan zolang er één van is. Een regel zonder koppeling (bijv. ijs)
   wordt niet bijgehouden. Er wordt dus niets meer uit de tekst van de regel geraden. */

const outSet = new Set(OUT);
const isOut = n => outSet.has(n);

/* per receptregel de gekoppelde items, als [{ n: naam }, …]; regels zonder koppeling vallen weg */
function reqGroups(r){
  return (r.lines || []).map(l => l.items.map(n => ({ n }))).filter(g => g.length);
}

/* instelling hide_unavailable_recipes (admin.html): uit = een recept blijft zichtbaar ook als een ingrediënt op is */
const hideOut = typeof setting === 'function' ? setting('hide_unavailable_recipes') !== false : true;

/* regels waarvan alle opties op zijn, bijv. ["Eristoff of Absolut Vanilia"] */
const missingFor = r => reqGroups(r).filter(g => g.every(i => isOut(i.n))).map(g => g.map(i=>i.n).join(' of '));
const isAvailable = r => !hideOut || missingFor(r).length === 0;

/* Uitgeschakeld voor cocktails (items.in_cocktails = false, NO_MIX uit data-loader.js): zo'n item wordt niet in cocktails en mocktails
   gebruikt, ook al is het niet op. De drank zelf blijft gewoon op het menu. canMix(r): kan deze cocktail of mocktail gemaakt worden?
   Elke gekoppelde regel heeft een optie die niet op is (tenzij hide_unavailable_recipes uit staat) en niet is uitgeschakeld.
   Voor de puur-serves (P) geldt dit niet: gebruik daar isAvailable. */
const noMixSet = new Set(typeof NO_MIX === 'undefined' ? [] : NO_MIX);
const noMix = n => noMixSet.has(n);
const unusable = n => (hideOut && isOut(n)) || noMix(n);
const canMix = r => reqGroups(r).every(g => g.some(i => !unusable(i.n)));

/* waarom kan een recept niet: de regels waarvan elke optie op is of is uitgeschakeld, bijv. ["Eristoff (op) of Absolut Vanilia (op)"];
   voor de beheerder, die ook de recepten ziet die niet kunnen */
const blockedBy = r => reqGroups(r)
  .filter(g => g.every(i => isOut(i.n) || noMix(i.n)))
  .map(g => g.map(i => i.n + (isOut(i.n) ? ' (op)' : ' (niet in cocktails)')).join(' of '));
