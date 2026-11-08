// Run with:  node --test tests/*.test.mjs
// Soorten drank (migratie 0031): js/data-loader.js laat een receptregel die om een soort vraagt tellen voor elk item van die soort, en js/stock.js
// bepaalt daarmee of een recept kan. Beide bestanden worden hier uitgevoerd met een neppe `window` en een neppe Supabase-client.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const loaderCode = readFileSync(new URL('../js/data-loader.js', import.meta.url), 'utf8')
const stockCode = readFileSync(new URL('../js/stock.js', import.meta.url), 'utf8')

const cat = (id, label, kind, alcoholic) => ({ id, label, kind, alcoholic, show_alcohol: false, sort_order: id })
const item = (id, name, category_id, over = {}) => ({ id, category_id, name, note: null, zero_proof: false, in_stock: true, quantity: 1, in_cocktails: true, abv: null, serving: 'ingredient', sort_order: id, barcode: null, ...over })
const link = (it) => ({ item_id: it.id, items: { name: it.name } })
const line = (id, order, amount, ingredient, items, drink_sort) => ({ id, sort_order: order, amount, ingredient, drink_sort: drink_sort ?? null, recipe_line_items: items.map(link) })
const recipe = (id, kind, name, lines) => ({ id, on_menu: true, kind, name, style: 'Sour', blurb: null, method: null, url: null, sort_order: id, recipe_bottles: [], recipe_lines: lines })

// the world: two gins, two tonics, one rum
const world = () => {
  const bleu = item(1, "Bleu D'Argent", 10, { drink_sort: 'Gin' }), bombay = item(2, 'Bombay Sapphire', 10, { drink_sort: ' gin ' })
  const tonic = item(3, 'Tonic', 11, { drink_sort: 'Tonic' }), fever = item(4, 'Fever-Tree', 11, { drink_sort: 'tonic' })
  const rum = item(5, 'Havana Club', 10, { drink_sort: 'Rum' }), lime = item(6, 'Limoen', 12)
  return {
    categories: [cat(10, 'Iets Sterker', 'bottle', true), cat(11, 'Fris & mixers', 'drink', false), cat(12, 'Voorraad', 'ingredient', false)],
    items: [bleu, bombay, tonic, fever, rum, lime],
    recipes: [
      // a line that asks for the sort Gin, but is also linked to one gin
      recipe(100, 'cocktail', 'Gin Tonic', [line(1, 1, '50 ml', 'gin', [bleu], 'Gin'), line(2, 2, '120 ml', 'tonic', [tonic], 'Tonic'), line(3, 3, '1 schijf', 'limoen', [lime])]),
      // the same, without a sort: the old behaviour (only the linked bottle counts)
      recipe(101, 'cocktail', 'Bleu Special', [line(4, 1, '50 ml', "Bleu D'Argent", [bleu]), line(5, 2, '1 schijf', 'limoen', [lime])]),
      // a line that only names a sort and has no linked item at all
      recipe(102, 'cocktail', 'Rum Cola', [line(6, 1, '50 ml', 'rum', [], 'Rum'), line(7, 2, '1 schijf', 'limoen', [lime])]),
      // asks for a sort of which nothing is in the house
      recipe(103, 'cocktail', 'Tequila Sunrise', [line(8, 1, '50 ml', 'tequila', [], 'Tequila'), line(9, 2, '1 schijf', 'limoen', [lime])]),
    ],
  }
}

function fakeSb(w, { noSortColumns = false } = {}) {
  const table = (name, cols) => {
    const wantsSort = String(cols).includes('drink_sort')
    let res
    if (wantsSort && noSortColumns) res = { data: null, error: { code: '42703', message: 'column drink_sort does not exist' } }
    else if (String(cols).includes('label_path')) res = { data: null, error: { code: '42703', message: 'no label_path' } }
    else if (name === 'categories') res = { data: w.categories, error: null }
    else if (name === 'items') res = { data: w.items.map((i) => (wantsSort ? i : (({ drink_sort, ...rest }) => rest)(i))), error: null }
    else if (name === 'recipes') res = { data: w.recipes.map((r) => ({ ...r, recipe_lines: r.recipe_lines.map((l) => (wantsSort ? l : (({ drink_sort, ...rest }) => rest)(l))) })), error: null }
    else if (name === 'wines') res = { data: [], error: null }
    else if (name === 'settings') res = { data: [], error: null }
    else throw new Error('unexpected table ' + name)
    const b = { order: () => b, then: (ok, fail) => Promise.resolve(res).then(ok, fail) }
    return b
  }
  return { from: (name) => ({ select: (cols) => table(name, cols) }), storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: 'https://x/' + p } }) }) } }
}

