#!/usr/bin/env node
/* Maakt supabase/seed.sql uit legacy/drinks.js (en de alias-lijst uit legacy/stock.js).
   De legacy-versie blijft dus de bron voor de seed; draai dit opnieuw na een wijziging daar.

     node scripts/build-seed.mjs
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', 'legacy');                   // drinks.js en stock.js staan in de legacy-versie
const outFile = resolve(here, '..', 'supabase', 'seed.sql');

/* ---- legacy/drinks.js inlezen: de const's staan niet op het global object, dus pak ze er expliciet uit ---- */
const src = readFileSync(resolve(root, 'drinks.js'), 'utf8');
const { G, M, R, P, Z, ING, OUT, W, ORDER, WKINDS } = vm.runInNewContext(
  src + '\n;({ G, M, R, P, Z, ING, OUT, W, ORDER, WKINDS })'
);

const stockSrc = readFileSync(resolve(root, 'stock.js'), 'utf8');
const aliasMatch = stockSrc.match(/const ALIAS = (\{[^;]*\});/);
if (!aliasMatch) throw new Error('ALIAS niet gevonden in stock.js');
const ALIAS = JSON.parse(aliasMatch[1]);

/* ---- SQL-hulpjes ---- */
const q = v => (v === null || v === undefined || v === '') ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const qs = v => v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`;   // lege string blijft ''
const b = v => (v ? 'true' : 'false');
const arr = a => a && a.length ? `array[${a.map(qs).join(', ')}]::text[]` : `'{}'::text[]`;
const values = rows => rows.map(r => '  (' + r.join(', ') + ')').join(',\n');

/* ---- categorieën ---- */
const categories = ORDER.map(([label, level], i) => ({
  label, level, kind: G[label] ? 'bottle' : 'drink', sort_order: i + 1
}));
categories.push({ label: 'Ingrediënten', level: 'niet op het menu', kind: 'ingredient', sort_order: categories.length + 1 });

/* ---- items ---- */
const outSet = new Set(OUT);
const items = [];
for (const c of categories) {
  const list = c.kind === 'bottle' ? G[c.label].map(n => ({ n }))
             : c.kind === 'drink'  ? M[c.label]
             : ING;
  list.forEach((it, i) => items.push({
    category: c.label, name: it.n, keyword: it.k, aliases: ALIAS[it.n] || [], note: it.note,
    optional: it.o, zero_proof: it.z, to_confirm: it.c, in_stock: !outSet.has(it.n), sort_order: i + 1,
    kind: c.kind, keyword: it.k
  }));
}
const itemNames = new Set(items.map(i => i.name));

/* serving: ingredient = alleen ingrediënt, both = drank én ingrediënt (zit in een recept), drink = alleen drank.
   Zelfde startwaarden als migrations/0002_item_serving.sql; daarna per item aan te passen in Supabase. */
const recipesAll = [...R, ...Z, ...P];
const inRecipe = i => recipesAll.some(r => r.b.includes(i.name)) || (i.keyword && recipesAll.some(r => r.s.some(l => l[1].toLowerCase().includes(i.keyword))));
/* mixers zijn alleen een ingrediënt (migrations/0003): niet op het menu */
const MIXERS = new Set(['Tonic', 'Ginger beer', 'Bruiswater', 'Pulco', 'Royal Club', 'Fever-Tree']);
for (const i of items) i.serving = (i.kind === 'ingredient' || MIXERS.has(i.name)) ? 'ingredient' : inRecipe(i) ? 'both' : 'drink';
if (itemNames.size !== items.length) throw new Error('dubbele itemnaam in drinks.js');

/* ---- recepten ---- */
/* sort_order telt per soort (R, Z en P beginnen elk bij 1) */
const withKind = (list, kind) => list.map((r, i) => ({ ...r, kind, sort_order: i + 1 }));
const recipes = [...withKind(R, 'cocktail'), ...withKind(Z, 'mocktail'), ...withKind(P, 'solo')];

for (const r of recipes) for (const n of r.b) {
  if (!itemNames.has(n)) throw new Error(`"${r.n}": fles/drank "${n}" staat niet in G of M`);
}
const wines = W.map((w, i) => {
  if (!itemNames.has(w.n)) throw new Error(`wijn "${w.n}" staat niet in M`);
  if (!WKINDS[w.kind]) throw new Error(`onbekende wijnsoort "${w.kind}"`);
  return { ...w, sort_order: i + 1 };
});

/* ---- SQL ---- */
const sql = [];
sql.push(`-- Gegenereerd door scripts/build-seed.mjs uit drinks.js. Niet met de hand aanpassen.
-- Draai dit één keer, na migrations/0001_init.sql en 0002_item_serving.sql. Het stopt als er al data staat,
-- zodat een herhaling nooit de voorraad (items.in_stock) overschrijft.