async function load(w, opts) {
  const win = { kelderConfigured: true, kelderSb: fakeSb(w, opts) }
  new Function('window', loaderCode)(win)
  await win.kelderLoadData()
  return win
}
// js/stock.js as a function of the loader's globals
function stock(win, extraOut = []) {
  const f = new Function('OUT', 'NO_MIX', 'setting', stockCode + '\nreturn { canMix, blockedBy, isOut }')
  win.OUT.push(...extraOut)
  return f(win.OUT, win.NO_MIX, win.setting)
}
const recipeNamed = (win, name) => [...win.R, ...win.Z].find((r) => r.n === name)

test('without sorts nothing changes: a line counts only the items it is linked to', async () => {
  const w = world()
  w.items = w.items.map(({ drink_sort, ...rest }) => rest)
  w.recipes = w.recipes.map((r) => ({ ...r, recipe_lines: r.recipe_lines.map((l) => ({ ...l, drink_sort: null })) }))
  const win = await load(w)
  assert.equal(win.kelderSorts.length, 0)
  assert.deepEqual(recipeNamed(win, 'Gin Tonic').lines[0].items, ["Bleu D'Argent"])
})

test('a line that asks for a sort counts every item of that sort, but the dialog only gets the linked ones', async () => {
  const win = await load(world())
  const l = recipeNamed(win, 'Gin Tonic').lines[0]
  assert.deepEqual(l.items.slice().sort(), ["Bleu D'Argent", 'Bombay Sapphire'])
  assert.deepEqual(l.itemIds, [1])                         // only the direct link: the dialog shows and saves only that
  assert.equal(l.sort, 'Gin')
  assert.deepEqual(recipeNamed(win, 'Bleu Special').lines[0].items, ["Bleu D'Argent"])   // no sort: as before
})

test('sorts are compared without capitals and spaces at the edges, and listed with their items', async () => {
  const win = await load(world())
  assert.deepEqual(win.kelderSorts.map((s) => s.sort), ['Gin', 'Rum', 'Tonic'])
  assert.deepEqual(win.kelderSorts[0].items.map((i) => i.name).sort(), ["Bleu D'Argent", 'Bombay Sapphire'])
  assert.equal(win.kelderSortColumns, true)
})

test('one gin running out does not stop the cocktail while another gin is in stock', async () => {
  const w = world()
  w.items[0].in_stock = false                               // Bleu D'Argent is out
  const win = await load(w)
  const { canMix } = stock(win)
  assert.equal(canMix(recipeNamed(win, 'Gin Tonic')), true)      // Bombay is still there
  assert.equal(canMix(recipeNamed(win, 'Bleu Special')), false)  // this one wants that exact bottle
})

test('when the last bottle of a sort is out, the cocktail cannot be made and says why', async () => {
  const w = world()
  w.items[0].in_stock = false; w.items[1].in_stock = false
  const win = await load(w)
  const { canMix, blockedBy } = stock(win)
  const r = recipeNamed(win, 'Gin Tonic')
  assert.equal(canMix(r), false)
  assert.match(blockedBy(r).join(' '), /Bleu D'Argent \(op\) of Bombay Sapphire \(op\)/)
})

test('a line that only names a sort works without any linked item', async () => {
  const win = await load(world())
  const { canMix } = stock(win)
  assert.deepEqual(recipeNamed(win, 'Rum Cola').lines[0].items, ['Havana Club'])
  assert.equal(canMix(recipeNamed(win, 'Rum Cola')), true)
  const w = world(); w.items[4].in_stock = false
  const win2 = await load(w)
  assert.equal(stock(win2).canMix(recipeNamed(win2, 'Rum Cola')), false)
})

test('a sort of which nothing is in the house blocks the recipe instead of being ignored', async () => {
  const win = await load(world())
  const { canMix, blockedBy } = stock(win)
  const r = recipeNamed(win, 'Tequila Sunrise')
  assert.equal(canMix(r), false)
  assert.match(blockedBy(r).join(' '), /Tequila \(geen in huis\)/)
})

test('an item whose "use in cocktails" is off does not count for its sort either', async () => {
  const w = world()
  w.items[0].in_stock = false
  w.items[1].in_cocktails = false                            // Bombay may not be used in cocktails
  const win = await load(w)
  assert.equal(stock(win).canMix(recipeNamed(win, 'Gin Tonic')), false)
})

test('a database without the sort columns still loads everything, as before (not the old schema)', async () => {
  const win = await load(world(), { noSortColumns: true })
  assert.equal(win.kelderSortColumns, false)
  assert.equal(win.kelderOldSchema, false)
  assert.equal(win.kelderSorts.length, 0)
  assert.equal(win.R.length, 4)
  assert.deepEqual(recipeNamed(win, 'Gin Tonic').lines[0].items, ["Bleu D'Argent"])
  assert.equal(recipeNamed(win, 'Gin Tonic').lines[0].sort, '')
})