do $$
begin
  if exists (select 1 from public.categories) then
    raise exception 'De database is al gevuld. Leeg eerst de tabellen als je echt opnieuw wilt beginnen.';
  end if;
end
$$;
`);

sql.push(`insert into public.categories (label, kind, alcohol_level, sort_order) values
${values(categories.map(c => [q(c.label), q(c.kind), q(c.level), c.sort_order]))};
`);

sql.push(`insert into public.items (category_id, name, keyword, aliases, note, optional, zero_proof, to_confirm, in_stock, serving, sort_order)
select c.id, v.name, v.keyword, v.aliases, v.note, v.optional, v.zero_proof, v.to_confirm, v.in_stock, v.serving, v.sort_order
from (values
${values(items.map(i => [q(i.category), q(i.name), q(i.keyword), arr(i.aliases), q(i.note), b(i.optional), b(i.zero_proof), b(i.to_confirm), b(i.in_stock), q(i.serving), i.sort_order]))}
) as v(category, name, keyword, aliases, note, optional, zero_proof, to_confirm, in_stock, serving, sort_order)
join public.categories c on c.label = v.category;
`);

sql.push(`insert into public.recipes (kind, name, style, blurb, method, url, sort_order) values
${values(recipes.map(r => [q(r.kind), q(r.n), q(r.t), q(r.blurb), q(r.m), q(r.u), r.sort_order]))};
`);

const bottleRows = recipes.flatMap(r => r.b.map((n, i) => [q(r.kind), q(r.n), q(n), i + 1]));
sql.push(`insert into public.recipe_bottles (recipe_id, item_id, sort_order)
select r.id, i.id, v.sort_order
from (values
${values(bottleRows)}
) as v(kind, recipe, item, sort_order)
join public.recipes r on r.kind = v.kind and r.name = v.recipe
join public.items   i on i.name = v.item;
`);

const lineRows = recipes.flatMap(r => r.s.map((l, i) => [q(r.kind), q(r.n), i + 1, qs(l[0]), q(l[1]), b(l[2])]));
sql.push(`insert into public.recipe_lines (recipe_id, sort_order, amount, ingredient, on_bar)
select r.id, v.sort_order, v.amount, v.ingredient, v.on_bar
from (values
${values(lineRows)}
) as v(kind, recipe, sort_order, amount, ingredient, on_bar)
join public.recipes r on r.kind = v.kind and r.name = v.recipe;
`);

sql.push(`insert into public.wines (item_id, kind, grape, region, alcohol, note, to_confirm, sort_order)
select i.id, v.kind, v.grape, v.region, v.alcohol, v.note, v.to_confirm, v.sort_order
from (values
${values(wines.map(w => [q(w.n), q(w.kind), q(w.druif), q(w.regio), q(w.alc), q(w.note), b(w.c), w.sort_order]))}
) as v(item, kind, grape, region, alcohol, note, to_confirm, sort_order)
join public.items i on i.name = v.item;
`);

writeFileSync(outFile, sql.join('\n'));
console.log(`seed.sql geschreven: ${categories.length} categorieën, ${items.length} items (${outSet.size} op),`
  + ` ${recipes.length} recepten, ${bottleRows.length} flesverwijzingen, ${lineRows.length} receptregels, ${wines.length} wijnen`);
